// 這是 backend/routes/adminRoutes.js (V3 修正版)
// (新增 /logs 路由 和 /users/:id/impersonate 路由)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails,
  updateShipmentStatus,
  getAllShipments,
  getUsers,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  getDashboardStats,
  getActivityLogs,
  impersonateUser, // [*** 1. 匯入新函式 ***]
} = require("../controllers/adminController");

const { protect, admin } = require("../middleware/authMiddleware.js");

// 儀表板
router.route("/stats").get(protect, admin, getDashboardStats);

// 日誌
router.route("/logs").get(protect, admin, getActivityLogs);

// --- 包裹管理 ---
router.route("/packages/all").get(protect, admin, getAllPackages);
router.route("/packages/:id/status").put(protect, admin, updatePackageStatus);
router
  .route("/packages/:id/details")
  .put(
    protect,
    admin,
    upload.array("warehouseImages", 5),
    updatePackageDetails
  );

// --- 集運單管理 ---
router.route("/shipments/all").get(protect, admin, getAllShipments);
router.route("/shipments/:id").put(protect, admin, updateShipmentStatus);
router.route("/shipments/:id/reject").put(protect, admin, rejectShipment);

// --- 會員/員工管理 ---
router.route("/users").get(protect, admin, getUsers);
router.route("/users/create").post(protect, admin, createStaffUser);
router.route("/users/:id/status").put(protect, admin, toggleUserStatus);
router
  .route("/users/:id/reset-password")
  .put(protect, admin, resetUserPassword);

// [*** 2. 新增模擬登入路由 ***]
router.route("/users/:id/impersonate").post(protect, admin, impersonateUser);

module.exports = router;
