// backend/routes/shipmentRoutes.js (V8.1 完整版 - 支援商品證明上傳)

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

// 建立集運單 (支援上傳最多5張商品照片)
// 注意：前端 input name 必須為 "shipmentImages"
router
  .route("/create")
  .post(protect, upload.array("shipmentImages", 5), createShipment);

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
