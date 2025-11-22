// backend/routes/packageRoutes.js (V8 完整版 - 支援圖片更新與刪除)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js"); // 載入 multer 設定

const {
  createPackageForecast,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
} = require("../controllers/packageController");

const { protect } = require("../middleware/authMiddleware.js");

// 1. 建立包裹預報 (支援圖片上傳)
router
  .route("/forecast/images")
  .post(protect, upload.array("images", 5), createPackageForecast);

// 2. 取得我的包裹列表
router.route("/my").get(protect, getMyPackages);

// 3. 單一包裹操作 (修改與刪除)
router
  .route("/:id")
  // [V8 修改] 修改包裹現在支援圖片上傳 (multipart/form-data)
  .put(protect, upload.array("images", 5), updateMyPackage)
  // [V8 新增] 刪除包裹
  .delete(protect, deleteMyPackage);

module.exports = router;
