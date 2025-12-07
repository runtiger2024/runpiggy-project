// backend/routes/shipmentRoutes.js
// V13.0 - 支援錢包支付與完整訂單管理

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

// 匯入控制器
const {
  previewShipmentCost,
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
} = require("../controllers/shipmentController");

const { protect } = require("../middleware/authMiddleware.js");

// --- 設定路由 ---

// 1. 預估運費 (試算)
router.route("/preview").post(protect, previewShipmentCost);

// 2. 建立集運單 (支援多張商品截圖上傳)
// 注意: Controller 內部已支援 paymentMethod="WALLET" 的邏輯
// 若使用錢包支付，圖片為選填；若轉帳，則為必填(或連結)。
router
  .route("/create")
  .post(protect, upload.array("shipmentImages", 20), createShipment);

// 3. 取得我的集運單列表
router.route("/my").get(protect, getMyShipments);

// 4. 上傳付款憑證 (針對轉帳付款)
router
  .route("/:id/payment")
  .put(protect, upload.single("paymentProof"), uploadPaymentProof);

// 5. 單一集運單操作 (查詢詳情 / 取消訂單)
// 必須放在最後，以免 :id 攔截其他路徑
router
  .route("/:id")
  .get(protect, getShipmentById)
  .delete(protect, deleteMyShipment);

module.exports = router;
