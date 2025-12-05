// backend/routes/shipmentRoutes.js
// V12.1 - 移除管理員專用的發票路由 (已移至 adminRoutes)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

// 1. 匯入控制器
const {
  previewShipmentCost,
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
  // manualIssueInvoice, // [Moved] 移至 adminRoutes 以確保權限與路徑正確
  // manualVoidInvoice,  // [Moved]
} = require("../controllers/shipmentController");

const { protect } = require("../middleware/authMiddleware.js");

// 2. --- 設定路由 ---

// 預估運費
router.route("/preview").post(protect, previewShipmentCost);

// 建立集運單
router
  .route("/create")
  .post(protect, upload.array("shipmentImages", 20), createShipment);

// 取得我的集運單
router.route("/my").get(protect, getMyShipments);

// 上傳付款憑證
router
  .route("/:id/payment")
  .put(protect, upload.single("paymentProof"), uploadPaymentProof);

// 單一集運單操作 (必須放在最後，以免 :id 攔截其他路徑)
router
  .route("/:id")
  .get(protect, getShipmentById)
  .delete(protect, deleteMyShipment);

module.exports = router;
