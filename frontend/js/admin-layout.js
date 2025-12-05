// frontend/js/admin-layout.js (V2025 - Mobile Optimized)

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name") || "Admin";
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );

  // 1. 安全檢查
  const isLoginPage = window.location.pathname.includes("login.html");
  if (!adminToken && !isLoginPage) {
    window.location.href = "admin-login.html";
    return;
  }
  if (isLoginPage) return; // 登入頁不渲染佈局

  // 2. 定義側邊欄選單 (使用新版細緻權限)
  const menuItems = [
    {
      label: "儀表板",
      icon: "fas fa-tachometer-alt",
      href: "admin-dashboard.html",
      perm: "DASHBOARD_VIEW",
    },
    {
      label: "包裹管理",
      icon: "fas fa-box",
      href: "admin-parcels.html",
      perm: "PACKAGE_VIEW",
    },
    {
      label: "集運單管理",
      icon: "fas fa-shipping-fast",
      href: "admin-shipments.html",
      perm: "SHIPMENT_VIEW",
    },
    {
      label: "會員管理",
      icon: "fas fa-users",
      href: "admin-members.html",
      perm: "USER_VIEW",
    },
    {
      label: "新增員工",
      icon: "fas fa-user-plus",
      href: "admin-register.html",
      perm: "USER_MANAGE",
    },
    {
      label: "系統設定",
      icon: "fas fa-cogs",
      href: "admin-settings.html",
      perm: "SYSTEM_CONFIG",
    },
    {
      label: "操作日誌",
      icon: "fas fa-history",
      href: "admin-logs.html",
      perm: "LOGS_VIEW",
    },
  ];

  // 3. 渲染主框架 (Sidebar + Topbar)
  const originalContent = document.body.innerHTML;
  document.body.innerHTML = ""; // 清空 body，準備重構

  const wrapper = document.createElement("div");
  wrapper.id = "wrapper";

  // [Mobile Fix] 插入遮罩層 (用於手機版點擊關閉選單)
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  // 3.1 建立 Sidebar
  let navItemsHtml = "";
  const currentPath = window.location.pathname.split("/").pop();

  menuItems.forEach((item) => {
    // 權限判斷：擁有指定權限 OR 擁有舊版超級管理員權限 (相容性)
    let hasAccess = false;
    if (item.perm) {
      if (
        adminPermissions.includes(item.perm) ||
        adminPermissions.includes("CAN_MANAGE_USERS") || // 舊版超級權限
        adminPermissions.includes("CAN_MANAGE_SYSTEM") // 舊版超級權限
      ) {
        hasAccess = true;
      }
    } else {
      hasAccess = true; // 無指定權限則公開
    }

    if (hasAccess) {
      const isActive =
        currentPath === item.href ||
        (currentPath === "" && item.href === "admin-dashboard.html")
          ? "active"
          : "";
      navItemsHtml += `
        <li class="nav-item">
            <a class="nav-link ${isActive}" href="${item.href}">
                <i class="${item.icon}"></i>
                <span>${item.label}</span>
            </a>
        </li>
      `;
    }
  });

  const sidebarHtml = `
    <ul class="sidebar" id="accordionSidebar">
        <a class="sidebar-brand" href="admin-dashboard.html">
            <i class="fas fa-piggy-bank"></i>
            <div class="sidebar-brand-text">小跑豬後台</div>
        </a>
        <div class="sidebar-nav">
            ${navItemsHtml}
        </div>
    </ul>
  `;

  // 3.2 建立 Content Wrapper & Topbar
  const contentHtml = `
    <div id="content-wrapper">
        <nav class="topbar">
            <button id="sidebarToggleTop" class="toggle-sidebar-btn">
                <i class="fa fa-bars"></i>
            </button>
            <div class="topbar-right">
                <div class="user-info">
                    <span class="user-name">${adminName}</span>
                    <div class="user-avatar">${adminName
                      .charAt(0)
                      .toUpperCase()}</div>
                </div>
                <button id="layoutLogoutBtn" class="btn-logout-icon" title="登出">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        </nav>
        <div class="container-fluid" id="main-content-container">
            </div>
    </div>
  `;

  wrapper.innerHTML = sidebarHtml + contentHtml;
  document.body.appendChild(wrapper);

  // 3.3 注入原本內容
  const mainContainer = document.getElementById("main-content-container");
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalContent, "text/html");

  // 移除舊版 header 佔位
  const oldHeader = doc.getElementById("admin-header-container");
  if (oldHeader) oldHeader.remove();

  const oldContainer = doc.querySelector(".container");
  if (oldContainer) {
    mainContainer.innerHTML = oldContainer.innerHTML;
  } else {
    mainContainer.innerHTML = doc.body.innerHTML;
  }

  // 4. 綁定事件
  const toggleBtn = document.getElementById("sidebarToggleTop");
  const sidebar = document.querySelector(".sidebar");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // 防止事件冒泡
      sidebar.classList.toggle("toggled");

      // [Mobile Fix] 手機版同步切換遮罩
      if (window.innerWidth <= 768) {
        overlay.classList.toggle("show");
      }
    });

    // [Mobile Fix] 點擊遮罩關閉側邊欄
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("toggled");
      overlay.classList.remove("show");
    });
  }

  const logoutBtn = document.getElementById("layoutLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("確定要登出系統嗎？")) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_name");
        localStorage.removeItem("admin_permissions");
        window.location.href = "admin-login.html";
      }
    });
  }
});
