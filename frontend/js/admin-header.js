// frontend/js/admin-header.js
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

  // 3. 定義選單結構
  const menuItems = [
    { href: "admin-dashboard.html", label: "儀表板", perm: null },
    {
      href: "admin-register.html",
      label: "新增員工帳號",
      perm: "CAN_MANAGE_USERS",
      style: "background-color: #2ecc71;",
    },
    { href: "admin-parcels.html", label: "包裹管理", perm: null },
    { href: "admin-shipments.html", label: "集運單管理", perm: null },
    { href: "admin-members.html", label: "會員管理", perm: "CAN_MANAGE_USERS" },
    { href: "admin-logs.html", label: "操作日誌", perm: "CAN_VIEW_LOGS" },
    {
      href: "admin-settings.html",
      label: "系統設定",
      customCheck: () =>
        adminPermissions.includes("CAN_MANAGE_SYSTEM") ||
        adminPermissions.includes("CAN_MANAGE_USERS"),
      style: "background-color: #607d8b;",
    },
  ];

  // 4. 判斷當前頁面 (用於 High light)
  const currentPath = window.location.pathname.split("/").pop();

  // 5. 生成選單 HTML
  let navButtonsHtml = "";

  menuItems.forEach((item) => {
    let hasPermission = true;
    if (item.perm && !adminPermissions.includes(item.perm))
      hasPermission = false;
    if (item.customCheck && !item.customCheck()) hasPermission = false;

    if (hasPermission) {
      // 簡單比對檔名，如果 href 包含 currentPath 則視為 active
      const isActive =
        currentPath === item.href ||
        (currentPath === "" && item.href === "admin-dashboard.html");
      const activeClass = isActive ? "active" : "";

      navButtonsHtml += `
        <a href="${item.href}" 
           class="btn btn-secondary ${activeClass}" 
           style="${item.style || ""}"
           ${item.id ? `id="${item.id}"` : ""}>
           ${item.label}
        </a>
      `;
    }
  });

  // 6. 生成歡迎詞與角色
  let roleText = "USER";
  if (adminPermissions.includes("CAN_MANAGE_USERS")) roleText = "ADMIN";
  else if (adminPermissions.length > 0) roleText = "OPERATOR";

  const welcomeHtml = adminName
    ? `<span id="admin-welcome">你好, ${adminName} (${roleText})</span>`
    : "";

  // 7. 組合完整 HTML
  const fullHtml = `
    <h1>${pageTitle}</h1>
    <div class="header-actions">
      ${navButtonsHtml}
      ${welcomeHtml}
      <button id="logoutBtn" class="btn-danger">登出</button>
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
