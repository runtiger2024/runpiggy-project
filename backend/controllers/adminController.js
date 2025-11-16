// 這是 backend/controllers/adminController.js (V5 報表功能 Phase 1)
// (1) 新增 7 天 / 30 天 報表數據
// (2) 修正 exports (補上 V4.1 遺漏的)

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

// 2. [ V4.1 ] 管理員幫客戶建立包裹
const adminCreatePackage = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { userId, trackingNumber, productName, quantity, note } = req.body;

    if (!userId || !trackingNumber || !productName) {
      return res.status(400).json({
        success: false,
        message: "請提供客戶 ID、物流單號和商品名稱",
      });
    }

    const customer = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: `找不到 ID 為 ${userId} 的客戶` });
    }

    // [V4.2 修正] 允許管理員為自己新增
    // let customerPermissions = [];
    // try {
    //     customerPermissions = JSON.parse(customer.permissions || "[]");
    // } catch(e) {}
    // if (customerPermissions.length > 0) {
    //     return res.status(400).json({ success: false, message: "無法為管理員或操作員帳號新增包裹" });
    // }

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
        productImages: imagePaths, // 客戶圖片
        warehouseImages: "[]", // 倉庫圖片預設為空
        userId: customer.id,
      },
    });

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
      finalImageList = finalImageList.slice(0, 5);
    }

    dataToUpdate.warehouseImages = JSON.stringify(finalImageList);

    const updatedPackage = await prisma.package.update({
      where: { id: id },
      data: dataToUpdate,
    });

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

