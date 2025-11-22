// frontend/js/admin-header.js
// 功能：動態生成管理後台的頂部導覽列、處理權限顯示、處理登出、顯示歡迎詞

document.addEventListener("DOMContentLoaded", () => {
  const headerContainer = document.getElementById("admin-header-container");
  if (!headerContainer) return;

  // 1. 讀取頁面設定 (標題從 HTML 的 data-title 屬性讀取)
  const pageTitle = headerContainer.dataset.title || "管理後台";

  // 2. 讀取使用者資訊與權限
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );

  // 若未登入，跳轉回登入頁 (這是第一道防線，各頁面 JS 會有第二道)
  if (!adminToken) {
    // 避免在 login 頁面無限迴圈，雖然 login 頁面不該引用此 script
    if (!window.location.pathname.includes("login")) {
      window.location.href = "admin-login.html";
      return;
    }
  }

  // 3. 定義選單結構
  // href: 連結目標
  // label: 按鈕文字
  // perm: 需要的權限 (null 代表所有人可見)
  // id: 元素的 ID (選填)
  // style: 額外的 CSS 樣式 (選填)
  const menuItems = [
    { href: "admin-dashboard.html", label: "儀表板", perm: null },
    {
      href: "admin-register.html",
      label: "新增員工帳號",
      perm: "CAN_MANAGE_USERS",
      style: "background-color: #2ecc71;", // 綠色按鈕
    },
    { href: "admin-parcels.html", label: "包裹管理", perm: null },
    { href: "admin-shipments.html", label: "集運單管理", perm: null },
    { href: "admin-members.html", label: "會員管理", perm: "CAN_MANAGE_USERS" },
    { href: "admin-logs.html", label: "操作日誌", perm: "CAN_VIEW_LOGS" },
    {
      href: "admin-settings.html",
      label: "系統設定",
      // 邏輯：系統管理 或 超級管理員 可見
      customCheck: () =>
        adminPermissions.includes("CAN_MANAGE_SYSTEM") ||
        adminPermissions.includes("CAN_MANAGE_USERS"),
      style: "background-color: #607d8b;", // 藍灰色按鈕
    },
  ];

  // 4. 判斷當前頁面 (用於 High light)
  const currentPath = window.location.pathname.split("/").pop();

  // 5. 生成選單 HTML
  let navButtonsHtml = "";

  menuItems.forEach((item) => {
    // A. 權限檢查
    let hasPermission = true;
    if (item.perm && !adminPermissions.includes(item.perm)) {
      hasPermission = false;
    }
    if (item.customCheck && !item.customCheck()) {
      hasPermission = false;
    }

    if (hasPermission) {
      // B. 判斷是否為當前頁面 (Active)
      // 簡單比對檔名，如果 href 包含 currentPath 則視為 active
      // 注意：處理 index 或空路徑的邊緣情況需視專案而定
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
  headerContainer.className = "admin-header"; // 確保套用 CSS 樣式

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
