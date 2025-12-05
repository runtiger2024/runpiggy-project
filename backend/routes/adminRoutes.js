// backend/routes/adminRoutes.js (V11.2 - 權限名稱全面對齊版)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
  getSystemSettings,
  updateSystemSetting,
  getAllPackages,
  exportPackages,
  bulkUpdatePackageStatus,
  bulkDeletePackages,
  adminCreatePackage,
  adminDeletePackage,
  updatePackageStatus,
  updatePackageDetails,
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,
  getUsers,
  getUsersList,
  createStaffUser,
  toggleUserStatus,
  adminUpdateUserProfile,
  resetUserPassword,
  deleteUser,
  impersonateUser,
  updateUserPermissions,
} = require("../controllers/adminController");

const { protect, checkPermission } = require("../middleware/authMiddleware.js");

// --- 1. 儀表板與報表 ---
// 對應前端: DASHBOARD_VIEW, LOGS_VIEW
router
  .route("/stats")
  .get(protect, checkPermission("DASHBOARD_VIEW"), getDashboardStats);
router
  .route("/logs")
  .get(protect, checkPermission("LOGS_VIEW"), getActivityLogs);
router
  .route("/reports")
  .get(protect, checkPermission("DASHBOARD_VIEW"), getDailyReport);

// --- 2. 系統全域設定 ---
// 對應前端: SYSTEM_CONFIG
router
  .route("/settings")
  .get(protect, checkPermission("SYSTEM_CONFIG"), getSystemSettings);

router
  .route("/settings/:key")
  .put(protect, checkPermission("SYSTEM_CONFIG"), updateSystemSetting);

// --- 3. 包裹管理 ---
// 對應前端: PACKAGE_VIEW, PACKAGE_EDIT, PACKAGE_DELETE
router
  .route("/packages/export")
  .get(protect, checkPermission("PACKAGE_VIEW"), exportPackages);

router
  .route("/packages/bulk-status")
  .put(protect, checkPermission("PACKAGE_EDIT"), bulkUpdatePackageStatus);

router
  .route("/packages/bulk-delete")
  .delete(protect, checkPermission("PACKAGE_DELETE"), bulkDeletePackages);

router
  .route("/packages/all")
  .get(protect, checkPermission("PACKAGE_VIEW"), getAllPackages);

router.route("/packages/create").post(
  protect,
  checkPermission("PACKAGE_EDIT"), // 建立包裹視為編輯權限
  upload.array("images", 5),
  adminCreatePackage
);

router
  .route("/packages/:id/status")
  .put(protect, checkPermission("PACKAGE_EDIT"), updatePackageStatus);

router
  .route("/packages/:id/details")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    upload.array("warehouseImages", 5),
    updatePackageDetails
  );

router
  .route("/packages/:id")
  .delete(protect, checkPermission("PACKAGE_DELETE"), adminDeletePackage);

// --- 4. 集運單管理 ---
// 對應前端: SHIPMENT_VIEW, SHIPMENT_PROCESS
router
  .route("/shipments/export")
  .get(protect, checkPermission("SHIPMENT_VIEW"), exportShipments);

router
  .route("/shipments/bulk-status")
  .put(protect, checkPermission("SHIPMENT_PROCESS"), bulkUpdateShipmentStatus);

router
  .route("/shipments/bulk-delete")
  .delete(protect, checkPermission("SHIPMENT_PROCESS"), bulkDeleteShipments);

router
  .route("/shipments/all")
  .get(protect, checkPermission("SHIPMENT_VIEW"), getAllShipments);

router
  .route("/shipments/:id")
  .put(protect, checkPermission("SHIPMENT_PROCESS"), updateShipmentStatus)
  .delete(protect, checkPermission("SHIPMENT_PROCESS"), adminDeleteShipment);

router
  .route("/shipments/:id/reject")
  .put(protect, checkPermission("SHIPMENT_PROCESS"), rejectShipment);

// --- 5. 會員管理 ---
// 對應前端: USER_VIEW, USER_MANAGE, USER_IMPERSONATE
router.route("/users").get(protect, checkPermission("USER_VIEW"), getUsers);

// [注意] 查詢會員列表功能，在建立包裹時也會用到，所以放寬為 PACKAGE_VIEW 即可
router
  .route("/users/list")
  .get(protect, checkPermission("PACKAGE_VIEW"), getUsersList);

router
  .route("/users/create")
  .post(protect, checkPermission("USER_MANAGE"), createStaffUser);

router
  .route("/users/:id/status")
  .put(protect, checkPermission("USER_MANAGE"), toggleUserStatus);

router
  .route("/users/:id/profile")
  .put(protect, checkPermission("USER_MANAGE"), adminUpdateUserProfile);

router
  .route("/users/:id/permissions")
  .put(protect, checkPermission("USER_MANAGE"), updateUserPermissions);

router
  .route("/users/:id/reset-password")
  .put(protect, checkPermission("USER_MANAGE"), resetUserPassword);

router
  .route("/users/:id")
  .delete(protect, checkPermission("USER_MANAGE"), deleteUser);

// [關鍵修正] 使用 USER_IMPERSONATE，解決權限不符問題
router
  .route("/users/:id/impersonate")
  .post(protect, checkPermission("USER_IMPERSONATE"), impersonateUser);

module.exports = router;
