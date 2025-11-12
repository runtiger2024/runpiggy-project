// 這是 authRoutes.js (路由)
const express = require("express");
const router = express.Router();

// 1. 匯入控制器
const {
  registerUser,
  loginUser,
  getMe,
  updateMe, // <-- 匯入新函式
} = require("../controllers/authController");

// 2. 匯入我們的「保全」中介軟體
const { protect } = require("../middleware/authMiddleware.js");

// 3. 建立路由規則

// "公開" 路由 (不需要 Token)
router.post("/register", registerUser);
router.post("/login", loginUser);

// "保護" 路由 (必須要有合法的 Token)
// GET /api/auth/me -> 取得資料
// PUT /api/auth/me -> 更新資料
// (這與 RUNPIGGY-V2 的 customerRoutes.js /profile 邏輯一致)
router.route("/me").get(protect, getMe).put(protect, updateMe); // <-- 新增

// 匯出這個 router
module.exports = router;
