// backend/routes/walletRoutes.js

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload");
const {
  getMyWallet,
  requestDeposit,
} = require("../controllers/walletController"); // 確保你有建立這個 Controller

const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// 取得錢包資訊 (餘額 & 交易紀錄)
router.get("/my", getMyWallet);

// 申請儲值 (需上傳憑證)
router.post("/deposit", upload.single("proof"), requestDeposit);

module.exports = router;
