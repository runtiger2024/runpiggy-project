// 這是 backend/controllers/adminController.js (V4.1 權限 + 代客預報 整合版)
// (補上 V4 的 adminCreatePackage 和 getUsersList 函式，並修正 exports)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const createLog = require("../utils/createLog.js");
const generateToken = require("../utils/generateToken.js");

// --- 常數定義 (用於運費計算) ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317;
const CBM_TO_CAI_FACTOR = 35.3;
const MINIMUM_CHARGE = 2000;

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
      let arrivedBoxes = [];

      try {
        productImages = JSON.parse(pkg.productImages || "[]");
      } catch (e) {}
      try {
        warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
      } catch (e) {}

      try {
        // 後端傳給前端時，直接解析
        arrivedBoxes = JSON.parse(pkg.arrivedBoxesJson || "[]");
      } catch (e) {}

      return {
        ...pkg,
        productImages,
        warehouseImages,
        arrivedBoxesJson: arrivedBoxes,
      };
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

// 2. [*** V4 新增：管理員幫客戶建立包裹 ***]
const adminCreatePackage = async (req, res) => {
  try {
    // 1. 取得操作者 ID (自己)
    const adminUserId = req.user.id;

    // 2. 取得表單資料 ( V4.1 修正：改用 userId )
    const { userId, trackingNumber, productName, quantity, note } = req.body;

    if (!userId || !trackingNumber || !productName) {
      return res.status(400).json({
        success: false,
        message: "請提供客戶 ID、物流單號和商品名稱",
      });
    }

    // 3. 根據 User ID 找到客戶
    const customer = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: `找不到 ID 為 ${userId} 的客戶` });
    }

    // 4. (安全檢查 V3) 確保我們是幫 "USER" (權限為空) 建立包裹
    let customerPermissions = [];
    try {
      customerPermissions = JSON.parse(customer.permissions || "[]");
    } catch (e) {}

    if (customerPermissions.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "無法為管理員或操作員帳號新增包裹" });
    }

    // 5. 處理上傳的圖片 (與 packageController 邏輯相同)
    let imagePaths = "[]";
    if (req.files && req.files.length > 0) {
      const paths = req.files.map((file) => `/uploads/${file.filename}`);
      imagePaths = JSON.stringify(paths);
    }

    // 6. 建立包裹
    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber,
        productName: productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note: note,
        productImages: imagePaths, // 客戶圖片
        warehouseImages: "[]", // 倉庫圖片預設為空
        userId: customer.id, // [*** 關鍵 ***] 使用客戶的 ID
      },
    });

    // 7. 寫入日誌 (假設 V3 日誌系統存在)
    try {
      await createLog(
        adminUserId,
        "ADMIN_CREATE_PACKAGE",
        newPackage.id,
        `為 ${customer.email} 新增包裹 (單號: ${trackingNumber})`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }

    res.status(201).json({
      success: true,
      message: "包裹預報成功！",
      package: newPackage,
    });
  } catch (error) {
    console.error("管理員建立包裹時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 3. 更新包裹狀態 (簡易版)
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

    // [*** 新增日誌 ***]
    try {
      await createLog(
        req.user.id,
        "UPDATE_PACKAGE_STATUS",
        id,
        `狀態更新為 ${status}`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }

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

// 4. 更新包裹詳細資料 (主要)
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, boxesData, existingImages } = req.body;

    // (1) 撈出原始包裹
    const originalPackage = await prisma.package.findUnique({
      where: { id: id },
    });

    if (!originalPackage) {
      return res.status(404).json({ success: false, message: "找不到包裹" });
    }

    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;

    let calculatedTotalFee = 0;
    let boxesWithFees = [];

    // (2) 處理分箱運費計算
    if (boxesData) {
      try {
        const boxes = JSON.parse(boxesData);

        if (Array.isArray(boxes) && boxes.length > 0) {
          for (const box of boxes) {
            const name = box.name || "未命名分箱";
            const weight = parseFloat(box.weight);
            const length = parseFloat(box.length);
            const width = parseFloat(box.width);
            const height = parseFloat(box.height);
            const typeKey = box.type;

            let boxFee = 0;
            let boxCai = 0;

            if (
              !isNaN(weight) &&
              weight > 0 &&
              !isNaN(length) &&
              length > 0 &&
              !isNaN(width) &&
              width > 0 &&
              !isNaN(height) &&
              height > 0 &&
              typeKey &&
              RATES[typeKey]
            ) {
              const rate = RATES[typeKey];
              boxCai = Math.ceil((length * width * height) / VOLUME_DIVISOR);
              const volumeCost = boxCai * rate.volumeRate;
              const w = Math.ceil(weight * 10) / 10;
              const weightCost = w * rate.weightRate;
              boxFee = Math.max(volumeCost, weightCost);
            }

            calculatedTotalFee += boxFee;

            boxesWithFees.push({
              name: name,
              weight: weight,
              length: length,
              width: width,
              height: height,
              type: typeKey,
              cai: boxCai,
              fee: boxFee,
            });
          }

          dataToUpdate.arrivedBoxesJson = JSON.stringify(boxesWithFees);
          dataToUpdate.totalCalculatedFee = calculatedTotalFee;
        } else {
          dataToUpdate.arrivedBoxesJson = "[]";
          dataToUpdate.totalCalculatedFee = 0;
        }
      } catch (e) {
        console.error("解析 boxesData 失敗:", e);
        return res
          .status(400)
          .json({ success: false, message: "分箱資料(boxesData)格式錯誤" });
      }
    }

    // (4) 照片處理邏輯 (修改為 5 張)
    let originalImagesList = [];
    try {
      originalImagesList = JSON.parse(originalPackage.warehouseImages || "[]");
    } catch (e) {
      originalImagesList = [];
    }
    let keepImagesList = [];
    if (existingImages) {
      try {
        keepImagesList = JSON.parse(existingImages);
        if (!Array.isArray(keepImagesList)) keepImagesList = [];
      } catch (e) {
        keepImagesList = [];
      }
    }
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
                console.warn(`刪除檔案失敗 (不影響流程): ${err.message}`);
            });
          }
        }
      } catch (err) {
        console.warn(`處理刪除檔案時發生錯誤: ${err.message}`);
      }
    });
    let finalImageList = [...keepImagesList];
    if (req.files && req.files.length > 0) {
      const newImagePaths = req.files.map(
        (file) => `/uploads/${file.filename}`
      );
      finalImageList = [...finalImageList, ...newImagePaths];
    }

    if (finalImageList.length > 5) {
      // 已修改為 5
      finalImageList = finalImageList.slice(0, 5);
    }

    dataToUpdate.warehouseImages = JSON.stringify(finalImageList);

    // (5) 執行資料庫更新
    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: dataToUpdate,
    });

    // [*** 新增日誌 ***]
    // 建立日誌詳情
    let logDetails = [];
    if (status && originalPackage.status !== status) {
      logDetails.push(`狀態: ${originalPackage.status} -> ${status}`);
    }
    if (
      dataToUpdate.totalCalculatedFee !== originalPackage.totalCalculatedFee
    ) {
      logDetails.push(
        `費用: ${originalPackage.totalCalculatedFee || 0} -> ${
          dataToUpdate.totalCalculatedFee
        }`
      );
    }
    if (dataToUpdate.arrivedBoxesJson !== originalPackage.arrivedBoxesJson) {
      logDetails.push(`更新了 ${boxesWithFees.length} 筆分箱明細`);
    }
    try {
      await createLog(
        req.user.id,
        "UPDATE_PACKAGE_DETAILS",
        id,
        logDetails.join(", ") || "儲存更新"
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

    // (6) 回傳更新後的包裹資料 (包含解析好的 JSON)
    let parsedBoxes = [];
    let parsedImages = [];
    try {
      parsedBoxes = JSON.parse(updatedPackage.arrivedBoxesJson || "[]");
    } catch (e) {}
    try {
      parsedImages = JSON.parse(updatedPackage.warehouseImages || "[]");
    } catch (e) {}

    res.status(200).json({
      success: true,
      message: "包裹詳細資料與分箱運費更新成功 (已清理舊圖片)",
      package: {
        ...updatedPackage,
        arrivedBoxesJson: parsedBoxes,
        warehouseImages: parsedImages,
      },
    });
  } catch (error) {
    console.error("後端更新包裹錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: `伺服器錯誤: ${error.message}` });
  }
};

// --- 集運單管理 ---

// 5. 更新集運單狀態
const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, totalCost, trackingNumberTW } = req.body;

    const originalShipment = await prisma.shipment.findUnique({
      where: { id: id },
    });
    if (!originalShipment) {
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

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

    // [*** 新增日誌 ***]
    let logDetails = [];
    if (status && originalShipment.status !== status) {
      logDetails.push(`狀態: ${originalShipment.status} -> ${status}`);
    }
    if (!isNaN(cost) && originalShipment.totalCost !== cost) {
      logDetails.push(`費用: ${originalShipment.totalCost || 0} -> ${cost}`);
    }
    if (
      trackingNumberTW &&
      originalShipment.trackingNumberTW !== trackingNumberTW
    ) {
      logDetails.push(`台-單號: ${trackingNumberTW}`);
    }
    try {
      await createLog(
        req.user.id,
        "UPDATE_SHIPMENT_STATUS",
        id,
        logDetails.join(", ") || "更新資料"
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

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

// 6. 取得所有集運單
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
      } catch (e) {}
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

// 7. 退回/拒絕集運單 (釋放包裹)
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
        data: {
          status: "ARRIVED",
          shipmentId: null,
        },
      });

      return { updatedShipment, releasedPackages };
    });

    // [*** 新增日誌 ***]
    try {
      await createLog(
        req.user.id,
        "REJECT_SHIPMENT",
        id,
        `退回訂單, 釋放 ${result.releasedPackages.count} 個包裹`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

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

// 8. 建立員工帳號
const createStaffUser = async (req, res) => {
  try {
    // (*** V3 權限系統 ***)
    const { email, password, name, permissions } = req.body;

    if (!email || !password || !name) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 Email、密碼和姓名" });
    }

    if (!Array.isArray(permissions)) {
      return res
        .status(400)
        .json({ success: false, message: "權限必須是一個陣列" });
    }

    const userExists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        permissions: JSON.stringify(permissions),
        isActive: true,
      },
      select: { id: true, email: true, name: true, permissions: true },
    });

    // [*** 新增日誌 ***]
    try {
      await createLog(
        req.user.id,
        "CREATE_STAFF_USER",
        newUser.id,
        `建立新員工 ${newUser.email} (權限: ${permissions.join(", ")})`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

    res.status(201).json({
      success: true,
      message: "員工帳號建立成功！",
      user: {
        ...newUser,
        permissions: JSON.parse(newUser.permissions || "[]"), // 回傳陣列
      },
    });
  } catch (error) {
    console.error("建立員工帳號時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 9. 取得所有使用者
const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        permissions: true, // ( V3 權限系統 )
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

// 9.1 [*** V4.1 新增：取得客戶列表 (用於搜尋) ***]
const getUsersList = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        permissions: "[]", // 只搜尋 "USER" (權限為空)
        isActive: true, // 只搜尋 "啟用" 的
      },
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    res.status(200).json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error("管理員取得客戶列表時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 10. 切換使用者狀態 (啟用/停用)
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

    // [*** 新增日誌 ***]
    try {
      await createLog(
        req.user.id,
        "TOGGLE_USER_STATUS",
        id,
        `將 ${updatedUser.email} 狀態設為 ${isActive ? "啟用" : "停用"}`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

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

// 11. 重設密碼
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

    // [*** 新增日誌 ***]
    try {
      await createLog(req.user.id, "RESET_USER_PASSWORD", id, `重設密碼`);
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

    res.status(200).json({
      success: true,
      message: `密碼已成功重設為 "${DEFAULT_PASSWORD}"`,
    });
  } catch (error) {
    console.error("重設密碼失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 12. 永久刪除使用者 (連動刪除包裹與集運單)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res
        .status(400)
        .json({ success: false, message: "您不能刪除自己的管理員帳號" });
    }

    // [*** 新增日誌 ***]
    const userToDelete = await prisma.user.findUnique({
      where: { id: id },
      select: { email: true },
    });
    try {
      await createLog(
        req.user.id,
        "DELETE_USER",
        id,
        `(危險) 刪除使用者 ${userToDelete?.email || id} 及其所有資料`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

    await prisma.$transaction(async (tx) => {
      // [*** V3 修正：刪除日誌 ***]
      await tx.activityLog.deleteMany({
        where: { userId: id },
      });
      await tx.package.deleteMany({
        where: { userId: id },
      });
      await tx.shipment.deleteMany({
        where: { userId: id },
      });
      await tx.user.delete({
        where: { id: id },
      });
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

// 13. [儀表板統計函式]
const getDashboardStats = async (req, res) => {
  try {
    // 1. 總用戶數
    const totalUsers = await prisma.user.count();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await prisma.user.count({
      where: { createdAt: { gte: today } },
    });

    // 2. 包裹統計
    const packageCounts = await prisma.package.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
    });
    const packageStats = {
      PENDING:
        packageCounts.find((p) => p.status === "PENDING")?._count.id || 0,
      ARRIVED:
        packageCounts.find((p) => p.status === "ARRIVED")?._count.id || 0,
      IN_SHIPMENT:
        packageCounts.find((p) => p.status === "IN_SHIPMENT")?._count.id || 0,
      COMPLETED:
        packageCounts.find((p) => p.status === "COMPLETED")?._count.id || 0,
    };
    const totalPackages = packageCounts.reduce(
      (sum, p) => sum + p._count.id,
      0
    );

    // 3. 訂單統計
    const shipmentCounts = await prisma.shipment.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
    });
    const shipmentStats = {
      PENDING_PAYMENT:
        shipmentCounts.find((s) => s.status === "PENDING_PAYMENT")?._count.id ||
        0,
      PROCESSING:
        shipmentCounts.find((s) => s.status === "PROCESSING")?._count.id || 0,
      SHIPPED:
        shipmentCounts.find((s) => s.status === "SHIPPED")?._count.id || 0,
      CANCEL: shipmentCounts.find((s) => s.status === "CANCEL")?._count.id || 0, // 已完成
    };

    // 4. 營收統計
    const revenueData = await prisma.shipment.aggregate({
      where: {
        status: "CANCEL", // 'CANCEL' = 已完成
      },
      _sum: {
        totalCost: true,
      },
    });
    const totalRevenue = revenueData._sum.totalCost || 0;

    // 5. 待付款訂單金額
    const pendingRevenueData = await prisma.shipment.aggregate({
      where: {
        status: "PENDING_PAYMENT",
      },
      _sum: {
        totalCost: true,
      },
    });
    const pendingRevenue = pendingRevenueData._sum.totalCost || 0;

    // 6. 最近 5 筆包裹
    const recentPackages = await prisma.package.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    });

    // 7. 最近 5 筆訂單
    const recentShipments = await prisma.shipment.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    });

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        newUsersToday,
        totalPackages,
        packageStats,
        shipmentStats,
        totalRevenue,
        pendingRevenue,
        recentPackages,
        recentShipments,
      },
    });
  } catch (error) {
    console.error("取得儀表板統計時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 14. [*** 新增：取得日誌函式 ***]
const getActivityLogs = async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200, // 最多顯示最近 200 筆
    });
    res.status(200).json({ success: true, logs: logs });
  } catch (error) {
    console.error("取得操作日誌時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 15. [*** V3 修正：模擬登入函式 ***]
const impersonateUser = async (req, res) => {
  try {
    const { id: userIdToImpersonate } = req.params; // 這是客戶 ID
    const adminUserId = req.user.id; // 這是管理員 ID

    const user = await prisma.user.findUnique({
      where: { id: userIdToImpersonate },
      select: { id: true, email: true, name: true, permissions: true },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "找不到該使用者" });
    }

    // [*** V3 修正：檢查客戶是否為 "USER" (權限為空) ***]
    let userPermissions = [];
    try {
      userPermissions = JSON.parse(user.permissions || "[]");
    } catch (e) {}

    if (userPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: "只能登入 'USER' 角色的帳號 (即權限為空)",
      });
    }
    // [*** 修正結束 ***]

    // [*** 新增日誌 ***]
    try {
      await createLog(
        adminUserId,
        "IMPERSONATE_USER",
        user.id,
        `模擬登入 ${user.email}`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }
    // [*** 日誌結束 ***]

    // 產生一個 "客戶" 的 Token
    const customerToken = generateToken(user.id);

    res.status(200).json({
      success: true,
      message: `即將以 ${user.name || user.email} 的身份登入`,
      token: customerToken, // 回傳客戶 Token
      user: {
        // 回傳客戶的 user info
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("模擬登入失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

module.exports = {
  getAllPackages,
  adminCreatePackage, // [*** 匯出新函式 ***]
  updatePackageStatus,
  updatePackageDetails,
  getUsers,
  getUsersList, // [*** 匯出新函式 ***]
  updateShipmentStatus,
  getAllShipments,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  deleteUser,
  getDashboardStats,
  getActivityLogs,
  impersonateUser,
};
