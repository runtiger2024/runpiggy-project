// 這是 adminController.js (最終完整版，支援「新增員工」和「退回集運單」)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs"); // (新) 載入 bcryptjs

// --- (包裹管理函式 ... 保持不變) ---
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
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualWeight, actualLength, actualWidth, actualHeight } =
      req.body;
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
    if (
      !isNaN(length) &&
      !isNaN(width) &&
      !isNaN(height) &&
      length > 0 &&
      width > 0 &&
      height > 0
    ) {
      const volume = (length * width * height) / 28317; // 材積
      dataToUpdate.actualCbm = volume / 35.3; // 立方米
    }
    if (req.files && req.files.length > 0) {
      const newImagePaths = req.files.map(
        (file) => `/uploads/${file.filename}`
      );
      const pkg = await prisma.package.findUnique({ where: { id: id } });
      const existingImages = JSON.parse(pkg.warehouseImages || "[]");
      dataToUpdate.warehouseImages = JSON.stringify([
        ...existingImages,
        ...newImagePaths,
      ]);
    }
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: dataToUpdate,
    });
    res.status(200).json({
      success: true,
      message: "包裹詳細資料更新成功",
      package: updatedPackage,
    });
  } catch (error) {
    console.error("管理員更新包裹細節時發生錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器發生錯誤或找不到包裹" });
  }
};

// --- (集運單管理函式) ---
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

/**
 * @description (新) (Admin) 退回/拒絕一筆集運單
 * @route       PUT /api/admin/shipments/:id/reject
 * @access      Private/Admin
 */
const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params; // 集運單 ID

    // (1) 使用「交易」來確保兩邊都更新成功
    const result = await prisma.$transaction(async (tx) => {
      // (A) 更新集運單狀態
      const updatedShipment = await tx.shipment.update({
        where: { id: id },
        data: {
          status: "CANCELLED", // 標記為已取消
        },
      });

      // (B) 釋放所有關聯的包裹
      //    把包裹狀態從 'IN_SHIPMENT' 改回 'ARRIVED'
      //    並解除 shipmentId 的關聯
      const releasedPackages = await tx.package.updateMany({
        where: { shipmentId: id },
        data: {
          status: "ARRIVED",
          shipmentId: null, // 解除綁定
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

// --- (會員/使用者管理函式) ---

/**
 * @description (新) (Admin) 建立新的員工帳號 (操作員/管理員)
 * @route       POST /api/admin/users/create
 * @access      Private/Admin
 */
const createStaffUser = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // (這參考了 RUNPIGGY-V2 的 register.js 和 adminRoutes.js)
    if (!email || !password || !name || !role) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 Email、密碼、姓名和角色" });
    }

    // 檢查 Email 是否已存在
    const userExists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    }

    // 檢查角色是否合法 (我們不允許在這裡建立 'USER')
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return res
        .status(400)
        .json({
          success: false,
          message: "無效的角色 (只允許 ADMIN 或 OPERATOR)",
        });
    }

    // 加密密碼
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 建立新使用者
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        role: role, // 'ADMIN' 或 'OPERATOR'
        isActive: true, // 預設啟用
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

// (*** 這是最重要的修復 ***)
module.exports = {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails,
  getUsers,
  updateShipmentStatus,
  getAllShipments,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser, // <-- (已加入)
  rejectShipment, // <-- (已加入)
};
