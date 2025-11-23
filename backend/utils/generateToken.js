// backend/utils/generateToken.js (V10 優化版 - 支援權限 Payload)

const jwt = require("jsonwebtoken");

/**
 * 產生 JWT Token
 * @param {string} id - 使用者 ID
 * @param {object} [payload={}] - 額外的 Payload 資料 (例如 permissions)
 * @returns {string} JWT Token
 */
const generateToken = (id, payload = {}) => {
  // 合併基本 ID 與額外資料
  const tokenPayload = {
    id,
    ...payload, // 允許將 permissions 等資訊放入 Token，減少 DB 查詢
  };

  return jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET,
    { expiresIn: "30d" } // Token 有效期
  );
};

module.exports = generateToken;
