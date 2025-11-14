// 這是 backend/controllers/shipmentController.js (支援分箱的修改版)

const prisma = require("../config/db.js");

/**
 * @description 建立新的集運單 (合併包裹)
 * @route       POST /api/shipments/create
 * @access      Private
 */
const createShipment = async (req, res) => {
  try {
    // 1. 從前端取得資訊
    const {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      taxId,
      note, // [新增] 接收備註
      // additionalServices (前端已移除，這裡可忽略或保留接收)
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

    // 2. 驗證包裹並撈取資料 (為了計算運費)
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

    // 3. [*** 修改重點 ***] 自動計算總運費
    // 累加每個包裹的 totalCalculatedFee，如果為 null 則視為 0 (代表未報價)
    const calculatedTotalCost = packagesToShip.reduce((sum, pkg) => {
      return sum + (pkg.totalCalculatedFee || 0); // <-- 改用這個欄位
    }, 0);

    // 4. 使用資料庫「交易」建立集運單
    const newShipment = await prisma.$transaction(async (tx) => {
      // A. 建立集運單
      const createdShipment = await tx.shipment.create({
        data: {
          recipientName: recipientName,
          phone: phone,
          shippingAddress: shippingAddress,
          idNumber: idNumber,
          taxId: taxId || null,
          note: note || null, // [新增] 存入備註

          // [關鍵] 直接寫入計算好的總金額
          totalCost: calculatedTotalCost,

          status: "PENDING_PAYMENT",
          userId: userId,
        },
      });

      // B. 更新所有被選中包裹的狀態
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

            // [修改] 舊的欄位已不存在，改撈新的
            // actualWeight: true,
            // actualLength: true,
            // actualWidth: true,
            // actualHeight: true,
            // shippingFee: true,
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
        // [新增] 也解析分箱
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

    // 1. 檢查是否有檔案
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "請選擇一張圖片上傳" });
    }

    // 2. 確認該集運單屬於該用戶
    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

    // 3. 更新資料庫
    const imagePath = `/uploads/${req.file.filename}`;

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: {
        paymentProof: imagePath,
        // 可選：上傳憑證後，自動將狀態改為 "PROCESSING" (處理中/已付款待確認)
        // status: "PROCESSING"
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
  uploadPaymentProof, // [新增]
};
