// backend/controllers/settingsController.js
// V2025.Security - 支援設定結構驗證 (Schema Validation)

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

    const result = {};
    settingsList.forEach((item) => {
      result[item.key] = item.value;
    });

    res.status(200).json({ success: true, settings: result });
  } catch (error) {
    console.error("取得設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 更新系統設定 (含防呆驗證)
 * @route PUT /api/admin/settings
 */
const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // 預期格式: { key: value, key2: value2 }

    // [Security] 結構驗證邏輯
    for (const [key, value] of Object.entries(updates)) {
      if (key === "rates_config") {
        // 檢查必要欄位，防止前台計算機崩潰
        if (
          !value.categories ||
          !value.constants ||
          typeof value.constants.MINIMUM_CHARGE !== "number" ||
          typeof value.constants.VOLUME_DIVISOR !== "number"
        ) {
          return res.status(400).json({
            success: false,
            message:
              "運費設定 (rates_config) 格式錯誤，缺少 categories 或 constants",
          });
        }
      } else if (key === "bank_info") {
        if (!value.bankName || !value.account) {
          return res.status(400).json({
            success: false,
            message: "銀行設定 (bank_info) 格式錯誤，缺少 bankName 或 account",
          });
        }
      }
    }

    const operations = Object.entries(updates).map(([key, value]) => {
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
