// 這是 frontend/js/admin-logs.js (V3 權限系統版)

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

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
    }

    // 檢查是否 "沒有" 查看日誌的權限
    if (!adminPermissions.includes("CAN_VIEW_LOGS")) {
      const btnNavLogs = document.getElementById("btn-nav-logs");
      if (btnNavLogs) btnNavLogs.style.display = "none";

      // 2. (特殊) 隱藏此頁面的主要内容
      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足 (Access Denied)</h2>' +
          '<p style="text-align: center;">此頁面僅限具有「查看日誌」權限的管理員使用。</p>';
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
  const logsTableBody = document.getElementById("logsTableBody");

  // (C) 登出按鈕 (V3 版)
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      localStorage.removeItem("admin_permissions"); // [*** V3 修正 ***]
      window.location.href = "admin-login.html";
    }
  });

  // --- 4. 函式定義 ---

  // (A) 載入所有日誌 (呼叫 GET /api/admin/logs)
  async function loadLogs() {
    // [V3] 權限檢查：如果沒有權限，不要載入
    if (!adminPermissions.includes("CAN_VIEW_LOGS")) {
      logsTableBody.innerHTML =
        '<tr><td colspan="5" style="text-align: center; color: red;">權限不足</td></tr>';
      return;
    }

    logsTableBody.innerHTML =
      '<tr><td colspan="5" class="loading"><div class="spinner"></div><p>載入日誌資料中...</p></td></tr>';

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/logs`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // 403 也可能是因為 V3 API 權限不足
          window.location.href = "admin-login.html";
        }
        throw new Error("載入日誌失敗");
      }

      const data = await response.json();
      renderLogs(data.logs || []);
    } catch (error) {
      console.error("載入日誌列表失敗:", error);
      logsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">載入失敗: ${error.message}</td></tr>`;
    }
  }

  // (B) 渲染日誌列表
  function renderLogs(logs) {
    logsTableBody.innerHTML = ""; // 清空

    if (logs.length === 0) {
      logsTableBody.innerHTML =
        '<tr><td colspan="5" style="text-align: center;">尚無任何操作日誌</td></tr>';
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");

      // 格式化時間
      const logTime = new Date(log.createdAt);
      const timeString = `${logTime.toLocaleDateString()} ${logTime.toLocaleTimeString()}`;

      tr.innerHTML = `
        <td style="white-space: normal;">${timeString}</td>
        <td style="white-space: normal;">${log.userEmail}</td>
        <td style="white-space: normal;">${log.action}</td>
        <td style="white-space: normal; word-break: break-all;">${
          log.targetId || "-"
        }</td>
        <td style="white-space: normal; word-break: break-all;">${
          log.details || "-"
        }</td>
      `;
      logsTableBody.appendChild(tr);
    });
  }

  // --- 5. 初始載入資料 ---
  loadLogs();
});
