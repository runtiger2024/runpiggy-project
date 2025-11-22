// backend/controllers/adminController.js (V10 旗艦版 - 支援資料庫化系統設定)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const createLog = require("../utils/createLog.js");
const generateToken = require("../utils/generateToken.js");
const invoiceHelper = require("../utils/invoiceHelper.js");

// --- 0. 輔助函式：建立查詢條件 ---

const buildPackageWhereClause = (status, search) => {
  const where = {};
  if (status) {
    where.status = status;
  }
  if (search) {
    const searchLower = search.trim();
    where.OR = [
      { trackingNumber: { contains: searchLower, mode: "insensitive" } },
      { productName: { contains: searchLower, mode: "insensitive" } },
      { user: { email: { contains: searchLower, mode: "insensitive" } } },
      { user: { name: { contains: searchLower, mode: "insensitive" } } },
    ];
  }
  return where;
};

const buildShipmentWhereClause = (status, search) => {
  const where = {};
  if (status) {
    if (status === "PENDING_REVIEW") {
      where.status = "PENDING_PAYMENT";
      where.paymentProof = { not: null };
    } else if (status === "PENDING_PAYMENT") {
      where.status = "PENDING_PAYMENT";
      where.paymentProof = null;
    } else {
      where.status = status;
    }
  }
  if (search) {
    const searchLower = search.trim();
    where.OR = [
      { recipientName: { contains: searchLower, mode: "insensitive" } },
      { phone: { contains: searchLower, mode: "insensitive" } },
      { idNumber: { contains: searchLower, mode: "insensitive" } },
      { user: { email: { contains: searchLower, mode: "insensitive" } } },
      { user: { name: { contains: searchLower, mode: "insensitive" } } },
      { trackingNumberTW: { contains: searchLower, mode: "insensitive" } },
    ];
  }
  return where;
};

// --- 1. 系統設定管理 (System Settings) ---

/**
 * @description 取得所有系統設定
 * @route GET /api/admin/settings
 */
const getSystemSettings = async (req, res) => {
  try {
    const settingsList = await prisma.systemSetting.findMany();

    // 轉換為 Key-Value 物件格式回傳，方便前端使用
    const settings = {};
    settingsList.forEach((item) => {
      try {
        // 嘗試解析 JSON，如果是 JSON 字串就轉物件，否則維持字串
        settings[item.key] = JSON.parse(item.value);
      } catch (e) {
        settings[item.key] = item.value;
      }
    });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("取得系統設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 更新單一系統設定
 * @route PUT /api/admin/settings/:key
 */
const updateSystemSetting = async (req, res) => {
  try {
    const { key } = req.params;
    let { value, description } = req.body;

    if (value === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "缺少設定值 (value)" });
    }

    // 確保儲存為字串
    const valueStr =
      typeof value === "object" ? JSON.stringify(value) : String(value);

    await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: valueStr,
        ...(description && { description }), // 只有當 description 存在時才更新
      },
      create: {
        key,
        value: valueStr,
        description: description || "系統設定",
      },
    });

    await createLog(
      req.user.id,
      "UPDATE_SYSTEM_SETTING",
      "SYSTEM",
      `更新設定: ${key}`
    );

    res.status(200).json({ success: true, message: `設定 ${key} 已更新` });
  } catch (error) {
    console.error(`更新設定 ${req.params.key} 失敗:`, error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

// --- 2. 包裹管理 (查詢、匯出、批量) ---

const getAllPackages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const where = buildPackageWhereClause(status, search);

    const [total, packages] = await prisma.$transaction([
      prisma.package.count({ where }),
      prisma.package.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    const processedPackages = packages.map((pkg) => {
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
        arrivedBoxesJson: arrivedBoxes,
      };
    });

    res.status(200).json({
      success: true,
      packages: processedPackages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("取得包裹失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const exportPackages = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = buildPackageWhereClause(status, search);

    const packages = await prisma.package.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, name: true } } },
    });

    const exportData = packages.map((p) => ({
      單號: p.trackingNumber,
      商品: p.productName,
      會員: `${p.user.name || ""} (${p.user.email})`,
      狀態: p.status,
      數量: p.quantity,
      預報時間: new Date(p.createdAt).toLocaleDateString(),
      備註: p.note || "",
      總運費: p.totalCalculatedFee || 0,
    }));

    res.status(200).json({ success: true, data: exportData });
  } catch (error) {
    console.error("匯出包裹失敗:", error);
    res.status(500).json({ success: false, message: "匯出失敗" });
  }
};

const bulkUpdatePackageStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, message: "參數錯誤" });
    }

    await prisma.package.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    await createLog(
      req.user.id,
      "BULK_UPDATE_PACKAGE",
      "BATCH",
      `批量更新 ${ids.length} 筆包裹狀態為 ${status}`
    );

    res.status(200).json({ success: true, message: "批量更新成功" });
  } catch (error) {
    console.error("批量更新失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const bulkDeletePackages = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "未選擇包裹" });
    }

    // 1. 查找圖片以便刪除
    const packages = await prisma.package.findMany({
      where: { id: { in: ids } },
      select: { productImages: true, warehouseImages: true },
    });

    const deleteFiles = (jsonStr) => {
      try {
        const files = JSON.parse(jsonStr || "[]");
        files.forEach((fileUrl) => {
          const filename = fileUrl.split("/").pop();
          if (filename) {
            const filePath = path.join(
              process.cwd(),
              "public",
              "uploads",
              filename
            );
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        });
      } catch (e) {}
    };

    packages.forEach((pkg) => {
      deleteFiles(pkg.productImages);
      deleteFiles(pkg.warehouseImages);
    });

    // 2. 刪除 DB 資料
    await prisma.package.deleteMany({
      where: { id: { in: ids } },
    });

    await createLog(
      req.user.id,
      "BULK_DELETE_PACKAGE",
      "BATCH",
      `批量刪除 ${ids.length} 筆包裹`
    );

    res.status(200).json({ success: true, message: "批量刪除成功" });
  } catch (error) {
    console.error("批量刪除失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

// --- 單一包裹操作 ---

const adminCreatePackage = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { userId, trackingNumber, productName, quantity, note } = req.body;

    if (!userId || !trackingNumber || !productName) {
      return res.status(400).json({ success: false, message: "資料不完整" });
    }

    let imagePaths = "[]";
    if (req.files && req.files.length > 0) {
      const paths = req.files.map((file) => `/uploads/${file.filename}`);
      imagePaths = JSON.stringify(paths);
    }

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber,
        productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note,
        productImages: imagePaths,
        warehouseImages: "[]",
        userId,
      },
    });

    await createLog(
      adminUserId,
      "ADMIN_CREATE_PACKAGE",
      newPackage.id,
      `代客預報 (單號: ${trackingNumber})`
    );

    res
      .status(201)
      .json({ success: true, message: "新增成功", package: newPackage });
  } catch (error) {
    console.error("新增包裹失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const adminDeletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg)
      return res.status(404).json({ success: false, message: "找不到包裹" });

    const deleteFiles = (jsonStr) => {
      try {
        JSON.parse(jsonStr || "[]").forEach((url) => {
          const fname = url.split("/").pop();
          if (fname) {
            const fpath = path.join(process.cwd(), "public", "uploads", fname);
            if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
          }
        });
      } catch (e) {}
    };
    deleteFiles(pkg.productImages);
    deleteFiles(pkg.warehouseImages);

    await prisma.package.delete({ where: { id } });
    await createLog(
      req.user.id,
      "ADMIN_DELETE_PACKAGE",
      id,
      `刪除包裹 ${pkg.trackingNumber}`
    );

    res.status(200).json({ success: true, message: "包裹已刪除" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

const updatePackageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status)
      return res.status(400).json({ success: false, message: "無狀態" });

    const pkg = await prisma.package.update({
      where: { id },
      data: { status },
    });
    await createLog(
      req.user.id,
      "UPDATE_PACKAGE_STATUS",
      id,
      `狀態更新為 ${status}`
    );
    res.status(200).json({ success: true, package: pkg });
  } catch (e) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, boxesData, existingImages } = req.body;

    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });

    // [V10 修改] 從資料庫讀取運費設定
    const settings = await prisma.systemSetting.findUnique({
      where: { key: "rates_config" },
    });
    // 預設值 (如果資料庫沒設定)
    let systemRates = {
      categories: {
        general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
        special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
        special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
        special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
      },
      constants: {
        VOLUME_DIVISOR: 28317,
      },
    };

    if (settings && settings.value) {
      try {
        systemRates = JSON.parse(settings.value);
      } catch (e) {
        console.error("解析運費設定失敗，使用預設值");
      }
    }

    const RATES = systemRates.categories;
    const CONSTANTS = systemRates.constants;

    const updateData = {};
    if (status) updateData.status = status;

    // 計算運費
    if (boxesData) {
      try {
        const boxes = JSON.parse(boxesData);
        let totalFee = 0;
        const processedBoxes = boxes.map((box) => {
          const weight = parseFloat(box.weight) || 0;
          const l = parseFloat(box.length) || 0;
          const w_dim = parseFloat(box.width) || 0;
          const h = parseFloat(box.height) || 0;
          const type = box.type;
          let fee = 0;
          let cai = 0;

          if (weight > 0 && l > 0 && w_dim > 0 && h > 0 && RATES[type]) {
            cai = Math.ceil((l * w_dim * h) / CONSTANTS.VOLUME_DIVISOR);
            const volCost = cai * RATES[type].volumeRate;
            const wtCost =
              (Math.ceil(weight * 10) / 10) * RATES[type].weightRate;
            fee = Math.max(volCost, wtCost);
          }
          totalFee += fee;
          return {
            ...box,
            weight,
            length: l,
            width: w_dim,
            height: h,
            cai,
            fee,
          };
        });
        updateData.arrivedBoxesJson = JSON.stringify(processedBoxes);
        updateData.totalCalculatedFee = totalFee;
      } catch (e) {}
    }

    // 處理圖片
    let currentImgs = [];
    try {
      currentImgs = JSON.parse(pkg.warehouseImages || "[]");
    } catch (e) {}
    let keepImgs = [];
    try {
      keepImgs = JSON.parse(existingImages || "[]");
    } catch (e) {}

    const toDelete = currentImgs.filter((i) => !keepImgs.includes(i));
    toDelete.forEach((url) => {
      const fname = url.split("/").pop();
      if (fname) {
        const fpath = path.join(process.cwd(), "public", "uploads", fname);
        if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
      }
    });

    let finalImgs = [...keepImgs];
    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((f) => `/uploads/${f.filename}`);
      finalImgs = [...finalImgs, ...newPaths];
    }
    updateData.warehouseImages = JSON.stringify(finalImgs.slice(0, 5));

    const updated = await prisma.package.update({
      where: { id },
      data: updateData,
    });
    await createLog(
      req.user.id,
      "UPDATE_PACKAGE_DETAILS",
      id,
      "更新詳情(含運費計算)"
    );

    let parsedBoxes = [];
    try {
      parsedBoxes = JSON.parse(updated.arrivedBoxesJson || "[]");
    } catch (e) {}
    let parsedImgs = [];
    try {
      parsedImgs = JSON.parse(updated.warehouseImages || "[]");
    } catch (e) {}

    res.status(200).json({
      success: true,
      package: {
        ...updated,
        arrivedBoxesJson: parsedBoxes,
        warehouseImages: parsedImgs,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// --- 3. 集運單管理 (查詢、匯出、批量) ---

const getAllShipments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const where = buildShipmentWhereClause(status, search);

    const [total, shipments] = await prisma.$transaction([
      prisma.shipment.count({ where }),
      prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          packages: { select: { productName: true, trackingNumber: true } },
        },
      }),
    ]);

    const processed = shipments.map((s) => {
      let svcs = {};
      try {
        svcs = JSON.parse(s.additionalServices || "{}");
      } catch (e) {}
      let imgs = [];
      try {
        imgs = JSON.parse(s.shipmentProductImages || "[]");
      } catch (e) {}
      return { ...s, additionalServices: svcs, shipmentProductImages: imgs };
    });

    res.status(200).json({
      success: true,
      shipments: processed,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const exportShipments = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = buildShipmentWhereClause(status, search);

    const shipments = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, name: true } } },
    });

    const exportData = shipments.map((s) => ({
      訂單號: s.id,
      建立時間: new Date(s.createdAt).toLocaleDateString(),
      會員: s.user.email,
      收件人: s.recipientName,
      電話: s.phone,
      地址: s.shippingAddress,
      狀態: s.status,
      總金額: s.totalCost || 0,
      發票號碼: s.invoiceNumber || "未開立",
      台灣單號: s.trackingNumberTW || "",
      備註: s.note || "",
    }));

    res.status(200).json({ success: true, data: exportData });
  } catch (e) {
    res.status(500).json({ success: false, message: "匯出失敗" });
  }
};

const bulkUpdateShipmentStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, message: "參數錯誤" });
    }

    await prisma.shipment.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    await createLog(
      req.user.id,
      "BULK_UPDATE_SHIPMENT",
      "BATCH",
      `批量更新 ${ids.length} 筆訂單狀態為 ${status}`
    );

    res.status(200).json({ success: true, message: "批量更新成功" });
  } catch (e) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const bulkDeleteShipments = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "未選擇訂單" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: { in: ids } },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.deleteMany({
        where: { id: { in: ids } },
      });
    });

    await createLog(
      req.user.id,
      "BULK_DELETE_SHIPMENT",
      "BATCH",
      `批量刪除 ${ids.length} 筆訂單`
    );

    res.status(200).json({ success: true, message: "批量刪除成功" });
  } catch (e) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

// --- 單一集運單操作 ---

const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, totalCost, trackingNumberTW } = req.body;

    const originalShipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!originalShipment) {
      return res.status(404).json({ success: false, message: "找不到訂單" });
    }

    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;
    if (totalCost !== undefined) dataToUpdate.totalCost = parseFloat(totalCost);
    if (trackingNumberTW !== undefined)
      dataToUpdate.trackingNumberTW = trackingNumberTW;

    // === 發票自動開立邏輯 ===
    // 檢查系統設定是否啟用發票
    const invoiceSetting = await prisma.systemSetting.findUnique({
      where: { key: "invoice_config" },
    });
    let invoiceEnabled = false;
    if (invoiceSetting && invoiceSetting.value) {
      try {
        const config = JSON.parse(invoiceSetting.value);
        invoiceEnabled = config.enabled === true;
      } catch (e) {}
    }

    if (
      invoiceEnabled &&
      status === "PROCESSING" &&
      !originalShipment.invoiceNumber &&
      originalShipment.totalCost > 0
    ) {
      console.log(`[Admin] 訂單 ${id} 確認收款，準備開立發票...`);
      const result = await invoiceHelper.createInvoice(
        originalShipment,
        originalShipment.user
      );

      if (result.success) {
        dataToUpdate.invoiceNumber = result.invoiceNumber;
        dataToUpdate.invoiceStatus = "ISSUED";
        dataToUpdate.invoiceDate = result.invoiceDate;
        await createLog(
          req.user.id,
          "CREATE_INVOICE",
          id,
          `發票開立成功: ${result.invoiceNumber}`
        );
      } else {
        console.error("發票開立失敗:", result.message);
        await createLog(
          req.user.id,
          "INVOICE_FAILED",
          id,
          `發票開立失敗: ${result.message}`
        );
      }
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: dataToUpdate,
    });

    await createLog(
      req.user.id,
      "UPDATE_SHIPMENT",
      id,
      `狀態:${status}, 金額:${totalCost}`
    );
    res.status(200).json({ success: true, shipment: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      const released = await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      return { updated, count: released.count };
    });

    await createLog(
      req.user.id,
      "REJECT_SHIPMENT",
      id,
      `釋放${result.count}件包裹`
    );
    res.status(200).json({ success: true, message: "已退回並釋放包裹" });
  } catch (e) {
    res.status(500).json({ success: false, message: "退回失敗" });
  }
};

