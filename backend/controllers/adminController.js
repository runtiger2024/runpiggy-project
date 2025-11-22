// backend/controllers/adminController.js (V8 完整版 - 含費率管理、完整 CRUD、圖片管理)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const createLog = require("../utils/createLog.js");
const generateToken = require("../utils/generateToken.js");
const ratesManager = require("../utils/ratesManager.js"); // [V8 新增] 引入費率管理器

// --- 系統設定 (費率) 管理 [V8 新增] ---

/**
 * @description 取得目前系統費率設定
 * @route GET /api/admin/config/rates
 */
const getSystemRates = async (req, res) => {
  try {
    const rates = ratesManager.getRates();
    res.status(200).json({ success: true, rates });
  } catch (error) {
    console.error("取得費率失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 更新系統費率設定
 * @route PUT /api/admin/config/rates
 */
const updateSystemRates = async (req, res) => {
  try {
    const { rates } = req.body;
    if (!rates) {
      return res
        .status(400)
        .json({ success: false, message: "無效的設定資料" });
    }

    const success = ratesManager.updateRates(rates);
    if (!success) throw new Error("寫入檔案失敗");

    await createLog(
      req.user.id,
      "UPDATE_SYSTEM_RATES",
      "SYSTEM",
      "更新系統運費設定"
    );
    res.status(200).json({ success: true, message: "系統費率已更新" });
  } catch (error) {
    console.error("更新費率錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

// --- 包裹管理 ---

/**
 * @description 取得所有包裹
 */
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

/**
 * @description 管理員幫客戶建立包裹
 */
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

/**
 * @description [V8 新增] 管理員刪除包裹 (含物理圖片刪除)
 */
const adminDeletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. 刪除前先撈取圖片路徑以便物理刪除
    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg)
      return res.status(404).json({ success: false, message: "找不到包裹" });

    // 2. 物理刪除檔案 (倉庫圖 + 客戶圖)
    const deleteFiles = (jsonStr) => {
      try {
        const files = JSON.parse(jsonStr || "[]");
        files.forEach((fileUrl) => {
          // fileUrl 例如 "/uploads/xxx.jpg"
          // 需轉換為絕對路徑
          const filename = fileUrl.split("/").pop();
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
        console.warn("刪除圖片檔案時發生錯誤:", e.message);
      }
    };
    deleteFiles(pkg.productImages);
    deleteFiles(pkg.warehouseImages);

    // 3. 資料庫刪除
    await prisma.package.delete({ where: { id } });

    await createLog(
      req.user.id,
      "ADMIN_DELETE_PACKAGE",
      id,
      `刪除包裹 ${pkg.trackingNumber} 及相關圖片`
    );

    res.status(200).json({ success: true, message: "包裹及其圖片已永久刪除" });
  } catch (error) {
    console.error("Admin delete package error:", error);
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * @description 更新包裹狀態
 */
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
      console.error(logError);
    }

    res.status(200).json({
      success: true,
      message: `包裹狀態已更新為 ${status}`,
      package: updatedPackage,
    });
  } catch (error) {
    console.error("管理員更新包裹狀態時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 更新包裹詳細資料 (分箱、圖片、費用)
 * [V8 更新] 使用 ratesManager 動態費率，並處理圖片刪除
 */
const updatePackageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, boxesData, existingImages } = req.body;

    const originalPackage = await prisma.package.findUnique({ where: { id } });
    if (!originalPackage) {
      return res.status(404).json({ success: false, message: "找不到包裹" });
    }

    // [V8] 讀取動態費率
    const systemRates = ratesManager.getRates();
    const RATES = systemRates.categories;
    const CONSTANTS = systemRates.constants;

    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;

    let calculatedTotalFee = 0;
    let boxesWithFees = [];

    // 1. 處理分箱與運費計算
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
              // [V8] 使用動態常數
              boxCai = Math.ceil(
                (length * width * height) / CONSTANTS.VOLUME_DIVISOR
              );
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
          .json({ success: false, message: "分箱資料格式錯誤" });
      }
    }

    // 2. 處理倉庫圖片 (新增 + 刪除)
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

    // 找出被移除的圖片並物理刪除
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

    // 加入新上傳的圖片
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

    await createLog(
      req.user.id,
      "UPDATE_PACKAGE_DETAILS",
      id,
      "更新包裹詳情/費用/圖片"
    );

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
      message: "更新成功 (已重新計算運費)",
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

/**
 * @description 取得所有集運單
 */
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

/**
 * @description 更新集運單狀態與金額
 */
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
    if (trackingNumberTW !== undefined)
      dataToUpdate.trackingNumberTW = trackingNumberTW;

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: dataToUpdate,
    });

    await createLog(
      req.user.id,
      "UPDATE_SHIPMENT_STATUS",
      id,
      `更新狀態: ${status}, 金額: ${cost}`
    );

    res.status(200).json({
      success: true,
      message: "集運單資料更新成功",
      shipment: updatedShipment,
    });
  } catch (error) {
    console.error("管理員更新集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 退回/拒絕集運單 (釋放包裹)
 */
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

    await createLog(
      req.user.id,
      "REJECT_SHIPMENT",
      id,
      `退回訂單, 釋放 ${result.releasedPackages.count} 個包裹`
    );

    res.status(200).json({
      success: true,
      message: `集運單已退回，並釋放了 ${result.releasedPackages.count} 個包裹。`,
    });
  } catch (error) {
    console.error("退回集運單時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description [V8 新增] 管理員永久刪除集運單
 */
const adminDeleteShipment = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. 檢查是否存在
    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) return res.status(404).json({ message: "找不到集運單" });

    // 2. 釋放包裹 + 刪除訂單 (Transaction)
    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id } });
    });

    await createLog(req.user.id, "ADMIN_DELETE_SHIPMENT", id, "永久刪除集運單");
    res.status(200).json({ success: true, message: "集運單已永久刪除" });
  } catch (error) {
    console.error("Delete shipment error:", error);
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

// --- 會員/員工管理 ---

/**
 * @description 建立員工帳號
 */
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

    await createLog(
      req.user.id,
      "CREATE_STAFF_USER",
      newUser.id,
      `建立新員工 ${newUser.email}`
    );

    res.status(201).json({
      success: true,
      message: "員工帳號建立成功！",
      user: {
        ...newUser,
        permissions: JSON.parse(newUser.permissions || "[]"),
      },
    });
  } catch (error) {
    console.error("建立員工帳號時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 取得所有使用者
 */
const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        permissions: true,
        createdAt: true,
        isActive: true,
      },
    });
    res.status(200).json({ success: true, count: users.length, users: users });
  } catch (error) {
    console.error("管理員取得所有使用者時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 取得使用者列表 (簡化版，用於搜尋)
 */
const getUsersList = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    });
    res.status(200).json({ success: true, users: users });
  } catch (error) {
    console.error("管理員取得客戶列表時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 切換使用者狀態
 */
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

    await createLog(
      req.user.id,
      "TOGGLE_USER_STATUS",
      id,
      `狀態設為 ${isActive ? "啟用" : "停用"}`
    );

    res.status(200).json({
      success: true,
      message: `會員 ${updatedUser.email} 狀態已更新`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("更新會員狀態失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description [V8 新增] 管理員編輯會員資料
 */
const adminUpdateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, defaultAddress } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, phone, defaultAddress },
    });

    await createLog(req.user.id, "ADMIN_UPDATE_USER", id, "管理員更新會員個資");

    res
      .status(200)
      .json({ success: true, message: "會員資料已更新", user: updatedUser });
  } catch (error) {
    console.error("Admin update user error:", error);
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * @description 重設密碼
 */
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

    await createLog(req.user.id, "RESET_USER_PASSWORD", id, `重設密碼為預設值`);

    res.status(200).json({
      success: true,
      message: `密碼已成功重設為 "${DEFAULT_PASSWORD}"`,
    });
  } catch (error) {
    console.error("重設密碼失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 永久刪除使用者
 */
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

    await createLog(
      req.user.id,
      "DELETE_USER",
      id,
      `刪除使用者 ${userToDelete?.email} 及所有資料`
    );

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { userId: id } });
      await tx.package.deleteMany({ where: { userId: id } });
      await tx.shipment.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id: id } });
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

