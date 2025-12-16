// frontend/js/dashboard-main.js
// V29.6 - Fix Image Broken Links for Cloudinary

document.addEventListener("DOMContentLoaded", () => {
  if (!window.dashboardToken) {
    window.location.href = "login.html";
    return;
  }

  // 1. 初始載入核心數據
  window.loadSystemSettings(); // 載入匯率、銀行等
  window.loadUserProfile(); // 載入個資
  window.loadMyPackages(); // 載入包裹
  window.loadMyShipments(); // 載入訂單

  if (typeof window.updateGlobalWalletDisplay === "function") {
    window.updateGlobalWalletDisplay();
  }

  // 2. Tab 切換邏輯
  setupTabs();

  // 3. 表單提交事件綁定
  bindForms();

  // 4. 初始化圖片上傳器
  initUploaders();

  // 5. 其他全域按鈕綁定 (含錢包捷徑)
  bindGlobalButtons();

  // 6. 延遲執行草稿檢查
  setTimeout(() => {
    if (window.checkForecastDraftQueue) {
      window.checkForecastDraftQueue(false);
    }
  }, 500);

  // [NEW] 事件委派：全域監聽上傳憑證表單提交
  // 解決 Modal 動態載入導致 addEventListener 失效的問題
  document.body.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "upload-proof-form") {
      console.log("偵測到上傳憑證表單提交，觸發處理函式...");
      window.handleUploadProofSubmit(e);
    }
  });
});

// --- Tab 管理 ---
function setupTabs() {
  const tabs = [
    { id: "tab-packages", section: "packages-section" },
    { id: "tab-shipments", section: "shipments-section" },
    {
      id: "tab-recipients",
      section: "recipient-section",
      loadFn: window.loadRecipients,
    },
    {
      id: "tab-wallet",
      section: "wallet-section",
      loadFn: window.loadWalletData,
    },
    {
      id: "tab-unclaimed",
      section: "unclaimed-section",
      loadFn: window.loadUnclaimedList,
    },
  ];

  tabs.forEach((tab) => {
    const btn = document.getElementById(tab.id);
    if (!btn) return;

    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));

      btn.classList.add("active");
      const section = document.getElementById(tab.section);
      if (section) section.style.display = "block";

      // 切換時執行對應的載入函式 (如: 重新整理列表)
      if (tab.loadFn && typeof tab.loadFn === "function") {
        tab.loadFn();
      }
    });
  });
}