// 9.1 [ V4.2 修正：取得所有使用者 (用於搜尋) ]
const getUsersList = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        // [V4.2 修正] 移除 'permissions: "[]"' 過濾器，讓管理員也能被搜尋到
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

    try {
      await createLog(req.user.id, "RESET_USER_PASSWORD", id, `重設密碼`);
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }

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

    await prisma.$transaction(async (tx) => {
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

// 13. [*** V5 修正：儀表板統計函式 (Phase 1) ***]
const getDashboardStats = async (req, res) => {
  try {
    // --- (1) 日期定義 ---
    const today = new Date();
    const date7DaysAgo = new Date(new Date().setDate(today.getDate() - 7));
    const date30DaysAgo = new Date(new Date().setDate(today.getDate() - 30));
    today.setHours(0, 0, 0, 0); // 設定為今天 0 點

    // --- (2) 營收 (Shipment "已完成" (CANCEL) 且 "已更新") ---
    const [
      weeklyRevenueData,
      monthlyRevenueData,
      totalRevenueData,
      pendingRevenueData,
    ] = await Promise.all([
      prisma.shipment.aggregate({
        where: { status: "CANCEL", updatedAt: { gte: date7DaysAgo } },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "CANCEL", updatedAt: { gte: date30DaysAgo } },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "CANCEL" },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "PENDING_PAYMENT" },
        _sum: { totalCost: true },
      }),
    ]);

    // --- (3) 入庫 (Package "已入庫" (ARRIVED) 且 "已更新") ---
    const [weeklyPackages, monthlyPackages] = await Promise.all([
      prisma.package.count({
        where: { status: "ARRIVED", updatedAt: { gte: date7DaysAgo } },
      }),
      prisma.package.count({
        where: { status: "ARRIVED", updatedAt: { gte: date30DaysAgo } },
      }),
    ]);

    // --- (4) 會員 (User "建立時間") ---
    const [weeklyNewUsers, monthlyNewUsers, totalUsers, newUsersToday] =
      await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: date7DaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: date30DaysAgo } } }),
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
      ]);

    // --- (5) 狀態總覽 (與舊版相同) ---
    const [packageCounts, shipmentCounts] = await Promise.all([
      prisma.package.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.shipment.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

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

    // --- (6) 最近活動 (與舊版相同) ---
    const [recentPackages, recentShipments] = await Promise.all([
      prisma.package.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
      prisma.shipment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        // [V5 新增]
        weeklyRevenue: weeklyRevenueData._sum.totalCost || 0,
        monthlyRevenue: monthlyRevenueData._sum.totalCost || 0,
        weeklyPackages: weeklyPackages,
        monthlyPackages: monthlyPackages,
        weeklyNewUsers: weeklyNewUsers,
        monthlyNewUsers: monthlyNewUsers,

        // [舊有]
        totalUsers,
        newUsersToday,
        packageStats,
        shipmentStats,
        totalRevenue: totalRevenueData._sum.totalCost || 0,
        pendingRevenue: pendingRevenueData._sum.totalCost || 0,
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

// 16. [*** V4.2 新增：更新使用者權限 ***]
const updateUserPermissions = async (req, res) => {
  try {
    const { id: userIdToUpdate } = req.params;
    const { permissions } = req.body;

    // 驗證
    if (!Array.isArray(permissions)) {
      return res
        .status(400)
        .json({ success: false, message: "權限必須是一個陣列" });
    }

    // 檢查不能修改自己的權限
    if (req.user.id === userIdToUpdate) {
      return res
        .status(400)
        .json({ success: false, message: "無法修改自己的權限" });
    }

    // 撈出舊資料
    const originalUser = await prisma.user.findUnique({
      where: { id: userIdToUpdate },
      select: { email: true, permissions: true },
    });
    if (!originalUser) {
      return res.status(404).json({ success: false, message: "找不到使用者" });
    }

    // 更新資料庫
    const updatedUser = await prisma.user.update({
      where: { id: userIdToUpdate },
      data: {
        permissions: JSON.stringify(permissions), // 存回 JSON 字串
      },
      select: { id: true, email: true, permissions: true },
    });

    // 寫入日誌
    try {
      await createLog(
        req.user.id,
        "UPDATE_USER_PERMISSIONS",
        userIdToUpdate,
        `更新 ${updatedUser.email} 的權限為: [${permissions.join(", ")}]`
      );
    } catch (logError) {
      console.error("寫入日誌失敗(不影響主流程):", logError);
    }

    res.status(200).json({
      success: true,
      message: "使用者權限更新成功",
      user: {
        ...updatedUser,
        permissions: JSON.parse(updatedUser.permissions || "[]"), // 回傳陣列
      },
    });
  } catch (error) {
    console.error("更新權限失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// [*** 新增：詳細報表函式 ***]
const getDailyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 startDate 和 endDate" });
    }

    // 1. 驗證日期格式 (並確保時區正確)
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0); // 設為當天 00:00:00

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // 設為當天 23:59:59

    // 2. 查詢每日營業額
    // [注意] 我們假設 "營業額" 是 status = 'CANCEL' (已完成) 的訂單
    // [注意] $queryRaw 內使用的是 "資料庫欄位名稱" (例如 "Shipment" 和 "totalCost")
    const revenueByDay = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('day', "updatedAt")::DATE as date,
        SUM("totalCost") as revenue
      FROM "Shipment"
      WHERE "status" = 'CANCEL'
        AND "updatedAt" >= ${start}
        AND "updatedAt" <= ${end}
      GROUP BY date
      ORDER BY date ASC
    `;

    // 3. 查詢每日新註冊會員
    const usersByDay = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('day', "createdAt")::DATE as date,
        COUNT(id) as newUsers
      FROM "User"
      WHERE "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY date
      ORDER BY date ASC
    `;

    // 4. 回傳數據
    res.status(200).json({
      success: true,
      report: {
        // $queryRaw 回傳的是 BigInt，轉為 String 避免 JSON 錯誤
        revenueData: revenueByDay.map((r) => ({
          date: r.date,
          revenue: Number(r.revenue || 0),
        })),
        userData: usersByDay.map((u) => ({
          date: u.date,
          newUsers: Number(u.newusers || 0),
        })),
      },
    });
  } catch (error) {
    console.error("取得詳細報表時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// [*** V4.2 修正：匯出所有函式 ***]
module.exports = {
  getAllPackages,
  adminCreatePackage,
  updatePackageStatus,
  updatePackageDetails,
  getUsers,
  getUsersList,
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
  updateUserPermissions,
  getDailyReport, // [*** 新增 ***]
};
