// frontend/js/admin-layout.js (V2025 - 自動化佈局渲染)

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

  // 2. 定義側邊欄選單
  // 結構: label, icon, href, requiredPermission (null = public for all staff)
  const menuItems = [
    {
      label: "儀表板",
      icon: "fas fa-tachometer-alt",
      href: "admin-dashboard.html",
      perm: "CAN_VIEW_DASHBOARD",
    },
    {
      label: "包裹管理",
      icon: "fas fa-box",
      href: "admin-parcels.html",
      perm: "CAN_MANAGE_PACKAGES",
    },
    {
      label: "集運單管理",
      icon: "fas fa-shipping-fast",
      href: "admin-shipments.html",
      perm: "CAN_MANAGE_SHIPMENTS",
    },
    {
      label: "會員管理",
      icon: "fas fa-users",
      href: "admin-members.html",
      perm: "CAN_MANAGE_USERS",
    },
    {
      label: "新增員工",
      icon: "fas fa-user-plus",
      href: "admin-register.html",
      perm: "CAN_MANAGE_USERS",
    },
    {
      label: "系統設定",
      icon: "fas fa-cogs",
      href: "admin-settings.html",
      perm: "CAN_MANAGE_SYSTEM", // 或 CAN_MANAGE_USERS
    },
    {
      label: "操作日誌",
      icon: "fas fa-history",
      href: "admin-logs.html",
      perm: "CAN_VIEW_LOGS",
    },
  ];

  // 3. 渲染主框架 (Sidebar + Topbar)
  // 我們將直接把 body 的內容包進 wrapper
  const originalContent = document.body.innerHTML;
  document.body.innerHTML = ""; // 清空 body，準備重構

  const wrapper = document.createElement("div");
  wrapper.id = "wrapper";

  // 3.1 建立 Sidebar
  let navItemsHtml = "";
  const currentPath = window.location.pathname.split("/").pop();

  menuItems.forEach((item) => {
    // 權限判斷
    let hasAccess = true;
    if (item.perm) {
      // 若需要特定權限，且使用者沒有，也沒有管理員全權
      if (
        !adminPermissions.includes(item.perm) &&
        !adminPermissions.includes("CAN_MANAGE_USERS")
      ) {
        // 特例：設定頁面若無 CAN_MANAGE_SYSTEM 但有 CAN_MANAGE_USERS 則可進
        if (
          item.href === "admin-settings.html" &&
          adminPermissions.includes("CAN_MANAGE_USERS")
        ) {
          hasAccess = true;
        } else {
          hasAccess = false;
        }
      }
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
  // 這裡需要過濾掉原本可能存在的 admin-header-container DIV
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalContent, "text/html");
  const oldHeader = doc.getElementById("admin-header-container");
  if (oldHeader) oldHeader.remove(); // 移除舊版 header 佔位

  // 移除舊版 container wrapper 如果有的話，避免雙重 container
  // 假設舊版內容都包在 <div class="container"> 裡
  const oldContainer = doc.querySelector(".container");
  if (oldContainer) {
    mainContainer.innerHTML = oldContainer.innerHTML;
  } else {
    mainContainer.innerHTML = doc.body.innerHTML;
  }

  // 4. 綁定事件
  // 漢堡選單
  const toggleBtn = document.getElementById("sidebarToggleTop");
  const sidebar = document.querySelector(".sidebar");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("toggled");
      // 手機版邏輯：toggled 時 width 設為 250px (CSS 已定義)
      if (window.innerWidth <= 768) {
        if (sidebar.classList.contains("toggled")) {
          sidebar.style.width = "250px";
        } else {
          sidebar.style.width = "0";
        }
      }
    });
  }

  // 登出
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
