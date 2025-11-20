// 這是 backend/controllers/shipmentController.js (V7.4 - 新增集運單詳情查詢)
// (V7 - 整合偏遠地區運費計算)
// (V7.1 修正：補上「超重費」和「超長費」的計算邏輯)
// (V7.2 修正：補上「偏遠地區費」的計算邏輯)
// (V7.3 修正：整合 SendGrid 通知)
// (V7.4 修正：實作 getShipmentById 用於列印/詳情，並支援 Admin 權限)

const prisma = require("../config/db.js");

// [V7.3 匯入 Email 函式]
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");

// [從 calculatorController.js 引入規則]
const MINIMUM_CHARGE = 2000; // 集運低消
const OVERSIZED_LIMIT = 300;
const OVERSIZED_FEE = 800;
const OVERWEIGHT_LIMIT = 100;
const OVERWEIGHT_FEE = 800;
// [V7 新增：計算 CBM 用的常數]
const VOLUME_DIVISOR = 28317;
const CBM_TO_CAI_FACTOR = 35.3;

/**
 * @description 建立新的集運單 (合併包裹)
 * @route       POST /api/shipments/create
 * @access      Private
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

    // 驗證
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

    // 計算總運費
    const calculatedTotalCost = packagesToShip.reduce((sum, pkg) => {
      return sum + (pkg.totalCalculatedFee || 0);
    }, 0);

    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;
    let totalShipmentVolume = 0;

    packagesToShip.forEach((pkg) => {
      try {
        const boxes = JSON.parse(pkg.arrivedBoxesJson || "[]");
        boxes.forEach((box) => {
          const length = parseFloat(box.length) || 0;
          const width = parseFloat(box.width) || 0;
          const height = parseFloat(box.height) || 0;
          const weight = parseFloat(box.weight) || 0;

          if (
            length > OVERSIZED_LIMIT ||
            width > OVERSIZED_LIMIT ||
            height > OVERSIZED_LIMIT
          ) {
            hasAnyOversizedItem = true;
          }
          if (weight > OVERWEIGHT_LIMIT) {
            hasAnyOverweightItem = true;
          }

          if (length > 0 && width > 0 && height > 0) {
            const singleVolume = Math.ceil(
              (length * width * height) / VOLUME_DIVISOR
            );
            totalShipmentVolume += singleVolume;
          }
        });
      } catch (e) {
        console.error(`解析包裹 ${pkg.id} 的 arrivedBoxesJson 失敗`, e);
      }
    });

    const totalOverweightFee = hasAnyOversizedItem ? OVERWEIGHT_FEE : 0;
    const totalOversizedFee = hasAnyOversizedItem ? OVERSIZED_FEE : 0;

    const totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
    const remoteFee = Math.round(
      totalCbm * (parseFloat(deliveryLocationRate) || 0)
    );

    let finalBaseCost = calculatedTotalCost;
    if (finalBaseCost > 0 && finalBaseCost < MINIMUM_CHARGE) {
      finalBaseCost = MINIMUM_CHARGE;
    }

    const finalTotalCost =
      finalBaseCost + totalOverweightFee + totalOversizedFee + remoteFee;

    // 使用資料庫「交易」建立集運單
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

    // 發送 Email 通知
    try {
      await sendNewShipmentNotification(newShipment, req.user);
    } catch (emailError) {
      console.warn(
        `[Non-critical] 訂單 ${newShipment.id} 建立成功，但 Email 通知發送失敗:`,
        emailError
      );
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
 * @access      Private
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
 * @description (新) 客戶上傳付款憑證
 * @route       PUT /api/shipments/:id/payment
 * @access      Private (User)
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
 * @description [V7.4 新增] 取得單一集運單詳情 (支援 Admin 與 User)
 * @route       GET /api/shipments/:id
 * @access      Private
 */
const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // 檢查是否擁有管理集運單的權限
    const isAdmin =
      user.permissions && user.permissions.includes("CAN_MANAGE_SHIPMENTS");

    const whereCondition = {
      id: id,
    };

    // 如果不是管理員 (User)，則強制只能查自己的單
    if (!isAdmin) {
      whereCondition.userId = user.id;
    }

    // 查詢集運單，並關聯包裹資料
    const shipment = await prisma.shipment.findFirst({
      where: whereCondition,
      include: {
        user: { select: { email: true, name: true } },
        packages: true, // 抓取關聯的包裹所有欄位 (包含圖片 JSON)
      },
    });

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此集運單或無權限查看" });
    }

    // 解析 JSON 欄位 (包裹圖片、分箱資訊)
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
        arrivedBoxesJson: undefined, // 移除原始 JSON 字串
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

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
};
