// frontend/js/dashboard-main.js
// V25.10 - Fix Forecast Draft Queue & Auto-fill Logic

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

  // 5. 其他全域按鈕綁定
  bindGlobalButtons();

  // 6. [Fix] 延遲執行草稿檢查，確保 DOM (尤其是 Tab 內的表單) 已準備就緒
  // 並傳入 false 代表這是頁面初次載入
  setTimeout(() => {
    if (window.checkForecastDraftQueue) {
      window.checkForecastDraftQueue(false);
    }
  }, 500);
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

  const proofForm = document.getElementById("upload-proof-form");
  if (proofForm)
    proofForm.addEventListener("submit", window.handleUploadProofSubmit);

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
 * 預報草稿佇列檢查 (修復版)
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
    // [Fix] 邏輯修正：只要有草稿，且是在提交後(準備下一筆) 或是 剛載入頁面，就嘗試填入
    // 移除 input.value === "" 的嚴格檢查，改為更寬容的判斷，避免瀏覽器自動填充導致失效
    const isFieldEmpty = !nameInput.value || nameInput.value.trim() === "";

    if (isAfterSubmit || isFieldEmpty || nameInput.value === current.name) {
      nameInput.value = current.name || "";
      qtyInput.value = current.quantity || 1;

      // 只有當備註是空的或已經是"來自試算"時才覆蓋，避免蓋掉使用者手動打的字
      if (noteInput && (!noteInput.value || noteInput.value.includes("試算"))) {
        noteInput.value = "來自試算帶入";
      }

      // 警示訊息
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

      // 滾動到表單位置，提示用戶
      if (isAfterSubmit) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.showMessage(`已自動帶入下一筆：${current.name}`, "info");
      }
    }
  }
};
