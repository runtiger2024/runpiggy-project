// frontend/js/admin-login.js (已修復 Password Trim 問題)

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

      // [關鍵修復] 移除 .trim()，避免密碼前後有空白時導致驗證失敗
      // 原本: const password = document.getElementById("admin-password").value.trim();
      const password = document.getElementById("admin-password").value;

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
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_name", data.user.name || data.user.email);
        localStorage.setItem(
          "admin_permissions",
          JSON.stringify(data.user.permissions || [])
        );

        showMessage("登入成功！正在跳轉...", "success");

        // 延遲跳轉
        setTimeout(() => {
          window.location.href = "admin-dashboard.html";
        }, 1000);
      } catch (error) {
        console.error("登入錯誤:", error);
        // 在錯誤訊息中加入提示，幫助判斷是否為環境問題
        const envHint = API_BASE_URL.includes("onrender")
          ? " (正式機)"
          : " (本機)";
        showMessage(error.message + envHint, "error");
      }
    });
  }

  // --- 輔助函式：顯示訊息 ---
  function showMessage(msg, type) {
    if (!messageBox) return;
    messageBox.textContent = msg;
    messageBox.style.display = "block";
    messageBox.className = "alert";

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
