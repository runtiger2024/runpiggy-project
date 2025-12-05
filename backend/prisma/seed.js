// backend/prisma/seed.js

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始執行資料庫種子腳本 (Seeding)...");

  // 1. 設定管理員帳號資訊
  const adminEmail = "randyhuang1007@gmail.com";
  const adminPassword = "randy1007";
  const adminName = "超級管理員";

  // 2. 加密密碼
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  // 3. 定義完整的管理權限
  // 這些權限字串對應您的前端權限檢查邏輯
  const allPermissions = [
    "CAN_VIEW_DASHBOARD",
    "CAN_MANAGE_PACKAGES",
    "CAN_MANAGE_SHIPMENTS",
    "CAN_MANAGE_USERS",
    "CAN_MANAGE_SYSTEM",
    "CAN_VIEW_LOGS",
  ];

  // 4. 使用 upsert (有則更新，無則新增)
  // 注意：Prisma 的 Json 欄位可以直接接收 JavaScript 陣列
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: passwordHash,
      permissions: allPermissions,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: passwordHash,
      permissions: allPermissions,
      isActive: true,
    },
  });

  console.log(`✅ 管理員帳號已就緒: ${admin.email} (密碼: ${adminPassword})`);
  console.log(`🔑 權限設定:`, admin.permissions);
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
