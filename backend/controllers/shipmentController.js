// backend/controllers/shipmentController.js (V8 完整版 - 支援 ratesManager 與 取消訂單)

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js"); // [V8 新增]

/**
 * @description 建立新的集運單 (合併包裹)
 * @route POST /api/shipments/create
 */
const createShipment = async (req, res) => {
  try {
    const {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      taxId,
      note,
      deliveryLocationRate,
    } = req.body;

    const userId = req.user.id;

    // 驗證輸入
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "請至少選擇一個包裹" });
    }
    if (!shippingAddress || !recipientName || !phone || !idNumber) {
      return res.status(400).json({
        success: false,
        message: "請提供完整的收件人姓名、電話、地址 和 身分證字號",
      });
    }
    if (deliveryLocationRate === undefined || deliveryLocationRate === null) {
      return res.status(400).json({
        success: false,
        message: "請提供配送地區費率 (deliveryLocationRate)",
      });
    }

    // 查詢包裹
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

    // [V8 修改] 使用 ratesManager 讀取動態常數
    const systemRates = ratesManager.getRates();
    const CONSTANTS = systemRates.constants;

    // 計算總運費
    const calculatedTotalFee = packagesToShip.reduce((sum, pkg) => {
      return sum + (pkg.totalCalculatedFee || 0);
    }, 0);

    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;
    let totalShipmentVolume = 0;

    // 遍歷包裹計算附加費與總材積
    packagesToShip.forEach((pkg) => {
      try {
        const boxes = JSON.parse(pkg.arrivedBoxesJson || "[]");
        boxes.forEach((box) => {
          const length = parseFloat(box.length) || 0;
          const width = parseFloat(box.width) || 0;
          const height = parseFloat(box.height) || 0;
          const weight = parseFloat(box.weight) || 0;

          if (
            length > CONSTANTS.OVERSIZED_LIMIT ||
            width > CONSTANTS.OVERSIZED_LIMIT ||
            height > CONSTANTS.OVERSIZED_LIMIT
          ) {
            hasAnyOversizedItem = true;
          }
          if (weight > CONSTANTS.OVERWEIGHT_LIMIT) {
            hasAnyOverweightItem = true;
          }

          if (length > 0 && width > 0 && height > 0) {
            const singleVolume = Math.ceil(
              (length * width * height) / CONSTANTS.VOLUME_DIVISOR
            );
            totalShipmentVolume += singleVolume;
          }
        });
      } catch (e) {
        console.error(`解析包裹 ${pkg.id} 的 arrivedBoxesJson 失敗`, e);
      }
    });

    const totalOverweightFee = hasAnyOverweightItem
      ? CONSTANTS.OVERWEIGHT_FEE
      : 0;
    const totalOversizedFee = hasAnyOversizedItem ? CONSTANTS.OVERSIZED_FEE : 0;

    const totalCbm = totalShipmentVolume / CONSTANTS.CBM_TO_CAI_FACTOR;
    const remoteFee = Math.round(
      totalCbm * (parseFloat(deliveryLocationRate) || 0)
    );

    let finalBaseCost = calculatedTotalFee;
    if (finalBaseCost > 0 && finalBaseCost < CONSTANTS.MINIMUM_CHARGE) {
      finalBaseCost = CONSTANTS.MINIMUM_CHARGE;
    }

    const finalTotalCost =
      finalBaseCost + totalOverweightFee + totalOversizedFee + remoteFee;

    // 使用交易建立集運單
    const newShipment = await prisma.$transaction(async (tx) => {
      const createdShipment = await tx.shipment.create({
        data: {
          recipientName: recipientName,
          phone: phone,
          shippingAddress: shippingAddress,
          idNumber: idNumber,
          taxId: taxId || null,
          note: note || null,
          totalCost: finalTotalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: "PENDING_PAYMENT",
          userId: userId,
        },
      });

      await tx.package.updateMany({
        where: {
          id: { in: packageIds },
        },
        data: {
          status: "IN_SHIPMENT",
          shipmentId: createdShipment.id,
        },
      });

      return createdShipment;
    });

    // 發送通知
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

/**
 * @description 取得 "我" 的所有集運單
 * @route GET /api/shipments/my
 */
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

    // 解析 JSON 資料
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

/**
 * @description 客戶上傳付款憑證
 * @route PUT /api/shipments/:id/payment
 */
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
      data: {
        paymentProof: imagePath,
      },
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

/**
 * @description 取得單一集運單詳情 (支援 Admin 與 User)
 * @route GET /api/shipments/:id
 */
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

    const processedShipment = {
      ...shipment,
      packages: processedPackages,
      additionalServices: JSON.parse(shipment.additionalServices || "{}"),
    };

    res.status(200).json({
      success: true,
      shipment: processedShipment,
    });
  } catch (error) {
    console.error("取得集運單詳情失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description [V8 新增] 客戶自行取消/刪除待付款的集運單
 * @route DELETE /api/shipments/:id
 */
const deleteMyShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. 查詢訂單
    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

    // 2. 檢查狀態
    if (shipment.status !== "PENDING_PAYMENT") {
      return res
        .status(400)
        .json({ success: false, message: "只能取消「待付款」狀態的訂單" });
    }

    // 3. 使用 Transaction：釋放包裹並刪除訂單
    await prisma.$transaction(async (tx) => {
      // 釋放包裹回到 ARRIVED 狀態
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: {
          status: "ARRIVED",
          shipmentId: null,
        },
      });

      // 刪除集運單
      await tx.shipment.delete({
        where: { id: id },
      });
    });

    res
      .status(200)
      .json({
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
};
