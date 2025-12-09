// backend/controllers/admin/packageController.js
// V2025.Features.Fixed - Added Unclaimed Filter, Status Counts, Email Notifications & Rates Fix

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js");
// 引入新的 Email 通知函數
const { sendPackageArrivedNotification } = require("../../utils/sendEmail.js");
const ratesManager = require("../../utils/ratesManager.js"); // [Fix] 引入費率管理器
const {
  deleteFiles,
  buildPackageWhereClause,
} = require("../../utils/adminHelpers.js");

const getAllPackages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search, filter } = req.query;

    let where = buildPackageWhereClause(status, search);

    if (filter === "UNCLAIMED") {
      where.user = {
        email: { in: ["unclaimed@runpiggy.com", "admin@runpiggy.com"] },
      };
    } else if (filter === "CLAIM_REVIEW") {
      where.claimProof = { not: null };
    }

    let statsWhere = buildPackageWhereClause(undefined, search);
    if (filter === "UNCLAIMED") {
      statsWhere.user = {
        email: { in: ["unclaimed@runpiggy.com", "admin@runpiggy.com"] },
      };
    } else if (filter === "CLAIM_REVIEW") {
      statsWhere.claimProof = { not: null };
    }

    const [total, packages, statusGroups] = await prisma.$transaction([
      prisma.package.count({ where }),
      prisma.package.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.package.groupBy({
        by: ["status"],
        where: statsWhere,
        _count: { status: true },
      }),
    ]);

    const statusCounts = {};
    let totalInSearch = 0;
    statusGroups.forEach((g) => {
      statusCounts[g.status] = g._count.status;
      totalInSearch += g._count.status;
    });
    statusCounts["ALL"] = totalInSearch;

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
      statusCounts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const exportPackages = async (req, res) => {
  try {
    const { status, search, filter } = req.query;
    let where = buildPackageWhereClause(status, search);

    if (filter === "UNCLAIMED") {
      where.user = {
        email: { in: ["unclaimed@runpiggy.com", "admin@runpiggy.com"] },
      };
    } else if (filter === "CLAIM_REVIEW") {
      where.claimProof = { not: null };
    }

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
      認領憑證: p.claimProof ? "有" : "無",
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

    // 若狀態變更為 ARRIVED，發送通知
    if (status === "ARRIVED") {
      const packages = await prisma.package.findMany({
        where: { id: { in: ids } },
        select: {
          userId: true,
          trackingNumber: true,
          productName: true,
          arrivedBoxesJson: true,
        },
        include: { user: true }, // 需要 User email
      });

      // 並行處理通知
      await Promise.all(
        packages.map(async (p) => {
          // 1. 站內通知
          await createNotification(
            p.userId,
            "包裹已入庫",
            `您的包裹 ${p.trackingNumber} 已送達倉庫並入庫。`,
            "PACKAGE",
            "tab-packages"
          );
          // 2. [New] Email 通知
          await sendPackageArrivedNotification(p, p.user);
        })
      );
    }

    await createLog(
      req.user.id,
      "BULK_UPDATE_PACKAGE",
      "BATCH",
      `批量更新 ${ids.length} 筆包裹為 ${status}`
    );
    res.status(200).json({ success: true, message: "批量更新成功" });
  } catch (error) {
    console.error(error);
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

    await createNotification(
      userId,
      "管理員已代為預報",
      `您的包裹 ${trackingNumber} 已由客服建立。`,
      "PACKAGE"
    );

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

    const pkg = await prisma.package.findUnique({
      where: { id },
      include: { user: true }, // 包含 User 資訊以便發信
    });
    if (!pkg) return res.status(404).json({ message: "包裹不存在" });

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

    if (status === "ARRIVED" && pkg.status !== "ARRIVED") {
      // 1. 站內通知
      await createNotification(
        pkg.userId,
        "包裹已入庫",
        `您的包裹 ${pkg.trackingNumber} 已測量完畢並入庫，請前往打包。`,
        "PACKAGE",
        "tab-packages"
      );
      // 2. [New] Email 通知
      await sendPackageArrivedNotification(updatedPkg, pkg.user);
    }

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

// [Critical Fix] 更新包裹詳情與運費計算 (修復 0 元運費問題)
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, boxesData, existingImages } = req.body;
    const pkg = await prisma.package.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });

    // [Fix] 使用 ratesManager 獲取費率，確保安全性與 fallback 機制
    const systemRates = await ratesManager.getRates();
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

          // [Fix] 標準化 type 並使用安全查找，避免找不到費率導致運費為 0
          const rateInfo = ratesManager.getCategoryRate(systemRates, box.type);

          let fee = 0;
          let cai = 0;

          if (weight > 0 && l > 0 && w_dim > 0 && h > 0) {
            cai = Math.ceil((l * w_dim * h) / CONSTANTS.VOLUME_DIVISOR);
            const volCost = cai * rateInfo.volumeRate;
            const wtCost = (Math.ceil(weight * 10) / 10) * rateInfo.weightRate;
            fee = Math.max(volCost, wtCost);
          }

          totalFee += fee;
          return {
            ...box,
            // 存入處理過、標準化的小寫 type，確保未來讀取一致
            type: (box.type || "general").trim().toLowerCase(),
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

    if (status === "ARRIVED" && pkg.status !== "ARRIVED") {
      // 1. 站內通知
      await createNotification(
        pkg.userId,
        "包裹已入庫",
        `您的包裹 ${pkg.trackingNumber} 已更新測量數據。`,
        "PACKAGE",
        "tab-packages"
      );
      // 2. [New] Email 通知
      await sendPackageArrivedNotification(updated, pkg.user);
    }

    await createLog(
      req.user.id,
      "UPDATE_PACKAGE_DETAILS",
      id,
      "更新詳情(含運費計算 - Fix)"
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
    console.error("Update Package Details Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getAllPackages,
  exportPackages,
  bulkUpdatePackageStatus,
  bulkDeletePackages,
  adminCreatePackage,
  adminDeletePackage,
  updatePackageStatus,
  updatePackageDetails,
};
