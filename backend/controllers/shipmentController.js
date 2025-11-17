// 這是 backend/controllers/shipmentController.js (V7 - 整合偏遠地區運費計算)
// (修正：補上「超重費」和「超長費」的計算邏輯)
// (V7 修正：補上「偏遠地區費」的計算邏輯)

const prisma = require("../config/db.js");

// [*** 修正：從 calculatorController.js 引入規則 ***]
const MINIMUM_CHARGE = 2000; // 集運低消
const OVERSIZED_LIMIT = 300;
const OVERSIZED_FEE = 800;
const OVERWEIGHT_LIMIT = 100;
const OVERWEIGHT_FEE = 800;
// [!!! V7 新增：計算 CBM 用的常數 !!!]
const VOLUME_DIVISOR = 28317;
const CBM_TO_CAI_FACTOR = 35.3;
// [*** 修正結束 ***]

/**
 * @description 建立新的集運單 (合併包裹)
 * @route       POST /api/shipments/create
 * @access      Private
 */
const createShipment = async (req, res) => {
  try {
    // 1. [!!! V7 修正：取得新欄位 !!!]
    const {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      taxId,
      note,
      deliveryLocationRate, // <-- [!!! V7 新增 !!!]
    } = req.body;

    const userId = req.user.id;

    // 2. 驗證 (保持不變)
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
    // [!!! V7 新增：驗證 deliveryLocationRate !!!]
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

    // 3. [*** V7 關鍵修正：計算總運費 (包含附加費 + 偏遠地區費) ***]

    // (A) 累加所有包裹的 "基本運費"
    const calculatedTotalCost = packagesToShip.reduce((sum, pkg) => {
      return sum + (pkg.totalCalculatedFee || 0);
    }, 0);

    // (B) 檢查是否觸發 "附加費" + [!!! V7 新增：計算總材積 !!!]
    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;
    let totalShipmentVolume = 0; // [!!! V7 新增 !!!]

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

          // [!!! V7 新增：累加總材積 !!!]
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

    const totalOverweightFee = hasAnyOverweightItem ? OVERWEIGHT_FEE : 0;
    const totalOversizedFee = hasAnyOversizedItem ? OVERSIZED_FEE : 0;

    // [!!! V7 新增：計算偏遠地區費 !!!]
    const totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
    const remoteFee = Math.round(
      totalCbm * (parseFloat(deliveryLocationRate) || 0)
    );

    // (C) 套用 "低消" 邏輯
    let finalBaseCost = calculatedTotalCost;
    if (finalBaseCost > 0 && finalBaseCost < MINIMUM_CHARGE) {
      finalBaseCost = MINIMUM_CHARGE;
    }

    // (D) [!!! V7 修正：計算最終總金額 !!!]
    const finalTotalCost =
      finalBaseCost + totalOverweightFee + totalOversizedFee + remoteFee;

    // [*** 修正結束 ***]

    // 4. 使用資料庫「交易」建立集運單
    const newShipment = await prisma.$transaction(async (tx) => {
      // A. 建立集運單
      const createdShipment = await tx.shipment.create({
        data: {
          recipientName: recipientName,
          phone: phone,
          shippingAddress: shippingAddress, // [!!! V7 修正 !!!] 這裡已是組合好的完整地址
          idNumber: idNumber,
          taxId: taxId || null,
          note: note || null,

          // [!!! V7 修正 !!!] 寫入 "最終總金額" 和 "費率"
          totalCost: finalTotalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0, // <-- [!!! V7 新增 !!!]

          status: "PENDING_PAYMENT",
          userId: userId,
        },
      });

      // B. 更新所有被選中包裹的狀態 (不變)
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

    // 5. 回傳成功訊息
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

// (保留骨架)
const getShipmentById = (req, res) => {
  res.json({ message: "OK, getShipmentById (尚未實作)" });
};

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
};
