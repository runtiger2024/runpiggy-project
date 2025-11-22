const fs = require("fs");
const path = require("path");

const RATES_FILE = path.join(__dirname, "../config/rates.json");

// 預設費率 (當檔案不存在時使用)
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

// 確保 config 資料夾存在
const configDir = path.dirname(RATES_FILE);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 讀取費率
const getRates = () => {
  try {
    if (fs.existsSync(RATES_FILE)) {
      const data = fs.readFileSync(RATES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("讀取費率設定失敗，使用預設值:", error);
  }
  return DEFAULT_RATES;
};

// 寫入費率
const updateRates = (newRates) => {
  try {
    fs.writeFileSync(RATES_FILE, JSON.stringify(newRates, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("寫入費率設定失敗:", error);
    return false;
  }
};

module.exports = { getRates, updateRates };
