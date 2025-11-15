// 這是 frontend/js/admin-register.js (V3 權限系統版)

document.addEventListener("DOMContentLoaded", () => {
  // [*** V3 權限檢查：讀取權限 ***]
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  // [*** V3 權限檢查：檢查函式 ***]
  function checkAdminPermissions() {
    // 檢查是否 "沒有" 管理會員的權限
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      // 1. 隱藏導覽列的 Admin 按鈕 (如果存在)
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";

      // 2. 隱藏此頁面的主要内容
      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足 (Access Denied)</h2>' +
          '<p style="text-align: center;">此頁面僅限具有「管理會員」權限的管理員使用。</p>';
      }
    }
  }

  // (A) 檢查登入
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return; // 停止執行
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminName) {
    // [V3 修正] 解析權限，顯示 ADMIN 或 OPERATOR
    let role = "USER";
    if (adminPermissions.includes("CAN_MANAGE_USERS")) {
      role = "ADMIN";
    } else if (adminPermissions.length > 0) {
      role = "OPERATOR";
    }
    // (admin-register.html 頁面沒有 admin-welcome 元素，但我們保留這段)
    if (adminWelcome) {
      adminWelcome.textContent = `你好, ${adminName} (${role})`;
    }
  }

  // (B) [*** V3 權限檢查：立刻執行 ***]
  checkAdminPermissions();
  // [*** 權限檢查結束 ***]

  const registerForm = document.getElementById("register-form");
  const messageBox = document.getElementById("message-box");
  const permissionsFieldset = document.getElementById("permissions-fieldset");

  if (!registerForm) return; // 如果內容已被隱藏，就停止

  // (C) 綁定表單提交事件
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    // 收集表單資料
    const name = document.getElementById("staff-name").value;
    const email = document.getElementById("staff-email").value;
    const password = document.getElementById("staff-password").value;

    // [*** V3 修正：讀取 Checkboxes ***]
    const permissions = [];
    const checkboxes = permissionsFieldset.querySelectorAll(
      "input[type='checkbox']:checked"
    );
    checkboxes.forEach((cb) => {
      permissions.push(cb.value);
    });

    if (permissions.length === 0) {
      showMessage("必須至少勾選一個權限", "error");
      return;
    }
    // [*** 修正結束 ***]

    const requestData = { name, email, password, permissions }; // [*** V3 修正 ***]

    try {
      // (3) 呼叫 API
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
        throw new Error(data.message || "建立失敗");
      }

      // (4) 成功
      showMessage(
        `成功建立員工: ${data.user.email} (權限: ${data.user.permissions.length} 個)`,
        "success"
      );
      registerForm.reset(); // 清空表單
      // 預設勾選
      document.getElementById("perm-CAN_VIEW_DASHBOARD").checked = true;
      document.getElementById("perm-CAN_MANAGE_PACKAGES").checked = true;
      document.getElementById("perm-CAN_MANAGE_SHIPMENTS").checked = true;
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
