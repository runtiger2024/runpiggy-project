// backend/routes/adminRoutes.js (V12.0 - 統一匯入優化版)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  // --- 儀表板 & 報表 ---
  getDashboardStats,
  getActivityLogs,
  getDailyReport,

  // --- 系統設定 ---
  getSystemSettings,
  updateSystemSetting,

  // --- 包裹管理 ---
  getAllPackages,
  exportPackages,
  bulkUpdatePackageStatus,
  bulkDeletePackages,
  adminCreatePackage,
  adminDeletePackage,
  updatePackageStatus,
  updatePackageDetails,

  // --- 集運單管理 ---
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,

  // [優化] 發票相關功能 (統一從 adminController 匯入)
  manualIssueInvoice,
  manualVoidInvoice,

  // --- 會員管理 ---
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

// ==========================================
// 1. 儀表板與報表 (Dashboard & Reports)
// ==========================================
router
  .route("/stats")
  .get(protect, checkPermission("DASHBOARD_VIEW"), getDashboardStats);

router
  .route("/logs")
  .get(protect, checkPermission("LOGS_VIEW"), getActivityLogs);

router
  .route("/reports")
  .get(protect, checkPermission("DASHBOARD_VIEW"), getDailyReport);

// ==========================================
// 2. 系統全域設定 (System Settings)
// ==========================================
router
  .route("/settings")
  .get(protect, checkPermission("SYSTEM_CONFIG"), getSystemSettings);

router
  .route("/settings/:key")
  .put(protect, checkPermission("SYSTEM_CONFIG"), updateSystemSetting);

// ==========================================
// 3. 包裹管理 (Packages)
// ==========================================
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

router
  .route("/packages/create")
  .post(
    protect,
    checkPermission("PACKAGE_EDIT"),
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

// ==========================================
// 4. 集運單管理 (Shipments)
// ==========================================
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

// 發票管理路由
router
  .route("/shipments/:id/invoice/issue")
  .post(protect, checkPermission("SHIPMENT_PROCESS"), manualIssueInvoice);

router
  .route("/shipments/:id/invoice/void")
  .post(protect, checkPermission("SHIPMENT_PROCESS"), manualVoidInvoice);

// 單一訂單操作
router
  .route("/shipments/:id")
  .put(protect, checkPermission("SHIPMENT_PROCESS"), updateShipmentStatus)
  .delete(protect, checkPermission("SHIPMENT_PROCESS"), adminDeleteShipment);

router
  .route("/shipments/:id/reject")
  .put(protect, checkPermission("SHIPMENT_PROCESS"), rejectShipment);

// ==========================================
// 5. 會員管理 (Users)
// ==========================================
router.route("/users").get(protect, checkPermission("USER_VIEW"), getUsers);

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

router
  .route("/users/:id/impersonate")
  .post(protect, checkPermission("USER_IMPERSONATE"), impersonateUser);

module.exports = router;
