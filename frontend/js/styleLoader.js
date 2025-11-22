// frontend/js/styleLoader.js
// 負責集中管理 CSS 的載入，避免在每個 HTML 檔案中重複寫 <link>
// 也方便統一管理版本號 (Cache Busting)

(function () {
  // 1. 設定版本號 (修改這裡即可更新全站快取)
  const CSS_VERSION = "3.0";

  // 2. 判斷當前頁面是否為管理後台
  const path = window.location.pathname;
  // 判斷邏輯：只要檔名包含 "admin-"，就視為後台頁面
  const isAdminPage = path.includes("admin-");

  // 3. 定義要載入的 CSS 檔案清單
  const cssFiles = [
    "css/base.css", // 所有頁面共用
  ];

  if (isAdminPage) {
    cssFiles.push("css/admin.css"); // 管理端專用
  } else {
    cssFiles.push("css/client.css"); // 客戶端專用
  }

  // 4. 注入 <link> 標籤
  // 使用 document.write 可以確保 CSS 在頁面渲染前就載入，避免畫面閃爍 (FOUC)
  cssFiles.forEach((file) => {
    document.write(`<link rel="stylesheet" href="${file}?v=${CSS_VERSION}">`);
  });
})();
