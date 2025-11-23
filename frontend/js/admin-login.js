// frontend/js/admin-logs.js (V12 - 分頁與篩選優化版)
// 支援動態注入篩選列，無需手動修改 HTML 即可使用新功能

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 權限檢查 ---
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");

  if (!adminToken) {
    window.location.href = "admin-login.html";
    return;
  }

  if (!adminPermissions.includes("CAN_VIEW_LOGS")) {
    const container = document.getElementById("admin-only-content");
    if (container) {
      container.innerHTML = `
        <div class="alert alert-error" style="text-align:center; margin-top:50px;">
          <h3><i class="fas fa-lock"></i> 權限不足</h3>
          <p>您沒有查看操作日誌的權限。</p>
        </div>`;
    }
    return;
  }

  // --- 2. 變數與 DOM ---
  let currentPage = 1;
  const limit = 20;
  let currentSearch = "";
  let currentAction = "";

  const logsTableBody = document.getElementById("logsTableBody");
  const tableContainer = document.querySelector(".members-table-container");

  // --- 3. 動態注入篩選 UI (如果 HTML 裡沒有) ---
  // 這樣可以確保即使只更新 JS，也能獲得篩選功能
  if (!document.getElementById("logs-filter-bar")) {
    const filterBar = document.createElement("div");
    filterBar.id = "logs-filter-bar";
    filterBar.className = "filters-container";
    filterBar.style.marginBottom = "20px";
    filterBar.innerHTML = `
      <div class="filters" style="display:flex; gap:10px; flex-wrap:wrap;">
        <select id="filter-action" class="form-control" style="width:200px;">
          <option value="">所有動作</option>
          <option value="LOGIN">登入 (LOGIN)</option>
          <option value="UPDATE_PACKAGE">更新包裹 (UPDATE_PACKAGE)</option>
          <option value="UPDATE_SHIPMENT">更新訂單 (UPDATE_SHIPMENT)</option>
          <option value="CREATE_STAFF">建立員工 (CREATE_STAFF)</option>
          <option value="DELETE">刪除操作 (DELETE)</option>
          <option value="SYSTEM">系統設定 (SYSTEM)</option>
        </select>
        <input type="text" id="search-input" class="form-control" placeholder="搜尋 User Email 或 內容..." style="flex:1;">
        <button id="filter-btn" class="btn btn-primary" style="width:auto;">
          <i class="fas fa-search"></i> 搜尋
        </button>
      </div>
    `;
    // 插入到表格容器之前
    if (tableContainer) {
      tableContainer.parentNode.insertBefore(filterBar, tableContainer);
    }
  }

  // 注入分頁容器 (如果沒有)
  let paginationContainer = document.getElementById("pagination");
  if (!paginationContainer && tableContainer) {
    paginationContainer = document.createElement("div");
    paginationContainer.id = "pagination";
    paginationContainer.className = "pagination-container";
    paginationContainer.style.marginTop = "20px";
    tableContainer.parentNode.appendChild(paginationContainer);
  }

  // 綁定篩選事件
  const filterBtn = document.getElementById("filter-btn");
  const searchInput = document.getElementById("search-input");
  const filterAction = document.getElementById("filter-action");

  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      currentSearch = searchInput.value;
      currentAction = filterAction.value;
      currentPage = 1;
      loadLogs();
    });
  }

  // 支援 Enter 搜尋
  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") filterBtn.click();
    });
  }

  // --- 4. 載入資料函式 ---
  async function loadLogs() {
    logsTableBody.innerHTML =
      '<tr><td colspan="5" class="loading"><div class="spinner"></div><p>載入中...</p></td></tr>';

    try {
      // 建構 URL 參數
      let url = `${API_BASE_URL}/api/admin/logs?page=${currentPage}&limit=${limit}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;
      if (currentAction) url += `&action=${encodeURIComponent(currentAction)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401) window.location.href = "admin-login.html";
        throw new Error("載入失敗");
      }

      const data = await response.json();

      // 兼容後端：若後端尚未支援分頁回傳 (只回傳 array)，則視為單頁
      const logs = Array.isArray(data) ? data : data.logs || [];
      const pagination = data.pagination || {
        total: logs.length,
        totalPages: 1,
        page: 1,
      };

      renderLogs(logs);
      renderPagination(pagination);
    } catch (error) {
      console.error(error);
      logsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">載入發生錯誤: ${error.message}</td></tr>`;
    }
  }

  // --- 5. 渲染表格 ---
  function renderLogs(logs) {
    logsTableBody.innerHTML = "";

    if (logs.length === 0) {
      logsTableBody.innerHTML =
        '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">查無日誌紀錄</td></tr>';
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");

      // 格式化時間
      const dateObj = new Date(log.createdAt);
      const dateStr =
        dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString();

      // 根據動作類型上色 (Optional)
      let actionStyle = "";
      if (log.action.includes("DELETE"))
        actionStyle = "color: #e74c3c; font-weight:bold;";
      else if (log.action.includes("CREATE"))
        actionStyle = "color: #27ae60; font-weight:bold;";
      else if (log.action.includes("UPDATE")) actionStyle = "color: #f39c12;";

      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${log.userEmail || "未知"}</td>
        <td style="${actionStyle}">${log.action}</td>
        <td><code style="background:#f4f4f4; padding:2px 5px; border-radius:4px;">${
          log.targetId || "-"
        }</code></td>
        <td style="word-break: break-all; color:#555;">${log.details || ""}</td>
      `;
      logsTableBody.appendChild(tr);
    });
  }

  // --- 6. 渲染分頁 ---
  function renderPagination(pg) {
    paginationContainer.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const createBtn = (text, page, isActive = false, isDisabled = false) => {
      const btn = document.createElement("button");
      btn.className = `page-btn ${isActive ? "active" : ""}`;
      btn.textContent = text;
      btn.disabled = isDisabled;
      btn.style.margin = "0 2px";
      btn.style.padding = "5px 10px";
      btn.style.border = "1px solid #ddd";
      btn.style.background = isActive ? "#1a73e8" : "#fff";
      btn.style.color = isActive ? "#fff" : "#333";
      btn.style.cursor = isDisabled ? "not-allowed" : "pointer";
      btn.style.borderRadius = "4px";

      if (!isDisabled) {
        btn.addEventListener("click", () => {
          currentPage = page;
          loadLogs();
        });
      }
      return btn;
    };

    // 上一頁
    paginationContainer.appendChild(
      createBtn("<", currentPage - 1, false, currentPage === 1)
    );

    // 簡單顯示：第一頁、當前頁前後、最後一頁
    if (currentPage > 2) {
      paginationContainer.appendChild(createBtn("1", 1));
      if (currentPage > 3) {
        const span = document.createElement("span");
        span.textContent = "...";
        span.style.margin = "0 5px";
        paginationContainer.appendChild(span);
      }
    }

    // 前一頁
    if (currentPage > 1)
      paginationContainer.appendChild(
        createBtn(currentPage - 1, currentPage - 1)
      );

    // 當前頁
    paginationContainer.appendChild(createBtn(currentPage, currentPage, true));

    // 後一頁
    if (currentPage < pg.totalPages)
      paginationContainer.appendChild(
        createBtn(currentPage + 1, currentPage + 1)
      );

    // 最後一頁
    if (currentPage < pg.totalPages - 1) {
      if (currentPage < pg.totalPages - 2) {
        const span = document.createElement("span");
        span.textContent = "...";
        span.style.margin = "0 5px";
        paginationContainer.appendChild(span);
      }
      paginationContainer.appendChild(createBtn(pg.totalPages, pg.totalPages));
    }

    // 下一頁
    paginationContainer.appendChild(
      createBtn(">", currentPage + 1, false, currentPage === pg.totalPages)
    );
  }

  // 初始載入
  loadLogs();
});
