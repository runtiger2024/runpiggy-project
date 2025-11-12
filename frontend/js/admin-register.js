// 這是 frontend/js/admin-register.js (已修復 API_BASE_URL)

document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("register-form");
  const messageBox = document.getElementById("message-box");
  const adminToken = localStorage.getItem("admin_token");

  // (1) 檢查管理員是否登入
  if (!adminToken) {
    alert("請先登入管理員帳號");
    window.location.href = "admin-login.html";
    return;
  }

  // (2) 綁定表單提交事件
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    // 收集表單資料
    const name = document.getElementById("staff-name").value;
    const email = document.getElementById("staff-email").value;
    const password = document.getElementById("staff-password").value;
    const role = document.getElementById("staff-role").value;

    const requestData = { name, email, password, role };

    try {
      // (3) 呼叫我們在 adminRoutes.js 建立的新 API
      const response = await fetch(`${API_BASE_URL}/api/admin/users/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`, // (重要) 必須帶上管理員 Token
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (!response.ok) {
        // (例如 "這個 Email 已經被註冊了")
        throw new Error(data.message || "建立失敗");
      }

      // (4) 成功
      showMessage(
        `成功建立員工: ${data.user.email} (${data.user.role})`,
        "success"
      );
      registerForm.reset(); // 清空表單
    } catch (error) {
      console.error("建立員工失敗:", error);
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
