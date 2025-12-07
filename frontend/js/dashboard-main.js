// frontend/js/dashboard-main.js
// V25.1 - 佇列自動帶入 & 預報警示

document.addEventListener("DOMContentLoaded", () => {
  if (!window.dashboardToken) {
    window.location.href = "login.html";
    return;
  }

  // 1. 初始載入
  window.loadSystemSettings();
  window.loadUserProfile();
  window.loadMyPackages();
  window.loadMyShipments();

  // 2. [Modified] 啟動預報草稿檢查 (不會立即刪除，等待提交)
  window.checkForecastDraftQueue(false);

  // 3. 事件綁定
  // 頁籤
  const tabPackages = document.getElementById("tab-packages");
  const tabShipments = document.getElementById("tab-shipments");
  const pkgSec = document.getElementById("packages-section");
  const shipSec = document.getElementById("shipments-section");

  tabPackages.addEventListener("click", () => {
    tabPackages.classList.add("active");
    tabShipments.classList.remove("active");
    pkgSec.style.display = "block";
    shipSec.style.display = "none";
  });
  tabShipments.addEventListener("click", () => {
    tabPackages.classList.remove("active");
    tabShipments.classList.add("active");
    pkgSec.style.display = "none";
    shipSec.style.display = "block";
  });

  // 表單提交事件
  document
    .getElementById("forecast-form")
    .addEventListener("submit", window.handleForecastSubmit);
  document
    .getElementById("edit-package-form")
    .addEventListener("submit", window.handleEditPackageSubmit);
  document
    .getElementById("create-shipment-form")
    .addEventListener("submit", window.handleCreateShipmentSubmit);
  document
    .getElementById("upload-proof-form")
    .addEventListener("submit", window.handleUploadProofSubmit);

  // 個人資料編輯
  document.getElementById("btn-edit-profile").addEventListener("click", () => {
    document.getElementById("edit-name").value = window.currentUser.name || "";
    document.getElementById("edit-phone").value =
      window.currentUser.phone || "";
    document.getElementById("edit-address").value =
      window.currentUser.defaultAddress || "";
    document.getElementById("edit-profile-modal").style.display = "flex";
  });
  document
    .getElementById("edit-profile-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById("edit-name").value,
        phone: document.getElementById("edit-phone").value,
        defaultAddress: document.getElementById("edit-address").value,
      };
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
    });

  // --- [新增] 修改密碼功能 ---
  const btnChangePwd = document.getElementById("btn-change-password");
  const modalChangePwd = document.getElementById("change-password-modal");
  const formChangePwd = document.getElementById("change-password-form");

  if (btnChangePwd && modalChangePwd) {
    btnChangePwd.addEventListener("click", () => {
      if (formChangePwd) formChangePwd.reset();
      modalChangePwd.style.display = "flex";
    });
  }

  if (formChangePwd) {
    formChangePwd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById("cp-current").value;
      const newPassword = document.getElementById("cp-new").value;
      const confirmPassword = document.getElementById("cp-confirm").value;

      if (newPassword !== confirmPassword) {
        alert("兩次輸入的新密碼不一致");
        return;
      }

      const btn = formChangePwd.querySelector("button[type='submit']");
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
          modalChangePwd.style.display = "none";
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

  // 建立訂單按鈕
  document
    .getElementById("btn-create-shipment")
    .addEventListener("click", window.handleCreateShipmentClick);

  // 地區變更觸發試算
  const locSelect = document.getElementById("ship-delivery-location");
  locSelect.addEventListener("change", () => {
    const text = locSelect.options[locSelect.selectedIndex].text;
    document.getElementById("ship-remote-area-info").style.display = "block";
    document.getElementById("ship-selected-area-name").textContent = text;
    window.recalculateShipmentTotal();
  });

  // --- [Updated] 初始化動態圖片上傳器 ---
  if (window.initImageUploader) {
    // 1. 預報包裹
    window.initImageUploader("images", "forecast-uploader", 5);
    // 2. 建立集運單
    window.initImageUploader(
      "ship-product-images",
      "ship-shipment-uploader",
      20
    );
    // 3. 編輯包裹
    window.initImageUploader(
      "edit-package-new-images",
      "edit-package-uploader",
      5
    );
  }

  // [New] 監聽預報表單的 Reset 事件
  const forecastForm = document.getElementById("forecast-form");
  if (forecastForm) {
    forecastForm.addEventListener("reset", () => {
      const input = document.getElementById("images");
      if (input && input.resetUploader) {
        setTimeout(() => input.resetUploader(), 0);
      }
      // 重置時同時隱藏警示
      const warningEl = document.getElementById("forecast-warning-box");
      if (warningEl) warningEl.style.display = "none";
    });
  }

  // --- [Fix] 訂單成功彈窗的「複製資訊」按鈕邏輯 ---
  const btnCopyBank = document.getElementById("btn-copy-bank-info");
  if (btnCopyBank) {
    btnCopyBank.addEventListener("click", () => {
      const bName = document.getElementById("bank-name").innerText.trim();
      const bAcc = document.getElementById("bank-account").innerText.trim();
      const bHolder = document.getElementById("bank-holder").innerText.trim();

      // 組合複製文字
      const textToCopy = `【匯款資訊】\n銀行：${bName}\n帳號：${bAcc}\n戶名：${bHolder}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            alert("✅ 匯款資訊已複製到剪貼簿！");
          })
          .catch((err) => {
            console.error("Clipboard Error:", err);
            alert("複製失敗，請手動選取文字複製。");
          });
      } else {
        alert("您的瀏覽器不支援自動複製，請手動截圖或複製。");
      }
    });
  }

  // [新增] 綁定「立即上傳憑證」按鈕事件
  const btnUploadNow = document.getElementById("btn-upload-now");
  if (btnUploadNow) {
    btnUploadNow.addEventListener("click", () => {
      // 1. 關閉成功彈窗
      document.getElementById("bank-info-modal").style.display = "none";

      // 2. 檢查是否有剛建立的訂單 ID
      if (window.lastCreatedShipmentId) {
        // 3. 直接呼叫開啟上傳憑證視窗的函式 (位於 dashboard-shipments.js)
        window.openUploadProof(window.lastCreatedShipmentId);
      } else {
        // 防呆：如果沒有 ID (理論上不應發生)，則重新整理列表讓用戶自己選
        window.loadMyShipments();
      }
    });
  }

  // 關閉彈窗通用
  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
  });
  document.querySelectorAll(".modal-close, .modal-close-btn").forEach((b) => {
    b.addEventListener(
      "click",
      () => (b.closest(".modal-overlay").style.display = "none")
    );
  });
});

/**
 * [NEW] 預報草稿佇列檢查與自動帶入
 * @param {boolean} isAfterSubmit - 是否為提交成功後 (如果是，移除第一筆並載入下一筆)
 */
window.checkForecastDraftQueue = function (isAfterSubmit = false) {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem("forecast_draft_list") || "[]");
  } catch (e) {
    queue = [];
  }

  if (isAfterSubmit) {
    // 移除剛處理完的第一筆
    queue.shift();
    localStorage.setItem("forecast_draft_list", JSON.stringify(queue));
  }

  const container = document.getElementById("draft-queue-container");
  const listEl = document.getElementById("draft-queue-list");
  const warningEl = document.getElementById("forecast-warning-box");

  // 若佇列空了，隱藏相關 UI
  if (queue.length === 0) {
    if (container) container.style.display = "none";
    if (warningEl) warningEl.style.display = "none";
    return;
  }

  // 顯示佇列清單
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

  // 自動帶入第一筆資料到表單 (僅當表單是空的時候，或者剛提交完)
  const current = queue[0];
  const nameInput = document.getElementById("productName");
  const qtyInput = document.getElementById("quantity");
  const noteInput = document.getElementById("note");

  if (nameInput && (isAfterSubmit || nameInput.value === "")) {
    nameInput.value = current.name || "";
    qtyInput.value = current.quantity || 1;
    noteInput.value = "來自試算帶入";

    // [Point 1] 顯示警示：檢查超長或超重
    // 這些屬性 (hasOversizedItem, isOverweight) 來自 calculatorController 回傳的結果
    let warnings = [];
    if (current.hasOversizedItem)
      warnings.push("⚠️ 此商品尺寸超長 (需加收超長費)");
    if (current.isOverweight) warnings.push("⚠️ 此商品單件超重 (需加收超重費)");

    if (warningEl) {
      if (warnings.length > 0) {
        warningEl.innerHTML = warnings.join("<br>");
        warningEl.style.display = "block";
        // 加入震動動畫提醒
        warningEl.classList.add("alert-error");
      } else {
        warningEl.style.display = "none";
      }
    }

    // 提示用戶
    window.showMessage(`已自動帶入：${current.name}`, "info");
  }
};
