// 這是 backend/routes/adminRoutes.js (V4.2 權限系統版)
// (補上 /users/list 和 /users/:id/permissions 路由)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails,
  adminCreatePackage,
  updateShipmentStatus,
  getAllShipments,
  getUsers,
  getUsersList,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  getDashboardStats,
  getActivityLogs,
  impersonateUser,
  updateUserPermissions, // [*** 1. 匯入新函式 ***]
  getDailyReport, // [*** 1. 匯入新函式 ***]
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

// (V4)
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

// [*** V4.1 修正：補上 /users/list 路由 ***]
// (使用 CAN_MANAGE_PACKAGES 保護，因為它是「代客預報」功能的一部分)
router
  .route("/users/list")
  .get(protect, checkPermission("CAN_MANAGE_PACKAGES"), getUsersList);

router
  .route("/users/create")
  .post(protect, checkPermission("CAN_MANAGE_USERS"), createStaffUser);
router
  .route("/users/:id/status")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), toggleUserStatus);

// [*** V4.2 新增：更新權限路由 ***]
router
  .route("/users/:id/permissions")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), updateUserPermissions);

router
  .route("/users/:id/reset-password")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), resetUserPassword);
router
  .route("/users/:id/impersonate")
  .post(protect, checkPermission("CAN_IMPERSONATE_USERS"), impersonateUser);

// [*** 新增：儀表板的詳細報表路由 ***]
router
  .route("/reports")
  .get(protect, checkPermission("CAN_VIEW_DASHBOARD"), getDailyReport);

module.exports = router;
