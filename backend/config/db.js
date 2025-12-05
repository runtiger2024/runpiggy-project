// backend/config/db.js

// 1. 載入 Prisma 客戶端
const { PrismaClient } = require("@prisma/client");

// 2. 建立一個 PrismaClient 的實例 (instance)
//    加上日誌記錄，開發時終端機會顯示執行的 SQL 指令
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

// 3. 匯出這個實例
module.exports = prisma;
