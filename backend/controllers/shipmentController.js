// backend/controllers/shipmentController.js
// V11.0 - Native Json Support

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");

const calculateShipmentDetails = (packages, rates, deliveryRate) => {
  const CONSTANTS = rates.constants;
  const CATEGORIES = rates.categories;

  let baseCost = 0;
  let totalVolumeDivisor = 0;
  let hasOversized = false;
  let hasOverweight = false;

  packages.forEach((pkg) => {
    try {
      // [修改] 直接讀取 DB Json 物件
      const boxes = pkg.arrivedBoxesJson || [];

      if (boxes.length > 0) {
        boxes.forEach((box) => {
          const l = parseFloat(box.length) || 0;
          const w = parseFloat(box.width) || 0;
          const h = parseFloat(box.height) || 0;
          const weight = parseFloat(box.weight) || 0;
          const type = box.type || "general";
          const rateInfo = CATEGORIES[type] || { weightRate: 0, volumeRate: 0 };

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

          if (l > 0 && w > 0 && h > 0 && weight > 0) {
            const cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
            totalVolumeDivisor += cai;

            const volFee = cai * rateInfo.volumeRate;
            const wtFee = (Math.ceil(weight * 10) / 10) * rateInfo.weightRate;

            baseCost += Math.max(volFee, wtFee);
          }
        });
      } else {
        baseCost += pkg.totalCalculatedFee || 0;
      }
    } catch (e) {
      console.error(`Error calculating package ${pkg.id}:`, e);
      baseCost += pkg.totalCalculatedFee || 0;
    }
  });

  let finalBaseCost = baseCost;
  const isMinimumChargeApplied =
    baseCost > 0 && baseCost < CONSTANTS.MINIMUM_CHARGE;

  if (isMinimumChargeApplied) {
    finalBaseCost = CONSTANTS.MINIMUM_CHARGE;
  }

  const overweightFee = hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0;
  const oversizedFee = hasOversized ? CONSTANTS.OVERSIZED_FEE : 0;

  const totalCbm = parseFloat(
    (totalVolumeDivisor / CONSTANTS.CBM_TO_CAI_FACTOR).toFixed(2)
  );
  const remoteFee = Math.round(totalCbm * (parseFloat(deliveryRate) || 0));

  const totalCost = finalBaseCost + remoteFee + overweightFee + oversizedFee;

  return {
    totalCost,
    baseCost: finalBaseCost,
    originalBaseCost: baseCost,
    remoteFee,
    totalCbm,
    overweightFee,
    oversizedFee,
    isMinimumChargeApplied,
    hasOversized,
    hasOverweight,
  };
};

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
      additionalServices,
    } = req.body;

    const userId = req.user.id;

    const files = req.files || [];
    if ((!productUrl || productUrl.trim() === "") && files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "請提供「商品購買連結」或上傳「商品照片」才能提交訂單",
      });
    }
    // [修改] 路徑陣列
    let shipmentImagePaths = [];
    if (files.length > 0) {
      shipmentImagePaths = files.map((file) => `/uploads/${file.filename}`);
    }

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

    const systemRates = await ratesManager.getRates();
    const calcResult = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    // [修改] 解析 additionalServices 字串 (來自 FormData)
    let finalAdditionalServices = {};
    if (additionalServices) {
      try {
        finalAdditionalServices =
          typeof additionalServices === "string"
            ? JSON.parse(additionalServices)
            : additionalServices;
      } catch (e) {
        console.warn("Parse additionalServices failed", e);
      }
    }

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
          // [修改] 存入物件
          additionalServices: finalAdditionalServices,
          totalCost: calcResult.totalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: "PENDING_PAYMENT",
          userId: userId,
          productUrl: productUrl || null,
          // [修改] 存入陣列
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

    // [修改] 移除 JSON.parse，直接映射資料
    const processedShipments = shipments.map((ship) => ({
      ...ship,
      additionalServices: ship.additionalServices || {},
      packages: ship.packages.map((pkg) => ({
        ...pkg,
        warehouseImages: pkg.warehouseImages || [],
        arrivedBoxes: pkg.arrivedBoxesJson || [],
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

    // [修改] 直接讀取
    const processedPackages = shipment.packages.map((pkg) => ({
      ...pkg,
      productImages: pkg.productImages || [],
      warehouseImages: pkg.warehouseImages || [],
      arrivedBoxes: pkg.arrivedBoxesJson || [],
      arrivedBoxesJson: undefined,
    }));

    const processedShipment = {
      ...shipment,
      packages: processedPackages,
      additionalServices: shipment.additionalServices || {},
      shipmentProductImages: shipment.shipmentProductImages || [],
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
