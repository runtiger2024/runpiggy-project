// 這是 frontend/js/apiConfig.js (優化版)

// 1. 定義您的正式後端網址
//    (我從您的 admin-register.js 檔案中找到了這個網址)
const PROD_URL = "https://runpiggy-api.onrender.com";

// 2. 定義您的本地開發網址
const DEV_URL = "http://localhost:3000";

// 3. 檢查目前網頁的網址
//    如果
//    (A) 網址是 "localhost" 或 "127.0.0.1" (本地開發)
//    (B) 網址是 "file://" (直接打開 HTML 檔案)
//    [新增] (C) 網址是私有 IP (如 192.168.x.x)，這通常是手機連線電腦進行開發測試。
//    我們就使用 DEV_URL。
//    否則 (例如 https://runpiggy.onrender.com)，我們就使用 PROD_URL。
const isDev =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.") || // 新增：支援區域網路偵錯
  window.location.protocol === "file:";

/**
 * [新增優化功能] 自動修正網址格式
 * 確保網址結尾沒有斜線 "/"。
 * 這是為了防止在 auth.js 拼接時出現 "//api/auth/login" (雙斜線)。
 * 某些伺服器遇到雙斜線會判定為無效路徑並回傳 404 HTML，導致 JSON 解析失敗。
 */
const formatUrl = (url) => (url.endsWith("/") ? url.slice(0, -1) : url);

const API_BASE_URL = isDev ? formatUrl(DEV_URL) : formatUrl(PROD_URL);

/**
 * [新增新功能] 全域環境狀態物件
 * 讓其他腳本（如 dashboard.js）能快速判斷環境而無需重新計算
 */
window.APP_ENV = {
  isDev: isDev,
  baseUrl: API_BASE_URL,
  isLocalFile: window.location.protocol === "file:",
};

// (可選) 在主控台印出，方便偵錯
// 使用樣式讓偵錯資訊在瀏覽器主控台中更顯眼
console.log(
  `%c目前環境: ${isDev ? "開發 (Local)" : "正式 (Prod)"}`,
  "color: white; background: #2196F3; padding: 2px 5px; border-radius: 3px;",
);
console.log(`API 基礎網址: ${API_BASE_URL}`);
