// backend/routes/shipmentRoutes.js (V8 完整版 - 支援取消訂單)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js"); // 引入上傳工具

// 1. 匯入控制器
const {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment, // [V8 新增]
} = require("../controllers/shipmentController");

// 2. 匯入保全
const { protect } = require("../middleware/authMiddleware.js");

// 3. --- 設定路由 ---

// 建立集運單
router.route("/create").post(protect, createShipment);

// 取得我的集運單
router.route("/my").get(protect, getMyShipments);

// 上傳付款憑證 (單張圖片)
router
  .route("/:id/payment")
  .put(protect, upload.single("paymentProof"), uploadPaymentProof);

// 取得單一集運單詳情
router.route("/:id").get(protect, getShipmentById);

// [V8 新增] 客戶自行取消訂單 (僅限待付款)
router.route("/:id").delete(protect, deleteMyShipment);

module.exports = router;
