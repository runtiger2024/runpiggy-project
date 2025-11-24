// backend/controllers/shipmentController.js (V10.1 - 修復超規判斷 >= 版)

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");

/**
 * 核心輔助函式：計算整筆集運單的費用細節
 * 包含：重新計算基本運費、總材積(CBM)、偏遠費、超規費、低消補足
 * 規則：總費用 = 基本運費(含低消) + 偏遠費 + 超規費
 */
const calculateShipmentDetails = (packages, rates, deliveryRate) => {
  const CONSTANTS = rates.constants;
  const CATEGORIES = rates.categories;

  let baseCost = 0; // 純基本運費 (不含低消補足、不含偏遠、不含附加費)
  let totalVolumeDivisor = 0; // 總材積數累加 (sum of (LxWxH)/DIVISOR)
  let hasOversized = false;
  let hasOverweight = false;

  packages.forEach((pkg) => {
    try {
      const boxes = JSON.parse(pkg.arrivedBoxesJson || "[]");

      // 如果有分箱數據，依照分箱重新計算運費 (最準確)
      if (boxes.length > 0) {
        boxes.forEach((box) => {
          const l = parseFloat(box.length) || 0;
          const w = parseFloat(box.width) || 0;
          const h = parseFloat(box.height) || 0;
          const weight = parseFloat(box.weight) || 0;
          const type = box.type || "general";
          const rateInfo = CATEGORIES[type] || { weightRate: 0, volumeRate: 0 };

          // [修正] 檢查超規 (改為 >=)
          if (
            l >= CONSTANTS.OVERSIZED_LIMIT ||
            w >= CONSTANTS.OVERSIZED_LIMIT ||
            h >= CONSTANTS.OVERSIZED_LIMIT
          ) {
            hasOversized = true;
          }
          if (weight >= CONSTANTS.OVERWEIGHT_LIMIT) {
            hasOverweight = true;
          }

          // 計算單箱運費
          if (l > 0 && w > 0 && h > 0 && weight > 0) {
            // 材積 = (長x寬x高)/除數 (無條件進位)
            const cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
            totalVolumeDivisor += cai; // 累加總材積數，稍後換算 CBM 用於偏遠費

            // 材積費
            const volFee = cai * rateInfo.volumeRate;
            // 重量費 (小數點後一位進位)
            const wtFee = (Math.ceil(weight * 10) / 10) * rateInfo.weightRate;

            // 取大者累加到基本運費
            baseCost += Math.max(volFee, wtFee);
          }
        });
      } else {
        // 若無分箱數據 (舊資料)，回退使用資料庫儲存的費用
        baseCost += pkg.totalCalculatedFee || 0;
      }
    } catch (e) {
      console.error(`Error calculating package ${pkg.id}:`, e);
      // 出錯時的回退機制
      baseCost += pkg.totalCalculatedFee || 0;
    }
  });

  // 1. 低消判斷 (針對基本運費)
  // 若基本運費 < 低消，則以低消計算
  let finalBaseCost = baseCost;
  const isMinimumChargeApplied =
    baseCost > 0 && baseCost < CONSTANTS.MINIMUM_CHARGE;

  if (isMinimumChargeApplied) {
    finalBaseCost = CONSTANTS.MINIMUM_CHARGE;
  }

  // 2. 計算附加費 (整筆訂單一次性)
  const overweightFee = hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0;
  const oversizedFee = hasOversized ? CONSTANTS.OVERSIZED_FEE : 0;

  // 3. 計算偏遠費
  // Total CBM = Total Cai / Factor (保留兩位小數)
  const totalCbm = parseFloat(
    (totalVolumeDivisor / CONSTANTS.CBM_TO_CAI_FACTOR).toFixed(2)
  );
  const remoteFee = Math.round(totalCbm * (parseFloat(deliveryRate) || 0));

  // 4. 總費用公式
  const totalCost = finalBaseCost + remoteFee + overweightFee + oversizedFee;

  return {
    totalCost,
    baseCost: finalBaseCost, // 最終基本運費 (含低消補足)
    originalBaseCost: baseCost, // 原始運費 (用於前端顯示補了多少錢)
    remoteFee,
    totalCbm,
    overweightFee,
    oversizedFee,
    isMinimumChargeApplied,
    hasOversized,
    hasOverweight,
  };
};

/**
 * @description 預估集運單費用 (不建立訂單)
 * @route POST /api/shipments/preview
 */
const previewShipmentCost = async (req, res) => {
  try {
    let { packageIds, deliveryLocationRate } = req.body;
    const userId = req.user.id;

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({ success: false, message: "請選擇包裹" });
    }

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length) {
      return res.status(400).json({
        success: false,
        message: "包含無效包裹 (可能狀態已變更)",
      });
    }

    const systemRates = await ratesManager.getRates();
    // 使用共用函式計算
    const result = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    res.status(200).json({
      success: true,
      preview: result,
    });
  } catch (error) {
    console.error("預估運費失敗:", error);
    res.status(500).json({ success: false, message: "預估失敗" });
  }
};

/**
 * @description 建立新的集運單 (合併包裹)
 * @route POST /api/shipments/create
 */
