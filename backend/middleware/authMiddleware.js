// 這是 backend/middleware/authMiddleware.js (V4 超級管理員版)

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

      req.user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          permissions: true,
          createdAt: true,
        },
      });

      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "未授權：找不到此使用者" });
      }

      // 解析權限
      try {
        req.user.permissions = JSON.parse(req.user.permissions || "[]");
      } catch (e) {
        req.user.permissions = [];
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

// 2. [V4 優化] 權限檢查中介軟體
// 邏輯修正：只要有 "CAN_MANAGE_USERS" (Admin)，就視為擁有所有權限
const checkPermission = (permission) => {
  return (req, res, next) => {
    // protect 必須先執行，確保 req.user 存在
    const userPerms = req.user.permissions || [];

    if (
      userPerms.includes("CAN_MANAGE_USERS") || // 超級管理員條款
      userPerms.includes(permission) // 普通權限檢查
    ) {
      next(); // 通過！
    } else {
      return res
        .status(403)
        .json({ success: false, message: `權限不足：需要 ${permission} 權限` });
    }
  };
};

module.exports = { protect, checkPermission };
