// frontend/js/dashboard-main.js
// V25.3 - 整合錢包、收件人與通知中心

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

  // 2. 啟動預報草稿檢查
  if (window.checkForecastDraftQueue) {
    window.checkForecastDraftQueue(false);
  }

  // 3. Tab 切換邏輯 (統一管理)
  setupTabs();

  // 4. 表單提交事件綁定
  bindForms();

  // 5. 初始化圖片上傳器
  initUploaders();

  // 6. 其他全域按鈕綁定 (個人資料、密碼修改)
  bindGlobalButtons();
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
    }, // 需要 dashboard-recipient.js
    {
      id: "tab-wallet",
      section: "wallet-section",
      loadFn: window.loadWalletData,
    }, // 需要 dashboard-wallet.js
  ];

  tabs.forEach((tab) => {
    const btn = document.getElementById(tab.id);
    if (!btn) return;

    btn.addEventListener("click", () => {
      // 1. UI 狀態切換
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));

      btn.classList.add("active");
      const section = document.getElementById(tab.section);
      if (section) section.style.display = "block";

      // 2. 觸發該頁面的資料載入 (Lazy Load)
      if (tab.loadFn && typeof tab.loadFn === "function") {
        tab.loadFn();
      }
    });
  });
}

// --- 表單綁定 ---
function bindForms() {
  // 預報
  const forecastForm = document.getElementById("forecast-form");
  if (forecastForm) {
    forecastForm.addEventListener("submit", window.handleForecastSubmit);
    // Reset 時重置圖片元件
    forecastForm.addEventListener("reset", () => {
      const input = document.getElementById("images");
      if (input && input.resetUploader)
        setTimeout(() => input.resetUploader(), 0);
      const warningEl = document.getElementById("forecast-warning-box");
      if (warningEl) warningEl.style.display = "none";
    });
  }

  // 編輯包裹
  const editPkgForm = document.getElementById("edit-package-form");
  if (editPkgForm)
    editPkgForm.addEventListener("submit", window.handleEditPackageSubmit);

  // 建立訂單
  const createShipForm = document.getElementById("create-shipment-form");
  if (createShipForm)
    createShipForm.addEventListener(
      "submit",
      window.handleCreateShipmentSubmit
    );

  // 上傳憑證
  const proofForm = document.getElementById("upload-proof-form");
  if (proofForm)
    proofForm.addEventListener("submit", window.handleUploadProofSubmit);

  // 個人資料
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

  // 修改密碼
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

// --- 初始化上傳器 ---
function initUploaders() {
  if (window.initImageUploader) {
    // 1. 預報包裹 (5張)
    window.initImageUploader("images", "forecast-uploader", 5);
    // 2. 建立集運單 (20張)
    window.initImageUploader(
      "ship-product-images",
      "ship-shipment-uploader",
      20
    );
    // 3. 編輯包裹 (5張)
    window.initImageUploader(
      "edit-package-new-images",
      "edit-package-uploader",
      5
    );
    // 4. [New] 錢包儲值憑證 (1張)
    const depProof = document.getElementById("dep-proof");
    if (depProof) {
      // 這裡可以選擇是否套用預覽器，或保持原生 input file
      // 為了保持一致性，暫不套用複雜預覽，保持簡單
    }
  }
}

// --- 按鈕事件綁定 ---
function bindGlobalButtons() {
  // 編輯個人資料按鈕
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

  // 修改密碼按鈕
  const btnChangePwd = document.getElementById("btn-change-password");
  if (btnChangePwd) {
    btnChangePwd.addEventListener("click", () => {
      const form = document.getElementById("change-password-form");
      if (form) form.reset();
      document.getElementById("change-password-modal").style.display = "flex";
    });
  }

  // 建立訂單 (合併打包) 按鈕
  const btnCreateShip = document.getElementById("btn-create-shipment");
  if (btnCreateShip) {
    btnCreateShip.addEventListener("click", window.handleCreateShipmentClick);
  }

  // 訂單詳情中的複製按鈕
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

  // 立即上傳憑證 (從成功彈窗跳轉)
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

  // 關閉彈窗 (通用)
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
 * 預報草稿佇列檢查 (保留原功能)
 */
window.checkForecastDraftQueue = function (isAfterSubmit = false) {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem("forecast_draft_list") || "[]");
  } catch (e) {
    queue = [];
  }

  if (isAfterSubmit) {
    queue.shift();
    localStorage.setItem("forecast_draft_list", JSON.stringify(queue));
  }

  const container = document.getElementById("draft-queue-container");
  const listEl = document.getElementById("draft-queue-list");
  const warningEl = document.getElementById("forecast-warning-box");

  if (queue.length === 0) {
    if (container) container.style.display = "none";
    if (warningEl) warningEl.style.display = "none";
    return;
  }

  if (container && listEl) {
    container.style.display = "flex";
    listEl.innerHTML = "";
    queue.forEach((item, idx) => {
      const isNext = idx === 0;
      const style = isNext ? "font-weight:bold; color:#d35400;" : "";
      const icon = isNext ? ' <i class="fas fa-arrow-left"></i> 準備預報' : "";
      listEl.innerHTML += `<li style="${style}">${item.name} (x${item.quantity}) ${icon}</li>`;
    });
  }

  const current = queue[0];
  const nameInput = document.getElementById("productName");
  const qtyInput = document.getElementById("quantity");
  const noteInput = document.getElementById("note");

  if (nameInput && (isAfterSubmit || nameInput.value === "")) {
    nameInput.value = current.name || "";
    qtyInput.value = current.quantity || 1;
    noteInput.value = "來自試算帶入";

    let warnings = [];
    if (current.hasOversizedItem)
      warnings.push("⚠️ 此商品尺寸超長 (需加收超長費)");
    if (current.isOverweight) warnings.push("⚠️ 此商品單件超重 (需加收超重費)");

    if (warningEl) {
      if (warnings.length > 0) {
        warningEl.innerHTML = warnings.join("<br>");
        warningEl.style.display = "block";
        warningEl.classList.add("alert-error");
      } else {
        warningEl.style.display = "none";
      }
    }
    window.showMessage(`已自動帶入：${current.name}`, "info");
  }
};
