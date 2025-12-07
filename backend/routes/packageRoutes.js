// backend/routes/packageRoutes.js
// V2025.Security - 完整功能版

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js"); // 載入 multer 設定

const {
  createPackageForecast,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
  bulkForecast, // [New] 批量預報
  claimPackage, // [New] 認領包裹
  resolveException, // [New] 異常處理
} = require("../controllers/packageController");

const { protect } = require("../middleware/authMiddleware.js");

// 1. 建立包裹預報 (單筆，支援圖片上傳)
router
  .route("/forecast/images")
  .post(protect, upload.array("images", 5), createPackageForecast);

// 2. [New] 批量預報 (接收 JSON Array)
router.route("/bulk-forecast").post(protect, bulkForecast);

// 3. [New] 認領包裹 (需上傳截圖憑證)
router.route("/claim").post(protect, upload.single("proof"), claimPackage);

// 4. 取得我的包裹列表
router.route("/my").get(protect, getMyPackages);

// 5. 單一包裹操作
router
  .route("/:id")
  // 修改包裹 (支援圖片上傳)
  .put(protect, upload.array("images", 5), updateMyPackage)
  // 刪除包裹
  .delete(protect, deleteMyPackage);

// 6. [New] 異常包裹處理 (客戶回覆處理方式)
router.route("/:id/exception").put(protect, resolveException);

module.exports = router;
