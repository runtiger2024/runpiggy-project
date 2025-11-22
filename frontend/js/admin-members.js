// frontend/js/admin-members.js (V9 旗艦版 - 支援分頁、篩選、安全刪除)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 權限檢查與初始化 ---
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  function checkAdminPermissions() {
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      const elements = [
        "btn-nav-create-staff",
        "btn-nav-members",
        "btn-nav-logs",
      ];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });

      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足 (Access Denied)</h2><p style="text-align: center;">此頁面僅限具有「管理會員」權限的管理員使用。</p>';
      }
    }
  }

  if (!adminToken) {
    window.location.href = "admin-login.html";
    return;
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminName) {
    let role = "USER";
    if (adminPermissions.includes("CAN_MANAGE_USERS")) role = "ADMIN";
    else if (adminPermissions.length > 0) role = "OPERATOR";
    adminWelcome.textContent = `你好, ${adminName} (${role})`;
  }

  checkAdminPermissions();

  // --- 2. 變數與元素 ---
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let currentRole = "";
  let currentFilter = ""; // for "new_today"

  // DOM
  const membersTableBody = document.getElementById("membersTableBody");
  const paginationContainer = document.getElementById("pagination");
  const statsTotal = document.getElementById("stats-total");
  const statsActive = document.getElementById("stats-active");
  const statsInactive = document.getElementById("stats-inactive");
  const searchInput = document.getElementById("search-input");
  const filterStatus = document.getElementById("filter-status");
  const filterRole = document.getElementById("filter-role");
  const filterBtn = document.getElementById("filter-btn");
  const logoutBtn = document.getElementById("logoutBtn");

  // 彈窗與表單
  const permsModal = document.getElementById("edit-permissions-modal");
  const permsForm = document.getElementById("edit-permissions-form");
  const editProfileModal = document.getElementById("admin-edit-user-modal");
  const editProfileForm = document.getElementById("admin-edit-user-form");
  const deleteModal = document.getElementById("delete-user-modal");
  const deleteInput = document.getElementById("delete-confirmation-input");
  const btnConfirmDelete = document.getElementById("btn-confirm-delete");

  let userToDelete = null; // 暫存要刪除的對象

  // --- 3. 初始化邏輯 (讀取 URL 參數) ---
  function init() {
    const params = new URLSearchParams(window.location.search);
    const pStatus = params.get("status");
    const pSearch = params.get("search");
    const pRole = params.get("role");
    const pFilter = params.get("filter"); // "new_today"
    const pPage = params.get("page");

    if (pStatus) {
      currentStatus = pStatus;
      filterStatus.value = pStatus;
    }
    if (pSearch) {
      currentSearch = pSearch;
      searchInput.value = pSearch;
    }
    if (pRole) {
      currentRole = pRole;
      filterRole.value = pRole;
    }
    if (pFilter) {
      currentFilter = pFilter;
      // 可選：在 UI 上顯示提示「正在檢視今日新註冊」
      if (pFilter === "new_today") {
        searchInput.placeholder = "🔍 正在篩選：今日新註冊會員";
        searchInput.style.backgroundColor = "#e8f5e9";
      }
    }
    if (pPage) {
      currentPage = parseInt(pPage) || 1;
    }

    loadUsers();
  }

  // --- 4. 資料載入 (分頁) ---
  async function loadUsers() {
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) return;

    membersTableBody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; padding: 30px;">載入中...</td></tr>';

    try {
      let url = `${API_BASE_URL}/api/admin/users?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;
      if (currentRole) url += `&role=${currentRole}`;
      if (currentFilter) url += `&filter=${currentFilter}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      renderTable(data.users || []);
      renderPagination(data.pagination);
      updateUrlParams();

      // 更新統計數字 (注意：這裡只更新總數，若要精確統計需另呼叫 stats API)
      // 這裡簡單顯示本次查詢的總數
      statsTotal.textContent = data.pagination.total;
      // 由於是後端分頁，無法直接算出 active/inactive 總數，
      // 這裡可以選擇隱藏 active/inactive 卡片，或另外呼叫 /api/admin/stats
      // 為了保持介面，我們暫時顯示 '-' 或保留 0
    } catch (e) {
      console.error(e);
      membersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  // --- 5. 渲染邏輯 ---
  function renderTable(users) {
    membersTableBody.innerHTML = "";
    if (users.length === 0) {
      membersTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align: center;">無符合資料</td></tr>';
      return;
    }

    users.forEach((user) => {
      const tr = document.createElement("tr");
      const isActive = user.isActive === true;

      // 判斷角色
      let userRole = "USER";
      let userPerms = [];
      try {
        userPerms = JSON.parse(user.permissions || "[]");
      } catch (e) {}
      if (userPerms.includes("CAN_MANAGE_USERS")) userRole = "ADMIN";
      else if (userPerms.length > 0) userRole = "OPERATOR";

      const myName = localStorage.getItem("admin_name");
      const canImpersonate = adminPermissions.includes("CAN_IMPERSONATE_USERS");

      // 按鈕生成
      let buttonsHTML = "";

      // 模擬登入
      if (canImpersonate && userRole === "USER") {
        buttonsHTML += `<button class="btn-action btn-login-as" style="background-color: #3498db;" title="模擬登入">登入</button>`;
      }
      // 權限 & 刪除 (不能操作自己)
      if (user.email !== myName) {
        buttonsHTML += `<button class="btn-action btn-edit-perms" style="background-color: #f39c12;" title="修改權限">權限</button>`;
        buttonsHTML += `<button class="btn-action btn-delete-user" style="background-color: #e74c3c;" title="永久刪除">刪除</button>`;
      }
      // 編輯個資 & 重設密碼
      buttonsHTML += `<button class="btn-action btn-edit-profile" style="background-color: #17a2b8;" title="編輯基本資料">編輯</button>`;
      buttonsHTML += `<button class="btn-action btn-reset-password" style="background-color: #ffc107; color: #000;" title="重設密碼為8888">密碼</button>`;
      // 停用/啟用
      buttonsHTML += `<button class="btn-action btn-toggle-status ${
        isActive ? "activate" : ""
      }" style="background-color: ${isActive ? "#6c757d" : "#28a745"};">${
        isActive ? "停用" : "啟用"
      }</button>`;

      // 安全跳脫 (防止 JSON.stringify 破壞 HTML)
      // 這裡不需要把整個 user 塞進 data attr，直接用 ID 即可
      // 但為了方便模擬登入等操作，我們閉包處理事件

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
      const btnLoginAs = tr.querySelector(".btn-login-as");
      if (btnLoginAs)
        btnLoginAs.addEventListener("click", () => handleLoginAs(user));

      const btnEditPerms = tr.querySelector(".btn-edit-perms");
      if (btnEditPerms)
        btnEditPerms.addEventListener("click", () =>
          handleEditPermissions(user)
        );

      tr.querySelector(".btn-edit-profile").addEventListener("click", () =>
        openEditProfileModal(user)
      );
      tr.querySelector(".btn-reset-password").addEventListener("click", () =>
        handleResetPassword(user)
      );
      tr.querySelector(".btn-toggle-status").addEventListener("click", () =>
        handleToggleStatus(user)
      );

      const btnDelete = tr.querySelector(".btn-delete-user");
      if (btnDelete)
        btnDelete.addEventListener("click", () => openDeleteModal(user));

      membersTableBody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    paginationContainer.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const createBtn = (text, page, isActive = false, isDisabled = false) => {
      const btn = document.createElement("button");
      btn.className = `page-btn ${isActive ? "active" : ""}`;
      btn.textContent = text;
      btn.disabled = isDisabled;
      if (!isDisabled) {
        btn.addEventListener("click", () => {
          currentPage = page;
          loadUsers();
        });
      }
      return btn;
    };

    paginationContainer.appendChild(
      createBtn("<", currentPage - 1, false, currentPage === 1)
    );

    for (let i = 1; i <= pg.totalPages; i++) {
      if (
        i === 1 ||
        i === pg.totalPages ||
        (i >= currentPage - 2 && i <= currentPage + 2)
      ) {
        paginationContainer.appendChild(createBtn(i, i, i === currentPage));
      } else if (
        paginationContainer.lastChild.textContent !== "..." &&
        (i < currentPage - 2 || i > currentPage + 2)
      ) {
        const span = document.createElement("span");
        span.textContent = "...";
        span.style.margin = "0 5px";
        paginationContainer.appendChild(span);
      }
    }

    paginationContainer.appendChild(
      createBtn(">", currentPage + 1, false, currentPage === pg.totalPages)
    );
  }

  function updateUrlParams() {
    const url = new URL(window.location);
    if (currentStatus) url.searchParams.set("status", currentStatus);
    else url.searchParams.delete("status");

    if (currentSearch) url.searchParams.set("search", currentSearch);
    else url.searchParams.delete("search");

    if (currentRole) url.searchParams.set("role", currentRole);
    else url.searchParams.delete("role");

    if (currentFilter) url.searchParams.set("filter", currentFilter);
    else url.searchParams.delete("filter");

    url.searchParams.set("page", currentPage);
    window.history.pushState({}, "", url);
  }

  // --- 6. 功能實作 ---

  // (A) 安全刪除 (Modal 流程)
  function openDeleteModal(user) {
    userToDelete = user;
    document.getElementById("delete-target-email").textContent = user.email;
    deleteInput.value = "";
    btnConfirmDelete.disabled = true;
    btnConfirmDelete.style.opacity = "0.5";
    deleteModal.style.display = "flex";
  }

  deleteInput.addEventListener("input", (e) => {
    if (!userToDelete) return;
    if (e.target.value === userToDelete.email) {
      btnConfirmDelete.disabled = false;
      btnConfirmDelete.style.opacity = "1";
    } else {
      btnConfirmDelete.disabled = true;
      btnConfirmDelete.style.opacity = "0.5";
    }
  });

  btnConfirmDelete.addEventListener("click", async () => {
    if (!userToDelete) return;
    btnConfirmDelete.textContent = "刪除中...";
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${userToDelete.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      alert("會員已永久刪除");
      deleteModal.style.display = "none";
      loadUsers();
    } catch (e) {
      alert("錯誤: " + e.message);
    } finally {
      btnConfirmDelete.textContent = "確認永久刪除";
    }
  });

  // (B) 切換狀態
  async function handleToggleStatus(user) {
    const newStatus = !user.isActive;
    const action = newStatus ? "啟用" : "停用";
    if (!confirm(`確定要 ${action} "${user.email}" 嗎？`)) return;
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
      if (res.ok) {
        alert(`已${action}`);
        loadUsers();
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  }

  // (C) 重設密碼
  async function handleResetPassword(user) {
    if (!confirm(`將 "${user.email}" 密碼重設為 8888？`)) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${user.id}/reset-password`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      if (res.ok) alert("重設成功");
      else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  }

  // (D) 模擬登入
  async function handleLoginAs(user) {
    if (!confirm(`登入為 "${user.email}"？`)) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${user.id}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const d = await res.json();
      if (res.ok) {
        localStorage.setItem("token", d.token);
        localStorage.setItem("userName", d.user.name || d.user.email);
        window.open("dashboard.html", "_blank");
      } else alert(d.message);
    } catch (e) {
      alert("錯誤");
    }
  }

  // (E) 編輯個資
  function openEditProfileModal(user) {
    document.getElementById("admin-edit-user-id").value = user.id;
    document.getElementById("admin-edit-user-email").value = user.email;
    document.getElementById("admin-edit-user-name").value = user.name || "";
    document.getElementById("admin-edit-user-phone").value = user.phone || "";
    document.getElementById("admin-edit-user-address").value =
      user.defaultAddress || "";
    editProfileModal.style.display = "flex";
  }

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
      if (res.ok) {
        alert("更新成功");
        editProfileModal.style.display = "none";
        loadUsers();
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  // (F) 編輯權限
  function handleEditPermissions(user) {
    document.getElementById("edit-perms-email").textContent = user.email;
    document.getElementById("edit-perms-userId").value = user.id;
    let userPerms = [];
    try {
      userPerms = JSON.parse(user.permissions || "[]");
    } catch (e) {}
    document
      .querySelectorAll("#edit-perms-fieldset input[type='checkbox']")
      .forEach((cb) => {
        cb.checked = userPerms.includes(cb.value);
      });
    permsModal.style.display = "flex";
  }

  permsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-perms-userId").value;
    const newPerms = [];
    document
      .querySelectorAll("#edit-perms-fieldset input[type='checkbox']:checked")
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
      if (res.ok) {
        alert("權限更新成功");
        permsModal.style.display = "none";
        loadUsers();
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  // --- 7. 搜尋與事件 ---
  filterBtn.addEventListener("click", () => {
    currentSearch = searchInput.value;
    currentStatus = filterStatus.value;
    currentRole = filterRole.value;
    currentFilter = ""; // 搜尋時清除特殊 filter
    currentPage = 1;
    loadUsers();
  });

  // 關閉彈窗通用
  document.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      permsModal.style.display = "none";
      editProfileModal.style.display = "none";
      deleteModal.style.display = "none";
    });
  });

  // 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("登出?")) {
      localStorage.removeItem("admin_token");
      window.location.href = "admin-login.html";
    }
  });

  // 啟動
  init();
});
