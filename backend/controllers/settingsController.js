// backend/controllers/settingsController.js

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js"); // 用來讀取舊的 json 設定
const createLog = require("../utils/createLog.js");

// 定義預設設定與遷移邏輯
const seedDefaultSettings = async () => {
  console.log("[System] 正在初始化系統設定 (遷移舊資料)...");

  const configs = [];

  // 1. 遷移運費設定 (從 rates.json)
  try {
    const currentRates = ratesManager.getRates();
    configs.push({
      key: "shipping_rates",
      value: JSON.stringify(currentRates),
      category: "SHIPPING",
      description: "運費費率與常數設定 (JSON)",
    });
  } catch (e) {
    console.error("讀取舊運費設定失敗:", e);
  }

  // 2. 遷移發票設定 (從 .env)
  // 注意：我們只存非敏感或可變更的設定，HashKey 建議還是留 .env 或這裡加密存
  // 這裡示範將 MerchantID 搬進來，HashKey 因為安全考量，我們策略是：
  // 若資料庫有值就用資料庫的，沒值就用 .env 的。
  configs.push({
    key: "invoice_config",
    value: JSON.stringify({
      merchantId: process.env.AMEGO_MERCHANT_ID || "",
      hashKey: process.env.AMEGO_HASH_KEY || "", // 存入 DB 方便後台修改
      apiUrl:
        process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json/f0401",
      isEnabled: true, // 新增開關
      notifyEmail: true, // 是否寄信
    }),
    category: "INVOICE",
    description: "電子發票 API 設定",
  });

  // 3. 遷移 Email 設定 (從 .env)
  const adminEmails = process.env.ADMIN_EMAIL_RECIPIENT
    ? process.env.ADMIN_EMAIL_RECIPIENT.split(",").map((e) => e.trim())
    : [];

  configs.push({
    key: "email_config",
    value: JSON.stringify({
      adminEmails: adminEmails,
      senderName: "小跑豬集運",
      isEnabled: true,
    }),
    category: "EMAIL",
    description: "郵件通知設定",
  });

  // 4. 系統公告 (新功能)
  configs.push({
    key: "system_notice",
    value: JSON.stringify({
      enabled: false,
      text: "系統維護中，請稍後再試。",
      type: "info", // info, warning, error
    }),
    category: "SYSTEM",
    description: "前台系統公告",
  });

  // 寫入資料庫
  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {}, // 如果存在就不動
      create: config,
    });
  }
  console.log("[System] 系統設定初始化完成");
};

/**
 * @description 取得所有系統設定
 * @route GET /api/admin/config
 */
const getAllSettings = async (req, res) => {
  try {
    // 每次讀取前，先檢查是否需要初始化 (Lazy Seeding)
    const count = await prisma.systemConfig.count();
    if (count === 0) {
      await seedDefaultSettings();
    }

    const settings = await prisma.systemConfig.findMany();

    // 轉成 Key-Value 物件回傳，方便前端使用
    const result = {};
    settings.forEach((item) => {
      try {
        result[item.key] = JSON.parse(item.value);
      } catch (e) {
        result[item.key] = item.value;
      }
    });

    res.status(200).json({ success: true, settings: result });
  } catch (error) {
    console.error("取得設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 更新系統設定
 * @route PUT /api/admin/config
 */
const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // 預期格式: { key: value, key2: value2 }

    const operations = Object.entries(updates).map(([key, value]) => {
      // 如果 value 是物件，轉字串存
      const stringValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      return prisma.systemConfig.update({
        where: { key },
        data: { value: stringValue },
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
