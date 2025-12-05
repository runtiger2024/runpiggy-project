// frontend/js/forgot-password.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgot-form");
  const messageBox = document.getElementById("message-box");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const btn = form.querySelector("button[type='submit']");
      const email = document.getElementById("email").value.trim();

      // UI 鎖定
      btn.disabled = true;
      btn.textContent = "發送中...";
      showMessage("", "hide");

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (res.ok) {
          showMessage(
            "重設信已發送！請檢查您的信箱 (含垃圾郵件夾)。連結 10 分鐘內有效。",
            "success"
          );
          form.reset();
        } else {
          throw new Error(data.message || "發送失敗");
        }
      } catch (err) {
        showMessage(err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "發送重設信";
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
