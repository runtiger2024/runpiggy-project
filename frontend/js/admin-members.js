// 這是 frontend/js/admin-members.js (V8 完整版 - 含編輯個資與刪除功能 - Prettier 修正版)

document.addEventListener("DOMContentLoaded", () => {
  // [*** V3 權限檢查：讀取權限 ***]
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  // [*** V3 權限檢查：檢查函式 ***]
  function checkAdminPermissions() {
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";

      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足 (Access Denied)</h2><p style="text-align: center;">此頁面僅限具有「管理會員」權限的管理員使用。</p>';
      }
    }
  }

  // (A) 檢查登入
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return;
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminName) {
    let role = "USER";
    if (adminPermissions.includes("CAN_MANAGE_USERS")) {
      role = "ADMIN";
    } else if (adminPermissions.length > 0) {
      role = "OPERATOR";
    }
    adminWelcome.textContent = `你好, ${adminName} (${role})`;
  }

  checkAdminPermissions();

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

  // 權限編輯相關 (V4.2)
  const permsModal = document.getElementById("edit-permissions-modal");
  const permsModalCloseBtn = permsModal
    ? permsModal.querySelector(".modal-close-btn")
    : null;
  const permsForm = document.getElementById("edit-permissions-form");
  const permsUserIdInput = document.getElementById("edit-perms-userId");
  const permsEmailDisplay = document.getElementById("edit-perms-email");
  const permsMessageBox = document.getElementById("edit-perms-message-box");
  const permsFieldset = document.getElementById("edit-perms-fieldset");
  const allPermissionCheckboxes = [
    "CAN_VIEW_DASHBOARD",
    "CAN_MANAGE_PACKAGES",
    "CAN_MANAGE_SHIPMENTS",
    "CAN_MANAGE_USERS",
    "CAN_VIEW_LOGS",
    "CAN_IMPERSONATE_USERS",
  ];

  // --- [V8 新增] 自動建立「編輯會員個資」彈窗 (如果 HTML 沒有) ---
  let editProfileModal = document.getElementById("admin-edit-user-modal");
  if (!editProfileModal) {
    const modalHTML = `
      <div id="admin-edit-user-modal" class="modal-overlay" style="display: none;">
        <div class="modal-content">
          <button class="modal-close-btn">&times;</button>
          <h2>編輯會員資料</h2>
          <form id="admin-edit-user-form">
            <input type="hidden" id="admin-edit-user-id">
            <div class="form-group">
              <label>Email (不可修改)</label>
              <input type="text" id="admin-edit-user-email" class="form-control" disabled style="background:#f0f0f0;">
            </div>
            <div class="form-group">
              <label>姓名</label>
              <input type="text" id="admin-edit-user-name" class="form-control">
            </div>
            <div class="form-group">
              <label>電話</label>
              <input type="text" id="admin-edit-user-phone" class="form-control">
            </div>
            <div class="form-group">
              <label>預設地址</label>
              <textarea id="admin-edit-user-address" class="form-control" rows="2"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">儲存變更</button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    editProfileModal = document.getElementById("admin-edit-user-modal");
  }

  const editProfileForm = document.getElementById("admin-edit-user-form");
  const editProfileCloseBtn =
    editProfileModal.querySelector(".modal-close-btn");

  // --- 2. 狀態變數 ---
  let allUsersData = [];

  // --- 4. 函式定義 ---

  function showMessage(message, type = "success") {
    alert(`${type === "error" ? "錯誤" : "成功"}: ${message}`);
  }

  function showPermsMessage(message, type) {
    if (permsMessageBox) {
      permsMessageBox.textContent = message;
      permsMessageBox.className = `alert alert-${type}`;
      permsMessageBox.style.display = "block";
    }
  }

  // (A) 載入所有使用者
  async function loadAllUsers() {
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) return;

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
      renderUsers();
      updateStats();
    } catch (error) {
      console.error(error);
      membersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">載入失敗: ${error.message}</td></tr>`;
    }
  }

  // (B) 渲染列表
  function renderUsers() {
    membersTableBody.innerHTML = "";
    const search = searchInput.value.toLowerCase();
    const status = filterStatus.value;
    const role = filterRole.value;

    const filteredUsers = allUsersData.filter((user) => {
      const statusMatch = status === "" || user.isActive.toString() === status;

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

      const roleMatch = role === "" || userRole === role;
      const searchMatch =
        !search ||
        (user.name && user.name.toLowerCase().includes(search)) ||
        (user.email && user.email.toLowerCase().includes(search)) ||
        (user.phone && user.phone.includes(search));

      return statusMatch && roleMatch && searchMatch;
    });

    if (filteredUsers.length === 0) {
      membersTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align: center;">無符合資料</td></tr>';
      return;
    }

    filteredUsers.forEach((user) => {
      const tr = document.createElement("tr");
      const isActive = user.isActive === true;

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

      const myName = localStorage.getItem("admin_name");
      const canImpersonate = adminPermissions.includes("CAN_IMPERSONATE_USERS");

      // 按鈕生成
      let buttonsHTML = "";

      // 1. 模擬登入 (僅限對 USER)
      if (canImpersonate && userRole === "USER") {
        buttonsHTML += `<button class="btn-action btn-login-as" style="background-color: #3498db;" title="模擬登入">登入</button>`;
      }

      // 2. 編輯權限 (不能改自己)
      if (user.email !== myName) {
        buttonsHTML += `<button class="btn-action btn-edit-perms" style="background-color: #f39c12;" title="修改權限">權限</button>`;
      }

      // 3. [V8 新增] 編輯資料
      buttonsHTML += `<button class="btn-action btn-edit-profile" style="background-color: #17a2b8;" title="編輯基本資料">編輯</button>`;

      // 4. 重設密碼
      buttonsHTML += `<button class="btn-action btn-reset-password" style="background-color: #ffc107; color: #000;" title="重設密碼為8888">密碼</button>`;

      // 5. 停用/啟用
      buttonsHTML += `<button class="btn-action btn-toggle-status ${
        isActive ? "activate" : ""
      }" style="background-color: ${isActive ? "#6c757d" : "#28a745"};">${
        isActive ? "停用" : "啟用"
      }</button>`;

      // 6. [V8 新增] 刪除 (不能刪自己)
      if (user.email !== myName) {
        buttonsHTML += `<button class="btn-action btn-delete-user" style="background-color: #e74c3c;" title="永久刪除">刪除</button>`;
      }

      tr.innerHTML = `
        <td>${user.name || "-"}</td>
        <td>${user.email}</td>
        <td>${user.phone || "-"}</td>
        <td><span class="role-badge role-${userRole}">${userRole}</span></td>
        <td>${new Date(user.createdAt).toLocaleDateString()}</td>
        <td><span class="status-badge ${isActive ? "active" : "inactive"}">${
        isActive ? "啟用" : "停用"
      }</span></td>
        <td><div class="action-buttons" style="gap:5px;">${buttonsHTML}</div></td>
      `;

      // 綁定事件
      if (tr.querySelector(".btn-login-as")) {
        tr.querySelector(".btn-login-as").addEventListener("click", () =>
          handleLoginAs(user)
        );
      }

      if (tr.querySelector(".btn-edit-perms")) {
        tr.querySelector(".btn-edit-perms").addEventListener("click", () =>
          handleEditPermissions(user)
        );
      }

      tr.querySelector(".btn-edit-profile").addEventListener("click", () =>
        openEditProfileModal(user)
      );
      tr.querySelector(".btn-reset-password").addEventListener("click", () =>
        handleResetPassword(user)
      );
      tr.querySelector(".btn-toggle-status").addEventListener("click", () =>
        handleToggleStatus(user)
      );

      if (tr.querySelector(".btn-delete-user")) {
        tr.querySelector(".btn-delete-user").addEventListener("click", () =>
          handleDeleteUser(user)
        );
      }

      membersTableBody.appendChild(tr);
    });
  }

  function updateStats() {
    statsTotal.textContent = allUsersData.length;
    statsActive.textContent = allUsersData.filter((u) => u.isActive).length;
    statsInactive.textContent = allUsersData.filter((u) => !u.isActive).length;
  }

  // --- 功能實作 ---

  // 1. 重設密碼
  async function handleResetPassword(user) {
    if (
      !confirm(`確定要將 "${user.name || user.email}" 的密碼重設為 "8888" 嗎？`)
    )
      return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${user.id}/reset-password`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      showMessage(result.message);
    } catch (e) {
      showMessage(e.message, "error");
    }
  }

  // 2. 切換狀態
  async function handleToggleStatus(user) {
    const newStatus = !user.isActive;
    const action = newStatus ? "啟用" : "停用";
    if (!confirm(`確定要 ${action} 此使用者嗎？`)) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${user.id}/status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isActive: newStatus }),
        }
      );
      if (!res.ok) throw new Error("更新失敗");
      showMessage(`已${action}`);
      loadAllUsers();
    } catch (e) {
      showMessage(e.message, "error");
    }
  }

  // 3. 模擬登入
  async function handleLoginAs(user) {
    if (!confirm(`以 "${user.name || user.email}" 身分登入前台？`)) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${user.id}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email);
      window.open("dashboard.html", "_blank");
    } catch (e) {
      showMessage(e.message, "error");
    }
  }

  // 4. 編輯權限 (UI邏輯)
  function handleEditPermissions(user) {
    if (permsMessageBox) permsMessageBox.style.display = "none";
    permsForm.reset();
    permsEmailDisplay.textContent = user.email;
    permsUserIdInput.value = user.id;

    let userPerms = [];
    try {
      userPerms = JSON.parse(user.permissions || "[]");
    } catch (e) {}

    allPermissionCheckboxes.forEach((key) => {
      const cb = document.getElementById(`edit-perm-${key}`);
      if (cb) cb.checked = userPerms.includes(key);
    });
    permsModal.style.display = "flex";
  }

  if (permsForm) {
    permsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = permsUserIdInput.value;
      const newPerms = [];
      permsFieldset
        .querySelectorAll("input[type='checkbox']:checked")
        .forEach((cb) => newPerms.push(cb.value));

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/admin/users/${id}/permissions`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${adminToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ permissions: newPerms }),
          }
        );
        if (!res.ok) throw new Error("更新失敗");
        showPermsMessage("權限更新成功", "success");
        loadAllUsers();
        setTimeout(() => (permsModal.style.display = "none"), 1000);
      } catch (e) {
        showPermsMessage(e.message, "error");
      }
    });
  }

  if (permsModalCloseBtn) {
    permsModalCloseBtn.addEventListener(
      "click",
      () => (permsModal.style.display = "none")
    );
  }

  // 5. [V8 新增] 編輯個人資料 (開啟彈窗)
  function openEditProfileModal(user) {
    document.getElementById("admin-edit-user-id").value = user.id;
    document.getElementById("admin-edit-user-email").value = user.email;
    document.getElementById("admin-edit-user-name").value = user.name || "";
    document.getElementById("admin-edit-user-phone").value = user.phone || "";
    document.getElementById("admin-edit-user-address").value =
      user.defaultAddress || "";
    editProfileModal.style.display = "flex";
  }

  // 6. [V8 新增] 提交個人資料變更
  editProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("admin-edit-user-id").value;
    const data = {
      name: document.getElementById("admin-edit-user-name").value,
      phone: document.getElementById("admin-edit-user-phone").value,
      defaultAddress: document.getElementById("admin-edit-user-address").value,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("更新失敗");
      showMessage("資料更新成功");
      editProfileModal.style.display = "none";
      loadAllUsers();
    } catch (e) {
      showMessage(e.message, "error");
    }
  });

  if (editProfileCloseBtn) {
    editProfileCloseBtn.addEventListener(
      "click",
      () => (editProfileModal.style.display = "none")
    );
  }

  // 7. [V8 新增] 刪除會員
  async function handleDeleteUser(user) {
    if (
      !confirm(
        `【危險操作】\n\n確定要永久刪除會員 "${user.email}" 嗎？\n這將會連同刪除該會員的所有包裹、訂單與紀錄，且無法復原！`
      )
    )
      return;

    if (!confirm("請再次確認：您真的要刪除此會員嗎？")) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      showMessage("會員已永久刪除");
      loadAllUsers();
    } catch (e) {
      showMessage(e.message, "error");
    }
  }

  // --- 通用 ---
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定登出？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      localStorage.removeItem("admin_permissions");
      window.location.href = "admin-login.html";
    }
  });

  if (filterBtn) filterBtn.addEventListener("click", renderUsers);

  // 點擊遮罩關閉
  window.addEventListener("click", (e) => {
    if (e.target === permsModal) permsModal.style.display = "none";
    if (e.target === editProfileModal) editProfileModal.style.display = "none";
  });

  // 初始載入
  loadAllUsers();
});