const adminDeleteShipment = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id } });
    });
    await createLog(req.user.id, "ADMIN_DELETE_SHIPMENT", id, "永久刪除");
    res.status(200).json({ success: true, message: "已刪除" });
  } catch (e) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

// --- 4. 會員管理 (分頁) ---

const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search, role, filter } = req.query;

    const where = {};
    if (status !== undefined && status !== "") {
      where.isActive = status === "true";
    }
    if (search) {
      const s = search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { email: { contains: s, mode: "insensitive" } },
        { phone: { contains: s, mode: "insensitive" } },
      ];
    }
    if (role) {
      if (role === "ADMIN")
        where.permissions = { contains: "CAN_MANAGE_USERS" };
      else if (role === "OPERATOR") where.permissions = { not: "[]" };
      else if (role === "USER") where.permissions = "[]";
    }

    if (filter === "new_today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          permissions: true,
          createdAt: true,
          isActive: true,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const getUsersList = async (req, res) => {
  try {
    const { search } = req.query;
    const where = { isActive: true };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      take: 20,
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    });
    res.status(200).json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const createStaffUser = async (req, res) => {
  try {
    const { email, password, name, permissions } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ message: "資料不全" });
    const exists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (exists) return res.status(400).json({ message: "Email 已存在" });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hash,
        name,
        permissions: JSON.stringify(permissions),
        isActive: true,
      },
    });
    await createLog(req.user.id, "CREATE_STAFF", user.id, `建立員工 ${email}`);
    res.status(201).json({
      success: true,
      user: { ...user, permissions: JSON.parse(user.permissions) },
    });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    await prisma.user.update({ where: { id }, data: { isActive } });
    await createLog(req.user.id, "TOGGLE_USER", id, `狀態:${isActive}`);
    res.status(200).json({ success: true, message: "狀態已更新" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const adminUpdateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, defaultAddress } = req.body;
    await prisma.user.update({
      where: { id },
      data: { name, phone, defaultAddress },
    });
    await createLog(req.user.id, "UPDATE_USER_PROFILE", id, "更新個資");
    res.status(200).json({ success: true, message: "更新成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const hash = await bcrypt.hash("8888", 10);
    await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    await createLog(req.user.id, "RESET_PASSWORD", id, "重設為8888");
    res.status(200).json({ success: true, message: "重設成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id === id)
      return res.status(400).json({ message: "不能刪除自己" });

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { userId: id } });
      await tx.package.deleteMany({ where: { userId: id } });
      await tx.shipment.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    await createLog(req.user.id, "DELETE_USER", id, "永久刪除");
    res.status(200).json({ success: true, message: "已刪除" });
  } catch (e) {
    res.status(500).json({ message: "刪除失敗" });
  }
};

const impersonateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: "找不到" });
    const token = generateToken(user.id);
    await createLog(req.user.id, "IMPERSONATE", id, `模擬 ${user.email}`);
    res.status(200).json({ success: true, token, user });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const updateUserPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    if (req.user.id === id)
      return res.status(400).json({ message: "不能改自己權限" });
    await prisma.user.update({
      where: { id },
      data: { permissions: JSON.stringify(permissions) },
    });
    await createLog(req.user.id, "UPDATE_PERMS", id, "更新權限");
    res.status(200).json({ success: true, message: "更新成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

// --- 5. 儀表板與日誌 ---

const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const date7 = new Date(new Date().setDate(today.getDate() - 7));
    const date30 = new Date(new Date().setDate(today.getDate() - 30));
    today.setHours(0, 0, 0, 0);

    const [
      weeklyRev,
      monthlyRev,
      totalRev,
      pendingRev,
      wPkg,
      mPkg,
      wUser,
      mUser,
      totalUser,
      newUserToday,
      pkgGroup,
      shipGroup,
      recentPkg,
      recentShip,
    ] = await Promise.all([
      prisma.shipment.aggregate({
        where: { status: "CANCEL", updatedAt: { gte: date7 } },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "CANCEL", updatedAt: { gte: date30 } },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "CANCEL" },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "PENDING_PAYMENT" },
        _sum: { totalCost: true },
      }),
      prisma.package.count({
        where: { status: "ARRIVED", updatedAt: { gte: date7 } },
      }),
      prisma.package.count({
        where: { status: "ARRIVED", updatedAt: { gte: date30 } },
      }),
      prisma.user.count({ where: { createdAt: { gte: date7 } } }),
      prisma.user.count({ where: { createdAt: { gte: date30 } } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.package.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.shipment.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.package.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
      prisma.shipment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
    ]);

    const pkgStats = {};
    pkgGroup.forEach((p) => (pkgStats[p.status] = p._count.id));
    const shipStats = {};
    shipGroup.forEach((s) => (shipStats[s.status] = s._count.id));

    res.status(200).json({
      success: true,
      stats: {
        weeklyRevenue: weeklyRev._sum.totalCost || 0,
        monthlyRevenue: monthlyRev._sum.totalCost || 0,
        totalRevenue: totalRev._sum.totalCost || 0,
        pendingRevenue: pendingRev._sum.totalCost || 0,
        weeklyPackages: wPkg,
        monthlyPackages: mPkg,
        weeklyNewUsers: wUser,
        monthlyNewUsers: mUser,
        totalUsers: totalUser,
        newUsersToday: newUserToday,
        packageStats: pkgStats,
        shipmentStats: shipStats,
        recentPackages: recentPkg,
        recentShipments: recentShip,
      },
    });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const getActivityLogs = async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.status(200).json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const getDailyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const revenue = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "updatedAt")::DATE as date, SUM("totalCost") as revenue
      FROM "Shipment"
      WHERE "status" = 'CANCEL' AND "updatedAt" >= ${start} AND "updatedAt" <= ${end}
      GROUP BY date ORDER BY date ASC
    `;
    const users = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt")::DATE as date, COUNT(id) as newusers
      FROM "User"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY date ORDER BY date ASC
    `;

    res.status(200).json({
      success: true,
      report: {
        revenueData: revenue.map((r) => ({
          date: r.date,
          revenue: Number(r.revenue),
        })),
        userData: users.map((u) => ({
          date: u.date,
          newUsers: Number(u.newusers),
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

module.exports = {
  // 系統設定
  getSystemSettings,
  updateSystemSetting,

  // 包裹
  getAllPackages,
  exportPackages,
  bulkUpdatePackageStatus,
  bulkDeletePackages,
  adminCreatePackage,
  adminDeletePackage,
  updatePackageStatus,
  updatePackageDetails,

  // 集運單
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,

  // 會員
  getUsers,
  getUsersList,
  createStaffUser,
  toggleUserStatus,
  adminUpdateUserProfile,
  resetUserPassword,
  deleteUser,
  impersonateUser,
  updateUserPermissions,

  // 報表與日誌
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
};
