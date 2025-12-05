// backend/controllers/packageController.js
// V11 優化版 - 使用 Native JSON 型別

const prisma = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const ratesManager = require("../utils/ratesManager.js");

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
 * @description 包裹預報 (支援圖片上傳)
 * @route POST /api/packages/forecast/images
 */
const createPackageForecast = async (req, res) => {
  try {
    const { trackingNumber, productName, quantity, note } = req.body;
    const userId = req.user.id;

    if (!trackingNumber || !productName) {
      return res
        .status(400)
        .json({ success: false, message: "請提供物流單號和商品名稱" });
    }

    // 處理上傳的圖片
    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`);
    }

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber,
        productName: productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note: note,
        // [修改] 直接存入陣列，Prisma 會自動處理 Json
        productImages: imagePaths,
        warehouseImages: [],
        userId: userId,
        status: "PENDING",
      },
    });

    res.status(201).json({
      success: true,
      message: "包裹預報成功！",
      package: newPackage,
    });
  } catch (error) {
    console.error("包裹預報時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 取得 "我" 的所有包裹 (包含後端即時計算的費用與狀態)
 * @route GET /api/packages/my
 */
const getMyPackages = async (req, res) => {
  try {
    const userId = req.user.id;
    const myPackages = await prisma.package.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });

    // 1. 取得當前系統費率設定
    const systemRates = await ratesManager.getRates();
    const CONSTANTS = systemRates.constants;
    const RATES = systemRates.categories;

    // 2. 解析與增強數據
    const packagesWithParsedJson = myPackages.map((pkg) => {
      // [修改] 直接讀取 DB 的 Json 欄位，無需 JSON.parse
      const productImages = pkg.productImages || [];
      const warehouseImages = pkg.warehouseImages || [];
      const arrivedBoxes = pkg.arrivedBoxesJson || [];

      // --- 後端計算邏輯 ---
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

        let cai = 0;
        let volFee = 0;
        let wtFee = 0;
        let finalFee = 0;
        let isVolWin = false;

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
        productImages,
        warehouseImages,
        arrivedBoxes: enrichedBoxes, // 使用增強版
        arrivedBoxesJson: undefined, // 隱藏原始欄位名(可選)

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
    console.error("查詢我的包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 會員修改自己的包裹 (含圖片增刪)
 * @route PUT /api/packages/:id
 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, productName, quantity, note, existingImages } =
      req.body;
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({
      where: { id: id, userId: userId },
    });

    if (!pkg) {
      return res
        .status(404)
        .json({ success: false, message: "找不到包裹或權限不足" });
    }
    if (pkg.status !== "PENDING") {
      return res
        .status(400)
        .json({ success: false, message: "包裹已入庫或處理中，無法修改" });
    }

    // [修改] 直接讀取 DB Json
    let originalImagesList = pkg.productImages || [];

    // [注意] existingImages 來自 FormData，仍是字串，需 parse
    let keepImagesList = [];
    try {
      keepImagesList = existingImages ? JSON.parse(existingImages) : [];
      if (!Array.isArray(keepImagesList)) keepImagesList = [];
    } catch (e) {
      keepImagesList = [];
    }

    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );

    deleteFiles(imagesToDelete);

    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((file) => `/uploads/${file.filename}`);
      keepImagesList = [...keepImagesList, ...newPaths];
    }

    if (keepImagesList.length > 5) {
      keepImagesList = keepImagesList.slice(0, 5);
    }

    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: {
        trackingNumber,
        productName,
        quantity: quantity ? parseInt(quantity) : undefined,
        note,
        // [修改] 直接存入陣列
        productImages: keepImagesList,
      },
    });

    res.status(200).json({
      success: true,
      message: "包裹資料更新成功",
      package: updatedPackage,
    });
  } catch (error) {
    console.error("更新包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 會員刪除自己的包裹 (含物理圖片刪除)
 * @route DELETE /api/packages/:id
 */
const deleteMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({
      where: { id: id, userId: userId },
    });

    if (!pkg) {
      return res
        .status(404)
        .json({ success: false, message: "找不到包裹或權限不足" });
    }
    if (pkg.status !== "PENDING") {
      return res
        .status(400)
        .json({ success: false, message: "包裹已入庫或處理中，無法刪除" });
    }

    // [修改] 直接讀取 DB Json
    const productImages = pkg.productImages || [];
    const warehouseImages = pkg.warehouseImages || [];

    deleteFiles([...productImages, ...warehouseImages]);

    await prisma.package.delete({
      where: { id: id },
    });

    res.status(200).json({ success: true, message: "包裹刪除成功" });
  } catch (error) {
    console.error("刪除包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

module.exports = {
  createPackageForecast,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
};
