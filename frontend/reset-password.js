// frontend/js/reset-password.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("reset-form");
  const messageBox = document.getElementById("message-box");
  const loginLinkDiv = document.getElementById("login-link");

  // 1. 從網址取得 Token
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    showMessage("無效的連結：缺少 Token", "error");
    if (form) form.style.display = "none";
    return;
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const pwd = document.getElementById("new-password").value;
      const confirmPwd = document.getElementById("confirm-password").value;
      const btn = form.querySelector("button[type='submit']");

      if (pwd !== confirmPwd) {
        showMessage("兩次密碼輸入不一致", "error");
        return;
      }

      btn.disabled = true;
      btn.textContent = "重設中...";
      showMessage("", "hide");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/auth/reset-password/${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pwd }),
          }
        );

        const data = await res.json();

        if (res.ok) {
          showMessage("密碼重設成功！請使用新密碼登入。", "success");
          form.style.display = "none";
          loginLinkDiv.style.display = "block";
        } else {
          throw new Error(data.message || "重設失敗 (Token 可能已過期)");
        }
      } catch (err) {
        showMessage(err.message, "error");
        btn.disabled = false;
        btn.textContent = "確認重設";
      }
    });
  }

  function showMessage(msg, type) {
    messageBox.textContent = msg;
    messageBox.className = "alert";
    if (type === "hide") {
      messageBox.style.display = "none";
    } else {
      messageBox.style.display = "block";
      if (type === "success") {
        messageBox.classList.add("alert-success");
      } else {
        messageBox.classList.add("alert-error");
      }
    }
  }
});
