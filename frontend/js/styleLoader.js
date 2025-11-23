// frontend/js/styleLoader.js
(function () {
  const CSS_VERSION = "3.1"; // 更新版本號以清除快取

  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html"; // 取得檔名

  // 1. 基礎 CSS (所有頁面共用)
  const cssFiles = [
    "css/base.css", // 基礎重置
  ];

  // 2. 判斷是前台還是後台
  if (page.includes("admin-")) {
    // --- 管理後台 ---
    cssFiles.push("css/admin.css");
  } else {
    // --- 客戶端前台 ---
    cssFiles.push("css/client.css"); // 載入共用元件 (Header/Footer/Buttons...)

    // 3. 根據頁面載入特定 CSS
    if (page === "index.html" || page === "quote.html" || page === "") {
      // 首頁與估價單頁面：載入計算機與費率樣式
      cssFiles.push("css/client-index.css");
    } else if (page === "dashboard.html" || page.includes("profile")) {
      // 會員中心：載入儀表板與表格樣式
      cssFiles.push("css/client-dashboard.css");
    }
    // login.html 或其他頁面只會載入 base + client (夠用了)
  }

  // 4. 注入 HTML
  cssFiles.forEach((file) => {
    document.write(`<link rel="stylesheet" href="${file}?v=${CSS_VERSION}">`);
  });
})();
