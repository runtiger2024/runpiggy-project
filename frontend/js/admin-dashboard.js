// 這是 frontend/js/admin-dashboard.js (V5 狀態標籤統一版)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");

  // 主要卡片
  const statsTotalRevenue = document.getElementById("stats-total-revenue");
  const statsPendingRevenue = document.getElementById("stats-pending-revenue");
  const statsTotalUsers = document.getElementById("stats-total-users");
  const statsNewUsersToday = document.getElementById("stats-new-users-today");

  // 次要卡片
  const statsPkgPending = document.getElementById("stats-pkg-pending");
  const statsPkgArrived = document.getElementById("stats-pkg-arrived");
  const statsShipPendingPayment = document.getElementById(
    "stats-ship-pending-payment"
  );
  const statsShipProcessing = document.getElementById("stats-ship-processing");

  // 最近活動表格
  const recentPackagesTable = document.getElementById("recent-packages-table");
  const recentShipmentsTable = document.getElementById(
    "recent-shipments-table"
  );

  // --- 2. 狀態變數 ---
  const adminToken = localStorage.getItem("admin_token");

  // (從 admin-parcels.js 複製過來)
  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // [*** V5 關鍵修正：統一狀態 ***]
  // (此定義基於 admin-shipments.html 的下拉選單)
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
  // [*** 修正結束 ***]

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
              shipmentStatusMap[ship.status] || ship.status // [*** V5 修正 ***]
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
      window.location.href = "admin-login.html";
    }
  });

  // --- 5. 初始載入資料 ---
  loadDashboardStats();
});
