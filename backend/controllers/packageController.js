// 這是 backend/controllers/packageController.js (最終修正版，支援分箱)

const prisma = require("../config/db.js");

/**
 * @description 包裹預報 (建立新包裹) - (純 JSON 版)
 * @route       POST /api/packages/forecast/json
 * @route       POST /api/packages/forecast/images
 * @access      Private
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

    // *** 這是修復的關鍵邏輯 ***
    // (1) 檢查 req.files (來自 upload.array("images", 5) 中間件)
    let imagePaths = "[]"; // 預設為空 JSON 陣列
    if (req.files && req.files.length > 0) {
      // (2) 將檔案轉換為 URL 路徑
      const paths = req.files.map((file) => `/uploads/${file.filename}`);
      // (3) 存成 JSON 字串
      imagePaths = JSON.stringify(paths);
    }
    // *** 修復邏輯結束 ***

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber,
        productName: productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note: note,
        productImages: imagePaths, // (4) 使用新的 imagePaths 變數
        warehouseImages: "[]", // 預設為空陣列
        userId: userId,
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
 * @route       GET /api/packages/my
 * @access      Private
 */
const getMyPackages = async (req, res) => {
  try {
    const userId = req.user.id;
    const myPackages = await prisma.package.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });

    // --- (*** 這是 [修改重點] ***) ---
    // 我們要安全地解析 JSON 欄位
    const packagesWithParsedJson = myPackages.map((pkg) => {
      let productImages = [];
      let warehouseImages = [];
      let arrivedBoxes = []; // <-- [新增]

      try {
        productImages = JSON.parse(pkg.productImages || "[]");
      } catch (e) {
        console.warn(
          `包裹 ${pkg.id} 的 productImages 格式錯誤 (值: ${pkg.productImages})，已重設為空陣列。`
        );
      }

      try {
        warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
      } catch (e) {
        console.warn(
          `包裹 ${pkg.id} 的 warehouseImages 格式錯誤 (值: ${pkg.warehouseImages})，已重設為空陣列。`
        );
      }

      // [新增] 解析分箱資料
      try {
        arrivedBoxes = JSON.parse(pkg.arrivedBoxesJson || "[]");
      } catch (e) {
        console.warn(
          `包裹 ${pkg.id} 的 arrivedBoxesJson 格式錯誤 (值: ${pkg.arrivedBoxesJson})，已重設為空陣列。`
        );
      }

      return {
        ...pkg,
        productImages: productImages, // 回傳解析後的陣列
        warehouseImages: warehouseImages, // 回傳解析後的陣列
        arrivedBoxes: arrivedBoxes, // <-- [新增] 回傳解析後的分箱陣列
        arrivedBoxesJson: undefined, // 移除原始 JSON 字串，節省傳輸
      };
    });
    // --- (*** 修改結束 ***) ---

    res.status(200).json({
      success: true,
      count: packagesWithParsedJson.length,
      packages: packagesWithParsedJson, // <-- [修改]
    });
  } catch (error) {
    console.error("查詢我的包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description (新) 會員修改自己的包裹
 * @route       PUT /api/packages/:id
 * @access      Private
 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, productName, quantity, note } = req.body;
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
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: {
        trackingNumber,
        productName,
        quantity: quantity ? parseInt(quantity) : undefined,
        note,
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
 * @description (新) 會員刪除自己的包裹
 * @route       DELETE /api/packages/:id
 * @access      Private
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
    await prisma.package.delete({
      where: { id: id },
    });
    res.status(200).json({ success: true, message: "包裹刪除成功" });
  } catch (error) {
    console.error("刪除包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// (保留骨架)
const getPackageById = (req, res) => {
  res.json({
    message: `OK, Ggting package ${req.params.id} details (not implemented)`,
  });
};

module.exports = {
  createPackageForecast,
  getMyPackages,
  getPackageById,
  updateMyPackage,
  deleteMyPackage,
};
