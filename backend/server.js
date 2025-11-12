// 這是 backend/server.js (最終版，包含 quoteRoutes)

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
const quoteRoutes = require("./routes/quoteRoutes"); // <-- (1) 載入新路由

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
app.use("/api/admin", adminRoutes);
app.use("/api/quotes", quoteRoutes); // <-- (2) 啟用新路由

app.get("/", (req, res) => {
  res.json({ message: "小跑豬後端伺服器 (已包含估價單功能)!" });
});

app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行...`);
});
