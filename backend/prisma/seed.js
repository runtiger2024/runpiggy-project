// backend/prisma/seed.js
// V2025.Security.Unclaimed - 安全化種子腳本 (含無主帳號初始化)

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始執行資料庫種子腳本 (Seeding)...");

  // ==========================================
  // 1. 設定管理員 (Admin)
  // ==========================================
  // [Security] 強制從環境變數讀取，不使用預設值以策安全
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

  // 加密密碼
  const salt = await bcrypt.genSalt(10);
  const adminHash = await bcrypt.hash(adminPassword, salt);

  // 定義完整的管理權限
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
    // 舊版相容權限
    "CAN_VIEW_DASHBOARD",
    "CAN_MANAGE_PACKAGES",
    "CAN_MANAGE_SHIPMENTS",
    "CAN_MANAGE_USERS",
    "CAN_MANAGE_SYSTEM",
    "CAN_VIEW_LOGS",
    "CAN_IMPERSONATE_USERS",
  ];

  // 建立或更新管理員
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminHash,
      permissions: allPermissions,
      isActive: true,
      role: "ADMIN",
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: adminHash,
      permissions: allPermissions,
      isActive: true,
      role: "ADMIN",
    },
  });

  console.log(`✅ 管理員帳號已就緒: ${admin.email}`);

  // ==========================================
  // 2. 設定無主包裹專用帳號 (Unclaimed User)
  // ==========================================
  // 這是一個系統帳號，所有無主件都歸屬於此 user ID，方便後續查詢與認領
  const unclaimedEmail = "unclaimed@runpiggy.com";
  const unclaimedName = "無主包裹庫存";
  // 密碼隨機或固定皆可，此帳號不應登入，僅作資料歸屬使用
  const unclaimedPassword =
    process.env.UNCLAIMED_PASSWORD || "UnclaimedStorage2025!";
  const unclaimedHash = await bcrypt.hash(unclaimedPassword, salt);

  const unclaimedUser = await prisma.user.upsert({
    where: { email: unclaimedEmail },
    update: {
      // 確保名稱正確，方便前端辨識
      name: unclaimedName,
      // 確保角色是一般會員 (CLIENT)，避免擁有後台權限
      role: "CLIENT",
      isActive: true,
      // 清空權限
      permissions: [],
    },
    create: {
      email: unclaimedEmail,
      name: unclaimedName,
      passwordHash: unclaimedHash,
      role: "CLIENT",
      isActive: true,
      permissions: [],
    },
  });

  console.log(`📦 無主包裹專用帳號已就緒: ${unclaimedUser.email}`);

  // ==========================================
  // 3. (選用) 設定一般測試會員
  // ==========================================
  if (process.env.NODE_ENV === "development") {
    const testEmail = "user@example.com";
    const testHash = await bcrypt.hash("123456", salt);
    await prisma.user.upsert({
      where: { email: testEmail },
      update: {},
      create: {
        email: testEmail,
        name: "測試會員",
        passwordHash: testHash,
        role: "CLIENT",
      },
    });
    console.log(`👤 開發用測試會員已就緒: ${testEmail}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
