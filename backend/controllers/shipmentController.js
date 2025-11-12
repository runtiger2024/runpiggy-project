// 這是 shipmentController.js (升級版)

const prisma = require("../config/db.js");

/**
 * @description 建立新的集運單 (合併包裹)
 * @route       POST /api/shipments/create
 * @access      Private
 */
const createShipment = async (req, res) => {
  try {
    // 1. 從前端取得 "所有" 資訊
    const {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      taxId,
      additionalServices, // <-- (新) 接收附加服務
    } = req.body;

    const userId = req.user.id;

    // 驗證
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "請至少選擇一個包裹" });
    }
    if (!shippingAddress || !recipientName || !phone || !idNumber) {
      return res
        .status(400)
        .json({
          success: false,
          message: "請提供完整的收件人姓名、電話、地址 和 身分證字號",
        });
    }

    // 2. 驗證包裹
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

    // 4. 使用資料庫「交易」
    const newShipment = await prisma.$transaction(async (tx) => {
      // A. 建立一張新的集運單 (加入新欄位)
      const createdShipment = await tx.shipment.create({
        data: {
          recipientName: recipientName,
          phone: phone,
          shippingAddress: shippingAddress,
          idNumber: idNumber,
          taxId: taxId || null,

          // (新) 將物件轉為 JSON 字串儲存
          additionalServices: additionalServices
            ? JSON.stringify(additionalServices)
            : null,

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
            // (新) 把倉庫回填的資料也傳給會員
            actualWeight: true,
            actualLength: true,
            actualWidth: true,
            actualHeight: true,
            warehouseImages: true,
          },
        },
      },
    });

    // (新) 解析附加服務和包裹圖片
    const processedShipments = shipments.map((ship) => ({
      ...ship,
      additionalServices: JSON.parse(ship.additionalServices || "{}"),
      packages: ship.packages.map((pkg) => ({
        ...pkg,
        warehouseImages: JSON.parse(pkg.warehouseImages || "[]"),
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

// (保留骨架)
const getShipmentById = (req, res) => {
  res.json({ message: "OK, getShipmentById (尚未實作)" });
};

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
};
