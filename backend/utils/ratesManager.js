// backend/utils/ratesManager.js
// V2025.Security - 移除硬編碼費率

const prisma = require("../config/db.js");

// 預設的空結構 (不包含具體金額，強制依賴資料庫)
const DEFAULT_RATES_STRUCTURE = {
  categories: {
    general: {
      name: "一般家具",
      description: "請至後台設定說明",
      weightRate: 0,
      volumeRate: 0,
    },
  },
  constants: {
    VOLUME_DIVISOR: 28317, // 國際標準，可保留
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 0,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 0,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 0,
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
      // Prisma 的 Json 欄位通常直接回傳物件
      return typeof setting.value === "string"
        ? JSON.parse(setting.value)
        : setting.value;
    }

    console.warn("⚠️ 警告：資料庫中找不到 rates_config，將使用空白預設值");
    return DEFAULT_RATES_STRUCTURE;
  } catch (error) {
    console.error("讀取運費設定失敗 (將使用空白預設值):", error.message);
    // 發生錯誤時回傳空結構，避免計算出錯誤費用
    return DEFAULT_RATES_STRUCTURE;
  }
};

/**
 * 驗證費率結構是否合法 (用於更新設定時)
 * @param {Object} rates
 */
const validateRates = (rates) => {
  if (!rates || !rates.categories || !rates.constants) {
    return false;
  }
  if (typeof rates.constants.MINIMUM_CHARGE === "undefined") return false;
  return true;
};

module.exports = {
  getRates,
  validateRates,
  DEFAULT_RATES: DEFAULT_RATES_STRUCTURE,
};
