// frontend/js/dashboard-recipient.js
// 負責常用收件人管理與選擇邏輯
// V25.7 - Optimized: Cache-First rendering to prevent UI stutter (消除頓挫感)

// --- 函式定義 ---

// 1. 載入與渲染 (核心優化)
window.loadRecipients = async function (forceRefresh = false) {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  // [優化 1] 快取優先策略 (Cache-First)
  // 如果已有資料且非強制重新整理，直接渲染現有資料，不顯示 Loading
  if (!forceRefresh && window.myRecipients && window.myRecipients.length > 0) {
    renderRecipients(window.myRecipients);

    // [優化 2] 背景靜默更新 (SWR - Stale While Revalidate)
    // 在背景偷偷發送請求確認是否有最新資料，使用者無感
    fetchRecipientsData(container, true);
    return;
  }

  // 只有在真的沒資料時，才顯示載入中動畫，避免畫面閃爍
  if (!window.myRecipients || window.myRecipients.length === 0) {
    container.innerHTML =
      '<div style="width:100%; text-align:center; padding:30px; color:#999;"><i class="fas fa-spinner fa-spin"></i> 載入中...</div>';
  }

  await fetchRecipientsData(container, false);
};

// 獨立出來的 API 請求函式
async function fetchRecipientsData(container, isBackgroundUpdate) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/recipients`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      // 只有當資料有變動，或是第一次載入時才重新渲染
      // 這裡簡單比對長度或內容，為了效能直接覆蓋快取並渲染
      window.myRecipients = data.recipients || [];

      if (window.myRecipients.length > 0) {
        renderRecipients(window.myRecipients);
      } else {
        // 只有非背景更新時才顯示「尚未建立」
        if (!isBackgroundUpdate) {
          container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:30px; color:#999;">
                    <i class="fas fa-address-book" style="font-size:30px; margin-bottom:10px;"></i><br>
                    尚未建立常用收件人
                </div>`;
        }
      }
    }
  } catch (e) {
    console.error("載入收件人失敗", e);
    if (!isBackgroundUpdate) {
      container.innerHTML = `<p class="text-center" style="color:red;">載入失敗，請檢查網路</p>`;
    }
  }
}

function renderRecipients(list) {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  // 使用 Fragment 減少 DOM 操作次數 (雖然 innerHTML 已經很快，但保持好習慣)
  let htmlContent = "";

  list.forEach((r) => {
    // 隱藏敏感資訊 (身分證)
    const maskedId = r.idNumber
      ? r.idNumber.substring(0, 3) + "*****" + r.idNumber.slice(-2)
      : "";

    const defaultBadge = r.isDefault
      ? '<span class="badge-default">預設</span>'
      : "";
    const activeClass = r.isDefault ? "default-card" : "";

    htmlContent += `
        <div class="recipient-card ${activeClass}">
            <div class="recipient-header">
                <div>
                    <span class="recipient-name">${r.name}</span>
                    ${defaultBadge}
                </div>
                <span class="recipient-phone"><i class="fas fa-phone"></i> ${
                  r.phone
                }</span>
            </div>
            <div class="recipient-info-row">
                <i class="fas fa-id-card"></i> ${maskedId}
            </div>
            <div class="recipient-info-row">
                <i class="fas fa-map-marker-alt"></i> ${r.address}
            </div>
            <div class="recipient-actions">
                ${
                  !r.isDefault
                    ? `<button class="btn btn-sm btn-outline-primary" onclick="window.setDefaultRecipient('${r.id}')">設為預設</button>`
                    : ""
                }
                <button class="btn btn-sm btn-secondary" onclick="window.openRecipientModal('edit', '${
                  r.id
                }')">編輯</button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteRecipient('${
                  r.id
                }')">刪除</button>
            </div>
        </div>
    `;
  });

  // 一次性更新 DOM
  container.innerHTML = htmlContent;
}

// 2. 新增/編輯 Modal
window.openRecipientModal = function (mode, id = null) {
  const modal = document.getElementById("recipient-modal");
  const form = document.getElementById("recipient-form");
  const title = document.getElementById("recipient-modal-title");

  if (form) form.reset();
  const idInput = document.getElementById("recipient-id");
  if (idInput) idInput.value = "";

  if (mode === "edit") {
    if (title) title.textContent = "編輯收件人";
    const target = window.myRecipients.find((r) => r.id === id);
    if (target) {
      document.getElementById("recipient-id").value = target.id;
      document.getElementById("rec-name").value = target.name;
      document.getElementById("rec-phone").value = target.phone;
      document.getElementById("rec-idNumber").value = target.idNumber;
      document.getElementById("rec-address").value = target.address;
      document.getElementById("rec-isDefault").checked = target.isDefault;
    }
  } else {
    if (title) title.textContent = "新增常用收件人";
  }

  if (modal) modal.style.display = "flex";
};

