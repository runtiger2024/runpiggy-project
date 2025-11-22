// frontend/js/admin-dashboard.js (V10.2 - 修正權限與閃爍)

document.addEventListener("DOMContentLoaded", () => {
  // 1. 權限檢查與初始化
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  function checkAdminPermissions() {
    // 檢查使用者管理權限 (反向邏輯：無權限則隱藏)
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";
    }

    // [修正] 檢查系統設定權限
    // 邏輯調整：只要擁有 "CAN_MANAGE_SYSTEM" (系統管理)
    // 或者 "CAN_MANAGE_USERS" (超級管理員/ADMIN)，都可以看到系統設定按鈕
    if (
      adminPermissions.includes("CAN_MANAGE_SYSTEM") ||
      adminPermissions.includes("CAN_MANAGE_USERS")
    ) {
      const btnNavSettings = document.getElementById("btn-nav-settings");
      if (btnNavSettings) btnNavSettings.style.display = "inline-block";
    }
  }

  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return;
  }

  checkAdminPermissions();

  // --- 2. 卡片快速導航 (Drill-down) ---
  function setupCardNavigation() {
    const mapping = {
      "card-total-revenue": "admin-shipments.html?status=CANCEL",
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
  }

  setupCardNavigation();

  // --- 3. 獲取元素與初始化 ---
  const statsTotalRevenue = document.getElementById("stats-total-revenue");
  const statsPendingRevenue = document.getElementById("stats-pending-revenue");
  const statsTotalUsers = document.getElementById("stats-total-users");
  const statsNewUsersToday = document.getElementById("stats-new-users-today");
  const statsPkgPending = document.getElementById("stats-pkg-pending");
  const statsPkgArrived = document.getElementById("stats-pkg-arrived");
  const statsShipPendingPayment = document.getElementById(
    "stats-ship-pending-payment"
  );
  const statsShipProcessing = document.getElementById("stats-ship-processing");
  const recentPackagesTable = document.getElementById("recent-packages-table");
  const recentShipmentsTable = document.getElementById(
    "recent-shipments-table"
  );

  const pkgStatusMap = window.PACKAGE_STATUS_MAP || {};
  const shipStatusMap = window.SHIPMENT_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};

  // --- 4. 載入儀表板統計 ---
  async function loadDashboardStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "admin-login.html";
        }
        throw new Error("載入統計失敗");
      }

      const data = await response.json();
      const stats = data.stats;

      statsTotalRevenue.textContent = `NT$ ${stats.totalRevenue.toLocaleString()}`;
      statsPendingRevenue.textContent = `NT$ ${stats.pendingRevenue.toLocaleString()}`;
      statsTotalUsers.textContent = stats.totalUsers.toLocaleString();
      statsNewUsersToday.textContent = stats.newUsersToday.toLocaleString();

      statsPkgPending.textContent = stats.packageStats.PENDING || 0;
      statsPkgArrived.textContent = stats.packageStats.ARRIVED || 0;
      statsShipPendingPayment.textContent =
        stats.shipmentStats.PENDING_PAYMENT || 0;
      statsShipProcessing.textContent = stats.shipmentStats.PROCESSING || 0;

      if (stats.recentPackages && stats.recentPackages.length > 0) {
        recentPackagesTable.innerHTML = stats.recentPackages
          .map((pkg) => {
            const statusText = pkgStatusMap[pkg.status] || pkg.status;
            const statusClass = statusClasses[pkg.status] || pkg.status;
            return `
          <tr>
            <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
            <td>${pkg.user.email}</td>
            <td>${pkg.productName}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          </tr>
        `;
          })
          .join("");
      } else {
        recentPackagesTable.innerHTML =
          '<tr><td colspan="4" style="text-align: center;">尚無包裹</td></tr>';
      }

      if (stats.recentShipments && stats.recentShipments.length > 0) {
        recentShipmentsTable.innerHTML = stats.recentShipments
          .map((ship) => {
            const statusText = shipStatusMap[ship.status] || ship.status;
            const statusClass = statusClasses[ship.status] || ship.status;
            return `
          <tr>
            <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
            <td>${ship.user.email}</td>
            <td>${
              ship.totalCost ? `NT$ ${ship.totalCost.toLocaleString()}` : "-"
            }</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          </tr>
        `;
          })
          .join("");
      } else {
        recentShipmentsTable.innerHTML =
          '<tr><td colspan="4" style="text-align: center;">尚無訂單</td></tr>';
      }
    } catch (error) {
      console.error("載入儀表板失敗:", error);
    }
  }

  // --- 5. 詳細報表圖表邏輯 ---
  const dateRangePicker = document.getElementById("report-date-range");
  const btnFetchReport = document.getElementById("btn-fetch-report");
  const reportLoading = document.getElementById("report-loading-spinner");
  const revenueChartCtx = document.getElementById("revenueChart");
  const userChartCtx = document.getElementById("userChart");

  let revenueChartInstance = null;
  let userChartInstance = null;

  const fp = flatpickr(dateRangePicker, {
    mode: "range",
    dateFormat: "Y-m-d",
    locale: "zh_tw",
    defaultDate: [getNDaysAgo(30), getNDaysAgo(0)],
  });

  btnFetchReport.addEventListener("click", fetchDetailedReport);

  async function fetchDetailedReport() {
    const selectedDates = fp.selectedDates;
    if (selectedDates.length < 2) {
      alert("請選擇一個完整的日期區間");
      return;
    }

    const startDate = selectedDates[0].toISOString().split("T")[0];
    const endDate = selectedDates[1].toISOString().split("T")[0];

    reportLoading.style.display = "block";
    btnFetchReport.disabled = true;
    btnFetchReport.textContent = "查詢中...";

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/reports?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      if (!response.ok) throw new Error("抓取報表失敗");
      const data = await response.json();

      const allDates = getDateArray(selectedDates[0], selectedDates[1]);
      const processedReport = processReportData(data.report, allDates);

      renderCharts(processedReport);
    } catch (error) {
      console.error("報表錯誤:", error);
      alert(error.message);
    } finally {
      reportLoading.style.display = "none";
      btnFetchReport.disabled = false;
      btnFetchReport.textContent = "查詢報表";
    }
  }

  function renderCharts(report) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    if (userChartInstance) userChartInstance.destroy();

    revenueChartInstance = new Chart(revenueChartCtx, {
      type: "line",
      data: {
        labels: report.labels,
        datasets: [
          {
            label: "每日營業額 (NT$)",
            data: report.revenueData,
            borderColor: "#1a73e8",
            backgroundColor: "rgba(26, 115, 232, 0.1)",
            fill: true,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => "NT$ " + value.toLocaleString(),
            },
          },
        },
      },
    });

    userChartInstance = new Chart(userChartCtx, {
      type: "bar",
      data: {
        labels: report.labels,
        datasets: [
          {
            label: "每日新註冊會員",
            data: report.userData,
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.5)",
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
          },
        },
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

  function processReportData(report, allDates) {
    const revenueMap = new Map(
      report.revenueData.map((item) => [item.date.split("T")[0], item.revenue])
    );
    const userMap = new Map(
      report.userData.map((item) => [item.date.split("T")[0], item.newUsers])
    );

    const labels = allDates;
    const revenueData = labels.map((date) => revenueMap.get(date) || 0);
    const userData = labels.map((date) => userMap.get(date) || 0);

    return { labels, revenueData, userData };
  }

  // 初始載入
  loadDashboardStats();
  fetchDetailedReport();
});
