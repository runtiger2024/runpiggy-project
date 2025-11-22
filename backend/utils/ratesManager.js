// backend/utils/ratesManager.js (V10 旗艦版 - 資料庫驅動)

const prisma = require("../config/db.js");

// 預設費率 (當資料庫尚未設定或連線失敗時的備案)
const DEFAULT_RATES = {
  categories: {
    general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
    special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
    special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
    special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
  },
  constants: {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 2000,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 800,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 800,
  },
};

/**
 * 從資料庫讀取運費設定
 * @returns {Promise<Object>} 包含 categories 和 constants 的設定物件
 */
const getRates = async () => {
  try {
    // 嘗試從 SystemSetting 資料表讀取
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "rates_config" },
    });

    if (setting && setting.value) {
      return JSON.parse(setting.value);
    }
  } catch (error) {
    console.error("讀取運費設定失敗 (將使用預設值):", error.message);
  }
  // 若無設定或發生錯誤，回傳預設值
  return DEFAULT_RATES;
};

module.exports = { getRates, DEFAULT_RATES };
