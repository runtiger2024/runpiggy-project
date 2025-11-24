// backend/controllers/calculatorController.js (V12.1 - 修復超規判斷 >= 版)

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");

// --- 定義後端預設值 (當資料庫為空時使用) ---
const DEFAULT_CONFIG = {
  warehouseInfo: {
    recipient: "小跑豬+[您的姓名]",
    phone: "13652554906",
    zip: "523920",
    address: "广东省东莞市虎门镇龙眼工业路28号139铺",
  },
  announcement: {
    enabled: true,
    text: "歡迎使用小跑豬集運！新會員註冊即享優惠。",
    color: "info",
  },
  // 預設偏遠地區 (簡化版，避免空值)
  remoteAreas: {
    1800: ["東勢區", "新社區", "石岡區", "和平區"],
    2000: ["三芝", "石門", "烏來", "坪林"],
    2500: ["名間鄉", "四湖鄉", "東勢鄉"],
    4000: ["南莊鄉", "獅潭鄉", "竹山鎮"],
    7000: ["小琉球", "綠島", "蘭嶼"],
  },
  bankInfo: {
    bankName: "第一銀行 (007)",
    branch: "台南分行",
    account: "60110066477",
    holder: "跑得快國際貿易",
  },
};

/**
 * @description 取得公開的計算機設定 (費率、公告、銀行、偏遠地區)
 * @route       GET /api/calculator/config
 * @access      Public
 */
