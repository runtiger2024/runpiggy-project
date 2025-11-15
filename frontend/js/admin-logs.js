// 這是 frontend/js/admin-logs.js (新檔案)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const logsTableBody = document.getElementById("logsTableBody");

  // --- 2. 狀態變數 ---
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

  // (A) 載入所有日誌 (呼叫 GET /api/admin/logs)
  async function loadLogs() {
    logsTableBody.innerHTML =
      '<tr><td colspan="5" class="loading"><div class="spinner"></div><p>載入日誌資料中...</p></td></tr>';

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/logs`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
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

  // (F) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  // --- 5. 初始載入資料 ---
  loadLogs();
});
