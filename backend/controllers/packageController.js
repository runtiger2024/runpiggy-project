// backend/controllers/packageController.js (V8 完整版 - 支援圖片 CRUD)

const prisma = require("../config/db.js");
const fs = require("fs");
const path = require("path");

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
    let imagePaths = "[]";
    if (req.files && req.files.length > 0) {
      const paths = req.files.map((file) => `/uploads/${file.filename}`);
      imagePaths = JSON.stringify(paths);
    }

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber,
        productName: productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note: note,
        productImages: imagePaths, // 儲存圖片路徑陣列
        warehouseImages: "[]", // 倉庫圖片預設為空
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
        arrivedBoxesJson: undefined, // 移除原始 JSON 字串
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
      keepImagesList = JSON.parse(existingImages || "[]");
      if (!Array.isArray(keepImagesList)) keepImagesList = [];
    } catch (e) {
      keepImagesList = [];
    }

    // 找出「原本有」但「現在沒了」的圖片 -> 刪除檔案
    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    imagesToDelete.forEach((imgUrl) => {
      try {
        const filename = imgUrl.split("/").pop();
        if (filename) {
          const absolutePath = path.join(uploadDir, filename);
          if (fs.existsSync(absolutePath)) {
            fs.unlink(absolutePath, (err) => {
              if (err)
                console.warn(`刪除舊圖失敗 (不影響流程): ${err.message}`);
            });
          }
        }
      } catch (err) {
        console.warn(`處理刪除圖片錯誤: ${err.message}`);
      }
    });

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

    // 1. 物理刪除圖片
    try {
      const imgs = JSON.parse(pkg.productImages || "[]");
      imgs.forEach((imgUrl) => {
        const filename = imgUrl.split("/").pop();
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
    } catch (e) {
      console.warn("刪除圖片時發生錯誤:", e.message);
    }

    // 2. 刪除資料庫紀錄
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
