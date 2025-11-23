// backend/controllers/packageController.js (V9 優化版 - 整合檔案管理)

const prisma = require("../config/db.js");
const fs = require("fs");
const path = require("path");

// --- 輔助函式：安全刪除多個檔案 ---
const deleteFiles = (filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;

  const uploadDir = path.join(__dirname, "../public/uploads");

  filePaths.forEach((filePath) => {
    try {
      // 確保只處理 uploads 目錄下的檔案，防止路徑遍歷
      const fileName = path.basename(filePath);
      if (!fileName) return;

      const absolutePath = path.join(uploadDir, fileName);

      // 檢查檔案是否存在再刪除
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (err) {
      console.warn(`[File Warning] 刪除檔案失敗 (${filePath}):`, err.message);
    }
  });
};

/**
 * @description 包裹預報 (支援純 JSON 或 FormData 圖片上傳)
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
        productImages: JSON.stringify(imagePaths), // 儲存圖片路徑陣列
        warehouseImages: "[]", // 倉庫圖片預設為空
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

    // 解析 JSON 欄位
    const packagesWithParsedJson = myPackages.map((pkg) => {
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
        arrivedBoxesJson: undefined, // 移除原始 JSON 字串，保持回應乾淨
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
 * @description 會員修改自己的包裹 (含圖片增刪邏輯)
 * @route PUT /api/packages/:id
 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, productName, quantity, note, existingImages } =
      req.body;
    const userId = req.user.id;

    // 1. 檢查權限與狀態
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

    // 2. 處理圖片邏輯 (比對舊圖，物理刪除被移除的)
    let originalImagesList = [];
    try {
      originalImagesList = JSON.parse(pkg.productImages || "[]");
    } catch (e) {}

    let keepImagesList = [];
    try {
      // existingImages 若為空字串或 undefined，parse 會報錯，需處理
      keepImagesList = existingImages ? JSON.parse(existingImages) : [];
      if (!Array.isArray(keepImagesList)) keepImagesList = [];
    } catch (e) {
      keepImagesList = [];
    }

    // 找出「原本有」但「現在沒了」的圖片 -> 刪除檔案
    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );

    // 使用輔助函式刪除舊圖
    deleteFiles(imagesToDelete);

    // 3. 加入新上傳的圖片
    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((file) => `/uploads/${file.filename}`);
      keepImagesList = [...keepImagesList, ...newPaths];
    }

    // 限制最多 5 張
    if (keepImagesList.length > 5) {
      keepImagesList = keepImagesList.slice(0, 5);
    }

    // 4. 更新資料庫
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: {
        trackingNumber,
        productName,
        quantity: quantity ? parseInt(quantity) : undefined,
        note,
        productImages: JSON.stringify(keepImagesList),
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

    // 1. 物理刪除圖片 (會員上傳的)
    let productImages = [];
    try {
      productImages = JSON.parse(pkg.productImages || "[]");
    } catch (e) {}

    // 2. 物理刪除倉庫圖片 (理論上 PENDING 狀態不應有，但保險起見)
    let warehouseImages = [];
    try {
      warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
    } catch (e) {}

    deleteFiles([...productImages, ...warehouseImages]);

    // 3. 刪除資料庫紀錄
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