const getCalculatorConfig = async (req, res) => {
  try {
    // 1. 取得費率 (透過 ratesManager 封裝好的邏輯，內部已有預設值)
    const rates = await ratesManager.getRates();

    // 2. 取得其他公開設定
    const keysToFetch = [
      "remote_areas",
      "bank_info",
      "announcement",
      "warehouse_info",
    ];

    const settingsList = await prisma.systemSetting.findMany({
      where: { key: { in: keysToFetch } },
    });

    // 轉換為 Key-Value 物件
    const settingsMap = {};
    settingsList.forEach((item) => {
      try {
        settingsMap[item.key] = JSON.parse(item.value);
      } catch (e) {
        settingsMap[item.key] = item.value;
      }
    });

    // 3. 組合回傳 (優先使用 DB 值，若無則使用預設值)
    const responseData = {
      success: true,
      rates: rates, // ratesManager 已經保證有值
      remoteAreas: settingsMap.remote_areas || DEFAULT_CONFIG.remoteAreas,
      bankInfo: settingsMap.bank_info || DEFAULT_CONFIG.bankInfo,
      announcement: settingsMap.announcement || DEFAULT_CONFIG.announcement,
      warehouseInfo: settingsMap.warehouse_info || DEFAULT_CONFIG.warehouseInfo,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("取得計算機設定失敗 (使用全預設值):", error);

    // 發生錯誤時，回傳完整的預設值，確保前端不會掛掉
    res.status(200).json({
      success: false, // 標記為 false 讓前端知道是備案
      message: "系統載入預設設定",
      rates: ratesManager.DEFAULT_RATES,
      remoteAreas: DEFAULT_CONFIG.remoteAreas,
      bankInfo: DEFAULT_CONFIG.bankInfo,
      announcement: DEFAULT_CONFIG.announcement,
      warehouseInfo: DEFAULT_CONFIG.warehouseInfo,
    });
  }
};

/**
 * @description 計算海運運費 (核心邏輯)
 * @route       POST /api/calculator/sea
 * @access      Public
 */
const calculateSeaFreight = async (req, res) => {
  try {
    const { items, deliveryLocationRate } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "輸入錯誤：必須至少提供一個計算項目 (items 陣列)。",
      });
    }
    if (deliveryLocationRate === undefined || deliveryLocationRate === null) {
      return res.status(400).json({
        success: false,
        message: "輸入錯誤：必須提供配送地區費率 (deliveryLocationRate)。",
      });
    }

    // 取得費率 (確保有值)
    const systemRates = await ratesManager.getRates();
    const RATES = systemRates.categories;
    const CONSTANTS = systemRates.constants;

    let allItemsData = [];
    let initialSeaFreightCost = 0;
    let totalShipmentVolume = 0;
    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;

    for (const [index, item] of items.entries()) {
      const name = item.name || `貨物 ${index + 1}`;
      const quantity = parseInt(item.quantity) || 1;

      // 重量：無條件進位到小數點後1位
      const singleWeight = Math.ceil(parseFloat(item.weight) * 10) / 10;

      const type = item.type || "general";
      const calcMethod = item.calcMethod || "dimensions";
      const length = parseFloat(item.length) || 0;
      const width = parseFloat(item.width) || 0;
      const height = parseFloat(item.height) || 0;
      const cbm = parseFloat(item.cbm) || 0;

      if (isNaN(singleWeight) || singleWeight <= 0) {
        return res.status(400).json({
          success: false,
          message: `項目 "${name}" 的重量必須是 > 0 的數字。`,
        });
      }

      const rateInfo = RATES[type];
      if (!rateInfo) {
        return res.status(400).json({
          success: false,
          message: `項目 "${name}" 的家具種類 (type) "${type}" 無效 (可能是後台費率設定不匹配)。`,
        });
      }

      let singleVolume = 0; // 單件材積
      let isItemOversized = false;

      if (calcMethod === "dimensions") {
        if (length <= 0 || width <= 0 || height <= 0) {
          return res.status(400).json({
            success: false,
            message: `項目 "${name}" 選擇依尺寸計算，但 長/寬/高 必須是 > 0 的數字。`,
          });
        }
        // 材積：(L*W*H) / VOLUME_DIVISOR，結果無條件進位
        singleVolume = Math.ceil(
          (length * width * height) / CONSTANTS.VOLUME_DIVISOR
        );

        // [修正] 檢查超規 (改為 >=)
        if (
          length >= CONSTANTS.OVERSIZED_LIMIT ||
          width >= CONSTANTS.OVERSIZED_LIMIT ||
          height >= CONSTANTS.OVERSIZED_LIMIT
        ) {
          isItemOversized = true;
        }
      } else if (calcMethod === "cbm") {
        if (cbm <= 0) {
          return res.status(400).json({
            success: false,
            message: `項目 "${name}" 選擇依立方米計算，但 cbm 必須是 > 0 的數字。`,
          });
        }
        // 材積：CBM * CBM_TO_CAI_FACTOR，結果無條件進位
        singleVolume = Math.ceil(cbm * CONSTANTS.CBM_TO_CAI_FACTOR);
      }

      // [修正] 檢查超重 (改為 >=)
      const isItemOverweight = singleWeight >= CONSTANTS.OVERWEIGHT_LIMIT;

      if (isItemOversized) hasAnyOversizedItem = true;
      if (isItemOverweight) hasAnyOverweightItem = true;

      const totalItemVolume = singleVolume * quantity;
      const totalItemWeight = singleWeight * quantity;

      const itemWeightCost = totalItemWeight * rateInfo.weightRate;
      const itemVolumeCost = totalItemVolume * rateInfo.volumeRate;
      const itemFinalCost = Math.max(itemWeightCost, itemVolumeCost);

      initialSeaFreightCost += itemFinalCost;
      totalShipmentVolume += totalItemVolume;

      // 儲存明細
      allItemsData.push({
        id: index + 1,
        name,
        quantity,
        singleWeight,
        type,
        singleVolume,
        cbm,
        calcMethod,
        length,
        width,
        height,
        hasOversizedItem: isItemOversized,
        isOverweight: isItemOverweight,
        rateInfo,
        totalWeight: totalItemWeight,
        totalVolume: totalItemVolume,
        itemWeightCost: Math.round(itemWeightCost),
        itemVolumeCost: Math.round(itemVolumeCost),
        itemFinalCost: Math.round(itemFinalCost),
      });
    }

    // 彙總計算
    const finalSeaFreightCost = Math.max(
      initialSeaFreightCost,
      CONSTANTS.MINIMUM_CHARGE
    );
    const totalOverweightFee = hasAnyOverweightItem
      ? CONSTANTS.OVERWEIGHT_FEE
      : 0;
    const totalOversizedFee = hasAnyOversizedItem ? CONSTANTS.OVERSIZED_FEE : 0;
    const totalCbm = totalShipmentVolume / CONSTANTS.CBM_TO_CAI_FACTOR;
    const remoteFee = totalCbm * parseFloat(deliveryLocationRate);
    const finalTotal =
      finalSeaFreightCost + remoteFee + totalOverweightFee + totalOversizedFee;

    res.status(200).json({
      success: true,
      message: "運費試算成功",
      inputs: {
        itemCount: items.length,
        deliveryLocationRate: parseFloat(deliveryLocationRate),
      },
      calculationResult: {
        allItemsData,
        totalShipmentVolume: parseFloat(totalShipmentVolume.toFixed(4)),
        totalCbm: parseFloat(totalCbm.toFixed(4)),
        initialSeaFreightCost: Math.round(initialSeaFreightCost),
        finalSeaFreightCost: Math.round(finalSeaFreightCost),
        remoteAreaRate: parseFloat(deliveryLocationRate),
        remoteFee: Math.round(remoteFee),
        hasAnyOversizedItem,
        hasAnyOverweightItem,
        totalOverweightFee,
        totalOversizedFee,
        finalTotal: Math.round(finalTotal),
      },
      rulesApplied: CONSTANTS, // 回傳當前使用的規則
    });
  } catch (error) {
    console.error("計算運費時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const calculateAirFreight = (req, res) => {
  // 保留介面，尚未實作
  res.json({
    message: "OK, Controller: calculateAirFreight (尚未實作)",
    input: req.body,
  });
};

module.exports = {
  getCalculatorConfig,
  calculateSeaFreight,
  calculateAirFreight,
};
