// 這是 backend/utils/generateToken.js

const jwt = require("jsonwebtoken");

// 這是一個函式，專門用來產生 Token
// 它需要傳入一個 userId
const generateToken = (id) => {
  // jwt.sign() 是 'jsonwebtoken' 的功能
  return jwt.sign(
    { id }, // 這是我們要加密的資料 (payload)
    process.env.JWT_SECRET, // 這是我們在 .env 裡設定的秘密鑰匙
    { expiresIn: "30d" } // 設定通行證的有效期限 (例如 30 天)
  );
};

module.exports = generateToken;
