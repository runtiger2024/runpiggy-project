// 這是 adminRoutes.js (最終完整版，支援「新增員工」和「退回集運單」)
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
  createStaffUser, // <-- (新)
  rejectShipment, // <-- (新)
} = require("../controllers/adminController");

const { protect, admin } = require("../middleware/authMiddleware.js");

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
router.route("/shipments/:id/reject").put(protect, admin, rejectShipment); // <-- (新) 退回集運單

// --- 會員/員工管理 ---
router.route("/users").get(protect, admin, getUsers);
router.route("/users/create").post(protect, admin, createStaffUser); // <-- (新) 新增員工
router.route("/users/:id/status").put(protect, admin, toggleUserStatus);
router
  .route("/users/:id/reset-password")
  .put(protect, admin, resetUserPassword);

module.exports = router;
