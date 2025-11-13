// 這是 backend/controllers/adminController.js (最終完整無省略版)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

// --- 常數定義 (用於運費計算) ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317; // 材積參數
const CBM_TO_CAI_FACTOR = 35.3; // CBM轉材參數

// --- 包裹管理 ---

// 1. 取得所有包裹
const getAllPackages = async (req, res) => {
  try {
    const allPackages = await prisma.package.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });

    // 安全解析 JSON 欄位
    const packagesWithImages = allPackages.map((pkg) => {
      let productImages = [];
      let warehouseImages = [];
      try {
        productImages = JSON.parse(pkg.productImages || "[]");
      } catch (e) {
        console.warn(`包裹 ${pkg.id} productImages 格式錯誤`);
      }
      try {
        warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
      } catch (e) {
        console.warn(`包裹 ${pkg.id} warehouseImages 格式錯誤`);
      }

      return { ...pkg, productImages, warehouseImages };
    });

    res.status(200).json({
      success: true,
      count: packagesWithImages.length,
      packages: packagesWithImages,
    });
  } catch (error) {
    console.error("管理員取得所有包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 2. 更新包裹狀態
const updatePackageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: '請提供 "status" 欄位' });
    }

    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: { status: status },
    });

    res.status(200).json({
      success: true,
      message: `包裹狀態已更新為 ${status}`,
      package: updatedPackage,
    });
  } catch (error) {
    console.error("管理員更新包裹狀態時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到包裹" });
  }
};

// 3. 更新包裹詳細資料 (含運費計算 & 實體照片刪除)
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      actualWeight,
      actualLength,
      actualWidth,
      actualHeight,
      furnitureType,
      existingImages, // 前端傳來的「要保留的舊照片」JSON 字串
    } = req.body;

    // (1) 先從資料庫撈出「原始」包裹資料
    const originalPackage = await prisma.package.findUnique({
      where: { id: id },
    });

    if (!originalPackage) {
      return res.status(404).json({ success: false, message: "找不到包裹" });
    }

    const dataToUpdate = {};

    // (2) 更新基本欄位
    if (status) dataToUpdate.status = status;
    if (furnitureType) dataToUpdate.furnitureType = furnitureType;

    const weight = parseFloat(actualWeight);
    const length = parseFloat(actualLength);
    const width = parseFloat(actualWidth);
    const height = parseFloat(actualHeight);

    if (!isNaN(weight)) dataToUpdate.actualWeight = weight;
    if (!isNaN(length)) dataToUpdate.actualLength = length;
    if (!isNaN(width)) dataToUpdate.actualWidth = width;
    if (!isNaN(height)) dataToUpdate.actualHeight = height;

    // (3) 自動計算：材積 (CBM) & 運費 (Shipping Fee)
    if (
      !isNaN(length) &&
      !isNaN(width) &&
      !isNaN(height) &&
      length > 0 &&
      width > 0 &&
      height > 0
    ) {
      // A. 計算 CBM
      const volumeVal = (length * width * height) / 28317;
      dataToUpdate.actualCbm = volumeVal / 35.3;

      // B. 計算運費 (若有重量且有家具類型)
      const typeKey = furnitureType || originalPackage.furnitureType;
      const validWeight = !isNaN(weight)
        ? weight
        : originalPackage.actualWeight;

      if (typeKey && RATES[typeKey] && validWeight > 0) {
        const rate = RATES[typeKey];

        // 無條件進位計算材數與重量
        const cai = Math.ceil((length * width * height) / VOLUME_DIVISOR);
        const w = Math.ceil(validWeight * 10) / 10;

        const volumeCost = cai * rate.volumeRate;
        const weightCost = w * rate.weightRate;

        // 取大者為運費
        dataToUpdate.shippingFee = Math.max(volumeCost, weightCost);
      }
    }

    // (4) 照片處理與檔案刪除邏輯

    // A. 解析原始照片列表
    let originalImagesList = [];
    try {
      originalImagesList = JSON.parse(originalPackage.warehouseImages || "[]");
    } catch (e) {
      originalImagesList = [];
    }

    // B. 解析前端傳來「想保留」的列表
    let keepImagesList = [];
    if (existingImages) {
      try {
        keepImagesList = JSON.parse(existingImages);
        if (!Array.isArray(keepImagesList)) keepImagesList = [];
      } catch (e) {
        keepImagesList = [];
      }
    }

    // C. 找出被刪除的照片，並執行實體檔案刪除
    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );

    imagesToDelete.forEach((imgUrl) => {
      // 將 URL 路徑轉換為絕對路徑
      const relativePath = imgUrl.replace("/uploads/", "");
      const absolutePath = path.join(
        __dirname,
        "../public/uploads",
        relativePath
      );

      if (fs.existsSync(absolutePath)) {
        fs.unlink(absolutePath, (err) => {
          if (err) console.error(`刪除檔案失敗: ${absolutePath}`, err);
          else console.log(`成功刪除實體檔案: ${absolutePath}`);
        });
      }
    });

    // D. 組合最終列表 (保留的 + 新上傳的)
    let finalImageList = [...keepImagesList];

    if (req.files && req.files.length > 0) {
      const newImagePaths = req.files.map(
        (file) => `/uploads/${file.filename}`
      );
      finalImageList = [...finalImageList, ...newImagePaths];
    }

    // E. 強制限制最多 3 張
    if (finalImageList.length > 3) {
      finalImageList = finalImageList.slice(0, 3);
    }

    dataToUpdate.warehouseImages = JSON.stringify(finalImageList);

    // (5) 執行資料庫更新
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: dataToUpdate,
    });

    res.status(200).json({
      success: true,
      message: "包裹詳細資料與運費更新成功 (已清理舊圖片)",
      package: updatedPackage,
    });
  } catch (error) {
    console.error("管理員更新包裹細節時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到包裹" });
  }
};

