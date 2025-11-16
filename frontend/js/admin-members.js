// 這是 frontend/js/admin-members.js (V4.2 權限系統 + 編輯權限功能)
// (使用 permissions 陣列取代 role)
// (新增「編輯權限」按鈕與彈窗邏輯)

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
      // 1. 隱藏導覽列的 Admin 按鈕
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";

      // 2. (特殊) 隱藏此頁面的主要内容
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
    adminWelcome.textContent = `你好, ${adminName} (${role})`; // 顯示角色
  }

  // (B) [*** V3 權限檢查：立刻執行 ***]
  checkAdminPermissions();
  // [*** 權限檢查結束 ***]

  // --- 1. 獲取元素 ---
  const logoutBtn = document.getElementById("logoutBtn");
  const membersTableBody = document.getElementById("membersTableBody");
  const statsTotal = document.getElementById("stats-total");
  const statsActive = document.getElementById("stats-active");
  const statsInactive = document.getElementById("stats-inactive");
  const searchInput = document.getElementById("search-input");
  const filterStatus = document.getElementById("filter-status");
  const filterRole = document.getElementById("filter-role");
  const filterBtn = document.getElementById("filter-btn");

  // [*** V4.2 新增：獲取權限彈窗元素 ***]
  const permsModal = document.getElementById("edit-permissions-modal");
  const permsModalCloseBtn = permsModal.querySelector(".modal-close-btn");
  const permsForm = document.getElementById("edit-permissions-form");
  const permsEmailDisplay = document.getElementById("edit-perms-email");
  const permsUserIdInput = document.getElementById("edit-perms-userId");
  const permsFieldset = document.getElementById("edit-perms-fieldset");
  const permsMessageBox = document.getElementById("edit-perms-message-box");
  const allPermissionCheckboxes = [
    "CAN_VIEW_DASHBOARD",
    "CAN_MANAGE_PACKAGES",
    "CAN_MANAGE_SHIPMENTS",
    "CAN_MANAGE_USERS",
    "CAN_VIEW_LOGS",
    "CAN_IMPERSONATE_USERS",
  ];
  // [*** 新增結束 ***]

  // --- 2. 狀態變數 ---
  let allUsersData = [];

  // --- 4. 函式定義 ---

  function showMessage(message, type = "success") {
    const prefix = type === "error" ? "錯誤" : "成功";
    alert(`${prefix}: ${message}`);
    if (type === "error") console.error(message);
  }

  // [*** V4.2 新增：彈窗內訊息 ***]
  function showPermsMessage(message, type) {
    permsMessageBox.textContent = message;
    permsMessageBox.className = `alert alert-${type}`;
    permsMessageBox.style.display = "block";
  }

  // (A) 載入所有使用者 (呼叫 GET /api/admin/users)
  async function loadAllUsers() {
    // [V3] 權限檢查：如果沒有權限，不要載入
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      membersTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; color: red;">權限不足</td></tr>';
      return;
    }

    membersTableBody.innerHTML =
      '<tr><td colspan="7" class="loading"><div class="spinner"></div><p>載入使用者資料中...</p></td></tr>';

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "admin-login.html";
        }
        throw new Error("載入使用者失敗");
      }

      const data = await response.json();
      allUsersData = data.users || [];

      renderUsers(); // 顯示所有使用者
      updateStats(); // 更新統計數字
    } catch (error) {
      console.error("載入使用者列表失敗:", error);
      membersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">載入失敗: ${error.message}</td></tr>`;
    }
  }

  // (B) 渲染使用者列表
  function renderUsers() {
    membersTableBody.innerHTML = ""; // 清空

    // (新) 篩選
    const search = searchInput.value.toLowerCase();
    const status = filterStatus.value;
    const role = filterRole.value; // "USER", "ADMIN", "OPERATOR"

    const filteredUsers = allUsersData.filter((user) => {
      const statusMatch = status === "" || user.isActive.toString() === status;

      // [*** V3 修正：篩選角色邏輯 ***]
      let userRole = "USER"; // 預設為 USER
      let userPermissions = [];
      try {
        // 後端傳來的是 JSON 字串，必須解析
        userPermissions = JSON.parse(user.permissions || "[]");
      } catch (e) {}

      if (userPermissions.includes("CAN_MANAGE_USERS")) {
        userRole = "ADMIN"; // 擁有使用者管理權限 = ADMIN
      } else if (userPermissions.length > 0) {
        userRole = "OPERATOR"; // 擁有權限，但不是使用者管理 = OPERATOR
      }
      const roleMatch = role === "" || userRole === role;
      // [*** 修正結束 ***]

      const searchMatch =
        !search ||
        (user.name && user.name.toLowerCase().includes(search)) ||
        (user.email && user.email.toLowerCase().includes(search)) ||
        (user.phone && user.phone.includes(search));
      return statusMatch && roleMatch && searchMatch;
    });

    if (filteredUsers.length === 0) {
      membersTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align: center;">找不到符合條件的使用者</td></tr>';
      return;
    }

    filteredUsers.forEach((user) => {
      const tr = document.createElement("tr");
      const isActive = user.isActive === true;

      // [*** V3 修正：重算 userRole ***]
      let userRole = "USER";
      let userPermissions = [];
      try {
        userPermissions = JSON.parse(user.permissions || "[]");
      } catch (e) {}

      if (userPermissions.includes("CAN_MANAGE_USERS")) {
        userRole = "ADMIN";
      } else if (userPermissions.length > 0) {
        userRole = "OPERATOR";
      }
      // [*** 修正結束 ***]

      // [*** V4.2 修正：按鈕權限 ***]
      // 檢查 "我" (管理員) 是否有模擬登入的權限
      const canImpersonate = adminPermissions.includes("CAN_IMPERSONATE_USERS");
      const canManageUsers = adminPermissions.includes("CAN_MANAGE_USERS");

      // 取得登入者自己的 Email (或 Name)
      const myName = localStorage.getItem("admin_name");

      const loginAsBtn =
        canImpersonate && userRole === "USER" // 只有 ADMIN 且 對象是 USER
          ? `<button class="btn-action btn-login-as" data-id="${
              user.id
            }" data-name="${
              user.name || user.email
            }" style="background-color: #3498db;">
              登入身份
             </button>`
          : "";

      // [V4.2 新增] 編輯權限按鈕 (不能編輯自己)
      const editPermsBtn =
        canManageUsers && user.email !== myName
          ? `<button class="btn-action btn-edit-perms" data-id="${user.id}" style="background-color: #f39c12;">
              編輯權限
             </button>`
          : "";

      tr.innerHTML = `
        <td>${user.name || "-"}</td>
        <td>${user.email}</td>
        <td>${user.phone || "-"}</td>
        <td><span class="role-badge role-${userRole}">${userRole}</span></td> <td>${new Date(
        user.createdAt
      ).toLocaleDateString()}</td>
        <td>
          <span class="status-badge ${isActive ? "active" : "inactive"}">
            ${isActive ? "啟用" : "停用"}
          </span>
        </td>
        <td>
          <div class="action-buttons">
            ${loginAsBtn}
            ${editPermsBtn} <button class="btn-action btn-reset-password" data-id="${
        user.id
      }" data-name="${user.name || user.email}">
              重設密碼
            </button>
            <button class="btn-action btn-toggle-status ${
              isActive ? "" : "activate"
            }" data-id="${user.id}" data-status="${isActive}">
              ${isActive ? "停用" : "啟用"}
            </button>
          </div>
        </td>
      `;

      // 綁定事件
      tr.querySelector(".btn-reset-password").addEventListener(
        "click",
        handleResetPassword
      );
      tr.querySelector(".btn-toggle-status").addEventListener(
        "click",
        handleToggleStatus
      );

      const loginAsButton = tr.querySelector(".btn-login-as");
      if (loginAsButton) {
        loginAsButton.addEventListener("click", handleLoginAs);
      }

      // [*** V4.2 新增：綁定編輯權限按鈕 ***]
      const editPermsButton = tr.querySelector(".btn-edit-perms");
      if (editPermsButton) {
        editPermsButton.addEventListener("click", () =>
          handleEditPermissions(user)
        );
      }
      // [*** 新增結束 ***]

      membersTableBody.appendChild(tr);
    });
  }

  // (C) 更新統計卡片
  function updateStats() {
    statsTotal.textContent = allUsersData.length;
    statsActive.textContent = allUsersData.filter(
      (u) => u.isActive === true
    ).length;
    statsInactive.textContent = allUsersData.filter(
      (u) => u.isActive === false
    ).length;
  }

  // (D) 處理重設密碼
  async function handleResetPassword(e) {
    const userId = e.target.dataset.id;
    const userName = e.target.dataset.name;

    if (!confirm(`確定要將 "${userName}" 的密碼重設為 "8888" 嗎？`)) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/reset-password`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  // (E) 處理切換狀態
  async function handleToggleStatus(e) {
    const userId = e.target.dataset.id;
    const currentStatus = e.target.dataset.status === "true"; // 轉為布林值
    const newStatus = !currentStatus;
    const actionText = newStatus ? "啟用" : "停用";

    if (!confirm(`確定要 "${actionText}" 這位使用者嗎？`)) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isActive: newStatus }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      showMessage(result.message, "success");
      loadAllUsers();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  // (F) 處理模擬登入
  async function handleLoginAs(e) {
    const userId = e.target.dataset.id;
    const userName = e.target.dataset.name;

    if (
      !confirm(
        `即將以客戶 "${userName}" 的身份登入客戶前台。\n\n確定要繼續嗎？`
      )
    ) {
      return;
    }

    try {
      e.target.disabled = true;
      e.target.textContent = "登入中...";

      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      // 成功！
      showMessage(data.message, "success");

      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email);

      window.open("dashboard.html", "_blank");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      e.target.disabled = false;
      e.target.textContent = "登入身份";
    }
  }

  // (G) [*** V4.2 新增：開啟權限編輯彈窗 ***]
  function handleEditPermissions(user) {
    permsMessageBox.style.display = "none";
    permsForm.reset(); // 清除舊的勾選

    permsEmailDisplay.textContent = user.email;
    permsUserIdInput.value = user.id;

    // 解析該用戶 "目前" 的權限
    let userPermissions = [];
    try {
      userPermissions = JSON.parse(user.permissions || "[]");
    } catch (e) {}

    // 根據用戶權限，勾選 Checkboxes
    allPermissionCheckboxes.forEach((permKey) => {
      const checkbox = document.getElementById(`edit-perm-${permKey}`);
      if (checkbox) {
        checkbox.checked = userPermissions.includes(permKey);
      }
    });

    permsModal.style.display = "flex";
  }

  // (H) [*** V4.2 新增：提交權限變更 ***]
  permsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showPermsMessage("", "clear");
    const submitButton = permsForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    const userId = permsUserIdInput.value;

    // 1. 收集新的權限
    const newPermissions = [];
    const checkboxes = permsFieldset.querySelectorAll(
      "input[type='checkbox']:checked"
    );
    checkboxes.forEach((cb) => {
      newPermissions.push(cb.value);
    });

    try {
      // 2. 呼叫新 API
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/permissions`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ permissions: newPermissions }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      // 3. 成功
      showPermsMessage("權限更新成功！", "success");
      await loadAllUsers(); // 重新載入列表以更新 "角色" 顯示

      setTimeout(() => {
        permsModal.style.display = "none";
      }, 1500);
    } catch (error) {
      showPermsMessage(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "儲存權限";
    }
  });

  // 關閉權限彈窗
  permsModalCloseBtn.addEventListener("click", () => {
    permsModal.style.display = "none";
  });
  permsModal.addEventListener("click", (e) => {
    if (e.target === permsModal) permsModal.style.display = "none";
  });
  // [*** V4.2 新增結束 ***]

  // (I) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      localStorage.removeItem("admin_permissions"); // [*** V3 修正 ***]
      window.location.href = "admin-login.html";
    }
  });

  // (J) 篩選按鈕
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      renderUsers();
    });
  }

  // --- 5. 初始載入資料 ---
  loadAllUsers();
});
