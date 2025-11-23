// backend/routes/authRoutes.js (V10 完整版 - 含修改密碼路由)

const express = require("express");
const router = express.Router();

// 1. 匯入控制器
const {
  registerUser,
  loginUser,
  getMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword, // [New] 引入修改密碼控制器
} = require("../controllers/authController");

// 2. 匯入保全中介軟體
const { protect } = require("../middleware/authMiddleware.js");

// 3. --- 設定路由 ---

// 註冊與登入 (公開)
router.post("/register", registerUser);
router.post("/login", loginUser);

// 忘記密碼流程 (公開)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// 會員個人資料 (受保護)
// GET: 取得資料, PUT: 更新資料
router.route("/me").get(protect, getMe).put(protect, updateMe);

// 修改密碼 (受保護)
router.route("/password").put(protect, changePassword);

module.exports = router;
