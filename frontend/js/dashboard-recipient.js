// frontend/js/dashboard-recipient.js
// 負責常用收件人管理與選擇邏輯
// V25.6 - Fixed: Hoisting issues with custom loader

// --- 函式定義 (移至上方確保初始化時可讀取) ---

// 1. 載入與渲染
window.loadRecipients = async function () {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  container.innerHTML =
    '<p class="text-center" style="width:100%; color:#999;">載入中...</p>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/recipients`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.recipients.length > 0) {
      window.myRecipients = data.recipients; // 快取
      renderRecipients(data.recipients);
    } else {
      container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:30px; color:#999;">
                    <i class="fas fa-address-book" style="font-size:30px; margin-bottom:10px;"></i><br>
                    尚未建立常用收件人
                </div>`;
      window.myRecipients = [];
    }
  } catch (e) {
    container.innerHTML = `<p class="text-center" style="color:red;">載入失敗</p>`;
  }
};

function renderRecipients(list) {
  const container = document.getElementById("recipient-list-container");
  container.innerHTML = "";

  list.forEach((r) => {
    const card = document.createElement("div");
    card.className = `recipient-card ${r.isDefault ? "default-card" : ""}`;

    // 隱藏敏感資訊 (身分證)
    const maskedId = r.idNumber
      ? r.idNumber.substring(0, 3) + "*****" + r.idNumber.slice(-2)
      : "";

    card.innerHTML = `
            <div class="recipient-header">
                <div>
                    <span class="recipient-name">${r.name}</span>
                    ${
                      r.isDefault
                        ? '<span class="badge-default">預設</span>'
                        : ""
                    }
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
        `;
    container.appendChild(card);
  });
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
      window.loadRecipients(); // 重整列表
    } else {
      alert("操作失敗");
    }
  } catch (e) {
    alert("網路錯誤");
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
    window.loadRecipients();
  } catch (e) {
    alert("刪除失敗");
  }
};

window.setDefaultRecipient = async function (id) {
  try {
    const target = window.myRecipients.find((r) => r.id === id);
    if (!target) return;

    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({ ...target, isDefault: true }),
    });
    window.loadRecipients();
    window.showMessage("已設為預設", "success");
  } catch (e) {
    alert("設定失敗");
  }
};

// 4. 選擇器邏輯 (在集運單 Modal 中使用)
window.openRecipientSelector = async function () {
  const modal = document.getElementById("recipient-selector-modal");
  const list = document.getElementById("recipient-selector-list");

  if (!window.myRecipients || window.myRecipients.length === 0) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/recipients`, {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      });
      const data = await res.json();
      if (data.success) window.myRecipients = data.recipients;
    } catch (e) {}
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

// --- 初始化事件綁定 (移至下方) ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. 綁定 Tab 切換
  const tabRecipients = document.getElementById("tab-recipients");
  if (tabRecipients) {
    tabRecipients.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));

      tabRecipients.classList.add("active");
      document.getElementById("recipient-section").style.display = "block";

      window.loadRecipients();
    });
  }

  // 2. 綁定「新增收件人」按鈕
  const btnAdd = document.getElementById("btn-add-recipient");
  if (btnAdd) {
    // 使用 Arrow function 確保 window.openRecipientModal 存在
    btnAdd.addEventListener("click", () => window.openRecipientModal("create"));
  }

  // 3. 綁定表單提交
  const form = document.getElementById("recipient-form");
  if (form) {
    form.addEventListener("submit", handleRecipientSubmit);
  }

  // 4. 綁定集運單中的「從常用選取」按鈕
  const btnSelect = document.getElementById("btn-select-recipient");
  if (btnSelect) {
    // 這裡修復了 ReferenceError
    btnSelect.addEventListener("click", () => window.openRecipientSelector());
  }
});
