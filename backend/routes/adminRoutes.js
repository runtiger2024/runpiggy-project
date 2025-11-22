// backend/routes/adminRoutes.js (V10 旗艦版 - 包含系統設定路由)

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

const {
  // 系統與報表
  getDashboardStats,
  getActivityLogs,
  getDailyReport,

  // [新增/修改] 系統全域設定
  getSystemSettings,
  updateSystemSetting,

  // 包裹
  getAllPackages,
  exportPackages,
  bulkUpdatePackageStatus,
  bulkDeletePackages,
  adminCreatePackage,
  adminDeletePackage,
  updatePackageStatus,
  updatePackageDetails,

  // 集運單
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,

  // 會員
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
router
  .route("/stats")
  .get(protect, checkPermission("CAN_VIEW_DASHBOARD"), getDashboardStats);
router
  .route("/logs")
  .get(protect, checkPermission("CAN_VIEW_LOGS"), getActivityLogs);
router
  .route("/reports")
  .get(protect, checkPermission("CAN_VIEW_DASHBOARD"), getDailyReport);

// --- 2. [優化] 系統全域設定 ---
// 取代原本的 /config/rates，改為更通用的 settings 接口
// 權限建議使用 CAN_MANAGE_SYSTEM (最高權限)
router
  .route("/settings")
  .get(protect, checkPermission("CAN_MANAGE_SYSTEM"), getSystemSettings);

router
  .route("/settings/:key")
  .put(protect, checkPermission("CAN_MANAGE_SYSTEM"), updateSystemSetting);

// (舊的費率路由保留做相容，或者您可以選擇移除，前端將改呼叫新的 settings 接口)
// 建議：若前端尚未完全更新，這行可暫時保留，指向新的 controller 方法
// router.route("/config/rates")... (已整合進上方 settings 邏輯)

// --- 3. 包裹管理 ---
// 匯出
router
  .route("/packages/export")
  .get(protect, checkPermission("CAN_MANAGE_PACKAGES"), exportPackages);

// 批量更新
router
  .route("/packages/bulk-status")
  .put(
    protect,
    checkPermission("CAN_MANAGE_PACKAGES"),
    bulkUpdatePackageStatus
  );

// 批量刪除
router
  .route("/packages/bulk-delete")
  .delete(protect, checkPermission("CAN_MANAGE_PACKAGES"), bulkDeletePackages);

// 查詢列表
router
  .route("/packages/all")
  .get(protect, checkPermission("CAN_MANAGE_PACKAGES"), getAllPackages);

// 單筆操作
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
router
  .route("/packages/:id")
  .delete(protect, checkPermission("CAN_MANAGE_PACKAGES"), adminDeletePackage);

// --- 4. 集運單管理 ---
// 匯出
router
  .route("/shipments/export")
  .get(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), exportShipments);

// 批量更新
router
  .route("/shipments/bulk-status")
  .put(
    protect,
    checkPermission("CAN_MANAGE_SHIPMENTS"),
    bulkUpdateShipmentStatus
  );

// 批量刪除
router
  .route("/shipments/bulk-delete")
  .delete(
    protect,
    checkPermission("CAN_MANAGE_SHIPMENTS"),
    bulkDeleteShipments
  );

// 查詢列表
router
  .route("/shipments/all")
  .get(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), getAllShipments);

// 單筆操作
router
  .route("/shipments/:id")
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), updateShipmentStatus)
  .delete(
    protect,
    checkPermission("CAN_MANAGE_SHIPMENTS"),
    adminDeleteShipment
  );
router
  .route("/shipments/:id/reject")
  .put(protect, checkPermission("CAN_MANAGE_SHIPMENTS"), rejectShipment);

// --- 5. 會員管理 ---
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
