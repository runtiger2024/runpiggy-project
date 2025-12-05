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

  // 3. 定義完整的管理權限 (包含新舊版相容)
  const allPermissions = [
    // --- 舊版相容 ---
    "CAN_VIEW_DASHBOARD",
    "CAN_MANAGE_PACKAGES",
    "CAN_MANAGE_SHIPMENTS",
    "CAN_MANAGE_USERS",
    "CAN_MANAGE_SYSTEM",
    "CAN_VIEW_LOGS",
    "CAN_IMPERSONATE_USERS",

    // --- V2025 細緻權限 ---
    "DASHBOARD_VIEW",

    // 包裹
    "PACKAGE_VIEW",
    "PACKAGE_EDIT",
    "PACKAGE_DELETE",

    // 訂單
    "SHIPMENT_VIEW",
    "SHIPMENT_PROCESS",
    "FINANCE_AUDIT",

    // 會員與系統
    "USER_VIEW",
    "USER_MANAGE",
    "USER_IMPERSONATE",
    "SYSTEM_CONFIG",
    "LOGS_VIEW",
  ];

  // 4. 使用 upsert (有則更新，無則新增)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: passwordHash,
      permissions: allPermissions, // 更新權限列表
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

  console.log(`✅ 管理員帳號已就緒: ${admin.email}`);
  console.log(`🔑 權限已更新為全功能模式`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
