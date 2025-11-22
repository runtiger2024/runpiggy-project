// backend/controllers/calculatorController.js (V10 旗艦版 - 支援動態費率)

const ratesManager = require("../utils/ratesManager.js");

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

    // [V10 修改] 等待非同步讀取：從資料庫取得最新費率
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
        // 若資料庫設定有誤，這裡可能會報錯，建議後台設定時要謹慎
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

        if (
          length > CONSTANTS.OVERSIZED_LIMIT ||
          width > CONSTANTS.OVERSIZED_LIMIT ||
          height > CONSTANTS.OVERSIZED_LIMIT
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

      const isItemOverweight = singleWeight > CONSTANTS.OVERWEIGHT_LIMIT;

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
  console.log("Controller: calculateAirFreight 觸發", req.body);
  res.json({
    message: "OK, Controller: calculateAirFreight (尚未實作)",
    input: req.body,
  });
};

module.exports = {
  calculateSeaFreight,
  calculateAirFreight,
};
