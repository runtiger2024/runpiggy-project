// frontend/js/dashboard-main.js
// V27.1 - Added Invoice Validation on Proof Upload

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

  // [NEW] 錢包快速捷徑點擊事件
  const btnQuickWallet = document.getElementById("btn-quick-wallet");
  if (btnQuickWallet) {
    btnQuickWallet.addEventListener("click", () => {
      // 1. 觸發切換 Tab
      const tabWallet = document.getElementById("tab-wallet");
      if (tabWallet) tabWallet.click();

      // 2. 平滑捲動至錢包區塊
      // 延遲一點點確保 display: block 已生效
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

  // 自動插入統編補填欄位 (如果 HTML 尚未包含)
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
            <label style="color:#1a73e8; font-size:13px; font-weight:bold;">📝 統一編號 (如需修改請填寫)</label>
            <div style="display:flex; gap:10px;">
                <input type="text" id="proof-taxId" class="form-control" placeholder="統編 (8碼)" style="font-size:13px;">
                <input type="text" id="proof-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
            </div>
            <small style="color:#666; font-size:11px;">※ 若此處留空，將使用訂單建立時的資料。</small>
          `;
      form.insertBefore(taxDiv, fileGroup);
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

// 上傳憑證提交 (含統編更新)
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

  // [Validation] 若有填寫統編，抬頭必填
  if (taxId && !invoiceTitle) {
    alert("請注意：填寫統一編號時，「公司抬頭」為必填項目，以利發票開立。");
    document.getElementById("proof-invoiceTitle").focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "上傳中...";

  const fd = new FormData();
  fd.append("paymentProof", file);
  // 加入統編資訊
  if (taxId) fd.append("taxId", taxId);
  if (invoiceTitle) fd.append("invoiceTitle", invoiceTitle);

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
    alert("錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "上傳";
  }
};
