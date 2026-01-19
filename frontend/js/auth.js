// frontend/js/auth.js

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");
  const messageBox = document.getElementById("message-box");

  /**
   * 統一的 API 請求處理器
   * 解決 "Unexpected token <" 的核心方案：先檢查 Content-Type 再解析 JSON
   */
  async function apiRequest(url, options) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    // 檢查回應是否為 JSON 格式
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) {
        // 處理後端回傳的邏輯錯誤 (如：密碼錯誤、Email 已存在)
        throw new Error(data.message || "請求失敗");
      }
      return data;
    } else {
      // 若回傳非 JSON (如 HTML 404/500 頁面)，讀取文本以供偵錯，但不執行 JSON 解析
      const errorText = await response.text();
      console.error("伺服器回傳了非預期的內容 (HTML):", errorText);
      throw new Error("伺服器路徑錯誤或連線異常 (收到非 JSON 回應)");
    }
  }

  /**
   * 統一處理驗證成功後的邏輯 (儲存 Token 並跳轉)
   */
  function handleAuthSuccess(data) {
    // 顯示成功訊息
    showMessage(data.message || "操作成功！正在跳轉...", "success");

    // (關鍵) 將 Token 與使用者名稱存入 localStorage
    localStorage.setItem("token", data.token);

    // 優先使用後端回傳的名稱，若無則使用 Email
    const savedName = data.user.name || data.user.email;
    localStorage.setItem("userName", savedName);

    // 2 秒後跳轉到會員中心
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 2000);
  }

  // --- 2. 頁籤切換邏輯 ---
  loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    showMessage("", "clear");
  });

  registerTab.addEventListener("click", () => {
    loginTab.classList.remove("active");
    registerTab.classList.add("active");
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    showMessage("", "clear");
  });

  // --- 3. 登入表單提交 (呼叫 /api/auth/login) ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("正在登入...", "success");

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const data = await apiRequest(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      handleAuthSuccess(data);
    } catch (error) {
      console.error("登入錯誤:", error);
      showMessage(error.message, "error");
    }
  });

  // --- 4. 註冊表單提交 (呼叫 /api/auth/register) ---
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("正在註冊...", "success");

    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;

    // 前端基本驗證
    if (password.length < 6) {
      showMessage("密碼長度至少需要 6 個字元", "error");
      return;
    }

    try {
      const data = await apiRequest(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      handleAuthSuccess(data);
    } catch (error) {
      console.error("註冊錯誤:", error);
      showMessage(error.message, "error");
    }
  });

  // --- 5. 訊息顯示工具 ---
  function showMessage(message, type) {
    messageBox.textContent = message;

    if (type === "error") {
      messageBox.className = "alert alert-error";
      messageBox.style.display = "block";
    } else if (type === "success") {
      messageBox.className = "alert alert-success";
      messageBox.style.display = "block";
    } else {
      messageBox.style.display = "none";
    }
  }
});
