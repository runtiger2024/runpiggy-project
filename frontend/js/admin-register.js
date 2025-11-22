// frontend/js/admin-register.js (修正版)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 權限檢查 ---
  const adminToken = localStorage.getItem("admin_token");
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );

  if (!adminToken) {
    alert("請先登入");
    window.location.href = "admin-login.html";
    return;
  }

  // 檢查是否有「管理會員 (CAN_MANAGE_USERS)」權限
  if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
    alert("權限不足：您無法新增員工帳號");
    window.location.href = "admin-dashboard.html";
    return;
  }

  // --- 2. 處理表單提交 ---
  const registerForm = document.getElementById("register-form");
  const messageBox = document.getElementById("message-box");

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("正在建立帳號...", "info"); // 暫時顯示狀態

    // 獲取輸入值
    const name = document.getElementById("staff-name").value;
    const email = document.getElementById("staff-email").value;
    const password = document.getElementById("staff-password").value;

    // 獲取勾選的權限
    const selectedPerms = [];
    const checkboxes = document.querySelectorAll(
      "#permissions-fieldset input[type='checkbox']:checked"
    );
    checkboxes.forEach((cb) => {
      selectedPerms.push(cb.value);
    });

    // 簡單驗證
    if (password.length < 6) {
      showMessage("密碼長度至少需 6 位數", "error");
      return;
    }

    try {
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "處理中...";

      // 發送 API 請求
      const response = await fetch(`${API_BASE_URL}/api/admin/users/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: name,
          email: email,
          password: password,
          permissions: selectedPerms,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "建立失敗");
      }

      // 成功
      showMessage(`成功建立員工帳號：${data.user.email}`, "success");
      registerForm.reset();

      // 恢復預設勾選 (可選)
      document.getElementById("perm-CAN_VIEW_DASHBOARD").checked = true;
      document.getElementById("perm-CAN_MANAGE_PACKAGES").checked = true;
      document.getElementById("perm-CAN_MANAGE_SHIPMENTS").checked = true;

      // 滾動到頂部顯示訊息
      window.scrollTo(0, 0);
    } catch (error) {
      console.error(error);
      showMessage(error.message, "error");
    } finally {
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = false;
      submitBtn.textContent = "建立新帳號";
    }
  });

  // --- 3. 訊息顯示工具 ---
  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = "alert"; // 重置 class

    if (type === "error") {
      messageBox.classList.add("alert-error");
      messageBox.style.display = "block";
    } else if (type === "success") {
      messageBox.classList.add("alert-success");
      messageBox.style.display = "block";
    } else {
      // info 或其他
      messageBox.style.display = "block";
      messageBox.style.backgroundColor = "#e3f2fd";
      messageBox.style.color = "#0d47a1";
    }
  }
});
