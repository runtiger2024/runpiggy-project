// frontend/js/dashboard-main.js
// 負責：程式入口、事件綁定、圖片上傳初始化

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

  // 2. 預報草稿檢查
  const draftQueue = JSON.parse(
    localStorage.getItem("forecast_draft_list") || "[]"
  );
  const queueContainer = document.getElementById("draft-queue-container");
  const queueList = document.getElementById("draft-queue-list");
  if (draftQueue.length > 0) {
    queueContainer.style.display = "flex";
    queueList.innerHTML = "";
    draftQueue.forEach(
      (item) =>
        (queueList.innerHTML += `<li>${item.name} (x${item.quantity})</li>`)
    );

    // 自動填入第一筆
    const next = draftQueue.shift();
    document.getElementById("productName").value = next.name || "";
    document.getElementById("quantity").value = next.quantity || 1;
    document.getElementById("note").value = "來自試算";
    localStorage.setItem("forecast_draft_list", JSON.stringify(draftQueue));
    window.showMessage(`已自動填入: ${next.name}`, "info");
  } else {
    queueContainer.style.display = "none";
  }

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

  // [New] 監聽預報表單的 Reset 事件 (當 handleForecastSubmit 成功呼叫 form.reset() 時觸發)
  // 這會確保圖片預覽區和內部 DataTransfer 被清空
  const forecastForm = document.getElementById("forecast-form");
  if (forecastForm) {
    forecastForm.addEventListener("reset", () => {
      const input = document.getElementById("images");
      if (input && input.resetUploader) {
        // 延遲一下確保 reset 事件完成後再執行 UI 重繪
        setTimeout(() => input.resetUploader(), 0);
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
