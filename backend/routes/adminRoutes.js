// backend/routes/adminRoutes.js
// V14.2 - Added Email Test Route

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

// 引入控制器
const settingsController = require("../controllers/admin/settingsController");
const packageController = require("../controllers/admin/packageController");
const shipmentController = require("../controllers/admin/shipmentController");
const userController = require("../controllers/admin/userController");
const reportController = require("../controllers/admin/reportController");
const walletController = require("../controllers/admin/walletController");

const { protect, checkPermission } = require("../middleware/authMiddleware.js");

// ==========================================
// 1. 儀表板與報表
// ==========================================
router
  .route("/stats")
  .get(
    protect,
    checkPermission("DASHBOARD_VIEW"),
    reportController.getDashboardStats
  );

router
  .route("/logs")
  .get(protect, checkPermission("LOGS_VIEW"), reportController.getActivityLogs);

router
  .route("/reports")
  .get(
    protect,
    checkPermission("DASHBOARD_VIEW"),
    reportController.getDailyReport
  );

// ==========================================
// 2. 系統全域設定
// ==========================================
router
  .route("/settings")
  .get(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.getSystemSettings
  );

router
  .route("/settings/:key")
  .put(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.updateSystemSetting
  );

// [New] 測試 Email
router
  .route("/settings/test/email")
  .post(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.sendTestEmail
  );

// ==========================================
// 3. 包裹管理
// ==========================================
router
  .route("/packages/export")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.exportPackages
  );

router
  .route("/packages/bulk-status")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    packageController.bulkUpdatePackageStatus
  );

router
  .route("/packages/bulk-delete")
  .delete(
    protect,
    checkPermission("PACKAGE_DELETE"),
    packageController.bulkDeletePackages
  );

router
  .route("/packages/all")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.getAllPackages
  );

router
  .route("/packages/create")
  .post(
    protect,
    checkPermission("PACKAGE_EDIT"),
    upload.array("images", 5),
    packageController.adminCreatePackage
  );

router
  .route("/packages/:id/status")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    packageController.updatePackageStatus
  );

router
  .route("/packages/:id/details")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    upload.array("warehouseImages", 5),
    packageController.updatePackageDetails
  );

router
  .route("/packages/:id")
  .delete(
    protect,
    checkPermission("PACKAGE_DELETE"),
    packageController.adminDeletePackage
  );

// ==========================================
// 4. 集運單管理
// ==========================================
router
  .route("/shipments/export")
  .get(
    protect,
    checkPermission("SHIPMENT_VIEW"),
    shipmentController.exportShipments
  );

router
  .route("/shipments/bulk-status")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.bulkUpdateShipmentStatus
  );

router
  .route("/shipments/bulk-delete")
  .delete(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.bulkDeleteShipments
  );

router
  .route("/shipments/all")
  .get(
    protect,
    checkPermission("SHIPMENT_VIEW"),
    shipmentController.getAllShipments
  );

router
  .route("/shipments/:id/invoice/issue")
  .post(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.manualIssueInvoice
  );

router
  .route("/shipments/:id/invoice/void")
  .post(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.manualVoidInvoice
  );

router
  .route("/shipments/:id")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.updateShipmentStatus
  )
  .delete(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.adminDeleteShipment
  );

router
  .route("/shipments/:id/reject")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.rejectShipment
  );

// ==========================================
// 5. 會員管理
// ==========================================
router
  .route("/users")
  .get(protect, checkPermission("USER_VIEW"), userController.getUsers);

router
  .route("/users/list")
  .get(protect, checkPermission("PACKAGE_VIEW"), userController.getUsersList);

router
  .route("/users/create")
  .post(
    protect,
    checkPermission("USER_MANAGE"),
    userController.createStaffUser
  );

router
  .route("/users/:id/status")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.toggleUserStatus
  );

router
  .route("/users/:id/profile")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.adminUpdateUserProfile
  );

router
  .route("/users/:id/permissions")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.updateUserPermissions
  );

router
  .route("/users/:id/reset-password")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.resetUserPassword
  );

router
  .route("/users/:id")
  .delete(protect, checkPermission("USER_MANAGE"), userController.deleteUser);

router
  .route("/users/:id/impersonate")
  .post(
    protect,
    checkPermission("USER_IMPERSONATE"),
    userController.impersonateUser
  );

// ==========================================
// 6. 財務管理
// ==========================================
router
  .route("/finance/transactions")
  .get(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.getTransactions
  );

router
  .route("/finance/transactions/:id/review")
  .put(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.reviewTransaction
  );

router
  .route("/finance/transactions/:id/invoice")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.manualIssueDepositInvoice
  );

router
  .route("/finance/adjust")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.manualAdjust
  );

module.exports = router;
