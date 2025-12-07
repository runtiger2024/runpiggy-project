// backend/prisma/seed.js
// V2025.Security - 安全化種子腳本 (強制使用環境變數)

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始執行資料庫種子腳本 (Seeding)...");

  // [Security] 強制從環境變數讀取，不使用預設值
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = "超級管理員";

  if (!adminEmail || !adminPassword) {
    console.error(
      "❌ 錯誤：請先在 backend/.env 檔案中設定 ADMIN_EMAIL 與 ADMIN_PASSWORD"
    );
    console.error("範例: ADMIN_EMAIL=admin@example.com");
    console.error("範例: ADMIN_PASSWORD=StrongPassword123");
    process.exit(1);
  }

  // 2. 加密密碼
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  // 3. 定義完整的管理權限
  const allPermissions = [
    "DASHBOARD_VIEW",
    "PACKAGE_VIEW",
    "PACKAGE_EDIT",
    "PACKAGE_DELETE",
    "SHIPMENT_VIEW",
    "SHIPMENT_PROCESS",
    "FINANCE_AUDIT",
    "USER_VIEW",
    "USER_MANAGE",
    "USER_IMPERSONATE",
    "SYSTEM_CONFIG",
    "LOGS_VIEW",
    // 舊版相容
    "CAN_VIEW_DASHBOARD",
    "CAN_MANAGE_PACKAGES",
    "CAN_MANAGE_SHIPMENTS",
    "CAN_MANAGE_USERS",
    "CAN_MANAGE_SYSTEM",
    "CAN_VIEW_LOGS",
    "CAN_IMPERSONATE_USERS",
  ];

  // 4. 使用 upsert
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

  console.log(`✅ 管理員帳號已就緒: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
