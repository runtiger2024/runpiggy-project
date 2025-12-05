// frontend/js/admin-members.js
// V2025.Security - 包含刪除防呆 (雙重確認)

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  const myPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );

  if (!adminToken) return;

  // 變數
  let currentPage = 1;
  const limit = 20;
  let currentSearch = "";
  let currentRole = "";
  let currentStatus = "";

  // DOM 元素
  const tbody = document.getElementById("members-list");
  const paginationDiv = document.getElementById("pagination");
  const modal = document.getElementById("member-modal");
  const form = document.getElementById("member-form");
  const btnImpersonate = document.getElementById("btn-impersonate");

  // 初始化
  init();

  function init() {
    // 搜尋按鈕
    document.getElementById("btn-search").addEventListener("click", () => {
      currentSearch = document.getElementById("search-input").value;
      currentRole = document.getElementById("role-filter").value;
      currentStatus = document.getElementById("status-filter").value;
      currentPage = 1;
      loadMembers();
    });

    // Modal 關閉按鈕
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => (modal.style.display = "none"));
    });

    // 功能按鈕
    document
      .getElementById("btn-reset-pwd")
      .addEventListener("click", resetPassword);

    // 綁定模擬登入事件
    if (btnImpersonate) {
      btnImpersonate.addEventListener("click", impersonateUser);
    }

    // 表單提交
    form.addEventListener("submit", saveProfile);

    // 初始載入
    loadMembers();
  }

  async function loadMembers() {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center p-4">資料載入中...</td></tr>';

    try {
      let url = `${API_BASE_URL}/api/admin/users?page=${currentPage}&limit=${limit}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;
      if (currentRole) url += `&role=${currentRole}`;
      if (currentStatus) url += `&status=${currentStatus}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);

      renderTable(data.users || []);
      renderPagination(data.pagination);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger p-4">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  function renderTable(users) {
    tbody.innerHTML = "";
    if (users.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center p-4" style="color:#999;">查無符合條件的會員</td></tr>';
      return;
    }

    users.forEach((u) => {
      const tr = document.createElement("tr");

      // 判斷角色標籤
      let roleBadge =
        '<span class="status-badge" style="background:#e3f2fd; color:#0d47a1;">會員</span>';
      let perms = [];
      try {
        perms = Array.isArray(u.permissions)
          ? u.permissions
          : JSON.parse(u.permissions || "[]");
      } catch (e) {
        perms = [];
      }

      if (perms.includes("USER_MANAGE") || perms.includes("CAN_MANAGE_USERS")) {
        roleBadge =
          '<span class="status-badge" style="background:#fff3cd; color:#856404;">管理員</span>';
      } else if (perms.length > 0) {
        roleBadge =
          '<span class="status-badge" style="background:#d1e7dd; color:#0f5132;">操作員</span>';
      }

      const statusHtml = u.isActive
        ? '<span class="text-success"><i class="fas fa-check-circle"></i> 啟用中</span>'
        : '<span class="text-danger"><i class="fas fa-ban"></i> 已停用</span>';

      const uStr = encodeURIComponent(JSON.stringify(u));

      tr.innerHTML = `
            <td><div class="font-weight-bold text-dark">${
              u.name || "-"
            }</div></td>
            <td>${u.email}</td>
            <td>${u.phone || "-"}</td>
            <td>${roleBadge}</td>
            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>${statusHtml}</td>
            <td>
                <button class="btn btn-primary btn-sm" title="編輯" onclick="openModal('${uStr}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm ${
                  u.isActive ? "btn-warning" : "btn-success"
                }" 
                        title="${u.isActive ? "停用帳號" : "啟用帳號"}" 
                        onclick="toggleStatus('${u.id}', ${!u.isActive})">
                    <i class="fas ${
                      u.isActive ? "fa-user-slash" : "fa-user-check"
                    }"></i>
                </button>
                <button class="btn btn-danger btn-sm" title="刪除" onclick="deleteUser('${
                  u.id
                }', '${u.email}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
          `;
      tbody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    paginationDiv.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const createBtn = (text, page, disabled = false) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-sm btn-light border";
      btn.textContent = text;
      btn.disabled = disabled;
      if (!disabled)
        btn.onclick = () => {
          currentPage = page;
          loadMembers();
        };
      return btn;
    };

    paginationDiv.appendChild(
      createBtn("上一頁", currentPage - 1, currentPage === 1)
    );
    const infoSpan = document.createElement("span");
    infoSpan.className = "btn btn-sm btn-primary disabled";
    infoSpan.textContent = `${currentPage} / ${pg.totalPages}`;
    paginationDiv.appendChild(infoSpan);
    paginationDiv.appendChild(
      createBtn("下一頁", currentPage + 1, currentPage === pg.totalPages)
    );
  }

  // --- 操作功能 ---

  window.openModal = function (str) {
    const u = JSON.parse(decodeURIComponent(str));
    document.getElementById("edit-user-id").value = u.id;
    document.getElementById("m-email").value = u.email;
    document.getElementById("m-name").value = u.name || "";
    document.getElementById("m-phone").value = u.phone || "";
    document.getElementById("m-address").value = u.defaultAddress || "";

    const perms = Array.isArray(u.permissions)
      ? u.permissions
      : JSON.parse(u.permissions || "[]");

    document.querySelectorAll(".perm-check").forEach((checkbox) => {
      checkbox.checked = perms.includes(checkbox.value);
    });

    // 防止模擬自己
    const isSelf = u.email === localStorage.getItem("admin_name");
    const canImpersonate =
      myPermissions.includes("USER_IMPERSONATE") ||
      myPermissions.includes("CAN_MANAGE_USERS");

    if (btnImpersonate) {
      btnImpersonate.style.display =
        canImpersonate && !isSelf ? "inline-block" : "none";
    }

    modal.style.display = "flex";
  };

  async function saveProfile(e) {
    e.preventDefault();
    const id = document.getElementById("edit-user-id").value;
    const btn = e.target.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "儲存中...";

    try {
      const profileBody = {
        name: document.getElementById("m-name").value,
        phone: document.getElementById("m-phone").value,
        defaultAddress: document.getElementById("m-address").value,
      };

      await fetch(`${API_BASE_URL}/api/admin/users/${id}/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileBody),
      });

      const selectedPerms = [];
      document
        .querySelectorAll(".perm-check:checked")
        .forEach((cb) => selectedPerms.push(cb.value));

      await fetch(`${API_BASE_URL}/api/admin/users/${id}/permissions`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permissions: selectedPerms }),
      });

      alert("資料與權限更新成功");
      modal.style.display = "none";
      loadMembers();
    } catch (err) {
      alert("更新失敗：" + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "儲存變更";
    }
  }

  async function resetPassword() {
    if (!confirm("確定要將此會員密碼重設為 '8888' 嗎？")) return;
    const id = document.getElementById("edit-user-id").value;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${id}/reset-password`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      if (res.ok) alert("密碼已重設為 8888");
      else alert("重設失敗");
    } catch (err) {
      alert("錯誤");
    }
  }

  async function impersonateUser() {
    if (
      !confirm("確定要模擬此會員登入前台？\n(這將開啟新視窗並使用該會員身分)")
    )
      return;

    const id = document.getElementById("edit-user-id").value;
    const btn = document.getElementById("btn-impersonate");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${id}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();

      if (res.ok) {
        const win = window.open("index.html", "_blank");
        setTimeout(() => {
          if (win) {
            try {
              win.localStorage.setItem("token", data.token);
              win.localStorage.setItem(
                "userName",
                data.user.name || data.user.email
              );
              win.location.href = "dashboard.html";
            } catch (e) {
              console.warn("無法自動寫入 localStorage", e);
            }
          }
        }, 800);
      } else {
        alert("模擬失敗: " + (data.message || "權限不足"));
      }
    } catch (err) {
      alert("錯誤: " + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-secret"></i> 模擬登入';
    }
  }

  window.toggleStatus = async function (id, isActive) {
    const action = isActive ? "啟用" : "停用";
    if (!confirm(`確定要${action}此帳號嗎？`)) return;

    try {
      await fetch(`${API_BASE_URL}/api/admin/users/${id}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      loadMembers();
    } catch (err) {
      alert("操作失敗");
    }
  };

  // [Security] 雙重確認刪除機制
  window.deleteUser = async function (id, email) {
    const confirmation = prompt(
      `【危險操作】\n您確定要永久刪除會員 ${email} 嗎？\n此操作無法復原，且將連帶刪除該會員的所有紀錄。\n\n請輸入 "DELETE" (大寫) 以確認刪除：`
    );

    if (confirmation !== "DELETE") {
      if (confirmation !== null) alert("輸入錯誤，取消刪除。");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (res.ok) {
        alert("會員已成功刪除");
        loadMembers();
      } else {
        // 顯示後端回傳的具體錯誤 (例如：尚有未完成訂單)
        alert("刪除失敗：\n" + (data.message || "未知錯誤"));
      }
    } catch (err) {
      alert("網路錯誤，請稍後再試。");
    }
  };
});
