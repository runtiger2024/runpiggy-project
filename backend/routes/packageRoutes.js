// 這是 packageRoutes.js (支援 JSON 和 圖片 兩種上傳)
const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js"); // 載入 upload 設定

const {
  createPackageForecast,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
} = require("../controllers/packageController");

const { protect } = require("../middleware/authMiddleware.js");

// --- (新) 建立兩條 POST 路由 (參考 RUNPIGGY-V2) ---

// (1) 處理 "純 JSON" (沒有圖片) 的請求
// (我們的前端會先用這個)
router.route("/forecast/json").post(protect, createPackageForecast);

// (2) 處理 "FormData" (有圖片) 的請求
// (我們未來會用到這個)
router
  .route("/forecast/images")
  .post(protect, upload.array("images", 5), createPackageForecast);

// --- 結束 ---

router.route("/my").get(protect, getMyPackages);

router
  .route("/:id")
  .put(protect, updateMyPackage)
  .delete(protect, deleteMyPackage);

module.exports = router;
