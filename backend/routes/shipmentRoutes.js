// 這是 shipmentRoutes.js
const express = require("express");
const router = express.Router();

// 1. 匯入控制器
const {
  createShipment,
  getMyShipments,
  getShipmentById,
} = require("../controllers/shipmentController");

// 2. 匯入保全
const { protect } = require("../middleware/authMiddleware.js");

// 3. --- 設定路由 (全部都需要登入) ---

// POST /api/shipments/create
router.route("/create").post(protect, createShipment);

// GET /api/shipments/my
router.route("/my").get(protect, getMyShipments);

// GET /api/shipments/:id
router.route("/:id").get(protect, getShipmentById);

module.exports = router;
