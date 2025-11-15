// 這是 frontend/js/admin-dashboard.js (V5 狀態標籤 + V3 權限 統一版)

document.addEventListener("DOMContentLoaded", () => {
  // [*** V3 權限檢查：讀取權限 ***]
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  // [*** V3 權限檢查：檢查函式 ***]
  function checkAdminPermissions() {
    // 檢查是否 "沒有" 管理會員的權限 (即 OPERATOR)
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      // 1. 隱藏導覽列的 Admin 按鈕
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";

      // 2. (特殊) 如果目前頁面是 "僅限 Admin" 頁面，隱藏主要内容
      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足 (Access Denied)</h2>' +
          '<p style="text-align: center;">此頁面僅限「系統管理員 (ADMIN)」使用。</p>';
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

  // [*** V5 新增：報表卡片 ***]
  const statsWeeklyRevenue = document.getElementById("stats-weekly-revenue");
  const statsMonthlyRevenue = document.getElementById("stats-monthly-revenue");
  const statsWeeklyPackages = document.getElementById("stats-weekly-packages");
  const statsMonthlyPackages = document.getElementById(
    "stats-monthly-packages"
  );
  const statsWeeklyNewUsers = document.getElementById("stats-weekly-new-users");
  const statsMonthlyNewUsers = document.getElementById(
    "stats-monthly-new-users"
  );

  // --- 2. 狀態變數 ---
  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  const shipmentStatusMap = {
    PENDING_PAYMENT: "待付款",
    PROCESSING: "已收款，安排裝櫃",
    SHIPPED: "已裝櫃",
    COMPLETED: "海關查驗",
    CANCELLEDD: "清關放行", // (保留錯字鍵名)
    CANCELL: "拆櫃派送", // (保留錯字鍵名)
    CANCEL: "已完成", // (保留錯字鍵名)
    CANCELLED: "已取消/退回", // (這是"取消"的狀態)
  };

  // --- 4. 函式定義 ---

  // (A) 載入儀表板統計
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

      // 填入主要卡片
      statsTotalRevenue.textContent = `NT$ ${stats.totalRevenue.toLocaleString()}`;
      statsPendingRevenue.textContent = `NT$ ${stats.pendingRevenue.toLocaleString()}`;
      statsTotalUsers.textContent = stats.totalUsers.toLocaleString();
      statsNewUsersToday.textContent = stats.newUsersToday.toLocaleString();

      // [*** V5 新增：填入報表卡片 ***]
      if (statsWeeklyRevenue)
        statsWeeklyRevenue.textContent = `NT$ ${stats.weeklyRevenue.toLocaleString()}`;
      if (statsMonthlyRevenue)
        statsMonthlyRevenue.textContent = `NT$ ${stats.monthlyRevenue.toLocaleString()}`;
      if (statsWeeklyPackages)
        statsWeeklyPackages.textContent = `${stats.weeklyPackages} 件`;
      if (statsMonthlyPackages)
        statsMonthlyPackages.textContent = `${stats.monthlyPackages} 件`;
      if (statsWeeklyNewUsers)
        statsWeeklyNewUsers.textContent = `${stats.weeklyNewUsers} 人`;
      if (statsMonthlyNewUsers)
        statsMonthlyNewUsers.textContent = `${stats.monthlyNewUsers} 人`;

      // 填入次要卡片
      statsPkgPending.textContent = stats.packageStats.PENDING || 0;
      statsPkgArrived.textContent = stats.packageStats.ARRIVED || 0;
      statsShipPendingPayment.textContent =
        stats.shipmentStats.PENDING_PAYMENT || 0;
      statsShipProcessing.textContent = stats.shipmentStats.PROCESSING || 0;

      // 填入最近包裹
      if (stats.recentPackages && stats.recentPackages.length > 0) {
        recentPackagesTable.innerHTML = stats.recentPackages
          .map(
            (pkg) => `
          <tr>
            <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
            <td>${pkg.user.email}</td>
            <td>${pkg.productName}</td>
            <td><span class="status-badge status-${pkg.status}">${
              packageStatusMap[pkg.status] || pkg.status
            }</span></td>
          </tr>
        `
          )
          .join("");
      } else {
        recentPackagesTable.innerHTML =
          '<tr><td colspan="4" style="text-align: center;">尚無包裹</td></tr>';
      }

      // 填入最近訂單
      if (stats.recentShipments && stats.recentShipments.length > 0) {
        recentShipmentsTable.innerHTML = stats.recentShipments
          .map(
            (ship) => `
          <tr>
            <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
            <td>${ship.user.email}</td>
            <td>${
              ship.totalCost ? `NT$ ${ship.totalCost.toLocaleString()}` : "-"
            }</td>
            <td><span class="status-badge status-${ship.status}">${
              shipmentStatusMap[ship.status] || ship.status
            }</span></td>
          </tr>
        `
          )
          .join("");
      } else {
        recentShipmentsTable.innerHTML =
          '<tr><td colspan="4" style="text-align: center;">尚無訂單</td></tr>';
      }
    } catch (error) {
      console.error("載入儀表板失敗:", error);
      // 在某個地方顯示錯誤
    }
  }

  // (B) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台嗎？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      localStorage.removeItem("admin_permissions"); // [*** V3 修正 ***]
      window.location.href = "admin-login.html";
    }
  });

  // --- [*** 新增：詳細報表邏輯 ***] ---

  // (1) 獲取新 UI 元素
  const dateRangePicker = document.getElementById("report-date-range");
  const btnFetchReport = document.getElementById("btn-fetch-report");
  const reportLoading = document.getElementById("report-loading-spinner");
  const revenueChartCtx = document.getElementById("revenueChart");
  const userChartCtx = document.getElementById("userChart");

  let revenueChartInstance = null; // 用於存放 Chart.js 實例
  let userChartInstance = null; // 用於存放 Chart.js 實例

  // (2) 初始化 flatpickr 日期選擇器
  const fp = flatpickr(dateRangePicker, {
    mode: "range", // 設為「區間選擇」
    dateFormat: "Y-m-d", // 日期格式
    locale: "zh_tw", // 使用中文 (需引入 l10n/zh-tw.js)
    defaultDate: [getNDaysAgo(30), getNDaysAgo(0)], // 預設 30 天前到今天
  });

  // (3) 綁定查詢按鈕事件
  btnFetchReport.addEventListener("click", fetchDetailedReport);

  // (4) 抓取報表 API 的函式
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

      if (!response.ok) {
        throw new Error("抓取報表失敗");
      }
      const data = await response.json();

      // (重要) 處理資料，填補 0
      const allDates = getDateArray(selectedDates[0], selectedDates[1]);
      const processedReport = processReportData(data.report, allDates);

      // 渲染圖表
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

  // (5) 渲染圖表的函式
  function renderCharts(report) {
    // 銷毀舊圖表 (如果存在)
    if (revenueChartInstance) revenueChartInstance.destroy();
    if (userChartInstance) userChartInstance.destroy();

    // 渲染營業額圖表
    revenueChartInstance = new Chart(revenueChartCtx, {
      type: "line", // 折線圖
      data: {
        labels: report.labels, // X 軸 (日期)
        datasets: [
          {
            label: "每日營業額 (NT$)",
            data: report.revenueData, // Y 軸 (金額)
            borderColor: "#1a73e8",
            backgroundColor: "rgba(26, 115, 232, 0.1)",
            fill: true,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: function (context) {
                return ` 營業額: ${context.raw.toLocaleString()} 元`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return "NT$ " + value.toLocaleString();
              },
            },
          },
        },
      },
    });

    // 渲染新用戶圖表
    userChartInstance = new Chart(userChartCtx, {
      type: "bar", // 柱狀圖
      data: {
        labels: report.labels, // X 軸 (日期)
        datasets: [
          {
            label: "每日新註冊會員",
            data: report.userData, // Y 軸 (人數)
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
            ticks: {
              stepSize: 1, // 確保 Y 軸是整數
            },
          },
        },
      },
    });
  }

  // (6) 輔助函式：取得 N 天前的日期
  function getNDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  // (7) 輔助函式：取得日期區間內的所有日期 (用於 X 軸)
  function getDateArray(start, end) {
    const arr = [];
    const dt = new Date(start);
    while (dt <= end) {
      arr.push(dt.toISOString().split("T")[0]);
      dt.setDate(dt.getDate() + 1);
    }
    return arr;
  }

  // (8) 輔助函式：處理 API 回傳的資料，將空缺的日期補 0
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

  // --- [*** 新增結束 ***] ---

  // --- 5. 初始載入資料 ---
  loadDashboardStats();
  fetchDetailedReport(); // [*** 新增 ***] 頁面載入時，自動抓取預設(30天)的報表
});
