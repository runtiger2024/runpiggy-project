// backend/controllers/shipmentController.js
// V2025.Optimized.1 - Added Tax ID Validation for Proof Upload

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");
const invoiceHelper = require("../utils/invoiceHelper.js");
const createLog = require("../utils/createLog.js");
const { deleteFiles } = require("../utils/adminHelpers.js");

// ... (calculateShipmentDetails 保持不變)
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
      // taxId, // [Removed] - 客戶建立時不輸入，改為上傳憑證時輸入
      // invoiceTitle, // [Removed]
      carrierType,
      carrierId,
      note,
      deliveryLocationRate,
      // productUrl, // [Removed]
      additionalServices,
      paymentMethod, // 'TRANSFER' or 'WALLET'
    } = req.body;
    const userId = req.user.id;
    const files = req.files || [];

    const isWalletPay = paymentMethod === "WALLET";

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

    // 初始狀態
    let shipmentStatus = "PENDING_PAYMENT";
    if (isWalletPay) {
      shipmentStatus = "PROCESSING";
    }

    // 使用 Transaction 確保扣款原子性
    const newShipment = await prisma.$transaction(async (tx) => {
      let txRecord = null;

      if (isWalletPay) {
        try {
          await tx.wallet.update({
            where: {
              userId: userId,
              balance: { gte: calcResult.totalCost },
            },
            data: {
              balance: { decrement: calcResult.totalCost },
            },
          });
        } catch (err) {
          throw new Error("錢包餘額不足，扣款失敗");
        }

        // 建立交易紀錄
        txRecord = await tx.transaction.create({
          data: {
            wallet: { connect: { userId } },
            amount: -calcResult.totalCost,
            type: "PAYMENT",
            status: "COMPLETED",
            description: "支付運費 (訂單建立)",
          },
        });
      }

      // 建立訂單
      const createdShipment = await tx.shipment.create({
        data: {
          recipientName,
          phone,
          shippingAddress,
          idNumber,
          taxId: null, // [Hardcoded Null] 已移除前端輸入
          invoiceTitle: null, // [Hardcoded Null] 已移除前端輸入
          carrierType: carrierType || null,
          carrierId: carrierId || null,
          note: note || null,
          additionalServices: finalAdditionalServices,
          totalCost: calcResult.totalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: shipmentStatus,
          userId: userId,
          productUrl: null, // [Hardcoded Null]
          shipmentProductImages: shipmentImagePaths, // 雖然欄位還在，但前端已不傳送
          transactionId: txRecord ? txRecord.id : null,
          paymentProof: isWalletPay ? "WALLET_PAY" : null,
        },
      });

      // 更新包裹狀態
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
    console.error("建立訂單錯誤:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "建立失敗" });
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
    const { taxId, invoiceTitle } = req.body;

    if (!req.file)
      return res.status(400).json({ success: false, message: "請選擇圖片" });

    // [Validation] 統編與抬頭的一致性檢查
    if (
      taxId &&
      taxId.trim() !== "" &&
      (!invoiceTitle || invoiceTitle.trim() === "")
    ) {
      // 刪除已上傳的暫存檔案避免佔用
      const fs = require("fs");
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        success: false,
        message: "填寫統一編號時，公司抬頭為必填項目",
      });
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });
    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到集運單" });

    const updateData = {
      paymentProof: `/uploads/${req.file.filename}`,
    };

    // [Sync] 將客戶填寫的資料寫入資料庫，後台即可見
    if (taxId !== undefined) updateData.taxId = taxId;
    if (invoiceTitle !== undefined) updateData.invoiceTitle = invoiceTitle;

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: updateData,
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
      user.permissions &&
      (user.permissions.includes("CAN_MANAGE_SHIPMENTS") ||
        user.permissions.includes("SHIPMENT_VIEW"));

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

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
  previewShipmentCost,
};