/**
 * @description 模擬登入
 */
const impersonateUser = async (req, res) => {
  try {
    const { id: userIdToImpersonate } = req.params;
    const adminUserId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userIdToImpersonate },
      select: { id: true, email: true, name: true, permissions: true },
    });

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "找不到該使用者" });

    let userPermissions = [];
    try {
      userPermissions = JSON.parse(user.permissions || "[]");
    } catch (e) {}

    if (userPermissions.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "只能登入 'USER' 角色的帳號" });
    }

    await createLog(
      adminUserId,
      "IMPERSONATE_USER",
      user.id,
      `模擬登入 ${user.email}`
    );

    const customerToken = generateToken(user.id);

    res.status(200).json({
      success: true,
      message: `即將以 ${user.name || user.email} 的身份登入`,
      token: customerToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("模擬登入失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 更新使用者權限
 */
const updateUserPermissions = async (req, res) => {
  try {
    const { id: userIdToUpdate } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res
        .status(400)
        .json({ success: false, message: "權限必須是一個陣列" });
    }
    if (req.user.id === userIdToUpdate) {
      return res
        .status(400)
        .json({ success: false, message: "無法修改自己的權限" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userIdToUpdate },
      data: { permissions: JSON.stringify(permissions) },
      select: { id: true, email: true, permissions: true },
    });

    await createLog(
      req.user.id,
      "UPDATE_USER_PERMISSIONS",
      userIdToUpdate,
      `更新權限: [${permissions.join(", ")}]`
    );

    res.status(200).json({
      success: true,
      message: "使用者權限更新成功",
      user: {
        ...updatedUser,
        permissions: JSON.parse(updatedUser.permissions || "[]"),
      },
    });
  } catch (error) {
    console.error("更新權限失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 取得儀表板統計
 */
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const date7DaysAgo = new Date(new Date().setDate(today.getDate() - 7));
    const date30DaysAgo = new Date(new Date().setDate(today.getDate() - 30));
    today.setHours(0, 0, 0, 0);

    // 營收
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

    // 入庫
    const [weeklyPackages, monthlyPackages] = await Promise.all([
      prisma.package.count({
        where: { status: "ARRIVED", updatedAt: { gte: date7DaysAgo } },
      }),
      prisma.package.count({
        where: { status: "ARRIVED", updatedAt: { gte: date30DaysAgo } },
      }),
    ]);

    // 會員
    const [weeklyNewUsers, monthlyNewUsers, totalUsers, newUsersToday] =
      await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: date7DaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: date30DaysAgo } } }),
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
      ]);

    // 狀態統計
    const [packageCounts, shipmentCounts] = await Promise.all([
      prisma.package.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.shipment.groupBy({ by: ["status"], _count: { id: true } }),
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
      CANCEL: shipmentCounts.find((s) => s.status === "CANCEL")?._count.id || 0,
    };

    // 最近活動
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
        weeklyRevenue: weeklyRevenueData._sum.totalCost || 0,
        monthlyRevenue: monthlyRevenueData._sum.totalCost || 0,
        weeklyPackages,
        monthlyPackages,
        weeklyNewUsers,
        monthlyNewUsers,
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

/**
 * @description 取得操作日誌
 */
const getActivityLogs = async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.status(200).json({ success: true, logs: logs });
  } catch (error) {
    console.error("取得操作日誌時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 取得詳細報表
 */
const getDailyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 startDate 和 endDate" });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 使用 Raw Query 取得每日數據
    const revenueByDay = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "updatedAt")::DATE as date, SUM("totalCost") as revenue
      FROM "Shipment"
      WHERE "status" = 'CANCEL' AND "updatedAt" >= ${start} AND "updatedAt" <= ${end}
      GROUP BY date ORDER BY date ASC
    `;

    const usersByDay = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt")::DATE as date, COUNT(id) as newUsers
      FROM "User"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY date ORDER BY date ASC
    `;

    res.status(200).json({
      success: true,
      report: {
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

module.exports = {
  getAllPackages,
  adminCreatePackage,
  adminDeletePackage, // 新增
  updatePackageStatus,
  updatePackageDetails,
  getAllShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment, // 新增
  getUsers,
  getUsersList,
  createStaffUser,
  toggleUserStatus,
  resetUserPassword,
  adminUpdateUserProfile, // 新增
  deleteUser,
  impersonateUser,
  updateUserPermissions,
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
  getSystemRates, // 新增
  updateSystemRates, // 新增
};
