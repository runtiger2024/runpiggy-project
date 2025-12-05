// backend/middleware/authMiddleware.js
// V11 - Native JSON Support

const jwt = require("jsonwebtoken");
const prisma = require("../config/db.js");

/**
 * 登入驗證中介軟體
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // 取得 Token
      token = req.headers.authorization.split(" ")[1];

      // 解碼 Token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 1. 嘗試從 DB 獲取使用者
      const userFromDb = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          permissions: true, // DB 中的權限設定 (Json 陣列)
          isActive: true,
        },
      });

      if (!userFromDb) {
        return res
          .status(401)
          .json({ success: false, message: "未授權：找不到此使用者" });
      }

      if (userFromDb.isActive === false) {
        return res
          .status(403)
          .json({ success: false, message: "此帳號已被停用，請聯繫管理員" });
      }

      // 2. 處理權限 (優先級: Token Payload > DB)
      let finalPermissions = [];

      if (decoded.permissions && Array.isArray(decoded.permissions)) {
        // 使用 Token 內的快取權限
        finalPermissions = decoded.permissions;
      } else {
        // [修改] 直接使用 DB 中的 Json 陣列，無需 JSON.parse
        finalPermissions = userFromDb.permissions || [];
      }

      // 3. 將整理好的使用者資料掛載到 req
      req.user = {
        ...userFromDb,
        permissions: finalPermissions,
      };

      next();
    } catch (error) {
      console.error("Token 驗證失敗:", error.message);
      return res
        .status(401)
        .json({ success: false, message: "未授權：Token 無效或已過期" });
    }
  } else {
    return res
      .status(401)
      .json({ success: false, message: "未授權：沒有 Token" });
  }
};

/**
 * 權限檢查中介軟體
 * @param {string} permission - 需要的權限代號
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "未授權：使用者未登入" });
    }

    const userPerms = req.user.permissions || [];

    if (
      userPerms.includes("CAN_MANAGE_USERS") || // 超級管理員條款
      userPerms.includes(permission)
    ) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: `權限不足：此操作需要 ${permission} 權限`,
      });
    }
  };
};

module.exports = { protect, checkPermission };
