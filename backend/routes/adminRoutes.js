// backend/routes/adminRoutes.js (V8 完整版 - 包含費率管理與完整 CRUD 路由)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  getAllPackages,
  adminCreatePackage,
  adminDeletePackage, // [新增] 刪除包裹
  updatePackageStatus,
  updatePackageDetails,
  getAllShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment, // [新增] 刪除集運單
  getUsers,
  getUsersList,
  createStaffUser,
  toggleUserStatus,
  resetUserPassword,
  adminUpdateUserProfile, // [新增] 編輯會員個資
  deleteUser,
  impersonateUser,
  updateUserPermissions,
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
  getSystemRates, // [新增] 取得費率
  updateSystemRates, // [新增] 更新費率
} = require("../controllers/adminController");

const { protect, checkPermission } = require("../middleware/authMiddleware.js");

// --- 1. 儀表板統計與日誌 ---
router
  .route("/stats")
  .get(protect, checkPermission("CAN_VIEW_DASHBOARD"), getDashboardStats);

router
  .route("/logs")
  .get(protect, checkPermission("CAN_VIEW_LOGS"), getActivityLogs);

router
  .route("/reports")
  .get(protect, checkPermission("CAN_VIEW_DASHBOARD"), getDailyReport);

// --- 2. 系統設定 (費率管理) [V8 新增] ---
router
  .route("/config/rates")
  .get(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), getSystemRates) // 借用管理集運單的權限
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), updateSystemRates);

// --- 3. 包裹管理 ---
router
  .route("/packages/all")
  .get(protect, checkPermission("CAN_MANAGE_PACKAGES"), getAllPackages);

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

// [新增] 刪除包裹
router
  .route("/packages/:id")
  .delete(protect, checkPermission("CAN_MANAGE_PACKAGES"), adminDeletePackage);

// --- 4. 集運單管理 ---
router
  .route("/shipments/all")
  .get(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), getAllShipments);

router
  .route("/shipments/:id")
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), updateShipmentStatus);

router
  .route("/shipments/:id/reject")
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), rejectShipment);

// [新增] 刪除集運單
router
  .route("/shipments/:id")
  .delete(
    protect,
    checkPermission("CAN_MANAGE_SHIPMENTS"),
    adminDeleteShipment
  );

// --- 5. 會員/員工管理 ---
router
  .route("/users")
  .get(protect, checkPermission("CAN_MANAGE_USERS"), getUsers);

router
  .route("/users/list")
  .get(protect, checkPermission("CAN_MANAGE_PACKAGES"), getUsersList);

router
  .route("/users/create")
  .post(protect, checkPermission("CAN_MANAGE_USERS"), createStaffUser);

router
  .route("/users/:id/status")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), toggleUserStatus);

// [新增] 管理員更新會員個資
router
  .route("/users/:id/profile")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), adminUpdateUserProfile);

router
  .route("/users/:id/permissions")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), updateUserPermissions);

router
  .route("/users/:id/reset-password")
  .put(protect, checkPermission("CAN_MANAGE_USERS"), resetUserPassword);

router
  .route("/users/:id")
  .delete(protect, checkPermission("CAN_MANAGE_USERS"), deleteUser);

router
  .route("/users/:id/impersonate")
  .post(protect, checkPermission("CAN_IMPERSONATE_USERS"), impersonateUser);

module.exports = router;
