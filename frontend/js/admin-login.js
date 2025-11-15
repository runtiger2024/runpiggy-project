// 這是 frontend/js/admin-login.js (V3 權限系統版)
// (儲存 admin_permissions)

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("admin-login-form");
  const messageBox = document.getElementById("message-box");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const email = document.getElementById("admin-email").value;
    const password = document.getElementById("admin-password").value;

    try {
      // (1) 呼叫登入 API
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "登入失敗");
      }

      // (2) (關鍵！) 取得 'me' 的資料 (包含權限)
      const profileResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const profileData = await profileResponse.json();

      // [*** V3 關鍵修正：檢查 permissions 陣列 ***]
      // (不再檢查 profileData.user.role)
      const permissions = profileData.user?.permissions;
      if (
        !profileResponse.ok ||
        !Array.isArray(permissions) ||
        permissions.length === 0
      ) {
        throw new Error("權限不足：您不是管理員或操作員");
      }
      // [*** 修正結束 ***]

      // (3) 登入成功！
      showMessage("管理員登入成功！正在跳轉...", "success");

      // (4) [*** V3 關鍵修正：儲存權限 ***]
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem(
        "admin_name",
        profileData.user.name || profileData.user.email
      );
      // 儲存權限陣列的 "字串" 版本
      localStorage.setItem("admin_permissions", JSON.stringify(permissions));
      // 移除舊的
      localStorage.removeItem("admin_role");
      // [*** 修正結束 ***]

      setTimeout(() => {
        window.location.href = "admin-dashboard.html";
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
