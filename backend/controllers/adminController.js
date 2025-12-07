// backend/controllers/adminController.js
// V2025.Security - 已修復系統設定金鑰遮罩與還原邏輯

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const createLog = require("../utils/createLog.js");
const generateToken = require("../utils/generateToken.js");
const invoiceHelper = require("../utils/invoiceHelper.js");

// 從 shipmentController 引入手動開立函式
const {
  manualIssueInvoice,
  manualVoidInvoice,
} = require("../controllers/shipmentController");

// --- 輔助函式 ---
const deleteFiles = (filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  const uploadDir = path.join(__dirname, "../public/uploads");
  filePaths.forEach((filePath) => {
    try {
      const fileName = path.basename(filePath);
      if (!fileName) return;
      const absolutePath = path.join(uploadDir, fileName);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (err) {
      console.warn(`[File Warning] 刪除檔案失敗 (${filePath}):`, err.message);
    }
  });
};

const buildPackageWhereClause = (status, search) => {
  const where = {};
  if (status) where.status = status;
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
      { id: { contains: searchLower, mode: "insensitive" } },
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

// --- 系統設定 (System Settings) ---

/**
 * [Security Fix] 取得系統設定 (含金鑰遮罩)
 */
const getSystemSettings = async (req, res) => {
  try {
    const settingsList = await prisma.systemSetting.findMany();
    const settings = {};

    settingsList.forEach((item) => {
      let val = item.value;

      // [Security Fix] 針對電子發票 HashKey 進行遮罩處理
      // 避免金鑰明碼傳輸到前端
      if (item.key === "invoice_config" && val && val.hashKey) {
        // 使用淺拷貝，避免汙染原始物件，並將金鑰替換為遮罩
        val = { ...val, hashKey: "********" };
      }

      settings[item.key] = val;
    });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("取得系統設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * [Security Fix] 更新系統設定 (含金鑰還原)
 */
const updateSystemSetting = async (req, res) => {
  try {
    const { key } = req.params;
    let { value, description } = req.body;

    if (value === undefined)
      return res.status(400).json({ success: false, message: "缺少設定值" });

    // [Security Fix] 檢查是否為發票設定，並判斷是否需要還原遮罩
    if (key === "invoice_config" && value && value.hashKey === "********") {
      // 若前端傳來的是遮罩字串，代表使用者沒有修改金鑰
      // 需從資料庫讀取舊的金鑰並填回，避免將 "********" 寫入資料庫
      const oldSetting = await prisma.systemSetting.findUnique({
        where: { key: "invoice_config" },
      });

      if (oldSetting && oldSetting.value && oldSetting.value.hashKey) {
        value.hashKey = oldSetting.value.hashKey;
      } else {
        // 若原本沒金鑰，則設為空字串
        value.hashKey = "";
      }
    }

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value, ...(description && { description }) },
      create: { key, value: value, description: description || "系統設定" },
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

// --- 包裹管理 (Packages) ---
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
    const processedPackages = packages.map((pkg) => ({
      ...pkg,
      productImages: pkg.productImages || [],
      warehouseImages: pkg.warehouseImages || [],
      arrivedBoxesJson: pkg.arrivedBoxesJson || [],
    }));
    res.status(200).json({
      success: true,
      packages: processedPackages,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
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
    res.status(500).json({ success: false, message: "匯出失敗" });
  }
};

const bulkUpdatePackageStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !status)
      return res.status(400).json({ success: false, message: "參數錯誤" });
    await prisma.package.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    await createLog(
      req.user.id,
      "BULK_UPDATE_PACKAGE",
      "BATCH",
      `批量更新 ${ids.length} 筆包裹為 ${status}`
    );
    res.status(200).json({ success: true, message: "批量更新成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const bulkDeletePackages = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "未選擇包裹" });
    const packages = await prisma.package.findMany({
      where: { id: { in: ids } },
      select: { productImages: true, warehouseImages: true },
    });
    const allFiles = [];
    packages.forEach((pkg) => {
      if (Array.isArray(pkg.productImages)) allFiles.push(...pkg.productImages);
      if (Array.isArray(pkg.warehouseImages))
        allFiles.push(...pkg.warehouseImages);
    });
    deleteFiles(allFiles);
    await prisma.package.deleteMany({ where: { id: { in: ids } } });
    await createLog(
      req.user.id,
      "BULK_DELETE_PACKAGE",
      "BATCH",
      `批量刪除 ${ids.length} 筆包裹`
    );
    res.status(200).json({ success: true, message: "批量刪除成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const adminCreatePackage = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { userId, trackingNumber, productName, quantity, note } = req.body;
    if (!userId || !trackingNumber || !productName)
      return res.status(400).json({ success: false, message: "資料不完整" });

    // [Security] 單號唯一性檢查
    const existingPkg = await prisma.package.findFirst({
      where: { trackingNumber: trackingNumber.trim() },
    });
    if (existingPkg) {
      return res.status(400).json({
        success: false,
        message: "此物流單號已存在系統中，請勿重複建立",
      });
    }

    let imagePaths = [];
    if (req.files && req.files.length > 0)
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`);

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber.trim(),
        productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note,
        productImages: imagePaths,
        warehouseImages: [],
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
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const adminDeletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg)
      return res.status(404).json({ success: false, message: "找不到包裹" });

    let filesToDelete = [
      ...(pkg.productImages || []),
      ...(pkg.warehouseImages || []),
    ];
    deleteFiles(filesToDelete);
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

    // [Security] 狀態流轉檢查
    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg) return res.status(404).json({ message: "包裹不存在" });

    // 簡單的狀態機檢查：防止從 PENDING 直接跳到 COMPLETED (必須經過 ARRIVED)
    if (pkg.status === "PENDING" && status === "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "操作禁止：包裹必須先進行「入庫 (ARRIVED)」才能完成。",
      });
    }

    const updatedPkg = await prisma.package.update({
      where: { id },
      data: { status },
    });
    await createLog(
      req.user.id,
      "UPDATE_PACKAGE_STATUS",
      id,
      `狀態更新為 ${status}`
    );
    res.status(200).json({ success: true, package: updatedPkg });
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

    const settings = await prisma.systemSetting.findUnique({
      where: { key: "rates_config" },
    });
    let systemRates = {};
    if (settings && settings.value) {
      systemRates = settings.value;
    }
    const RATES = systemRates.categories || {};
    const CONSTANTS = systemRates.constants || { VOLUME_DIVISOR: 28317 };

    const updateData = {};
    if (status) updateData.status = status;

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
          const rate = RATES[type];
          if (weight > 0 && l > 0 && w_dim > 0 && h > 0 && rate) {
            cai = Math.ceil((l * w_dim * h) / CONSTANTS.VOLUME_DIVISOR);
            const volCost = cai * rate.volumeRate;
            const wtCost = (Math.ceil(weight * 10) / 10) * rate.weightRate;
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
        updateData.arrivedBoxesJson = processedBoxes;
        updateData.totalCalculatedFee = totalFee;
      } catch (e) {
        console.warn("Parse boxesData failed", e);
      }
    }

    let currentImgs = pkg.warehouseImages || [];
    let keepImgs = [];
    try {
      keepImgs = JSON.parse(existingImages || "[]");
    } catch (e) {}

    const toDelete = currentImgs.filter((i) => !keepImgs.includes(i));
    deleteFiles(toDelete);

    let finalImgs = [...keepImgs];
    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((f) => `/uploads/${f.filename}`);
      finalImgs = [...finalImgs, ...newPaths];
    }
    updateData.warehouseImages = finalImgs.slice(0, 5);

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
    res.status(200).json({
      success: true,
      package: {
        ...updated,
        arrivedBoxesJson: updated.arrivedBoxesJson || [],
        warehouseImages: updated.warehouseImages || [],
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// --- 集運單管理 (Shipments) ---
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
      return {
        ...s,
        additionalServices: s.additionalServices || {},
        shipmentProductImages: s.shipmentProductImages || [],
      };
    });
    res.status(200).json({
      success: true,
      shipments: processed,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
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
    if (!Array.isArray(ids) || ids.length === 0 || !status)
      return res.status(400).json({ success: false, message: "參數錯誤" });

    // [Logic] 如果是轉為「已收款 (PROCESSING)」，需要逐筆檢查並開立發票
    if (status === "PROCESSING") {
      const shipments = await prisma.shipment.findMany({
        where: { id: { in: ids } },
        include: { user: true },
      });

      let invoiceCount = 0;
      let successCount = 0;

      for (const ship of shipments) {
        let updateData = { status: "PROCESSING" };

        if (
          !ship.invoiceNumber &&
          ship.totalCost > 0 &&
          ship.invoiceStatus !== "VOID"
        ) {
          const result = await invoiceHelper.createInvoice(ship, ship.user);
          if (result.success) {
            updateData.invoiceNumber = result.invoiceNumber;
            updateData.invoiceStatus = "ISSUED";
            updateData.invoiceDate = result.invoiceDate;
            updateData.invoiceRandomCode = result.randomCode;
            invoiceCount++;
          } else {
            await createLog(
              req.user.id,
              "INVOICE_FAILED",
              ship.id,
              `批量開立失敗: ${result.message}`
            );
          }
        }

        await prisma.shipment.update({
          where: { id: ship.id },
          data: updateData,
        });
        successCount++;
      }

      await createLog(
        req.user.id,
        "BULK_UPDATE_SHIPMENT",
        "BATCH",
        `批量收款 ${successCount} 筆，自動開立發票 ${invoiceCount} 張`
      );
      return res.status(200).json({
        success: true,
        message: `批量更新成功 (含發票開立 ${invoiceCount} 張)`,
      });
    } else {
      await prisma.shipment.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });
      await createLog(
        req.user.id,
        "BULK_UPDATE_SHIPMENT",
        "BATCH",
        `批量更新 ${ids.length} 筆訂單為 ${status}`
      );
      return res.status(200).json({ success: true, message: "批量更新成功" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const bulkDeleteShipments = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "未選擇訂單" });
    const shipments = await prisma.shipment.findMany({
      where: { id: { in: ids } },
      select: { paymentProof: true, shipmentProductImages: true },
    });
    const files = [];
    shipments.forEach((s) => {
      if (s.paymentProof) files.push(s.paymentProof);
      if (Array.isArray(s.shipmentProductImages)) {
        files.push(...s.shipmentProductImages);
      }
    });
    deleteFiles(files);
    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: { in: ids } },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.deleteMany({ where: { id: { in: ids } } });
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

const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, totalCost, trackingNumberTW, taxId, invoiceTitle } =
      req.body;

    const originalShipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!originalShipment)
      return res.status(404).json({ success: false, message: "找不到訂單" });

    // [Security] 財務鎖定 (Financial Lock)
    // 如果發票已開立，禁止修改金額，必須先作廢發票。
    if (
      totalCost !== undefined &&
      originalShipment.invoiceStatus === "ISSUED" &&
      originalShipment.invoiceNumber &&
      parseFloat(totalCost) !== originalShipment.totalCost
    ) {
      return res.status(400).json({
        success: false,
        message:
          "危險操作禁止：此訂單已開立發票，禁止直接修改金額！請先「作廢發票」後再行修改。",
      });
    }

    // [Security] 出貨檢核
    // 若要轉為 SHIPPED，必須確保已付款 (PROCESSING) 或有上傳憑證
    if (
      status === "SHIPPED" &&
      originalShipment.status !== "PROCESSING" &&
      !originalShipment.paymentProof
    ) {
      // 這裡做一個嚴格檢查：必須要是 PROCESSING 才能轉 SHIPPED，或者至少要有憑證
      // 若原狀態是 PENDING_PAYMENT 且無憑證，則擋下
      if (originalShipment.status === "PENDING_PAYMENT") {
        return res.status(400).json({
          success: false,
          message: "出貨禁止：此訂單尚未付款或收款確認，無法發貨！",
        });
      }
    }

    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;
    if (totalCost !== undefined) dataToUpdate.totalCost = parseFloat(totalCost);
    if (trackingNumberTW !== undefined)
      dataToUpdate.trackingNumberTW = trackingNumberTW;
    if (taxId !== undefined) dataToUpdate.taxId = taxId;
    if (invoiceTitle !== undefined) dataToUpdate.invoiceTitle = invoiceTitle;

    if (status === "CANCELLED") {
      const result = await prisma.$transaction(async (tx) => {
        const released = await tx.package.updateMany({
          where: { shipmentId: id },
          data: { status: "ARRIVED", shipmentId: null },
        });
        const updatedShipment = await tx.shipment.update({
          where: { id },
          data: dataToUpdate,
        });
        return { shipment: updatedShipment, count: released.count };
      });
      await createLog(
        req.user.id,
        "UPDATE_SHIPMENT",
        id,
        `訂單取消，已釋放 ${result.count} 件包裹`
      );
      return res.status(200).json({
        success: true,
        shipment: result.shipment,
        message: `訂單已取消，並成功釋放 ${result.count} 件包裹回倉庫`,
      });
    }

    // PROCESSING 自動開票邏輯
    if (
      status === "PROCESSING" &&
      !originalShipment.invoiceNumber &&
      originalShipment.totalCost > 0
    ) {
      const shipmentForInvoice = { ...originalShipment, ...dataToUpdate };
      const result = await invoiceHelper.createInvoice(
        shipmentForInvoice,
        originalShipment.user
      );
      if (result.success) {
        dataToUpdate.invoiceNumber = result.invoiceNumber;
        dataToUpdate.invoiceStatus = "ISSUED";
        dataToUpdate.invoiceDate = result.invoiceDate;
        dataToUpdate.invoiceRandomCode = result.randomCode;
        await createLog(
          req.user.id,
          "CREATE_INVOICE",
          id,
          `發票成功: ${result.invoiceNumber}`
        );
      } else {
        await createLog(
          req.user.id,
          "INVOICE_FAILED",
          id,
          `發票失敗: ${result.message}`
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
      return { count: released.count };
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
    const ship = await prisma.shipment.findUnique({
      where: { id },
      select: { paymentProof: true, shipmentProductImages: true },
    });
    if (ship) {
      let files = [];
      if (ship.paymentProof) files.push(ship.paymentProof);
      if (Array.isArray(ship.shipmentProductImages)) {
        files.push(...ship.shipmentProductImages);
      }
      deleteFiles(files);
    }
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

// --- 會員管理 (Users) ---
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search, role, filter } = req.query;
    const where = {};
    if (status !== undefined && status !== "")
      where.isActive = status === "true";
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
        where.permissions = { array_contains: "CAN_MANAGE_USERS" };
    }

    if (filter === "new_today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      where.createdAt = { gte: start };
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
    if (search)
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    const users = await prisma.user.findMany({
      where,
      take: 20,
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    });
    res.status(200).json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, message: "錯誤" });
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
        permissions: permissions || [],
        isActive: true,
      },
    });
    await createLog(req.user.id, "CREATE_STAFF", user.id, `建立員工 ${email}`);
    res.status(201).json({ success: true, user });
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

// [Security] 刪除會員防呆機制 (Delete Protection)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id === id)
      return res.status(400).json({ message: "不能刪除自己" });

    // 檢查是否有未完成的訂單或包裹
    const activeShipments = await prisma.shipment.count({
      where: {
        userId: id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });

    const activePackages = await prisma.package.count({
      where: {
        userId: id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });

    if (activeShipments > 0 || activePackages > 0) {
      return res.status(400).json({
        message: `無法刪除！此會員尚有 ${activePackages} 件未完成包裹及 ${activeShipments} 筆未完成訂單。請先結案後再試。`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { userId: id } });
      await tx.package.deleteMany({ where: { userId: id } });
      await tx.shipment.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    await createLog(req.user.id, "DELETE_USER", id, "永久刪除");
    res.status(200).json({ success: true, message: "已刪除" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "刪除失敗" });
  }
};

const impersonateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: "找不到" });
    const token = generateToken(user.id, { permissions: user.permissions });
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
      data: { permissions: permissions || [] },
    });
    await createLog(req.user.id, "UPDATE_PERMS", id, "更新權限");
    res.status(200).json({ success: true, message: "更新成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

// --- 儀表板與報表 ---
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      totalRev,
      pendingRev,
      totalUser,
      newUserToday,
      pkgGroup,
      shipGroup,
      recentPkg,
      recentShip,
    ] = await Promise.all([
      prisma.shipment.aggregate({
        where: { status: "COMPLETED" }, // 只統計已完成的營收較為準確，或是 PROCESSIND
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "PENDING_PAYMENT" },
        _sum: { totalCost: true },
      }),
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
        totalRevenue: totalRev._sum.totalCost || 0,
        pendingRevenue: pendingRev._sum.totalCost || 0,
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, action } = req.query;
    const where = {};
    if (search)
      where.OR = [
        { userEmail: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
      ];
    if (action) where.action = { contains: action };
    const [total, logs] = await prisma.$transaction([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
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
    const revenue =
      await prisma.$queryRaw`SELECT DATE_TRUNC('day', "updatedAt")::DATE as date, SUM("totalCost") as revenue FROM "Shipment" WHERE "status" = 'COMPLETED' AND "updatedAt" >= ${start} AND "updatedAt" <= ${end} GROUP BY date ORDER BY date ASC`;
    const users =
      await prisma.$queryRaw`SELECT DATE_TRUNC('day', "createdAt")::DATE as date, COUNT(id) as newusers FROM "User" WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} GROUP BY date ORDER BY date ASC`;
    const safeRevenue = revenue.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
    }));
    const safeUsers = users.map((u) => ({
      date: u.date,
      newUsers: Number(u.newusers),
    }));
    res.status(200).json({
      success: true,
      report: { revenueData: safeRevenue, userData: safeUsers },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "報表錯誤" });
  }
};

module.exports = {
  getSystemSettings,
  updateSystemSetting,
  getAllPackages,
  exportPackages,
  bulkUpdatePackageStatus,
  bulkDeletePackages,
  adminCreatePackage,
  adminDeletePackage,
  updatePackageStatus,
  updatePackageDetails,
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,
  getUsers,
  getUsersList,
  createStaffUser,
  toggleUserStatus,
  adminUpdateUserProfile,
  resetUserPassword,
  deleteUser,
  impersonateUser,
  updateUserPermissions,
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
  manualIssueInvoice,
  manualVoidInvoice,
};