// 處理表單提交
async function handleRecipientSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("recipient-id").value;
  const isEdit = !!id;
  const btn = e.target.querySelector("button[type='submit']");

  // UI 鎖定
  btn.disabled = true;
  btn.textContent = "儲存中...";

  const payload = {
    name: document.getElementById("rec-name").value,
    phone: document.getElementById("rec-phone").value,
    idNumber: document.getElementById("rec-idNumber").value,
    address: document.getElementById("rec-address").value,
    isDefault: document.getElementById("rec-isDefault").checked,
  };

  const url = isEdit
    ? `${API_BASE_URL}/api/recipients/${id}`
    : `${API_BASE_URL}/api/recipients`;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      window.showMessage(isEdit ? "更新成功" : "新增成功", "success");
      const modal = document.getElementById("recipient-modal");
      if (modal) modal.style.display = "none";
      window.loadRecipients(true); // 強制重新整理
    } else {
      alert("操作失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "儲存";
  }
}

// 3. 刪除與設為預設
window.deleteRecipient = async function (id) {
  if (!confirm("確定刪除此收件人？")) return;
  try {
    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    // 刪除後更新本地快取，避免等到 API 回傳才消失，提升體驗
    window.myRecipients = window.myRecipients.filter((r) => r.id !== id);
    renderRecipients(window.myRecipients);

    // 背景再確認一次
    window.loadRecipients(true);
  } catch (e) {
    alert("刪除失敗");
  }
};

window.setDefaultRecipient = async function (id) {
  try {
    const target = window.myRecipients.find((r) => r.id === id);
    if (!target) return;

    // 樂觀更新 (Optimistic UI Update)：先改畫面，再送 API
    // 將所有人的預設取消，將目標設為預設
    const optimisticList = window.myRecipients.map((r) => ({
      ...r,
      isDefault: r.id === id,
    }));
    renderRecipients(optimisticList); // 瞬間更新畫面

    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({ ...target, isDefault: true }),
    });

    window.showMessage("已設為預設", "success");
    // 不用 reload，因為已經樂觀更新了，除非失敗才回滾 (這裡簡化處理)
    window.loadRecipients(true);
  } catch (e) {
    alert("設定失敗");
    window.loadRecipients(true); // 失敗則重抓
  }
};

// 4. 選擇器邏輯 (在集運單 Modal 中使用)
window.openRecipientSelector = async function () {
  const modal = document.getElementById("recipient-selector-modal");
  const list = document.getElementById("recipient-selector-list");

  // 如果快取為空，嘗試抓取
  if (!window.myRecipients || window.myRecipients.length === 0) {
    list.innerHTML =
      '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> 載入中...</div>';
    await fetchRecipientsData(null, true); // 抓取資料到 window.myRecipients
  }

  list.innerHTML = "";
  if (!window.myRecipients || window.myRecipients.length === 0) {
    list.innerHTML =
      "<p style='padding:10px; color:#666;'>無常用收件人，請先至「常用收件人」頁籤新增。</p>";
  } else {
    window.myRecipients.forEach((r) => {
      const div = document.createElement("div");
      div.className = "recipient-selector-item";
      div.innerHTML = `
                <div><strong>${r.name}</strong> <span style="font-size:12px; color:#666;">(${r.phone})</span></div>
                <div style="font-size:12px; color:#555;">${r.address}</div>
            `;
      div.onclick = () => {
        document.getElementById("ship-name").value = r.name;
        document.getElementById("ship-phone").value = r.phone;
        document.getElementById("ship-street-address").value = r.address;
        document.getElementById("ship-idNumber").value = r.idNumber || "";

        modal.style.display = "none";
        window.showMessage("已帶入收件人資訊", "success");
      };
      list.appendChild(div);
    });
  }

  modal.style.display = "flex";
};

// --- 初始化事件綁定 ---
document.addEventListener("DOMContentLoaded", () => {
  // 注意：這裡只綁定內部按鈕，Tab 的切換事件已經由 dashboard-main.js 統一管理
  // 所以不需要在這裡再次綁定 tab-recipients 的 click 事件，避免重複執行

  // 1. 綁定「新增收件人」按鈕
  const btnAdd = document.getElementById("btn-add-recipient");
  if (btnAdd) {
    btnAdd.addEventListener("click", () => window.openRecipientModal("create"));
  }

  // 2. 綁定表單提交
  const form = document.getElementById("recipient-form");
  if (form) {
    form.addEventListener("submit", handleRecipientSubmit);
  }

  // 3. 綁定集運單中的「從常用選取」按鈕 (防呆檢查)
  const btnSelect = document.getElementById("btn-select-recipient");
  if (btnSelect) {
    // 移除舊的監聽器 (如果有的話) 並綁定新的
    const newBtn = btnSelect.cloneNode(true);
    btnSelect.parentNode.replaceChild(newBtn, btnSelect);
    newBtn.addEventListener("click", () => window.openRecipientSelector());
  }
});
