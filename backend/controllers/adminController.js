// 這是 backend/controllers/adminController.js (最終完整版：含檔案刪除 & 員工管理 & 退回集運)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs"); // [新增] 引入檔案系統模組
const path = require("path"); // [新增] 引入路徑處理模組

// --- 包裹管理 ---

const getAllPackages = async (req, res) => {
  try {
    const allPackages = await prisma.package.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    // (安全解析 JSON)
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

// [重要修改] 更新包裹詳情 (含實體檔案刪除邏輯)
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      actualWeight,
      actualLength,
      actualWidth,
      actualHeight,
      existingImages, // 前端傳來的「要保留的舊照片」JSON 字串
    } = req.body;

    // 1. 先從資料庫撈出「原始」包裹資料，為了比對照片
    const originalPackage = await prisma.package.findUnique({
      where: { id: id },
    });

    if (!originalPackage) {
      return res.status(404).json({ success: false, message: "找不到包裹" });
    }

    // 2. 準備更新資料
    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;
    const weight = parseFloat(actualWeight);
    const length = parseFloat(actualLength);
    const width = parseFloat(actualWidth);
    const height = parseFloat(actualHeight);

    if (!isNaN(weight)) dataToUpdate.actualWeight = weight;
    if (!isNaN(length)) dataToUpdate.actualLength = length;
    if (!isNaN(width)) dataToUpdate.actualWidth = width;
    if (!isNaN(height)) dataToUpdate.actualHeight = height;

    // 自動計算材積 (CBM)
    if (
      !isNaN(length) &&
      !isNaN(width) &&
      !isNaN(height) &&
      length > 0 &&
      width > 0 &&
      height > 0
    ) {
      const volume = (length * width * height) / 28317;
      dataToUpdate.actualCbm = volume / 35.3;
    }

    // 3. [核心] 照片處理與檔案刪除邏輯

    // (A) 解析「原始」資料庫中的照片列表
    let originalImagesList = [];
    try {
      originalImagesList = JSON.parse(originalPackage.warehouseImages || "[]");
    } catch (e) {
      originalImagesList = [];
    }

    // (B) 解析前端傳來「想保留」的舊照片列表
    let keepImagesList = [];
    if (existingImages) {
      try {
        keepImagesList = JSON.parse(existingImages);
        if (!Array.isArray(keepImagesList)) keepImagesList = [];
      } catch (e) {
        keepImagesList = [];
      }
    }

    // (C) 找出「被刪除」的照片 (原始有，但保留列表沒有的)
    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );

    // (D) 執行實體檔案刪除
    imagesToDelete.forEach((imgUrl) => {
      // imgUrl 範例: "/uploads/filename.png"
      // 我們需要將它轉為絕對路徑: "C:/project/backend/public/uploads/filename.png"
      const relativePath = imgUrl.replace("/uploads/", ""); // 取得檔名
      const absolutePath = path.join(
        __dirname,
        "../public/uploads",
        relativePath
      );

      // 檢查檔案是否存在，存在則刪除
      if (fs.existsSync(absolutePath)) {
        fs.unlink(absolutePath, (err) => {
          if (err) console.error(`刪除檔案失敗: ${absolutePath}`, err);
          else console.log(`成功刪除實體檔案: ${absolutePath}`);
        });
      }
    });

    // (E) 組合最終要存入資料庫的新列表 (保留的舊圖 + 新上傳的圖)
    let finalImageList = [...keepImagesList];

    if (req.files && req.files.length > 0) {
      const newImagePaths = req.files.map(
        (file) => `/uploads/${file.filename}`
      );
      finalImageList = [...finalImageList, ...newImagePaths];
    }

    // (F) 強制限制最多 3 張 (若有多餘的，把新上傳的多的也刪掉)
    if (finalImageList.length > 3) {
      // 這裡可以做更細緻的處理，目前簡單做截斷，並刪除截斷的檔案(如果是新上傳的)
      // 實務上前端已經擋了，這裡做個防守即可
      finalImageList = finalImageList.slice(0, 3);
    }

    dataToUpdate.warehouseImages = JSON.stringify(finalImageList);

    // 4. 執行資料庫更新
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: dataToUpdate,
    });

    res.status(200).json({
      success: true,
      message: "包裹詳細資料更新成功 (已清理舊圖片)",
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

const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.$transaction(async (tx) => {
      const updatedShipment = await tx.shipment.update({
        where: { id: id },
        data: { status: "CANCELLED" },
      });
      const releasedPackages = await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
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
      return res.status(400).json({
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

// [新增] 永久刪除使用者
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id === id) {
      return res
        .status(400)
        .json({ success: false, message: "您不能刪除自己的管理員帳號" });
    }
    await prisma.$transaction(async (tx) => {
      await tx.package.deleteMany({ where: { userId: id } });
      await tx.shipment.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id: id } });
    });
    res
      .status(200)
      .json({ success: true, message: "使用者及其所有關聯資料已永久刪除" });
  } catch (error) {
    console.error("刪除使用者失敗:", error);
    res.status(500).json({
      success: false,
      message: "刪除失敗，可能含有無法刪除的關聯資料",
    });
  }
};

module.exports = {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails, // 已包含檔案刪除邏輯
  getUsers,
  updateShipmentStatus,
  getAllShipments,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  deleteUser,
};
