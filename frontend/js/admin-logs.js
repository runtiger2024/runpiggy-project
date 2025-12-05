// frontend/js/admin-logs.js

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  let currentPage = 1;
  const limit = 50; // 日誌每頁顯示較多
  const tbody = document.getElementById("logs-list");

  // 初始化
  loadLogs();

  document.getElementById("btn-search").addEventListener("click", () => {
    currentPage = 1;
    loadLogs();
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadLogs();
    }
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    currentPage++;
    loadLogs();
  });

  async function loadLogs() {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center p-3">載入中...</td></tr>';
    const search = document.getElementById("search-input").value.trim();
    const action = document.getElementById("action-input").value.trim();

    try {
      let url = `${API_BASE_URL}/api/admin/logs?page=${currentPage}&limit=${limit}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (action) url += `&action=${encodeURIComponent(action)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);

      renderLogs(data.logs || []);
      updatePagination(data.pagination);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger p-3">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  function renderLogs(logs) {
    tbody.innerHTML = "";
    if (logs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center p-3 text-secondary">無相關紀錄</td></tr>';
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");

      // 根據動作類型加上顏色
      let actionColor = "text-primary";
      if (log.action.includes("DELETE")) actionColor = "text-danger";
      if (log.action.includes("UPDATE")) actionColor = "text-warning";
      if (log.action.includes("CREATE")) actionColor = "text-success";

      tr.innerHTML = `
                <td style="white-space:nowrap; font-size:0.9rem;">${new Date(
                  log.createdAt
                ).toLocaleString()}</td>
                <td>${log.userEmail}</td>
                <td><span class="font-weight-bold ${actionColor}">${
        log.action
      }</span></td>
                <td><code style="background:#f1f1f1; padding:2px 4px; border-radius:3px;">${
                  log.targetId || "-"
                }</code></td>
                <td style="color:#555; font-size:0.95rem;">${
                  log.details || ""
                }</td>
            `;
      tbody.appendChild(tr);
    });
  }

  function updatePagination(pg) {
    const info = document.getElementById("page-info");
    info.textContent = `${currentPage} / ${pg.totalPages || 1}`;

    document.getElementById("btn-prev").disabled = currentPage === 1;
    document.getElementById("btn-next").disabled = currentPage >= pg.totalPages;
  }
});
