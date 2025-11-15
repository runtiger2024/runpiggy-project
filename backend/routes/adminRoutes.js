// 這是 backend/routes/adminRoutes.js (V3 權限系統版)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails,
  adminCreatePackage, // (V4 新增)
  updateShipmentStatus,
  getAllShipments,
  getUsers,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  getDashboardStats,
  getActivityLogs,
  impersonateUser,
} = require("../controllers/adminController");

// [*** V3 修正：匯入新的中介軟體 ***]
const { protect, checkPermission } = require("../middleware/authMiddleware.js");

// 儀表板
router
  .route("/stats")
  .get(protect, checkPermission("CAN_VIEW_DASHBOARD"), getDashboardStats);

// 日誌
router
  .route("/logs")
  .get(protect, checkPermission("CAN_VIEW_LOGS"), getActivityLogs);

// --- 包裹管理 ---
router
  .route("/packages/all")
  .get(protect, checkPermission("CAN_MANAGE_PACKAGES"), getAllPackages);

// (V4 新增)
router
  .route("/packages/create")
  .post(
    protect,
    checkPermission("CAN_MANAGE_PACKAGES"),
    upload.array("images", 5),
    adminCreatePackage
  );

router
  .route("/packages/:id/status")
  .put(protect, checkPermission("CAN_MANAGE_PACKAGES"), updatePackageStatus);
router
  .route("/packages/:id/details")
  .put(
    protect,
    checkPermission("CAN_MANAGE_PACKAGES"),
    upload.array("warehouseImages", 5),
    updatePackageDetails
  );

// --- 集運單管理 ---
router
  .route("/shipments/all")
  .get(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), getAllShipments);
router
  .route("/shipments/:id")
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), updateShipmentStatus);
router
  .route("/shipments/:id/reject")
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), rejectShipment);

// --- 會員/員工管理 ---
router
  .route("/users")
  .get(protect, checkPermission("CAN_MANAGE_USERS"), getUsers);
router
  .route("/users/create")
  .post(protect, checkPermission("CAN_MANAGE_USERS"), createStaffUser);
router
  .route("/users/:id/status")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), toggleUserStatus);
router
  .route("/users/:id/reset-password")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), resetUserPassword);
router
  .route("/users/:id/impersonate")
  .post(protect, checkPermission("CAN_IMPERSONATE_USERS"), impersonateUser);

module.exports = router;
