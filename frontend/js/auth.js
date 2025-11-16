// 這是 frontend/js/auth.js (已修復 API_BASE_URL)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");
  const messageBox = document.getElementById("message-box");

  // --- 2. 頁籤切換邏輯 ---
  // (參考 public/customer.html)
  loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    showMessage("", "clear"); // 清除訊息
  });

  registerTab.addEventListener("click", () => {
    loginTab.classList.remove("active");
    registerTab.classList.add("active");
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    showMessage("", "clear"); // 清除訊息
  });

  // --- 3. 登入表單提交 (呼叫 /api/auth/login) ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // 防止頁面跳轉
    showMessage("", "clear");

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 登入失敗 (例如 401 密碼錯誤)
        throw new Error(data.message || "登入失敗");
      }

      // 登入成功！
      showMessage("登入成功！正在跳轉至會員中心...", "success");

      // (關鍵) 將 Token 存入瀏覽器的 localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email); // 儲存使用者名稱

      // 2 秒後跳轉到 dashboard.html
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    } catch (error) {
      console.error("登入錯誤:", error);
      showMessage(error.message, "error");
    }
  });

  // --- 4. 註冊表單提交 (呼叫 /api/auth/register) ---
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;

    if (password.length < 6) {
      showMessage("密碼長度至少需要 6 個字元", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 註冊失敗 (例如 400 Email 已存在)
        throw new Error(data.message || "註冊失敗");
      }

      // 註冊成功！
      showMessage("註冊成功！正在自動登入並跳轉...", "success");

      // (關鍵) 將 Token 存入瀏覽器的 localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email);

      // 2 秒後跳轉到 dashboard.html
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
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
