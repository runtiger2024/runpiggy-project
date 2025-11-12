// 這是 backend/middleware/authMiddleware.js

const jwt = require("jsonwebtoken");
const prisma = require("../config/db.js");

// 1. "保護" 中介軟體 (檢查是否登入)
const protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // *** 關鍵更新 ***
      // 我們現在也把 'role' 欄位一起撈出來
      req.user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true, // <-- 把 'role' 撈出來
          createdAt: true,
        },
      });

      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "未授權：找不到此使用者" });
      }
      next();
    } catch (error) {
      console.error("Token 驗證失敗:", error.message);
      return res
        .status(401)
        .json({ success: false, message: "未授權：Token 驗證失敗" });
    }
  }
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "未授權：沒有 Token" });
  }
};

// 2. "管理員" 中介軟體 (檢查是否有 'ADMIN' 權限)
//    (這與 RUNPIGGY-V2 的 operatorAuthMiddleware.js 邏輯一致)
const admin = (req, res, next) => {
  //
  //
  //
  // `protect` 必須先執行，所以我們才能從 `req.user` 讀到資料
  if (req.user && (req.user.role === "ADMIN" || req.user.role === "OPERATOR")) {
    next(); // 通過！
  } else {
    return res
      .status(403)
      .json({ success: false, message: "權限不足：需要管理員權限" });
  }
};

module.exports = { protect, admin };
