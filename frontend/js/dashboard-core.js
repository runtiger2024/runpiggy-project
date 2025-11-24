// frontend/js/dashboard-core.js
// 負責：全域變數、工具函式、使用者資料、系統設定

// --- 全域變數 ---
window.currentUser = null;
window.allPackagesData = []; // 包裹快取
window.dashboardToken = localStorage.getItem("token");
window.BANK_INFO_CACHE = null; // [新增] 用於暫存銀行資訊

// --- 工具函式 ---
window.showMessage = function (message, type) {
  const messageBox = document.getElementById("message-box");
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `alert alert-${type}`;
  messageBox.style.display = "block";
  setTimeout(() => {
    messageBox.style.display = "none";
  }, 3000);
};

// 開啟圖片瀏覽大圖
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;

  gallery.innerHTML = "";
  if (images && Array.isArray(images) && images.length > 0) {
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.alt = "預覽圖";
      img.style.cssText =
        "width:100%; object-fit:cover; border-radius:4px; cursor:pointer;";
      img.onclick = () => window.open(img.src, "_blank");
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML =
      "<p style='grid-column:1/-1;text-align:center;color:#999;'>沒有照片</p>";
  }
  modal.style.display = "flex";
};

// --- 資料載入 ---
window.loadUserProfile = async function () {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    if (!response.ok) throw new Error("Auth failed");
    const data = await response.json();
    window.currentUser = data.user;

    document.getElementById("welcome-message").textContent = `${
      window.currentUser.name || "親愛的會員"
    }，您好`;
    document.getElementById("user-email").textContent =
      window.currentUser.email;
    document.getElementById("user-phone").textContent =
      window.currentUser.phone || "(未填寫)";
    document.getElementById("user-address").textContent =
      window.currentUser.defaultAddress || "(未填寫)";
  } catch (error) {
    console.error("User profile error:", error);
    localStorage.removeItem("token");
    window.location.href = "login.html";
  }
};

window.loadSystemSettings = async function () {
  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.rates) {
          window.RATES = data.rates.categories || window.RATES;
          window.CONSTANTS = data.rates.constants || window.CONSTANTS;
        }
        if (data.remoteAreas) window.REMOTE_AREAS = data.remoteAreas;

        // [修改] 儲存銀行資訊到全域變數，並更新 DOM
        if (data.bankInfo) {
          window.BANK_INFO_CACHE = data.bankInfo;
          if (typeof window.updateBankInfoDOM === "function") {
            window.updateBankInfoDOM(data.bankInfo);
          }
        }
      }
    }
  } catch (e) {
    console.warn("Config load failed, using defaults.");
  }
};

/**
 * [NEW] 初始化動態圖片上傳器
 * @param {string} inputId - 原本隱藏的 input type="file" ID
 * @param {string} containerId - 用來放置預覽圖與 + 號的容器 ID
 * @param {number} maxFiles - 最大上傳張數 (預設 5)
 */
window.initImageUploader = function (inputId, containerId, maxFiles = 5) {
  const mainInput = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!mainInput || !container) return;

  // 使用 DataTransfer 來模擬 FileList (因為 input.files 是唯讀的)
  const dataTransfer = new DataTransfer();

  // 渲染畫面函式
  function render() {
    container.innerHTML = "";

    // 1. 顯示已選圖片
    Array.from(dataTransfer.files).forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "upload-item";

      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.onclick = () => window.open(img.src, "_blank"); // 點擊放大

      const removeBtn = document.createElement("div");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.onclick = (e) => {
        e.stopPropagation(); // 防止觸發圖片點擊
        dataTransfer.items.remove(index); // 從清單移除
        mainInput.files = dataTransfer.files; // 同步回原本 input
        render(); // 重繪
      };

      item.appendChild(img);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });

    // 2. 顯示「+」按鈕 (若未達上限)
    if (dataTransfer.files.length < maxFiles) {
      const addLabel = document.createElement("label");
      addLabel.className = "upload-add-btn";
      addLabel.innerHTML = `<i class="fas fa-plus"></i><span>${dataTransfer.files.length}/${maxFiles}</span>`;

      // 建立一個臨時的 input 來觸發選檔
      const tempInput = document.createElement("input");
      tempInput.type = "file";
      tempInput.accept = "image/*";
      tempInput.multiple = true; // 允許一次選多張
      tempInput.style.display = "none";

      tempInput.onchange = (e) => {
        const newFiles = Array.from(e.target.files);
        newFiles.forEach((f) => {
          // 檢查是否超過總數
          if (dataTransfer.items.length < maxFiles) {
            dataTransfer.items.add(f);
          }
        });
        mainInput.files = dataTransfer.files; // 同步回原本 input
        render(); // 重繪
      };

      addLabel.appendChild(tempInput);
      container.appendChild(addLabel);
    }
  }

  // 初次渲染
  render();

  // 3. 監聽外部重置 (例如表單提交後清空)
  // 我們可以監聽 mainInput 的 change 事件，如果被外部清空 (value = '')，則重置 UI
  // 但由於我們上面主動修改了 files，這裡用一個自訂事件或簡單的 reset 函式更佳
  // 這裡做一個簡單的 hack: 給 mainInput 綁定一個 resetUploader 方法
  mainInput.resetUploader = () => {
    dataTransfer.items.clear();
    mainInput.value = "";
    render();
  };
};
