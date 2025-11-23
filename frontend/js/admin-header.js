// frontend/js/admin-header.js (V12 - 權限集中管理版)
// 負責渲染管理後台的導航列、檢查登入狀態與權限

document.addEventListener("DOMContentLoaded", () => {
  const headerContainer = document.getElementById("admin-header-container");
  if (!headerContainer) return;

  // 1. 讀取頁面標題
  const pageTitle = headerContainer.dataset.title || "管理後台";

  // 2. 讀取使用者資訊與權限
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );

  // 若未登入，跳轉回登入頁 (排除登入頁本身)
  if (!adminToken && !window.location.pathname.includes("login")) {
    window.location.href = "admin-login.html";
    return;
  }

  // 3. 定義選單結構 (Label, Link, Permission)
  const menuItems = [
    {
      href: "admin-dashboard.html",
      label: "儀表板",
      icon: "fas fa-tachometer-alt",
      perm: "CAN_VIEW_DASHBOARD", // 或是 null 代表基礎權限
    },
    {
      href: "admin-parcels.html",
      label: "包裹管理",
      icon: "fas fa-box",
      perm: "CAN_MANAGE_PACKAGES",
    },
    {
      href: "admin-shipments.html",
      label: "集運單管理",
      icon: "fas fa-shipping-fast",
      perm: "CAN_MANAGE_SHIPMENTS",
    },
    {
      href: "admin-members.html",
      label: "會員管理",
      icon: "fas fa-users",
      perm: "CAN_MANAGE_USERS",
    },
    {
      href: "admin-register.html",
      label: "新增員工",
      icon: "fas fa-user-plus",
      perm: "CAN_MANAGE_USERS",
      style: "background-color: #2ecc71; color: white;",
    },
    {
      href: "admin-logs.html",
      label: "操作日誌",
      icon: "fas fa-history",
      perm: "CAN_VIEW_LOGS",
    },
    {
      href: "admin-settings.html",
      label: "系統設定",
      icon: "fas fa-cogs",
      // 自訂檢查函式：擁有 系統管理 或 超級管理員 權限
      customCheck: () =>
        adminPermissions.includes("CAN_MANAGE_SYSTEM") ||
        adminPermissions.includes("CAN_MANAGE_USERS"),
      style: "background-color: #607d8b; color: white;",
    },
  ];

  // 4. 判斷當前頁面 (用於 High light)
  const currentPath = window.location.pathname.split("/").pop();

  // 5. 生成選單 HTML
  let navButtonsHtml = "";

  menuItems.forEach((item) => {
    let hasPermission = true;

    // 權限檢查
    if (item.perm && !adminPermissions.includes(item.perm)) {
      // 特例：如果是儀表板，通常允許所有登入的員工查看，除非嚴格限制
      if (item.perm !== "CAN_VIEW_DASHBOARD") hasPermission = false;
    }
    if (item.customCheck && !item.customCheck()) hasPermission = false;

    if (hasPermission) {
      // 簡單比對檔名，如果 href 包含 currentPath 則視為 active
      const isActive =
        currentPath === item.href ||
        (currentPath === "" && item.href === "admin-dashboard.html");
      const activeClass = isActive ? "active" : "";
      const iconHtml = item.icon ? `<i class="${item.icon}"></i> ` : "";

      navButtonsHtml += `
        <a href="${item.href}" 
           class="btn btn-secondary ${activeClass}" 
           style="${item.style || ""}"
           title="${item.label}">
           ${iconHtml}${item.label}
        </a>
      `;
    }
  });

  // 6. 生成歡迎詞與角色
  let roleText = "員工";
  if (adminPermissions.includes("CAN_MANAGE_USERS"))
    roleText = "管理員 (Admin)";
  else if (adminPermissions.length > 0) roleText = "操作員 (Operator)";

  const welcomeHtml = adminName
    ? `<span id="admin-welcome" style="margin: 0 10px; font-weight:500; color:#555;">
         <i class="fas fa-user-circle"></i> ${adminName} <small>(${roleText})</small>
       </span>`
    : "";

  // 7. 組合完整 HTML
  const fullHtml = `
    <div class="admin-header-top" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h1 style="margin:0; font-size:24px; color:#333;">${pageTitle}</h1>
      <div class="user-controls" style="display:flex; align-items:center;">
        ${welcomeHtml}
        <button id="logoutBtn" class="btn btn-danger btn-sm" style="width:auto;">
          <i class="fas fa-sign-out-alt"></i> 登出
        </button>
      </div>
    </div>
    <div class="header-actions" style="display:flex; gap:10px; flex-wrap:wrap; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:20px;">
      ${navButtonsHtml}
    </div>
  `;

  // 8. 注入 DOM
  headerContainer.innerHTML = fullHtml;
  headerContainer.className = "admin-header";

  // 9. 綁定登出事件
  const btnLogout = document.getElementById("logoutBtn");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (confirm("確定要登出管理後台嗎？")) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_name");
        localStorage.removeItem("admin_permissions");
        window.location.href = "admin-login.html";
      }
    });
  }
});
