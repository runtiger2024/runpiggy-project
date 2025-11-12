// 這是 backend/controllers/calculatorController.js (最終版，含無條件進位)

// --- 1. 資料定義 (來自 public/script.js) ---
const rates = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const MINIMUM_CHARGE = 2000;
const VOLUME_DIVISOR = 28317; // (長*寬*高) / 28317 = 材
const CBM_TO_CAI_FACTOR = 35.3; // 1 CBM = 35.3 材
const OVERSIZED_LIMIT = 300;
const OVERSIZED_FEE = 800;
const OVERWEIGHT_LIMIT = 100;
const OVERWEIGHT_FEE = 800;
// ---------------------------------------------------

/**
 * @description 計算海運運費 (核心邏輯)
 * @route       POST /api/calculator/sea
 * @access      Public
 */
const calculateSeaFreight = (req, res) => {
  const { items, deliveryLocationRate } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({
        success: false,
        message: "輸入錯誤：必須至少提供一個計算項目 (items 陣列)。",
      });
  }
  if (deliveryLocationRate === undefined || deliveryLocationRate === null) {
    return res
      .status(400)
      .json({
        success: false,
        message: "輸入錯誤：必須提供配送地區費率 (deliveryLocationRate)。",
      });
  }

  let allItemsData = [];
  let initialSeaFreightCost = 0;
  let totalShipmentVolume = 0;
  let hasAnyOversizedItem = false;
  let hasAnyOverweightItem = false;

  for (const [index, item] of items.entries()) {
    const name = item.name || `貨物 ${index + 1}`;
    const quantity = parseInt(item.quantity) || 1;

    // --- (規則修改 1) 重量：無條件進位到小數點後1位 ---
    const singleWeight = Math.ceil(parseFloat(item.weight) * 10) / 10;

    const type = item.type || "general";
    const calcMethod = item.calcMethod || "dimensions";
    const length = parseFloat(item.length) || 0;
    const width = parseFloat(item.width) || 0;
    const height = parseFloat(item.height) || 0;
    const cbm = parseFloat(item.cbm) || 0;

    if (isNaN(singleWeight) || singleWeight <= 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: `項目 "${name}" 的重量 (weight) 必須是 > 0 的數字。`,
        });
    }

    const rateInfo = rates[type];
    if (!rateInfo) {
      return res
        .status(400)
        .json({
          success: false,
          message: `項目 "${name}" 的家具種類 (type) "${type}" 無效。`,
        });
    }

    let singleVolume = 0; // 單件材積
    let isItemOversized = false;

    if (calcMethod === "dimensions") {
      if (length <= 0 || width <= 0 || height <= 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: `項目 "${name}" 選擇依尺寸計算，但 長/寬/高 必須是 > 0 的數字。`,
          });
      }
      // --- (規則修改 2) 材積：(L*W*H) / 28317，結果無條件進位 ---
      singleVolume = Math.ceil((length * width * height) / VOLUME_DIVISOR);

      if (
        length > OVERSIZED_LIMIT ||
        width > OVERSIZED_LIMIT ||
        height > OVERSIZED_LIMIT
      ) {
        isItemOversized = true;
      }
    } else if (calcMethod === "cbm") {
      if (cbm <= 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: `項目 "${name}" 選擇依立方米計算，但 cbm 必須是 > 0 的數字。`,
          });
      }
      // --- (規則修改 2) 材積：CBM * 35.3，結果無條件進位 ---
      singleVolume = Math.ceil(cbm * CBM_TO_CAI_FACTOR);
    }

    const isItemOverweight = singleWeight > OVERWEIGHT_LIMIT;

    if (isItemOversized) hasAnyOversizedItem = true;
    if (isItemOverweight) hasAnyOverweightItem = true;

    const totalItemVolume = singleVolume * quantity;
    const totalItemWeight = singleWeight * quantity;

    const itemWeightCost = totalItemWeight * rateInfo.weightRate;
    const itemVolumeCost = totalItemVolume * rateInfo.volumeRate;
    const itemFinalCost = Math.max(itemWeightCost, itemVolumeCost);

    initialSeaFreightCost += itemFinalCost;
    totalShipmentVolume += totalItemVolume;

    // 儲存明細時，使用 "已經" 進位過的數字
    allItemsData.push({
      id: index + 1,
      name,
      quantity,
      singleWeight, // <-- 已進位 (例: 50.0)
      type,
      singleVolume, // <-- 已進位 (例: 64)
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

  // 彙總計算 (保持不變)
  const finalSeaFreightCost = Math.max(initialSeaFreightCost, MINIMUM_CHARGE);
  const totalOverweightFee = hasAnyOverweightItem ? OVERWEIGHT_FEE : 0;
  const totalOversizedFee = hasAnyOversizedItem ? OVERSIZED_FEE : 0;
  const totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
  const remoteFee = totalCbm * parseFloat(deliveryLocationRate);
  const finalTotal =
    finalSeaFreightCost + remoteFee + totalOverweightFee + totalOversizedFee;

  // 回傳 JSON (保持不變)
  res.status(200).json({
    success: true,
    message: "運費試算成功 (RUNPIGGY-V2 標準, 含進位)",
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
    rulesApplied: {
      VOLUME_DIVISOR,
      CBM_TO_CAI_FACTOR,
      MINIMUM_CHARGE,
      OVERWEIGHT_LIMIT,
      OVERWEIGHT_FEE,
      OVERSIZED_LIMIT,
      OVERSIZED_FEE,
    },
  });
};

// (空運的函式我們先放著不動)
const calculateAirFreight = (req, res) => {
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
