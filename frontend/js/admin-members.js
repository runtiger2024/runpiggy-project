// 這是 frontend/js/admin-members.js (已修復 API_BASE_URL)
// 負責管理 admin-members.html 頁面

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const membersTableBody = document.getElementById("membersTableBody");

  // 統計卡片
  const statsTotal = document.getElementById("stats-total");
  const statsActive = document.getElementById("stats-active");
  const statsInactive = document.getElementById("stats-inactive");

  // 篩選器
  const searchInput = document.getElementById("search-input");
  const filterStatus = document.getElementById("filter-status");
  const filterRole = document.getElementById("filter-role");
  const filterBtn = document.getElementById("filter-btn");

  // --- 2. 狀態變數 ---
  let allUsersData = []; // 儲存所有使用者
  const adminToken = localStorage.getItem("admin_token");

  // --- 3. 初始化 (檢查登入) ---
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return; // 停止執行
  }

  const adminName = localStorage.getItem("admin_name");
  if (adminName) {
    adminWelcome.textContent = `你好, ${adminName}`;
  }

  // --- 4. 函式定義 ---

  // 顯示訊息 (簡易版)
  function showMessage(message, isError = false) {
    alert(message);
    if (isError) console.error(message);
  }

  // (A) 載入所有使用者 (呼叫 GET /api/admin/users)
  async function loadAllUsers() {
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
    const status = filterStatus.value; // "true", "false", ""
    const role = filterRole.value; // "USER", "ADMIN", ""

    const filteredUsers = allUsersData.filter((user) => {
      const statusMatch = status === "" || user.isActive.toString() === status;
      const roleMatch = role === "" || user.role === role;
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

      tr.innerHTML = `
        <td>${user.name || "-"}</td>
        <td>${user.email}</td>
        <td>${user.phone || "-"}</td>
        <td><span class="role-badge role-${user.role}">${user.role}</span></td>
        <td>${new Date(user.createdAt).toLocaleDateString()}</td>
        <td>
          <span class="status-badge ${isActive ? "active" : "inactive"}">
            ${isActive ? "啟用" : "停用"}
          </span>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-action btn-reset-password" data-id="${
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
      // (不需要重載，因為只是改密碼)
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
      loadAllUsers(); // (重要) 重新載入列表和統計
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  // (F) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  // (G) 篩選按鈕
  filterBtn.addEventListener("click", () => {
    renderUsers();
  });

  // --- 5. 初始載入資料 ---
  loadAllUsers();
});
