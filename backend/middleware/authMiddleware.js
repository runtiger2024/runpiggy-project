// 這是 backend/middleware/authMiddleware.js (V3 權限系統版)
// (使用 permissions 陣列取代 role)

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

      // [*** V3 修正：讀取 permissions ***]
      req.user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          permissions: true, // <-- 讀取新的 permissions 欄位
          createdAt: true,
        },
      });
      // [*** 修正結束 ***]

      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "未授權：找不到此使用者" });
      }

      // [*** V3 新增：解析權限 ***]
      // 將 permissions JSON 字串解析為陣列，並附加到 req.user 上
      try {
        req.user.permissions = JSON.parse(req.user.permissions || "[]");
      } catch (e) {
        req.user.permissions = []; // 解析失敗，給予空權限
      }
      // [*** 新增結束 ***]

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

// 2. [*** V3 修正：建立權限檢查中介軟體 ***]
/**
 * 建立一個中介軟体，檢查 req.user 是否包含指定的權限
 * @param {string} permission - 需要的權限代號 (e.g., "CAN_MANAGE_USERS")
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    // protect 必須先執行
    if (
      req.user &&
      req.user.permissions &&
      req.user.permissions.includes(permission)
    ) {
      next(); // 通過！
    } else {
      return res
        .status(403)
        .json({ success: false, message: `權限不足：需要 ${permission} 權限` });
    }
  };
};

module.exports = { protect, checkPermission }; // [*** V3 修正 ***]
