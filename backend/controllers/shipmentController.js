// backend/controllers/shipmentController.js
// V13.0 - 支援錢包扣款 (Wallet Payment) 與自動轉單

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");
const invoiceHelper = require("../utils/invoiceHelper.js");
const createLog = require("../utils/createLog.js");

// --- 運費計算邏輯 (保持原樣) ---
const calculateShipmentDetails = (packages, rates, deliveryRate) => {
  const CONSTANTS = rates.constants;
  const CATEGORIES = rates.categories;

  let baseCost = 0;
  let totalVolumeDivisor = 0;
  let hasOversized = false;
  let hasOverweight = false;

  packages.forEach((pkg) => {
    try {
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
      baseCost += pkg.totalCalculatedFee || 0;
    }
  });

  let finalBaseCost = baseCost;
  const isMinimumChargeApplied =
    baseCost > 0 && baseCost < CONSTANTS.MINIMUM_CHARGE;
  if (isMinimumChargeApplied) finalBaseCost = CONSTANTS.MINIMUM_CHARGE;

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
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0)
      return res.status(400).json({ success: false, message: "請選擇包裹" });

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length)
      return res.status(400).json({ success: false, message: "包含無效包裹" });

    const systemRates = await ratesManager.getRates();
    const result = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );
    res.status(200).json({ success: true, preview: result });
  } catch (error) {
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
      paymentMethod, // [New] 付款方式: 'TRANSFER' (預設) 或 'WALLET'
    } = req.body;
    const userId = req.user.id;
    const files = req.files || [];

    // 若選擇錢包支付，商品證明是選填；若轉帳，則需上傳圖片或連結
    const isWalletPay = paymentMethod === "WALLET";

    if (
      !isWalletPay &&
      (!productUrl || productUrl.trim() === "") &&
      files.length === 0
    ) {
      return res
        .status(400)
        .json({ success: false, message: "請提供商品證明(連結或截圖)" });
    }

    let shipmentImagePaths = [];
    if (files.length > 0)
      shipmentImagePaths = files.map((file) => `/uploads/${file.filename}`);

    try {
      if (typeof packageIds === "string") packageIds = JSON.parse(packageIds);
    } catch (e) {}

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0)
      return res.status(400).json({ success: false, message: "請選擇包裹" });

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length)
      return res.status(400).json({ success: false, message: "包含無效包裹" });

    const systemRates = await ratesManager.getRates();
    const calcResult = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    let finalAdditionalServices = {};
    if (additionalServices) {
      try {
        finalAdditionalServices =
          typeof additionalServices === "string"
            ? JSON.parse(additionalServices)
            : additionalServices;
      } catch (e) {}
    }

    // ----------------------------------------------------
    // [New] 錢包扣款邏輯
    // ----------------------------------------------------
    let shipmentStatus = "PENDING_PAYMENT";

    if (isWalletPay) {
      // 1. 檢查餘額是否足夠
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < calcResult.totalCost) {
        return res
          .status(400)
          .json({
            success: false,
            message: "錢包餘額不足，請先儲值或選擇轉帳付款。",
          });
      }
      // 2. 設定初始狀態為處理中 (已付款)
      shipmentStatus = "PROCESSING";
    }

    // 使用 Transaction 確保扣款與訂單建立的一致性
    const newShipment = await prisma.$transaction(async (tx) => {
      let txRecord = null;

      // 若為錢包支付，執行扣款與建立交易紀錄
      if (isWalletPay) {
        await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: calcResult.totalCost } },
        });

        txRecord = await tx.transaction.create({
          data: {
            wallet: { connect: { userId } },
            amount: -calcResult.totalCost, // 負數代表扣款
            type: "PAYMENT",
            status: "COMPLETED",
            description: "支付運費",
          },
        });
      }

      const createdShipment = await tx.shipment.create({
        data: {
          recipientName,
          phone,
          shippingAddress,
          idNumber,
          taxId: taxId || null,
          invoiceTitle: invoiceTitle || null,
          note: note || null,
          additionalServices: finalAdditionalServices,
          totalCost: calcResult.totalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: shipmentStatus,
          userId: userId,
          productUrl: productUrl || null,
          shipmentProductImages: shipmentImagePaths,
          // 關聯交易紀錄 (若有)
          transactionId: txRecord ? txRecord.id : null,
          // 標記付款憑證欄位 (錢包支付則填寫標記，避免前端顯示未上傳)
          paymentProof: isWalletPay ? "WALLET_PAY" : null,
        },
      });

      await tx.package.updateMany({
        where: { id: { in: packageIds } },
        data: { status: "IN_SHIPMENT", shipmentId: createdShipment.id },
      });

      return createdShipment;
    });

    try {
      await sendNewShipmentNotification(newShipment, req.user);
    } catch (e) {}

    res.status(201).json({
      success: true,
      message: isWalletPay
        ? "扣款成功！訂單已成立並開始處理。"
        : "集運單建立成功！請儘速完成轉帳。",
      shipment: newShipment,
    });
  } catch (error) {
    console.error("建立訂單錯誤:", error);
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
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const uploadPaymentProof = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!req.file)
      return res.status(400).json({ success: false, message: "請選擇圖片" });

    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });
    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到集運單" });

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: { paymentProof: `/uploads/${req.file.filename}` },
    });
    res
      .status(200)
      .json({ success: true, message: "上傳成功", shipment: updatedShipment });
  } catch (error) {
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
    if (!isAdmin) whereCondition.userId = user.id;

    const shipment = await prisma.shipment.findFirst({
      where: whereCondition,
      include: {
        user: { select: { email: true, name: true } },
        packages: true,
      },
    });

    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到集運單" });

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
    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到集運單" });
    if (shipment.status !== "PENDING_PAYMENT")
      return res
        .status(400)
        .json({ success: false, message: "只能取消待付款訂單" });

    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id: id } });
    });
    res.status(200).json({ success: true, message: "訂單已取消" });
  } catch (error) {
    res.status(500).json({ success: false, message: "取消失敗" });
  }
};

