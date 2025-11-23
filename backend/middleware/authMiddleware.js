// backend/middleware/authMiddleware.js (V5 優化版 - 支援 JWT Payload 權限快取)

const jwt = require("jsonwebtoken");
const prisma = require("../config/db.js");

/**
 * 登入驗證中介軟體
 * 1. 驗證 Bearer Token
 * 2. 優先讀取 Token Payload 中的權限資訊 (減少 DB 依賴)
 * 3. 確認使用者存在於資料庫且未被停用 (安全性)
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

      // 1. 嘗試從 DB 獲取使用者 (確保帳號有效性，例如未被刪除或停用)
      // 優化: 只選取必要欄位
      const userFromDb = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          permissions: true, // DB 中的權限設定 (JSON 字串)
          isActive: true, // 檢查帳號狀態
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
      // 如果我們在 generateToken 時有放入 permissions，這裡可以直接用
      let finalPermissions = [];

      if (decoded.permissions && Array.isArray(decoded.permissions)) {
        // 使用 Token 內的快取權限 (效能較好，但在 Token 過期前無法即時撤銷權限)
        finalPermissions = decoded.permissions;
      } else {
        // 回退使用 DB 資料
        try {
          finalPermissions = JSON.parse(userFromDb.permissions || "[]");
        } catch (e) {
          finalPermissions = [];
        }
      }

      // 3. 將整理好的使用者資料掛載到 req
      req.user = {
        ...userFromDb,
        permissions: finalPermissions, // 確保是 Array
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
 * @param {string} permission - 需要的權限代號 (例如 "CAN_MANAGE_USERS")
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    // protect 必須先執行，確保 req.user 存在
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "未授權：使用者未登入" });
    }

    const userPerms = req.user.permissions || [];

    // 檢查: 是否有特定權限 或 是超級管理員 (CAN_MANAGE_USERS 通常代表 Admin)
    if (
      userPerms.includes("CAN_MANAGE_USERS") || // 超級管理員條款 (Admin Pass)
      userPerms.includes(permission) // 普通權限檢查
    ) {
      next(); // 通過！
    } else {
      return res.status(403).json({
        success: false,
        message: `權限不足：此操作需要 ${permission} 權限`,
      });
    }
  };
};

module.exports = { protect, checkPermission };