// --- 表單綁定 ---
function bindForms() {
  const forecastForm = document.getElementById("forecast-form");
  if (forecastForm) {
    forecastForm.addEventListener("submit", window.handleForecastSubmit);
    forecastForm.addEventListener("reset", () => {
      const input = document.getElementById("images");
      if (input && input.resetUploader)
        setTimeout(() => input.resetUploader(), 0);
      const warningEl = document.getElementById("forecast-warning-box");
      if (warningEl) warningEl.style.display = "none";
    });
  }

  const editPkgForm = document.getElementById("edit-package-form");
  if (editPkgForm)
    editPkgForm.addEventListener("submit", window.handleEditPackageSubmit);

  const createShipForm = document.getElementById("create-shipment-form");
  if (createShipForm)
    createShipForm.addEventListener(
      "submit",
      window.handleCreateShipmentSubmit
    );

  const profileForm = document.getElementById("edit-profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById("edit-name").value,
        phone: document.getElementById("edit-phone").value,
        defaultAddress: document.getElementById("edit-address").value,
      };
      try {
        await fetch(`${API_BASE_URL}/api/auth/me`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${window.dashboardToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        document.getElementById("edit-profile-modal").style.display = "none";
        window.loadUserProfile();
        window.showMessage("已更新", "success");
      } catch (err) {
        alert("更新失敗");
      }
    });
  }

  const pwdForm = document.getElementById("change-password-form");
  if (pwdForm) {
    pwdForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById("cp-current").value;
      const newPassword = document.getElementById("cp-new").value;
      const confirmPassword = document.getElementById("cp-confirm").value;

      if (newPassword !== confirmPassword) {
        alert("兩次輸入的新密碼不一致");
        return;
      }

      const btn = pwdForm.querySelector("button[type='submit']");
      btn.disabled = true;
      btn.textContent = "更新中...";

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/password`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${window.dashboardToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message);
          document.getElementById("change-password-modal").style.display =
            "none";
          pwdForm.reset();
        } else {
          alert(data.message || "修改失敗");
        }
      } catch (err) {
        alert("網路錯誤");
      } finally {
        btn.disabled = false;
        btn.textContent = "確認修改";
      }
    });
  }
}

function initUploaders() {
  if (window.initImageUploader) {
    window.initImageUploader("images", "forecast-uploader", 5);
    window.initImageUploader(
      "ship-product-images",
      "ship-shipment-uploader",
      20
    );
    window.initImageUploader(
      "edit-package-new-images",
      "edit-package-uploader",
      5
    );
  }
}

function bindGlobalButtons() {
  const btnEditProfile = document.getElementById("btn-edit-profile");
  if (btnEditProfile) {
    btnEditProfile.addEventListener("click", () => {
      if (window.currentUser) {
        document.getElementById("edit-name").value =
          window.currentUser.name || "";
        document.getElementById("edit-phone").value =
          window.currentUser.phone || "";
        document.getElementById("edit-address").value =
          window.currentUser.defaultAddress || "";
        document.getElementById("edit-profile-modal").style.display = "flex";
      }
    });
  }

  const btnChangePwd = document.getElementById("btn-change-password");
  if (btnChangePwd) {
    btnChangePwd.addEventListener("click", () => {
      const form = document.getElementById("change-password-form");
      if (form) form.reset();
      document.getElementById("change-password-modal").style.display = "flex";
    });
  }

  // 錢包快速捷徑點擊事件
  const btnQuickWallet = document.getElementById("btn-quick-wallet");
  if (btnQuickWallet) {
    btnQuickWallet.addEventListener("click", () => {
      // 1. 觸發切換 Tab
      const tabWallet = document.getElementById("tab-wallet");
      if (tabWallet) tabWallet.click();

      // 2. 平滑捲動至錢包區塊
      setTimeout(() => {
        const section = document.getElementById("wallet-section");
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    });
  }

  const btnCreateShip = document.getElementById("btn-create-shipment");
  if (btnCreateShip) {
    btnCreateShip.addEventListener("click", window.handleCreateShipmentClick);
  }

  const btnCopyBank = document.getElementById("btn-copy-bank-info");
  if (btnCopyBank) {
    btnCopyBank.addEventListener("click", () => {
      const bName = document.getElementById("bank-name").innerText.trim();
      const bAcc = document.getElementById("bank-account").innerText.trim();
      const bHolder = document.getElementById("bank-holder").innerText.trim();
      const text = `【匯款資訊】\n銀行：${bName}\n帳號：${bAcc}\n戶名：${bHolder}`;

      navigator.clipboard
        .writeText(text)
        .then(() => alert("✅ 匯款資訊已複製！"))
        .catch(() => alert("複製失敗，請手動複製"));
    });
  }

  const btnUploadNow = document.getElementById("btn-upload-now");
  if (btnUploadNow) {
    btnUploadNow.addEventListener("click", () => {
      document.getElementById("bank-info-modal").style.display = "none";
      if (window.lastCreatedShipmentId) {
        window.openUploadProof(window.lastCreatedShipmentId);
      } else {
        window.loadMyShipments();
      }
    });
  }

  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
  });
  document.querySelectorAll(".modal-close, .modal-close-btn").forEach((b) => {
    b.addEventListener("click", () => {
      b.closest(".modal-overlay").style.display = "none";
    });
  });
}

/**
 * 預報草稿佇列檢查
 */
window.checkForecastDraftQueue = function (isAfterSubmit = false) {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem("forecast_draft_list") || "[]");
  } catch (e) {
    queue = [];
  }

  // 提交後移除第一筆
  if (isAfterSubmit) {
    queue.shift();
    localStorage.setItem("forecast_draft_list", JSON.stringify(queue));
  }

  const container = document.getElementById("draft-queue-container");
  const listEl = document.getElementById("draft-queue-list");
  const warningEl = document.getElementById("forecast-warning-box");

  // 若無草稿，隱藏並返回
  if (!queue || queue.length === 0) {
    if (container) container.style.display = "none";
    if (warningEl) warningEl.style.display = "none";
    return;
  }

  // 渲染佇列清單
  if (container && listEl) {
    container.style.display = "flex"; // 確保顯示
    listEl.innerHTML = "";
    queue.forEach((item, idx) => {
      const isNext = idx === 0;
      const style = isNext ? "font-weight:bold; color:#d35400;" : "";
      const icon = isNext
        ? ' <i class="fas fa-arrow-left"></i> <span class="badge badge-warning" style="font-size:10px;">準備填入</span>'
        : "";
      listEl.innerHTML += `<li style="${style}">${item.name} (x${item.quantity}) ${icon}</li>`;
    });
  }

  // 自動填入第一筆 (Auto-fill)
  const current = queue[0];
  const nameInput = document.getElementById("productName");
  const qtyInput = document.getElementById("quantity");
  const noteInput = document.getElementById("note");

  if (nameInput) {
    const isFieldEmpty = !nameInput.value || nameInput.value.trim() === "";

    if (isAfterSubmit || isFieldEmpty || nameInput.value === current.name) {
      nameInput.value = current.name || "";
      qtyInput.value = current.quantity || 1;

      if (noteInput && (!noteInput.value || noteInput.value.includes("試算"))) {
        noteInput.value = "來自試算帶入";
      }

      let warnings = [];
      if (current.hasOversizedItem)
        warnings.push("⚠️ 此商品尺寸超長 (需加收超長費)");
      if (current.isOverweight)
        warnings.push("⚠️ 此商品單件超重 (需加收超重費)");

      if (warningEl) {
        if (warnings.length > 0) {
          warningEl.innerHTML = warnings.join("<br>");
          warningEl.style.display = "block";
          warningEl.className = "alert alert-error";
        } else {
          warningEl.style.display = "none";
        }
      }

      if (isAfterSubmit) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.showMessage(`已自動帶入下一筆：${current.name}`, "info");
      }
    }
  }
};

// --- 上傳憑證相關 (UI 開啟) ---
window.openUploadProof = function (id) {
  document.getElementById("upload-proof-id").value = id;
  const modal = document.getElementById("upload-proof-modal");
  const form = document.getElementById("upload-proof-form");

  if (form) form.reset();

  // 1. 自動插入統編補填欄位 (如果 HTML 尚未包含)
  const existingTaxInput = document.getElementById("proof-taxId");
  if (!existingTaxInput && form) {
    const fileGroup = form.querySelector(".form-group");
    if (fileGroup) {
      const taxDiv = document.createElement("div");
      taxDiv.className = "form-group";
      taxDiv.style.background = "#e8f0fe";
      taxDiv.style.padding = "10px";
      taxDiv.style.borderRadius = "5px";
      taxDiv.style.marginBottom = "10px";
      taxDiv.innerHTML = `
            <label style="color:#1a73e8; font-size:13px; font-weight:bold;">
                📝 發票資訊 (如需打統編請填寫)
            </label>
            <div style="display:flex; gap:10px; flex-wrap: wrap;">
                <div style="flex:1;">
                    <input type="text" id="proof-taxId" class="form-control" placeholder="統一編號 (8碼)" maxlength="8" style="font-size:13px;">
                </div>
                <div style="flex:1;">
                    <input type="text" id="proof-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
                </div>
            </div>
            <small style="color:#666; font-size:11px;">※ 若填寫統編，公司抬頭為必填項目。</small>
          `;
      form.insertBefore(taxDiv, fileGroup);
    }
  }

  // 2. 綁定連動邏輯：有填統編 -> 抬頭變必填
  setTimeout(() => {
    const taxInput = document.getElementById("proof-taxId");
    const titleInput = document.getElementById("proof-invoiceTitle");

    if (taxInput && titleInput) {
      const validateTax = () => {
        if (taxInput.value.trim().length > 0) {
          titleInput.setAttribute("required", "true");
          titleInput.style.border = "1px solid #d32f2f";
          titleInput.placeholder = "公司抬頭 (必填)";
        } else {
          titleInput.removeAttribute("required");
          titleInput.style.border = "";
          titleInput.placeholder = "公司抬頭";
        }
      };
      // 綁定輸入事件
      taxInput.oninput = validateTax;
      // 初始化狀態
      validateTax();
    }
  }, 50);

  // [Auto-fill] 自動填入預設資料
  if (window.currentUser) {
    const tInput = document.getElementById("proof-taxId");
    const titleInput = document.getElementById("proof-invoiceTitle");
    if (tInput && window.currentUser.defaultTaxId) {
      tInput.value = window.currentUser.defaultTaxId;
    }
    if (titleInput && window.currentUser.defaultInvoiceTitle) {
      titleInput.value = window.currentUser.defaultInvoiceTitle;
    }
  }

  // 顯示銀行資訊提示
  const infoBox = document.getElementById("upload-proof-bank-info");
  if (window.BANK_INFO_CACHE) {
    infoBox.innerHTML = `
            <strong>請匯款至：</strong><br>
            銀行：${window.BANK_INFO_CACHE.bankName}<br>
            帳號：<span style="color:#d32f2f; font-weight:bold;">${window.BANK_INFO_CACHE.account}</span><br>
            戶名：${window.BANK_INFO_CACHE.holder}
        `;
  }

  if (modal) modal.style.display = "flex";
};

// [Critical Debug] 上傳憑證提交 (含統編更新 + 詳細 Log)
window.handleUploadProofSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button");

  const id = document.getElementById("upload-proof-id").value;
  const file = document.getElementById("proof-file").files[0];

  // 取得統編欄位 (如果存在)
  const taxId = document.getElementById("proof-taxId")
    ? document.getElementById("proof-taxId").value.trim()
    : "";
  const invoiceTitle = document.getElementById("proof-invoiceTitle")
    ? document.getElementById("proof-invoiceTitle").value.trim()
    : "";

  if (!file) return alert("請選擇圖片");

  // [Frontend Validation] 強制檢查：有統編必填抬頭
  if (taxId && !invoiceTitle) {
    alert("請注意：填寫統一編號時，「公司抬頭」為必填項目，以利發票開立。");
    document.getElementById("proof-invoiceTitle").focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "上傳中...";

  const fd = new FormData();

  // [Fix] 關鍵修正：確保文字欄位在檔案之前加入
  // 某些後端 Multer 配置若檔案先到，可能導致 req.body 在處理檔案時尚未填充文字欄位
  if (taxId) fd.append("taxId", taxId);
  if (invoiceTitle) fd.append("invoiceTitle", invoiceTitle);

  // 檔案最後加入
  fd.append("paymentProof", file);

  // --- DEBUG LOG: 前端送出前檢查 ---
  console.log("=== [Frontend Upload Debug] ===");
  console.log("TaxID:", taxId);
  console.log("Title:", invoiceTitle);
  console.log("File:", file.name);
  console.log("FormData Entries:");
  for (var pair of fd.entries()) {
    console.log(
      pair[0] + ", " + (pair[1] instanceof File ? pair[1].name : pair[1])
    );
  }
  console.log("===============================");

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      alert("上傳成功！\n若有更新統編，系統將依新資料開立發票。");
      document.getElementById("upload-proof-modal").style.display = "none";
      window.loadMyShipments();
    } else {
      const data = await res.json();
      alert(data.message || "上傳失敗");
    }
  } catch (err) {
    console.error(err);
    alert("錯誤: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "上傳";
  }
};

// --- 7. 查看訂單詳情 (增強版：費用透明化) ---
window.openShipmentDetails = async function (id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.shipment;

    // 取得系統常數
    const CONSTANTS = window.CONSTANTS || {
      MINIMUM_CHARGE: 2000,
      OVERSIZED_FEE: 800,
      OVERWEIGHT_FEE: 800,
      OVERSIZED_LIMIT: 300,
      OVERWEIGHT_LIMIT: 100,
    };

    document.getElementById("sd-id").textContent = s.id.slice(-8).toUpperCase();

    // 渲染時間軸 (確認 renderTimeline 是否可用)
    const timelineContainer = document.getElementById("sd-timeline");
    if (timelineContainer && typeof renderTimeline === "function") {
      renderTimeline(timelineContainer, s.status);
    } else {
      // 若 renderTimeline 函式未定義，僅更新文字狀態 (Fallback)
      const statusEl = document.getElementById("sd-status");
      if (statusEl)
        statusEl.textContent = window.SHIPMENT_STATUS_MAP[s.status] || s.status;
    }

    // 基本資訊
    document.getElementById("sd-trackingTW").textContent =
      s.trackingNumberTW || "尚未產生";
    document.getElementById("sd-name").textContent = s.recipientName;
    document.getElementById("sd-phone").textContent = s.phone;
    document.getElementById("sd-address").textContent = s.shippingAddress;

    let dateHtml = `<div><strong>建立日期:</strong> <span>${new Date(
      s.createdAt
    ).toLocaleString()}</span></div>`;
    if (s.loadingDate) {
      dateHtml += `<div style="color:#28a745; font-weight:bold; margin-top:5px;">
            <i class="fas fa-ship"></i> 裝櫃日期: ${new Date(
              s.loadingDate
            ).toLocaleDateString()}
        </div>`;
    }
    document.getElementById("sd-date").innerHTML = dateHtml;

    // --- [NEW] 費用計算明細邏輯 ---
    // 我們需要重新遍歷包裹來計算是否有超重/超長，因為後端只存了 totalCost
    let hasOversized = false;
    let hasOverweight = false;
    let totalBaseFee = 0; // 所有包裹的「基本」運費總和

    if (s.packages && Array.isArray(s.packages)) {
      s.packages.forEach((pkg) => {
        // 累加包裹的基本運費
        totalBaseFee += pkg.totalCalculatedFee || 0;

        // 檢查是否含有異常規格
        const boxes = pkg.arrivedBoxes || [];
        boxes.forEach((box) => {
          const l = parseFloat(box.length) || 0;
          const w = parseFloat(box.width) || 0;
          const h = parseFloat(box.height) || 0;
          const weight = parseFloat(box.weight) || 0;
          if (
            l >= CONSTANTS.OVERSIZED_LIMIT ||
            w >= CONSTANTS.OVERSIZED_LIMIT ||
            h >= CONSTANTS.OVERSIZED_LIMIT
          )
            hasOversized = true;
          if (weight >= CONSTANTS.OVERWEIGHT_LIMIT) hasOverweight = true;
        });
      });
    }

    // 計算各項費用
    const baseFee = Math.max(totalBaseFee, CONSTANTS.MINIMUM_CHARGE); // 補足低消後的基本費
    const minChargeGap = baseFee - totalBaseFee; // 補足差額

    // 這裡我們用逆推法或邏輯判斷來顯示
    // 因為總金額 s.totalCost = baseFee + remoteFee + surcharges
    // 如果是已完成的訂單，s.totalCost 是準確的。
    // 我們嘗試顯示明確的項目：

    let breakdownHtml = `<table class="fee-summary-table">`;

    // 1. 基本運費
    breakdownHtml += `
        <tr>
            <td>基本海運費 (共 ${s.packages.length} 件)</td>
            <td align="right">$${totalBaseFee.toLocaleString()}</td>
        </tr>`;

    // 2. 低消補足
    if (minChargeGap > 0) {
      breakdownHtml += `
        <tr style="color:#28a745;">
            <td><i class="fas fa-arrow-up"></i> 未達低消補足 (低消 $${
              CONSTANTS.MINIMUM_CHARGE
            })</td>
            <td align="right">+$${minChargeGap.toLocaleString()}</td>
        </tr>`;
    }

    // 3. 附加費用 (超長/超重/偏遠)
    // 由於我們沒有在 DB 存分項，這裡只能根據包裹狀態「推算」顯示
    // 注意：如果您的後端 createShipment 有存 additionalFee，這裡讀取會更準。
    // 但基於目前資料結構，我們用 hasOversized 旗標來顯示「包含」

    if (hasOversized) {
      breakdownHtml += `
        <tr style="color:#e74a3b;">
            <td>⚠️ 超長附加費 (整單)</td>
            <td align="right">+$${CONSTANTS.OVERSIZED_FEE.toLocaleString()}</td>
        </tr>`;
    }
    if (hasOverweight) {
      breakdownHtml += `
        <tr style="color:#e74a3b;">
            <td>⚠️ 超重附加費 (整單)</td>
            <td align="right">+$${CONSTANTS.OVERWEIGHT_FEE.toLocaleString()}</td>
        </tr>`;
    }

    // 4. 偏遠地區費 (逆推：總額 - 上述費用)
    // 這種逆推法在前端展示僅供參考，主要讓客戶知道錢花去哪
    let estimatedTotal =
      baseFee +
      (hasOversized ? CONSTANTS.OVERSIZED_FEE : 0) +
      (hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0);
    let gap = s.totalCost - estimatedTotal;

    if (gap > 0) {
      breakdownHtml += `
        <tr>
            <td>偏遠地區 / 其他加收</td>
            <td align="right">+$${gap.toLocaleString()}</td>
        </tr>`;
    }

    // 5. 總計
    breakdownHtml += `
        <tr>
            <td><strong>總金額</strong></td>
            <td align="right" style="font-size:18px; color:#d32f2f;"><strong>$${s.totalCost.toLocaleString()}</strong></td>
        </tr>
    </table>`;

    // 注入 HTML
    const breakdownEl = document.getElementById("sd-fee-breakdown");
    breakdownEl.innerHTML = breakdownHtml;
    breakdownEl.style.background = "#fff";
    breakdownEl.style.border = "1px solid #eee";

    // --- (其餘照片、發票顯示邏輯保持不變) ---
    // ... (Invoice Info & Proof Images) ...

    let invoiceInfoContainer = document.getElementById("sd-invoice-info");
    if (!invoiceInfoContainer) {
      invoiceInfoContainer = document.createElement("div");
      invoiceInfoContainer.id = "sd-invoice-info";
      const addressBlock = document.getElementById("sd-address").closest("div");
      if (addressBlock) {
        addressBlock.insertAdjacentElement("afterend", invoiceInfoContainer);
      }
    }

    invoiceInfoContainer.innerHTML = `
      <div class="modal-section-title" style="margin-top:15px;">
          <i class="fas fa-file-invoice"></i> 發票資訊
      </div>
      <div style="background:#fff; border:1px solid #d9d9d9; padding:15px; border-radius:5px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <div>
                  <label style="display:block; font-size:12px; color:#666; margin-bottom:4px;">統一編號 (Tax ID)</label>
                  <input type="text" class="form-control" value="${
                    s.taxId || "未填寫 (個人發票)"
                  }" disabled 
                         style="background:#f5f5f5; font-size:13px; color:${
                           s.taxId ? "#000" : "#999"
                         };">
              </div>
              <div>
                  <label style="display:block; font-size:12px; color:#666; margin-bottom:4px;">發票抬頭 (Title)</label>
                  <input type="text" class="form-control" value="${
                    s.invoiceTitle || "-"
                  }" disabled 
                         style="background:#f5f5f5; font-size:13px;">
              </div>
          </div>
          ${
            s.invoiceNumber
              ? `
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #eee; color:#28a745; font-weight:bold; font-size:13px;">
                <i class="fas fa-check-circle"></i> 發票已開立：${s.invoiceNumber}
            </div>`
              : ""
          }
      </div>
    `;

    const gallery = document.getElementById("sd-proof-images");
    gallery.innerHTML = "";

    if (s.paymentProof) {
      if (s.paymentProof === "WALLET_PAY") {
        gallery.innerHTML = `<div style="text-align:center; padding:10px; background:#f0f8ff; border-radius:5px; color:#0056b3;">
                <i class="fas fa-wallet"></i> 使用錢包餘額支付
            </div>`;
      } else {
        // [FIX] 檢查是否為完整網址
        const proofSrc =
          s.paymentProof.startsWith("http") ||
          s.paymentProof.startsWith("https")
            ? s.paymentProof
            : `${API_BASE_URL}${s.paymentProof}`;

        gallery.innerHTML += `<div style="text-align:center;"><p>付款憑證</p><img src="${proofSrc}" onclick="window.open(this.src)" style="max-width:100px; cursor:pointer; border:1px solid #ccc; padding:2px;"></div>`;
      }
    } else {
      gallery.innerHTML = `<span style="color:#999; font-size:13px;">尚未上傳</span>`;
    }

    document.getElementById("shipment-details-modal").style.display = "flex";
  } catch (e) {
    console.error(e);
    alert("無法載入詳情");
  }
};

// 訂單詳情頁所需的時間軸渲染函式 (移至最外層確保全域可見)
function renderTimeline(container, currentStatus) {
  const steps = [
    { code: "PENDING_PAYMENT", label: "待付款" },
    { code: "PROCESSING", label: "處理中" },
    { code: "SHIPPED", label: "已裝櫃" },
    { code: "CUSTOMS_CHECK", label: "海關查驗" },
    { code: "UNSTUFFING", label: "拆櫃派送" },
    { code: "COMPLETED", label: "已完成" },
  ];

  if (currentStatus === "CANCELLED" || currentStatus === "RETURNED") {
    const text = currentStatus === "RETURNED" ? "訂單已退回" : "訂單已取消";
    container.innerHTML = `<div class="alert alert-error text-center" style="margin:10px 0;">${text}</div>`;
    return;
  }
  if (currentStatus === "PENDING_REVIEW") currentStatus = "PENDING_PAYMENT";

  let currentIndex = steps.findIndex((s) => s.code === currentStatus);
  if (currentIndex === -1) currentIndex = 0;

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; margin:20px 0; position:relative; padding:0 10px; overflow-x:auto;">`;
  html += `<div style="position:absolute; top:15px; left:20px; right:20px; height:4px; background:#eee; z-index:0; min-width:400px;"></div>`;

  const stepCount = steps.length;
  const progressPercent = (currentIndex / (stepCount - 1)) * 100;

  html += `<div style="position:absolute; top:15px; left:20px; width:calc(${progressPercent}% - 40px); max-width:calc(100% - 40px); height:4px; background:#28a745; z-index:0; transition:width 0.3s; min-width:0;"></div>`;

  steps.forEach((step, idx) => {
    const isCompleted = idx <= currentIndex;
    const color = isCompleted ? "#28a745" : "#ccc";
    const icon = isCompleted ? "fa-check-circle" : "fa-circle";

    html += `
            <div style="position:relative; z-index:1; text-align:center; flex:1; min-width:60px;">
                <i class="fas ${icon}" style="color:${color}; font-size:24px; background:#fff; border-radius:50%;"></i>
                <div style="font-size:12px; margin-top:5px; color:${
                  isCompleted ? "#333" : "#999"
                }; font-weight:${
      idx === currentIndex ? "bold" : "normal"
    }; white-space:nowrap;">
                    ${step.label}
                </div>
            </div>
        `;
  });
  html += `</div>`;
  container.innerHTML = html;
}
