// frontend/js/admin-login.js (修復版)

document.addEventListener("DOMContentLoaded", () => {
  // 1. 如果已經登入，直接跳轉到儀表板
  if (localStorage.getItem("admin_token")) {
    window.location.href = "admin-dashboard.html";
    return;
  }

  // 2. 獲取元素
  const loginForm = document.getElementById("admin-login-form");
  const messageBox = document.getElementById("message-box");

  // 3. 綁定登入事件
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage("正在登入...", "info");

      const email = document.getElementById("admin-email").value.trim();
      const password = document.getElementById("admin-password").value.trim();

      try {
        // 發送登入請求
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "登入失敗");
        }

        // 4. 登入成功：儲存 Token 與權限資訊
        // 注意：這裡的 key 必須與 admin-header.js / admin-dashboard.js 裡讀取的 key 一致
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_name", data.user.name || data.user.email);
        // 將權限陣列轉為字串儲存
        localStorage.setItem(
          "admin_permissions",
          JSON.stringify(data.user.permissions || [])
        );

        showMessage("登入成功！正在跳轉...", "success");

        // 延遲跳轉，讓使用者看到成功訊息
        setTimeout(() => {
          window.location.href = "admin-dashboard.html";
        }, 1000);
      } catch (error) {
        console.error("登入錯誤:", error);
        showMessage(error.message, "error");
      }
    });
  }

  // --- 輔助函式：顯示訊息 ---
  function showMessage(msg, type) {
    if (!messageBox) return;
    messageBox.textContent = msg;
    messageBox.style.display = "block";
    messageBox.className = "alert"; // 重置 class

    if (type === "error") {
      messageBox.classList.add("alert-error");
      messageBox.style.backgroundColor = "#f8d7da";
      messageBox.style.color = "#721c24";
    } else if (type === "success") {
      messageBox.classList.add("alert-success");
      messageBox.style.backgroundColor = "#d4edda";
      messageBox.style.color = "#155724";
    } else {
      messageBox.style.backgroundColor = "#e2e3e5";
      messageBox.style.color = "#383d41";
    }
  }
});