// --- 集運單管理 ---

// 4. 更新集運單狀態
const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, totalCost, trackingNumberTW } = req.body;
    const dataToUpdate = {};

    if (status) dataToUpdate.status = status;

    const cost = parseFloat(totalCost);
    if (!isNaN(cost)) dataToUpdate.totalCost = cost;

    if (trackingNumberTW) dataToUpdate.trackingNumberTW = trackingNumberTW;

    if (Object.keys(dataToUpdate).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "請提供至少一個要更新的欄位" });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: dataToUpdate,
    });

    res.status(200).json({
      success: true,
      message: "集運單資料更新成功",
      shipment: updatedShipment,
    });
  } catch (error) {
    console.error("管理員更新集運單時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到集運單" });
  }
};

// 5. 取得所有集運單
const getAllShipments = async (req, res) => {
  try {
    const allShipments = await prisma.shipment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        packages: { select: { productName: true, trackingNumber: true } },
      },
    });

    const processedShipments = allShipments.map((ship) => {
      let services = {};
      try {
        services = JSON.parse(ship.additionalServices || "{}");
      } catch (e) {
        console.warn(`集運單 ${ship.id} additionalServices 格式錯誤`);
      }
      return { ...ship, additionalServices: services };
    });

    res.status(200).json({
      success: true,
      count: processedShipments.length,
      shipments: processedShipments,
    });
  } catch (error) {
    console.error("管理員取得所有集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 6. 退回/拒絕集運單 (釋放包裹)
const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      // 更新集運單為取消
      const updatedShipment = await tx.shipment.update({
        where: { id: id },
        data: { status: "CANCELLED" },
      });

      // 釋放所有包裹 (回到 ARRIVED 狀態，解除關聯)
      const releasedPackages = await tx.package.updateMany({
        where: { shipmentId: id },
        data: {
          status: "ARRIVED",
          shipmentId: null,
        },
      });

      return { updatedShipment, releasedPackages };
    });

    res.status(200).json({
      success: true,
      message: `集運單已退回，並釋放了 ${result.releasedPackages.count} 個包裹。`,
    });
  } catch (error) {
    console.error("退回集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// --- 會員/員工管理 ---

// 7. 建立員工帳號
const createStaffUser = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 Email、密碼、姓名和角色" });
    }

    const userExists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    }

    if (role !== "ADMIN" && role !== "OPERATOR") {
      return res
        .status(400)
        .json({
          success: false,
          message: "無效的角色 (只允許 ADMIN 或 OPERATOR)",
        });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        role: role,
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    res.status(201).json({
      success: true,
      message: "員工帳號建立成功！",
      user: newUser,
    });
  } catch (error) {
    console.error("建立員工帳號時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 8. 取得所有使用者
const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        isActive: true,
      },
    });
    res.status(200).json({
      success: true,
      count: users.length,
      users: users,
    });
  } catch (error) {
    console.error("管理員取得所有使用者時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 9. 切換使用者狀態 (啟用/停用)
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res
        .status(400)
        .json({ success: false, message: '請提供 "isActive" 狀態' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { isActive: isActive },
      select: { id: true, email: true, isActive: true },
    });

    res.status(200).json({
      success: true,
      message: `會員 ${updatedUser.email} 狀態已更新為 ${
        isActive ? "啟用" : "停用"
      }`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("更新會員狀態失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 10. 重設密碼
const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const DEFAULT_PASSWORD = "8888";
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, salt);

    await prisma.user.update({
      where: { id: id },
      data: { passwordHash: passwordHash },
    });

    res.status(200).json({
      success: true,
      message: `密碼已成功重設為 "${DEFAULT_PASSWORD}"`,
    });
  } catch (error) {
    console.error("重設密碼失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 11. 永久刪除使用者 (連動刪除包裹與集運單)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // 防止刪除自己
    if (req.user.id === id) {
      return res
        .status(400)
        .json({ success: false, message: "您不能刪除自己的管理員帳號" });
    }

    // 使用 Transaction 確保資料一致性
    await prisma.$transaction(async (tx) => {
      // 刪除關聯包裹
      await tx.package.deleteMany({
        where: { userId: id },
      });

      // 刪除關聯集運單
      await tx.shipment.deleteMany({
        where: { userId: id },
      });

      // 刪除使用者
      await tx.user.delete({
        where: { id: id },
      });
    });

    res
      .status(200)
      .json({ success: true, message: "使用者及其所有關聯資料已永久刪除" });
  } catch (error) {
    console.error("刪除使用者失敗:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "刪除失敗，可能含有無法刪除的關聯資料",
      });
  }
};

module.exports = {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails, // 包含運費計算與檔案刪除
  getUsers,
  updateShipmentStatus,
  getAllShipments,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  deleteUser,
}; // 這是 backend/controllers/adminController.js (最終完整無省略版)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

// --- 常數定義 (用於運費計算) ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317; // 材積參數
const CBM_TO_CAI_FACTOR = 35.3; // CBM轉材參數

// --- 包裹管理 ---

// 1. 取得所有包裹
const getAllPackages = async (req, res) => {
  try {
    const allPackages = await prisma.package.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });

    // 安全解析 JSON 欄位
    const packagesWithImages = allPackages.map((pkg) => {
      let productImages = [];
      let warehouseImages = [];
      try {
        productImages = JSON.parse(pkg.productImages || "[]");
      } catch (e) {
        console.warn(`包裹 ${pkg.id} productImages 格式錯誤`);
      }
      try {
        warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
      } catch (e) {
        console.warn(`包裹 ${pkg.id} warehouseImages 格式錯誤`);
      }

      return { ...pkg, productImages, warehouseImages };
    });

    res.status(200).json({
      success: true,
      count: packagesWithImages.length,
      packages: packagesWithImages,
    });
  } catch (error) {
    console.error("管理員取得所有包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 2. 更新包裹狀態
const updatePackageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: '請提供 "status" 欄位' });
    }

    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: { status: status },
    });

    res.status(200).json({
      success: true,
      message: `包裹狀態已更新為 ${status}`,
      package: updatedPackage,
    });
  } catch (error) {
    console.error("管理員更新包裹狀態時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到包裹" });
  }
};

