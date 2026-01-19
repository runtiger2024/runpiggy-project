// backend/server.js

const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");

dotenv.config();

// 載入所有路由
const authRoutes = require("./routes/authRoutes");
const packageRoutes = require("./routes/packageRoutes");
const calculatorRoutes = require("./routes/calculatorRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const quoteRoutes = require("./routes/quoteRoutes");

// [新增] 新功能的路由
const recipientRoutes = require("./routes/recipientRoutes");
const walletRoutes = require("./routes/walletRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 靜態檔案 (圖片)
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// --- 註冊 API 路由 ---
app.use("/api/auth", authRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/calculator", calculatorRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/admin", adminRoutes); // 管理員專用
app.use("/api/quotes", quoteRoutes); // 估價單分享

// [新增] 註冊新功能路由
app.use("/api/recipients", recipientRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => {
  res.json({ message: "小跑豬後端伺服器 (System V13 - Full Feature Ready)!" });
});

// --- 優化新增：處理所有未命中的路由 (404 Fallback) ---
// 這能解決 Unexpected token '<' 的問題，因為它保證回傳 JSON 而非預設的 HTML 頁面
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `找不到路徑: ${req.originalUrl}，請檢查前端 API_BASE_URL 配置`,
  });
});

// --- 優化新增：全域錯誤處理器 (Error Handling Middleware) ---
// 確保當後端程式碼發生錯誤（崩潰）時，回傳 JSON 格式的錯誤訊息，避免瀏覽器收到 HTML
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "伺服器內部發生錯誤",
    error: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行...`);
});
