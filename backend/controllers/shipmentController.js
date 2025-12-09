// backend/controllers/shipmentController.js
// V2025.Debug.Full - Added Detailed Logs for TaxID/InvoiceTitle Troubleshooting

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");
const invoiceHelper = require("../utils/invoiceHelper.js");
const createLog = require("../utils/createLog.js");
const { deleteFiles } = require("../utils/adminHelpers.js");
const fs = require("fs"); // 引入 fs 供刪檔使用

// --- 輔助計算函式 ---
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
      carrierType,
      carrierId,
      note,
      deliveryLocationRate,
      additionalServices,
      paymentMethod,
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

    let shipmentStatus = "PENDING_PAYMENT";
    if (isWalletPay) {
      shipmentStatus = "PROCESSING";
    }

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

      const createdShipment = await tx.shipment.create({
        data: {
          recipientName,
          phone,
          shippingAddress,
          idNumber,
          taxId: null,
          invoiceTitle: null,
          carrierType: carrierType || null,
          carrierId: carrierId || null,
          note: note || null,
          additionalServices: finalAdditionalServices,
          totalCost: calcResult.totalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: shipmentStatus,
          userId: userId,
          productUrl: null,
          shipmentProductImages: shipmentImagePaths,
          transactionId: txRecord ? txRecord.id : null,
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

// [Critical Fix] 上傳憑證 (含統編) - 加入詳細 Debug Log
const uploadPaymentProof = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // --- DEBUG LOG START ---
    console.log(`\n=== [UploadProof Debug] Start ===`);
    console.log(`User: ${userId}, Shipment: ${id}`);

    // 檢查 req.body 是否有收到文字欄位
    // 注意：如果是 Multer 解析問題，這裡可能看不到 taxId
    console.log(`Req.Body Content:`, JSON.stringify(req.body, null, 2));

    // 檢查檔案是否成功接收
    if (req.file) {
      console.log(`Req.File: ${req.file.filename} (${req.file.mimetype})`);
    } else {
      console.log(`Req.File: MISSING`);
    }
    // --- DEBUG LOG END ---

    if (!req.file)
      return res.status(400).json({ success: false, message: "請選擇圖片" });

    // 從 req.body 讀取，並移除多餘空白
    const taxId = req.body.taxId ? req.body.taxId.trim() : "";
    const invoiceTitle = req.body.invoiceTitle
      ? req.body.invoiceTitle.trim()
      : "";

    console.log(`Parsed TaxId: "${taxId}"`);
    console.log(`Parsed InvoiceTitle: "${invoiceTitle}"`);

    // [Backend Validation] 統編與抬頭的一致性檢查
    if (taxId && !invoiceTitle) {
      console.log(
        `[UploadProof Error] TaxId provided but InvoiceTitle missing.`
      );
      // 驗證失敗：立即刪除已上傳的暫存檔案
      fs.unlink(req.file.path, (err) => {
        if (err) console.warn("刪除暫存檔案失敗:", err.message);
      });

      return res.status(400).json({
        success: false,
        message: "填寫統一編號時，公司抬頭為必填項目",
      });
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });
    if (!shipment) {
      fs.unlink(req.file.path, () => {});
      console.log(
        `[UploadProof Error] Shipment not found or not owned by user.`
      );
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

    const updateData = {
      paymentProof: `/uploads/${req.file.filename}`,
    };

    // [Data Sync] 將資料寫入 updateData
    // 這裡使用明確的條件判斷，確保非 undefined/null 才會寫入
    if (taxId) updateData.taxId = taxId;
    if (invoiceTitle) updateData.invoiceTitle = invoiceTitle;

    // --- DEBUG LOG: 確認最終寫入 DB 的資料 ---
    console.log(
      `Executing Prisma Update with data:`,
      JSON.stringify(updateData, null, 2)
    );

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: updateData,
    });

    console.log(`=== [UploadProof Debug] Success ===\n`);

    res
      .status(200)
      .json({ success: true, message: "上傳成功", shipment: updatedShipment });
  } catch (error) {
    console.error(`=== [UploadProof Error] Exception ===`);
    console.error(error);
    // 發生未知錯誤時也要嘗試刪除檔案
    if (req.file) fs.unlink(req.file.path, () => {});
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