/**
 * [NEW] 手動開立發票
 */
const manualIssueInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!shipment) return res.status(404).json({ message: "找不到訂單" });
    if (shipment.invoiceNumber && shipment.invoiceStatus !== "VOID") {
      return res
        .status(400)
        .json({ message: "此訂單已開立發票，不可重複開立" });
    }

    const result = await invoiceHelper.createInvoice(shipment, shipment.user);

    if (result.success) {
      await prisma.shipment.update({
        where: { id },
        data: {
          invoiceNumber: result.invoiceNumber,
          invoiceDate: result.invoiceDate,
          invoiceRandomCode: result.randomCode,
          invoiceStatus: "ISSUED",
        },
      });
      await createLog(
        req.user.id,
        "INVOICE_ISSUE",
        id,
        `手動開立發票: ${result.invoiceNumber}`
      );
      res.json({
        success: true,
        message: "發票開立成功",
        invoiceNumber: result.invoiceNumber,
      });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "系統錯誤" });
  }
};

/**
 * [NEW] 手動作廢發票
 */
const manualVoidInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const shipment = await prisma.shipment.findUnique({ where: { id } });

    if (!shipment || !shipment.invoiceNumber)
      return res.status(400).json({ message: "此訂單尚未開立發票" });
    if (shipment.invoiceStatus === "VOID")
      return res.status(400).json({ message: "發票已作廢" });

    const result = await invoiceHelper.voidInvoice(
      shipment.invoiceNumber,
      reason
    );

    if (result.success) {
      await prisma.shipment.update({
        where: { id },
        data: { invoiceStatus: "VOID" },
      });
      await createLog(
        req.user.id,
        "INVOICE_VOID",
        id,
        `作廢發票: ${shipment.invoiceNumber}`
      );
      res.json({ success: true, message: "發票已成功作廢" });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "系統錯誤" });
  }
};

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
  previewShipmentCost,
  manualIssueInvoice,
  manualVoidInvoice,
};
