// backend/controllers/settingsController.js
// V11 - Native JSON Support

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

// 定義預設設定與遷移邏輯
const seedDefaultSettings = async () => {
  console.log("[System] 正在初始化系統設定...");

  const configs = [];

  // 1. 遷移運費設定
  try {
    const currentRates = await ratesManager.getRates();
    configs.push({
      key: "rates_config",
      // [修改] value 直接存物件
      value: currentRates,
      category: "SHIPPING",
      description: "運費費率與常數設定 (JSON)",
    });
  } catch (e) {
    console.error("讀取舊運費設定失敗:", e);
  }

  // 2. 遷移發票設定
  configs.push({
    key: "invoice_config",
    value: {
      merchantId: process.env.AMEGO_MERCHANT_ID || "",
      hashKey: process.env.AMEGO_HASH_KEY || "",
      apiUrl:
        process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json/f0401",
      enabled: true,
      notifyEmail: true,
    },
    category: "INVOICE",
    description: "電子發票 API 設定",
  });

  // 3. 遷移 Email 設定
  const adminEmails = process.env.ADMIN_EMAIL_RECIPIENT
    ? process.env.ADMIN_EMAIL_RECIPIENT.split(",").map((e) => e.trim())
    : [];

  configs.push({
    key: "email_config",
    value: {
      adminEmails: adminEmails,
      senderName: "小跑豬集運",
      isEnabled: true,
    },
    category: "EMAIL",
    description: "郵件通知設定",
  });

  // 4. 系統公告
  configs.push({
    key: "announcement",
    value: {
      enabled: false,
      text: "系統維護中，請稍後再試。",
      color: "info",
    },
    category: "SYSTEM",
    description: "前台系統公告",
  });

  // 寫入資料庫
  for (const config of configs) {
    // 這裡我們不使用 upsert，避免覆蓋已修改的設定，只在 key 不存在時建立
    const exists = await prisma.systemSetting.findUnique({
      where: { key: config.key },
    });
    if (!exists) {
      await prisma.systemSetting.create({
        data: {
          key: config.key,
          value: config.value,
          description: config.description,
        },
      });
    }
  }
  console.log("[System] 系統設定初始化完成");
};

/**
 * @description 取得所有系統設定
 * @route GET /api/admin/settings
 */
const getAllSettings = async (req, res) => {
  try {
    const count = await prisma.systemSetting.count();
    if (count === 0) {
      await seedDefaultSettings();
    }

    const settingsList = await prisma.systemSetting.findMany();

    // 轉成 Key-Value 物件回傳
    const result = {};
    settingsList.forEach((item) => {
      // [修改] 直接使用 Json
      result[item.key] = item.value;
    });

    res.status(200).json({ success: true, settings: result });
  } catch (error) {
    console.error("取得設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 更新系統設定
 * @route PUT /api/admin/settings
 */
const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // 預期格式: { key: value, key2: value2 }

    const operations = Object.entries(updates).map(([key, value]) => {
      // [修改] 直接存入 value (物件)
      return prisma.systemSetting.update({
        where: { key },
        data: { value: value },
      });
    });

    await prisma.$transaction(operations);

    await createLog(
      req.user.id,
      "UPDATE_SETTINGS",
      "SYSTEM",
      `更新了 ${operations.length} 項設定`
    );

    res.status(200).json({ success: true, message: "設定已更新" });
  } catch (error) {
    console.error("更新設定失敗:", error);
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

module.exports = {
  getAllSettings,
  updateSettings,
};
