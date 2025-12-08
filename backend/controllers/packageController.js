// backend/controllers/packageController.js
// V2025.Security - 完整功能版 (含認領、批量、異常處理、商品連結)

const prisma = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

// --- 輔助函式：安全刪除多個檔案 ---
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

/**
 * @description 包裹預報 (單筆)
 * @route POST /api/packages/forecast/images
 */
const createPackageForecast = async (req, res) => {
  try {
    // [Updated] 新增接收 productUrl
    const { trackingNumber, productName, quantity, note, productUrl } =
      req.body;
    const userId = req.user.id;

    if (!trackingNumber || !productName) {
      return res
        .status(400)
        .json({ success: false, message: "請提供物流單號和商品名稱" });
    }

    const existingPackage = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
    });

    if (existingPackage) {
      return res.status(400).json({
        success: false,
        message: "此物流單號已存在系統中，請勿重複預報。",
      });
    }

    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`);
    }

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber.trim(),
        productName: productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note: note,
        productUrl: productUrl || null, // [New] 儲存商品連結
        productImages: imagePaths,
        warehouseImages: [],
        userId: userId,
        status: "PENDING",
      },
    });

    await createLog(
      userId,
      "CREATE_PACKAGE",
      newPackage.id,
      `預報包裹 ${trackingNumber}`
    );

    res.status(201).json({
      success: true,
      message: "包裹預報成功！",
      package: newPackage,
    });
  } catch (error) {
    console.error("包裹預報錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 批量預報 (接收 JSON 陣列)
 * @route POST /api/packages/bulk-forecast
 */
const bulkForecast = async (req, res) => {
  try {
    const { packages } = req.body; // 預期是一個物件陣列
    const userId = req.user.id;

    if (!Array.isArray(packages) || packages.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "無效的資料格式" });
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // 使用 Transaction 確保原子性，或逐筆處理 (這裡選擇逐筆以允許部分成功)
    for (const pkg of packages) {
      // 簡單驗證
      if (!pkg.trackingNumber || !pkg.productName) {
        failCount++;
        errors.push(`單號 ${pkg.trackingNumber || "未知"}: 資料不全`);
        continue;
      }

      // 檢查重複
      const exists = await prisma.package.findUnique({
        where: { trackingNumber: pkg.trackingNumber.trim() },
      });

      if (exists) {
        failCount++;
        errors.push(`單號 ${pkg.trackingNumber}: 已存在`);
        continue;
      }

      await prisma.package.create({
        data: {
          trackingNumber: pkg.trackingNumber.trim(),
          productName: pkg.productName,
          quantity: pkg.quantity ? parseInt(pkg.quantity) : 1,
          note: pkg.note || "批量匯入",
          userId: userId,
          status: "PENDING",
        },
      });
      successCount++;
    }

    await createLog(
      userId,
      "BULK_FORECAST",
      "BATCH",
      `批量匯入成功 ${successCount} 筆`
    );

    res.json({
      success: true,
      message: `匯入完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`,
      errors,
    });
  } catch (error) {
    console.error("批量預報錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 認領無主包裹
 * @route POST /api/packages/claim
 */
const claimPackage = async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    const userId = req.user.id;
    const proofFile = req.file; // 上傳的截圖

    if (!trackingNumber) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入物流單號" });
    }

    // 搜尋該單號的包裹
    const pkg = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
      include: { user: true },
    });

    if (!pkg) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此單號的包裹" });
    }

    // 檢查是否已被綁定
    if (pkg.userId !== userId) {
      // 若不是無主件
      if (
        pkg.user.email !== "unclaimed@runpiggy.com" &&
        pkg.user.email !== "admin@runpiggy.com"
      ) {
        return res
          .status(400)
          .json({ success: false, message: "此包裹已被其他會員預報或綁定。" });
      }
    } else {
      return res
        .status(200)
        .json({ success: true, message: "此包裹已在您的清單中。" });
    }

    // 執行認領
    const updateData = {
      userId: userId,
    };

    if (proofFile) {
      updateData.claimProof = `/uploads/${proofFile.filename}`;
    }

    await prisma.package.update({
      where: { id: pkg.id },
      data: updateData,
    });

    await createLog(
      userId,
      "CLAIM_PACKAGE",
      pkg.id,
      `認領包裹 ${trackingNumber}`
    );

    res.json({ success: true, message: "認領成功！包裹已歸入您的帳戶。" });
  } catch (error) {
    console.error("認領包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 處理/回覆 異常包裹
 * @route PUT /api/packages/:id/exception
 */
const resolveException = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body; // action: "DISCARD", "RETURN", "SHIP_ANYWAY"
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({
      where: { id, userId },
    });

    if (!pkg) return res.status(404).json({ message: "找不到包裹" });

    // 僅更新備註，讓管理員看到客戶的決定
    const newNote = pkg.exceptionNote
      ? `${pkg.exceptionNote}\n[客戶決定]: ${action} - ${note || ""}`
      : `[客戶決定]: ${action} - ${note || ""}`;

    await prisma.package.update({
      where: { id },
      data: {
        exceptionNote: newNote,
      },
    });

    await createLog(userId, "RESOLVE_EXCEPTION", id, `回覆異常處理: ${action}`);

    res.json({ success: true, message: "已送出處理指示，請等待管理員作業。" });
  } catch (error) {
    console.error("異常處理錯誤:", error);
    res.status(500).json({ message: "伺服器錯誤" });
  }
};

/**
 * @description 取得 "我" 的所有包裹
 * @route GET /api/packages/my
 */
const getMyPackages = async (req, res) => {
  try {
    const userId = req.user.id;
    const myPackages = await prisma.package.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });

    const systemRates = await ratesManager.getRates();
    const CONSTANTS = systemRates.constants;
    const RATES = systemRates.categories;

    const packagesWithParsedJson = myPackages.map((pkg) => {
      const arrivedBoxes = pkg.arrivedBoxesJson || [];
      let pkgIsOversized = false;
      let pkgIsOverweight = false;
      let calculatedTotalFee = 0;

      const enrichedBoxes = arrivedBoxes.map((box) => {
        const l = parseFloat(box.length) || 0;
        const w = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;
        const type = box.type || "general";
        const rateInfo = RATES[type] || {
          weightRate: 0,
          volumeRate: 0,
          name: "未知",
        };

        const isOversized =
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          w >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT;
        const isOverweight = weight >= CONSTANTS.OVERWEIGHT_LIMIT;

        if (isOversized) pkgIsOversized = true;
        if (isOverweight) pkgIsOverweight = true;

        let cai = 0,
          volFee = 0,
          wtFee = 0,
          finalFee = 0,
          isVolWin = false;

        if (l > 0 && w > 0 && h > 0) {
          cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
          volFee = cai * rateInfo.volumeRate;
          wtFee = (Math.ceil(weight * 10) / 10) * rateInfo.weightRate;
          finalFee = Math.max(volFee, wtFee);
          isVolWin = volFee >= wtFee;
        }
        calculatedTotalFee += finalFee;

        return {
          ...box,
          cai,
          volFee,
          wtFee,
          calculatedFee: finalFee,
          isVolWin,
          isOversized,
          isOverweight,
          rateName: rateInfo.name,
        };
      });

      const finalTotalFee =
        pkg.totalCalculatedFee > 0
          ? pkg.totalCalculatedFee
          : calculatedTotalFee;

      return {
        ...pkg,
        arrivedBoxes: enrichedBoxes,
        arrivedBoxesJson: undefined,
        isOversized: pkgIsOversized,
        isOverweight: pkgIsOverweight,
        totalCalculatedFee: finalTotalFee,
      };
    });

    res.status(200).json({
      success: true,
      count: packagesWithParsedJson.length,
      packages: packagesWithParsedJson,
    });
  } catch (error) {
    console.error("查詢包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 會員修改自己的包裹
 * @route PUT /api/packages/:id
 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    // [Updated] 新增接收 productUrl
    const {
      trackingNumber,
      productName,
      quantity,
      note,
      existingImages,
      productUrl,
    } = req.body;
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });
    if (pkg.status !== "PENDING")
      return res.status(400).json({ message: "包裹已入庫或處理中，無法修改" });

    // 單號唯一性檢查 (若有修改)
    if (trackingNumber && trackingNumber.trim() !== pkg.trackingNumber) {
      const dup = await prisma.package.findUnique({
        where: { trackingNumber: trackingNumber.trim() },
      });
      if (dup) return res.status(400).json({ message: "單號已存在" });
    }

    let originalImagesList = pkg.productImages || [];
    let keepImagesList = [];
    try {
      keepImagesList = existingImages ? JSON.parse(existingImages) : [];
    } catch (e) {
      keepImagesList = [];
    }

    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );
    deleteFiles(imagesToDelete);

    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((f) => `/uploads/${f.filename}`);
      keepImagesList = [...keepImagesList, ...newPaths];
    }

    const updatedPackage = await prisma.package.update({
      where: { id },
      data: {
        trackingNumber: trackingNumber ? trackingNumber.trim() : undefined,
        productName,
        quantity: quantity ? parseInt(quantity) : undefined,
        note,
        productUrl: productUrl || undefined, // [New] 更新連結
        productImages: keepImagesList.slice(0, 5),
      },
    });

    res
      .status(200)
      .json({ success: true, message: "更新成功", package: updatedPackage });
  } catch (error) {
    console.error("更新包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 會員刪除自己的包裹
 * @route DELETE /api/packages/:id
 */
const deleteMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });
    if (pkg.status !== "PENDING")
      return res.status(400).json({ message: "包裹已處理，無法刪除" });

    deleteFiles([...(pkg.productImages || []), ...(pkg.warehouseImages || [])]);

    await prisma.package.delete({ where: { id } });
    res.status(200).json({ success: true, message: "刪除成功" });
  } catch (error) {
    console.error("刪除包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  createPackageForecast,
  bulkForecast,
  claimPackage,
  resolveException,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
};
