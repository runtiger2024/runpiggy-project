// backend/routes/shipmentRoutes.js (V9 優化版 - 含預估運費 API)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js"); // 引入上傳工具

// 1. 匯入控制器
const {
  previewShipmentCost, // [New] 預估運費
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
} = require("../controllers/shipmentController");

// 2. 匯入保全 (Auth Middleware)
const { protect } = require("../middleware/authMiddleware.js");

// 3. --- 設定路由 ---

// [新增] 預估運費 (不建立訂單，僅計算) - 用於前端懸浮結算欄
router.route("/preview").post(protect, previewShipmentCost);

// 建立集運單 (支援上傳最多5張商品照片)
// 注意：前端 input name 必須為 "shipmentImages"
router
  .route("/create")
  .post(protect, upload.array("shipmentImages", 5), createShipment);

// 取得我的集運單列表
router.route("/my").get(protect, getMyShipments);

// 上傳付款憑證 (單張圖片)
router
  .route("/:id/payment")
  .put(protect, upload.single("paymentProof"), uploadPaymentProof);

// 單一集運單操作
router
  .route("/:id")
  .get(protect, getShipmentById) // 查看詳情
  .delete(protect, deleteMyShipment); // 取消/刪除 (僅限待付款)

module.exports = router;
