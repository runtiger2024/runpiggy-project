// 這是 frontend/js/apiConfig.js (新檔案)

// 1. 定義您的正式後端網址
//    (我從您的 admin-register.js 檔案中找到了這個網址)
const PROD_URL = "https://runpiggy-api.onrender.com";

// 2. 定義您的本地開發網址
const DEV_URL = "http://localhost:3000";

// 3. 檢查目前網頁的網址
//    如果
//    (A) 網址是 "localhost" 或 "127.0.0.1" (本地開發)
//    (B) 網址是 "file://" (直接打開 HTML 檔案)
//    我們就使用 DEV_URL。
//    否則 (例如 https://runpiggy.onrender.com)，我們就使用 PROD_URL。
const isDev =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.protocol === "file:";

const API_BASE_URL = isDev ? DEV_URL : PROD_URL;

// (可選) 在主控台印出，方便偵錯
console.log(`目前環境: ${isDev ? "開發 (Local)" : "正式 (Prod)"}`);
console.log(`API 基礎網址: ${API_BASE_URL}`);
