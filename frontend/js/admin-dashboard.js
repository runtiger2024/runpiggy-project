// frontend/js/admin-dashboard.js (V2025 現代化版)

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");

  // (權限檢查與導航欄渲染已由 admin-layout.js 統一處理，此處僅處理 Dashboard 數據)

  if (!adminToken) return; // 登入檢查交給 layout

  // --- 1. 卡片快速導航 (Drill-down) ---
  const mapping = {
    "card-total-revenue": "admin-shipments.html?status=CANCEL", // 已完成的訂單算營收
    "card-pending-revenue": "admin-shipments.html?status=PENDING_PAYMENT",
    "card-total-users": "admin-members.html",
    "card-new-users": "admin-members.html?filter=new_today",
    "card-pkg-pending": "admin-parcels.html?status=PENDING",
    "card-pkg-arrived": "admin-parcels.html?status=ARRIVED",
    "card-ship-pending": "admin-shipments.html?status=PENDING_PAYMENT",
    "card-ship-processing": "admin-shipments.html?status=PROCESSING",
  };

  Object.keys(mapping).forEach((cardId) => {
    const card = document.getElementById(cardId);
    if (card) {
      card.addEventListener("click", () => {
        window.location.href = mapping[cardId];
      });
    }
  });

  // --- 2. 載入即時統計數據 ---
  async function loadDashboardStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) return; // layout.js 會處理 401

      const data = await response.json();
      const stats = data.stats;

      // 更新卡片數字
      setText(
        "stats-total-revenue",
        `NT$ ${stats.totalRevenue.toLocaleString()}`
      );
      setText(
        "stats-pending-revenue",
        `NT$ ${stats.pendingRevenue.toLocaleString()}`
      );
      setText("stats-total-users", stats.totalUsers.toLocaleString());
      setText("stats-new-users-today", stats.newUsersToday.toLocaleString());

      setText("stats-pkg-pending", stats.packageStats.PENDING || 0);
      setText("stats-pkg-arrived", stats.packageStats.ARRIVED || 0);
      setText(
        "stats-ship-pending-payment",
        stats.shipmentStats.PENDING_PAYMENT || 0
      );
      setText("stats-ship-processing", stats.shipmentStats.PROCESSING || 0);

      // 更新下方表格
      renderRecentTable(
        "recent-packages-table",
        stats.recentPackages,
        "package"
      );
      renderRecentTable(
        "recent-shipments-table",
        stats.recentShipments,
        "shipment"
      );
    } catch (error) {
      console.error("載入統計失敗:", error);
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderRecentTable(id, items, type) {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#999;">尚無資料</td></tr>`;
      return;
    }

    const pkgStatusMap = window.PACKAGE_STATUS_MAP || {};
    const shipStatusMap = window.SHIPMENT_STATUS_MAP || {};
    const statusClasses = window.STATUS_CLASSES || {};

    items.forEach((item) => {
      const tr = document.createElement("tr");
      let statusText, statusClass, col3;

      if (type === "package") {
        statusText = pkgStatusMap[item.status] || item.status;
        statusClass = statusClasses[item.status] || "";
        col3 = item.productName;
      } else {
        statusText = shipStatusMap[item.status] || item.status;
        statusClass = statusClasses[item.status] || "";
        col3 = item.totalCost ? `NT$ ${item.totalCost.toLocaleString()}` : "-";
      }

      tr.innerHTML = `
            <td>${new Date(item.createdAt).toLocaleDateString()}</td>
            <td>${item.user.email}</td>
            <td>${col3}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        `;
      tbody.appendChild(tr);
    });
  }

  // --- 3. 圖表初始化 (Chart.js) ---
  const dateRangePicker = document.getElementById("report-date-range");
  const btnFetchReport = document.getElementById("btn-fetch-report");
  const reportLoading = document.getElementById("report-loading-spinner");
  let revenueChartInstance = null;
  let userChartInstance = null;

  if (dateRangePicker) {
    const fp = flatpickr(dateRangePicker, {
      mode: "range",
      dateFormat: "Y-m-d",
      locale: "zh_tw",
      defaultDate: [getNDaysAgo(30), getNDaysAgo(0)],
    });

    btnFetchReport.addEventListener("click", () => fetchDetailedReport(fp));
    // 初始載入
    fetchDetailedReport(fp);
  }

  async function fetchDetailedReport(fp) {
    const selectedDates = fp.selectedDates;
    if (selectedDates.length < 2) return;

    const startDate = selectedDates[0].toISOString().split("T")[0];
    const endDate = selectedDates[1].toISOString().split("T")[0];

    reportLoading.style.display = "block";
    btnFetchReport.disabled = true;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/reports?startDate=${startDate}&endDate=${endDate}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const data = await response.json();
      if (data.success) {
        renderCharts(data.report, selectedDates[0], selectedDates[1]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      reportLoading.style.display = "none";
      btnFetchReport.disabled = false;
    }
  }

  function renderCharts(report, start, end) {
    const allDates = getDateArray(start, end);
    const revenueMap = new Map(
      report.revenueData.map((i) => [i.date.split("T")[0], i.revenue])
    );
    const userMap = new Map(
      report.userData.map((i) => [i.date.split("T")[0], i.newUsers])
    );

    const labels = allDates;
    const revData = labels.map((d) => revenueMap.get(d) || 0);
    const usrData = labels.map((d) => userMap.get(d) || 0);

    const revCtx = document.getElementById("revenueChart");
    const usrCtx = document.getElementById("userChart");

    if (revenueChartInstance) revenueChartInstance.destroy();
    if (userChartInstance) userChartInstance.destroy();

    // 營收圖表 (Line)
    revenueChartInstance = new Chart(revCtx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "營收 (NT$)",
            data: revData,
            borderColor: "#4e73df",
            backgroundColor: "rgba(78, 115, 223, 0.05)",
            pointRadius: 3,
            pointBackgroundColor: "#4e73df",
            pointBorderColor: "#4e73df",
            pointHoverRadius: 3,
            pointHoverBackgroundColor: "#4e73df",
            pointHoverBorderColor: "#4e73df",
            pointHitRadius: 10,
            pointBorderWidth: 2,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { left: 10, right: 25, top: 25, bottom: 0 } },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { maxTicksLimit: 7 },
          },
          y: {
            ticks: { maxTicksLimit: 5, padding: 10, callback: (v) => "$" + v },
          },
        },
        plugins: { legend: { display: false } },
      },
    });

    // 用戶圖表 (Bar)
    userChartInstance = new Chart(usrCtx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "新註冊數",
            data: usrData,
            backgroundColor: "#1cc88a",
            hoverBackgroundColor: "#17a673",
            borderColor: "#4e73df",
            maxBarThickness: 25,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false, drawBorder: false } },
          y: {
            ticks: { stepSize: 1 },
            grid: { borderDash: [2], drawBorder: false },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  function getNDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  function getDateArray(start, end) {
    const arr = [];
    const dt = new Date(start);
    while (dt <= end) {
      arr.push(dt.toISOString().split("T")[0]);
      dt.setDate(dt.getDate() + 1);
    }
    return arr;
  }

  // 啟動
  loadDashboardStats();
});
