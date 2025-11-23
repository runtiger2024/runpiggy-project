// frontend/js/dashboard-core.js
// 負責：全域變數、工具函式、使用者資料、系統設定

// --- 全域變數 ---
window.currentUser = null;
window.allPackagesData = []; // 包裹快取
window.dashboardToken = localStorage.getItem("token");

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
        if (data.bankInfo && typeof window.updateBankInfoDOM === "function") {
          window.updateBankInfoDOM(data.bankInfo);
        }
      }
    }
  } catch (e) {
    console.warn("Config load failed, using defaults.");
  }
};