// 3. 更新包裹詳細資料 (含運費計算 & 實體照片刪除)
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      actualWeight,
      actualLength,
      actualWidth,
      actualHeight,
      furnitureType,
      existingImages, // 前端傳來的「要保留的舊照片」JSON 字串
    } = req.body;

    // (1) 先從資料庫撈出「原始」包裹資料
    const originalPackage = await prisma.package.findUnique({
      where: { id: id },
    });

    if (!originalPackage) {
      return res.status(404).json({ success: false, message: "找不到包裹" });
    }

    const dataToUpdate = {};

    // (2) 更新基本欄位
    if (status) dataToUpdate.status = status;
    if (furnitureType) dataToUpdate.furnitureType = furnitureType;

    const weight = parseFloat(actualWeight);
    const length = parseFloat(actualLength);
    const width = parseFloat(actualWidth);
    const height = parseFloat(actualHeight);

    if (!isNaN(weight)) dataToUpdate.actualWeight = weight;
    if (!isNaN(length)) dataToUpdate.actualLength = length;
    if (!isNaN(width)) dataToUpdate.actualWidth = width;
    if (!isNaN(height)) dataToUpdate.actualHeight = height;

    // (3) 自動計算：材積 (CBM) & 運費 (Shipping Fee)
    if (
      !isNaN(length) &&
      !isNaN(width) &&
      !isNaN(height) &&
      length > 0 &&
      width > 0 &&
      height > 0
    ) {
      // A. 計算 CBM
      const volumeVal = (length * width * height) / 28317;
      dataToUpdate.actualCbm = volumeVal / 35.3;

      // B. 計算運費 (若有重量且有家具類型)
      const typeKey = furnitureType || originalPackage.furnitureType;
      const validWeight = !isNaN(weight)
        ? weight
        : originalPackage.actualWeight;

      if (typeKey && RATES[typeKey] && validWeight > 0) {
        const rate = RATES[typeKey];

        // 無條件進位計算材數與重量
        const cai = Math.ceil((length * width * height) / VOLUME_DIVISOR);
        const w = Math.ceil(validWeight * 10) / 10;

        const volumeCost = cai * rate.volumeRate;
        const weightCost = w * rate.weightRate;

        // 取大者為運費
        dataToUpdate.shippingFee = Math.max(volumeCost, weightCost);
      }
    }

    // (4) 照片處理與檔案刪除邏輯

    // A. 解析原始照片列表
    let originalImagesList = [];
    try {
      originalImagesList = JSON.parse(originalPackage.warehouseImages || "[]");
    } catch (e) {
      originalImagesList = [];
    }

    // B. 解析前端傳來「想保留」的列表
    let keepImagesList = [];
    if (existingImages) {
      try {
        keepImagesList = JSON.parse(existingImages);
        if (!Array.isArray(keepImagesList)) keepImagesList = [];
      } catch (e) {
        keepImagesList = [];
      }
    }

    // C. 找出被刪除的照片，並執行實體檔案刪除
    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );

    imagesToDelete.forEach((imgUrl) => {
      // 將 URL 路徑轉換為絕對路徑
      const relativePath = imgUrl.replace("/uploads/", "");
      const absolutePath = path.join(
        __dirname,
        "../public/uploads",
        relativePath
      );

      if (fs.existsSync(absolutePath)) {
        fs.unlink(absolutePath, (err) => {
          if (err) console.error(`刪除檔案失敗: ${absolutePath}`, err);
          else console.log(`成功刪除實體檔案: ${absolutePath}`);
        });
      }
    });

    // D. 組合最終列表 (保留的 + 新上傳的)
    let finalImageList = [...keepImagesList];

    if (req.files && req.files.length > 0) {
      const newImagePaths = req.files.map(
        (file) => `/uploads/${file.filename}`
      );
      finalImageList = [...finalImageList, ...newImagePaths];
    }

    // E. 強制限制最多 3 張
    if (finalImageList.length > 3) {
      finalImageList = finalImageList.slice(0, 3);
    }

    dataToUpdate.warehouseImages = JSON.stringify(finalImageList);

    // (5) 執行資料庫更新
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: dataToUpdate,
    });

    res.status(200).json({
      success: true,
      message: "包裹詳細資料與運費更新成功 (已清理舊圖片)",
      package: updatedPackage,
    });
  } catch (error) {
    console.error("管理員更新包裹細節時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到包裹" });
  }
};

