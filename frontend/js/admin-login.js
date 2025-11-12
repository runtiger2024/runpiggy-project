// 這是 frontend/js/admin-login.js

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("admin-login-form");
  const messageBox = document.getElementById("message-box");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const email = document.getElementById("admin-email").value;
    const password = document.getElementById("admin-password").value;

    try {
      // (1) 我們使用和「會員」一樣的登入 API
      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "登入失敗");
      }

      // (2) (關鍵！) 檢查這個人是不是管理員 (ADMIN)
      //     我們需要呼叫 /api/auth/me 來取得 role
      const profileResponse = await fetch("http://localhost:3000/api/auth/me", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const profileData = await profileResponse.json();

      if (!profileResponse.ok || profileData.user.role !== "ADMIN") {
        throw new Error("權限不足：您不是管理員");
      }

      // (3) 登入成功！
      showMessage("管理員登入成功！正在跳轉...", "success");

      // (4) (重要！) 我們把 Token 存在 "admin_token"，
      //     和 "token" (會員的) 分開
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem(
        "admin_name",
        profileData.user.name || profileData.user.email
      );

      // 5. 跳轉到「包裹管理頁面」(我們下一步會建立它)
      setTimeout(() => {
        window.location.href = "admin-parcels.html";
      }, 1500);
    } catch (error) {
      console.error("登入錯誤:", error);
      showMessage(error.message, "error");
    }
  });

  // 訊息顯示工具
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