const createShipment = async (req, res) => {
  try {
    let {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      taxId,
      invoiceTitle,
      note,
      deliveryLocationRate,
      productUrl,
    } = req.body;

    const userId = req.user.id;

    // 處理上傳檔案
    const files = req.files || [];
    if ((!productUrl || productUrl.trim() === "") && files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "請提供「商品購買連結」或上傳「商品照片」才能提交訂單",
      });
    }
    let shipmentImagePaths = "[]";
    if (files.length > 0) {
      const paths = files.map((file) => `/uploads/${file.filename}`);
      shipmentImagePaths = JSON.stringify(paths);
    }

    // 解析 packageIds
    try {
      if (typeof packageIds === "string") {
        packageIds = JSON.parse(packageIds);
      }
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "包裹 ID 格式錯誤" });
    }

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "請至少選擇一個包裹" });
    }

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length) {
      return res.status(400).json({
        success: false,
        message:
          '包含無效的包裹 (可能：非本人、狀態不是 "ARRIVED"、或已被集運)',
      });
    }

    // 使用共用函式計算最終費用 (確保與預覽一致)
    const systemRates = await ratesManager.getRates();
    const calcResult = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    const newShipment = await prisma.$transaction(async (tx) => {
      const createdShipment = await tx.shipment.create({
        data: {
          recipientName,
          phone,
          shippingAddress,
          idNumber,
          taxId: taxId || null,
          invoiceTitle: invoiceTitle || null,
          note: note || null,
          totalCost: calcResult.totalCost, // 使用重新計算的總金額
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: "PENDING_PAYMENT",
          userId: userId,
          productUrl: productUrl || null,
          shipmentProductImages: shipmentImagePaths,
        },
      });

      await tx.package.updateMany({
        where: { id: { in: packageIds } },
        data: {
          status: "IN_SHIPMENT",
          shipmentId: createdShipment.id,
        },
      });

      return createdShipment;
    });

    try {
      await sendNewShipmentNotification(newShipment, req.user);
    } catch (emailError) {
      console.warn("Email 通知發送失敗:", emailError);
    }

    res.status(201).json({
      success: true,
      message: "集運單建立成功！",
      shipment: newShipment,
    });
  } catch (error) {
    console.error("建立集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const getMyShipments = async (req, res) => {
  try {
    const userId = req.user.id;
    const shipments = await prisma.shipment.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        packages: {
          select: {
            id: true,
            productName: true,
            trackingNumber: true,
            arrivedBoxesJson: true,
            totalCalculatedFee: true,
            warehouseImages: true,
          },
        },
      },
    });

    const processedShipments = shipments.map((ship) => ({
      ...ship,
      additionalServices: JSON.parse(ship.additionalServices || "{}"),
      packages: ship.packages.map((pkg) => ({
        ...pkg,
        warehouseImages: JSON.parse(pkg.warehouseImages || "[]"),
        arrivedBoxes: JSON.parse(pkg.arrivedBoxesJson || "[]"),
      })),
    }));

    res.status(200).json({
      success: true,
      count: processedShipments.length,
      shipments: processedShipments,
    });
  } catch (error) {
    console.error("查詢集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const uploadPaymentProof = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "請選擇一張圖片上傳" });
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

    const imagePath = `/uploads/${req.file.filename}`;

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: { paymentProof: imagePath },
    });

    res.status(200).json({
      success: true,
      message: "付款憑證上傳成功",
      shipment: updatedShipment,
    });
  } catch (error) {
    console.error("上傳憑證失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isAdmin =
      user.permissions && user.permissions.includes("CAN_MANAGE_SHIPMENTS");

    const whereCondition = { id: id };
    if (!isAdmin) {
      whereCondition.userId = user.id;
    }

    const shipment = await prisma.shipment.findFirst({
      where: whereCondition,
      include: {
        user: { select: { email: true, name: true } },
        packages: true,
      },
    });

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此集運單或無權限查看" });
    }

    const processedPackages = shipment.packages.map((pkg) => {
      let productImages = [];
      let warehouseImages = [];
      let arrivedBoxes = [];
      try {
        productImages = JSON.parse(pkg.productImages || "[]");
      } catch (e) {}
      try {
        warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
      } catch (e) {}
      try {
        arrivedBoxes = JSON.parse(pkg.arrivedBoxesJson || "[]");
      } catch (e) {}

      return {
        ...pkg,
        productImages,
        warehouseImages,
        arrivedBoxes,
        arrivedBoxesJson: undefined,
      };
    });

    let shipmentProductImages = [];
    try {
      shipmentProductImages = JSON.parse(
        shipment.shipmentProductImages || "[]"
      );
    } catch (e) {}

    const processedShipment = {
      ...shipment,
      packages: processedPackages,
      additionalServices: JSON.parse(shipment.additionalServices || "{}"),
      shipmentProductImages: shipmentProductImages,
    };

    res.status(200).json({ success: true, shipment: processedShipment });
  } catch (error) {
    console.error("取得集運單詳情失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const deleteMyShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

    if (shipment.status !== "PENDING_PAYMENT") {
      return res
        .status(400)
        .json({ success: false, message: "只能取消「待付款」狀態的訂單" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id: id } });
    });

    res.status(200).json({
      success: true,
      message: "訂單已取消，包裹已釋放回「已入庫」列表",
    });
  } catch (error) {
    console.error("取消集運單失敗:", error);
    res.status(500).json({ success: false, message: "取消失敗" });
  }
};

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
  previewShipmentCost,
};
