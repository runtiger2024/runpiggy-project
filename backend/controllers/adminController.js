// 這是 backend/controllers/adminController.js (支援低消 2000 元的修改版)

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
const MINIMUM_CHARGE = 2000; // [*** 新增：包裹低消常數 ***]

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
        // 忽略解析錯誤
      }
      try {
        warehouseImages = JSON.parse(pkg.warehouseImages || "[]");
      } catch (e) {
        // 忽略解析錯誤
      }

      let arrivedBoxes = [];
      try {
        // 後端傳給前端時，直接解析
        arrivedBoxes = JSON.parse(pkg.arrivedBoxesJson || "[]");
      } catch (e) {
        // 忽略解析錯誤
      }

      return {
        ...pkg,
        productImages,
        warehouseImages,
        arrivedBoxesJson: arrivedBoxes, // [修改] 直接回傳解析後的物件
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

// 3. [關鍵修正] 更新包裹詳細資料 (支援「多筆分箱」入庫)
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

    let calculatedTotalFee = 0; // 總運費
    let boxesWithFees = []; // 儲存處理過的分箱陣列

    // (2) [新邏輯] 處理分箱運費計算
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

          // (3) [*** 修改重點：套用低消 ***]
          let finalPackageFee = calculatedTotalFee;
          // 只有在總金額 > 0 但 < 2000 時才套用
          if (calculatedTotalFee > 0 && calculatedTotalFee < MINIMUM_CHARGE) {
            finalPackageFee = MINIMUM_CHARGE;
          }

          dataToUpdate.arrivedBoxesJson = JSON.stringify(boxesWithFees);
          dataToUpdate.totalCalculatedFee = finalPackageFee; // 儲存套用低消後的金額
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

    // (4) 照片處理邏輯 (不變)
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
      message: "包裹詳細資料與分箱運費更新成功 (已清理舊圖片)",
      package: updatedPackage,
    });
  } catch (error) {
    console.error("後端更新包裹錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: `伺服器錯誤: ${error.message}` });
  }
};

// --- 集運單管理 ---

// 4. 更新集運單狀態 (保持不變)
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

// 5. 取得所有集運單 (保持不變)
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
        // 忽略解析錯誤
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

// 6. 退回/拒絕集運單 (釋放包裹) (保持不變)
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

// 7. 建立員工帳號 (保持不變)
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

// 8. 取得所有使用者 (保持不變)
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

// 9. 切換使用者狀態 (啟用/停用) (保持不變)
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

// 10. 重設密碼 (保持不變)
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

// 11. 永久刪除使用者 (連動刪除包裹與集運單) (保持不變)
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
    res.status(500).json({
      success: false,
      message: "刪除失敗，可能含有無法刪除的關聯資料",
    });
  }
};

module.exports = {
  getAllPackages,
  updatePackageStatus,
  updatePackageDetails,
  getUsers,
  updateShipmentStatus,
  getAllShipments,
  toggleUserStatus,
  resetUserPassword,
  createStaffUser,
  rejectShipment,
  deleteUser,
};