// --- 集運單管理 ---

// 4. 更新集運單狀態
const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, totalCost, trackingNumberTW } = req.body;
    const dataToUpdate = {};

    if (status) dataToUpdate.status = status;

    const cost = parseFloat(totalCost);
    if (!isNaN(cost)) dataToUpdate.totalCost = cost;

    if (trackingNumberTW) dataToUpdate.trackingNumberTW = trackingNumberTW;

    if (Object.keys(dataToUpdate).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "請提供至少一個要更新的欄位" });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: dataToUpdate,
    });

    res.status(200).json({
      success: true,
      message: "集運單資料更新成功",
      shipment: updatedShipment,
    });
  } catch (error) {
    console.error("管理員更新集運單時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到集運單" });
  }
};

// 5. 取得所有集運單
const getAllShipments = async (req, res) => {
  try {
    const allShipments = await prisma.shipment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        packages: { select: { productName: true, trackingNumber: true } },
      },
    });

    const processedShipments = allShipments.map((ship) => {
      let services = {};
      try {
        services = JSON.parse(ship.additionalServices || "{}");
      } catch (e) {
        console.warn(`集運單 ${ship.id} additionalServices 格式錯誤`);
      }
      return { ...ship, additionalServices: services };
    });

    res.status(200).json({
      success: true,
      count: processedShipments.length,
      shipments: processedShipments,
    });
  } catch (error) {
    console.error("管理員取得所有集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 6. 退回/拒絕集運單 (釋放包裹)
const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      // 更新集運單為取消
      const updatedShipment = await tx.shipment.update({
        where: { id: id },
        data: { status: "CANCELLED" },
      });

      // 釋放所有包裹 (回到 ARRIVED 狀態，解除關聯)
      const releasedPackages = await tx.package.updateMany({
        where: { shipmentId: id },
        data: {
          status: "ARRIVED",
          shipmentId: null,
        },
      });

      return { updatedShipment, releasedPackages };
    });

    res.status(200).json({
      success: true,
      message: `集運單已退回，並釋放了 ${result.releasedPackages.count} 個包裹。`,
    });
  } catch (error) {
    console.error("退回集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// --- 會員/員工管理 ---

// 7. 建立員工帳號
const createStaffUser = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 Email、密碼、姓名和角色" });
    }

    const userExists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    }

    if (role !== "ADMIN" && role !== "OPERATOR") {
      return res
        .status(400)
        .json({
          success: false,
          message: "無效的角色 (只允許 ADMIN 或 OPERATOR)",
        });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        role: role,
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    res.status(201).json({
      success: true,
      message: "員工帳號建立成功！",
      user: newUser,
    });
  } catch (error) {
    console.error("建立員工帳號時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 8. 取得所有使用者
const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        isActive: true,
      },
    });
    res.status(200).json({
      success: true,
      count: users.length,
      users: users,
    });
  } catch (error) {
    console.error("管理員取得所有使用者時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 9. 切換使用者狀態 (啟用/停用)
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res
        .status(400)
        .json({ success: false, message: '請提供 "isActive" 狀態' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { isActive: isActive },
      select: { id: true, email: true, isActive: true },
    });

    res.status(200).json({
      success: true,
      message: `會員 ${updatedUser.email} 狀態已更新為 ${
        isActive ? "啟用" : "停用"
      }`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("更新會員狀態失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 10. 重設密碼
const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const DEFAULT_PASSWORD = "8888";
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, salt);

    await prisma.user.update({
      where: { id: id },
      data: { passwordHash: passwordHash },
    });

    res.status(200).json({
      success: true,
      message: `密碼已成功重設為 "${DEFAULT_PASSWORD}"`,
    });
  } catch (error) {
    console.error("重設密碼失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 11. 永久刪除使用者 (連動刪除包裹與集運單)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // 防止刪除自己
    if (req.user.id === id) {
      return res
        .status(400)
        .json({ success: false, message: "您不能刪除自己的管理員帳號" });
    }

    // 使用 Transaction 確保資料一致性
    await prisma.$transaction(async (tx) => {
      // 刪除關聯包裹
      await tx.package.deleteMany({
        where: { userId: id },
      });

      // 刪除關聯集運單
      await tx.shipment.deleteMany({
        where: { userId: id },
      });

      // 刪除使用者
      await tx.user.delete({
        where: { id: id },
      });
    });

    res
      .status(200)
      .json({ success: true, message: "使用者及其所有關聯資料已永久刪除" });
  } catch (error) {
    console.error("刪除使用者失敗:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "刪除失敗，可能含有無法刪除的關聯資料",
      });
  }
};

module.exports = {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails, // 包含運費計算與檔案刪除
  getUsers,
  updateShipmentStatus,
  getAllShipments,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  deleteUser,
};
