// backend/controllers/packageController.js
// V2025.Security - 完整功能版 (含認領、批量、異常處理)

const prisma = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

// --- 輔助函式：安全刪除多個檔案 ---
const deleteFiles = (filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;

  const uploadDir = path.join(__dirname, "../public/uploads");

  filePaths.forEach((filePath) => {
    try {
      const fileName = path.basename(filePath);
      if (!fileName) return;

      const absolutePath = path.join(uploadDir, fileName);

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (err) {
      console.warn(`[File Warning] 刪除檔案失敗 (${filePath}):`, err.message);
    }
  });
};

/**
 * @description 包裹預報 (單筆)
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

    const existingPackage = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
    });

    if (existingPackage) {
      return res.status(400).json({
        success: false,
        message: "此物流單號已存在系統中，請勿重複預報。",
      });
    }

    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`);
    }

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber.trim(),
        productName: productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note: note,
        productImages: imagePaths,
        warehouseImages: [],
        userId: userId,
        status: "PENDING",
      },
    });

    await createLog(
      userId,
      "CREATE_PACKAGE",
      newPackage.id,
      `預報包裹 ${trackingNumber}`
    );

    res.status(201).json({
      success: true,
      message: "包裹預報成功！",
      package: newPackage,
    });
  } catch (error) {
    console.error("包裹預報錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 批量預報 (接收 JSON 陣列)
 * @route POST /api/packages/bulk-forecast
 */
const bulkForecast = async (req, res) => {
  try {
    const { packages } = req.body; // 預期是一個物件陣列
    const userId = req.user.id;

    if (!Array.isArray(packages) || packages.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "無效的資料格式" });
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // 使用 Transaction 確保原子性，或逐筆處理 (這裡選擇逐筆以允許部分成功)
    for (const pkg of packages) {
      // 簡單驗證
      if (!pkg.trackingNumber || !pkg.productName) {
        failCount++;
        errors.push(`單號 ${pkg.trackingNumber || "未知"}: 資料不全`);
        continue;
      }

      // 檢查重複
      const exists = await prisma.package.findUnique({
        where: { trackingNumber: pkg.trackingNumber.trim() },
      });

      if (exists) {
        failCount++;
        errors.push(`單號 ${pkg.trackingNumber}: 已存在`);
        continue;
      }

      await prisma.package.create({
        data: {
          trackingNumber: pkg.trackingNumber.trim(),
          productName: pkg.productName,
          quantity: pkg.quantity ? parseInt(pkg.quantity) : 1,
          note: pkg.note || "批量匯入",
          userId: userId,
          status: "PENDING",
        },
      });
      successCount++;
    }

    await createLog(
      userId,
      "BULK_FORECAST",
      "BATCH",
      `批量匯入成功 ${successCount} 筆`
    );

    res.json({
      success: true,
      message: `匯入完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`,
      errors,
    });
  } catch (error) {
    console.error("批量預報錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 認領無主包裹
 * @route POST /api/packages/claim
 */
const claimPackage = async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    const userId = req.user.id;
    const proofFile = req.file; // 上傳的截圖

    if (!trackingNumber) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入物流單號" });
    }

    // 搜尋該單號的包裹
    const pkg = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
      include: { user: true },
    });

    if (!pkg) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此單號的包裹" });
    }

    // 檢查是否已被綁定 (假設無主件是掛在特定管理員帳號下，或 userId 為空字串/特定標記)
    // 這裡的邏輯：如果該包裹已經屬於某個"有效"用戶，則不能認領。
    // 假設系統有一個機制標記無主件，或者我們檢查 pkg.user 是否存在
    // 為了簡化，若該包裹已屬於當前用戶，提示已預報；若屬於別的用戶，提示被佔用。
    // *若這是一個"無主件"功能，通常後端會先把包裹建立起來但 userId 指向 Admin 或 null (如果 schema 允許 nullable)*
    // 由於我們 Schema 的 userId 是 String 且有關聯，通常會設一個 Dummy User (例如 "UNCLAIMED")
    // 這裡假設：如果包裹狀態是 ARRIVED 且被標記為異常(無主)，或者我們允許搶奪(不建議)。

    // [修正邏輯]：僅允許認領 "尚未預報" 的包裹 (即資料庫根本沒有這筆)，
    // 或者 "已入庫但屬於無主帳號" 的包裹。
    // 鑑於目前的架構，最常見的情境是：客戶忘了預報，貨到了，管理員建檔(掛在無主帳號)。
    // 這裡我們簡單判定：如果包裹屬於別人，則禁止。

    if (pkg.userId !== userId) {
      // 這邊需要一個判斷是否為無主件的邏輯，例如 user.email === 'unclaimed@runpiggy.com'
      // 若不是無主件
      if (
        pkg.user.email !== "unclaimed@runpiggy.com" &&
        pkg.user.email !== "admin@runpiggy.com"
      ) {
        return res
          .status(400)
          .json({ success: false, message: "此包裹已被其他會員預報或綁定。" });
      }
    } else {
      return res
        .status(200)
        .json({ success: true, message: "此包裹已在您的清單中。" });
    }

    // 執行認領
    const updateData = {
      userId: userId,
      // 若原本是無主件(ARRIVED)，認領後狀態維持 ARRIVED，但需要人工審核憑證?
      // 或是直接歸戶。這裡設定為歸戶。
    };

    if (proofFile) {
      updateData.claimProof = `/uploads/${proofFile.filename}`;
    }

    await prisma.package.update({
      where: { id: pkg.id },
      data: updateData,
    });

    await createLog(
      userId,
      "CLAIM_PACKAGE",
      pkg.id,
      `認領包裹 ${trackingNumber}`
    );

    res.json({ success: true, message: "認領成功！包裹已歸入您的帳戶。" });
  } catch (error) {
    console.error("認領包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 處理/回覆 異常包裹
 * @route PUT /api/packages/:id/exception
 */
const resolveException = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body; // action: "DISCARD", "RETURN", "SHIP_ANYWAY"
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({
      where: { id, userId },
    });

    if (!pkg) return res.status(404).json({ message: "找不到包裹" });

    // 僅更新備註，讓管理員看到客戶的決定
    // 可以將狀態改回 ARRIVED 或保持 EXCEPTION 但加上備註
    const newNote = pkg.exceptionNote
      ? `${pkg.exceptionNote}\n[客戶決定]: ${action} - ${note || ""}`
      : `[客戶決定]: ${action} - ${note || ""}`;

    await prisma.package.update({
      where: { id },
      data: {
        exceptionNote: newNote,
        // 如果是 SHIP_ANYWAY，或許可以移除異常狀態? 這裡先保留，由管理員人工操作
      },
    });

    await createLog(userId, "RESOLVE_EXCEPTION", id, `回覆異常處理: ${action}`);

    res.json({ success: true, message: "已送出處理指示，請等待管理員作業。" });
  } catch (error) {
    console.error("異常處理錯誤:", error);
    res.status(500).json({ message: "伺服器錯誤" });
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

    const systemRates = await ratesManager.getRates();
    const CONSTANTS = systemRates.constants;
    const RATES = systemRates.categories;

    const packagesWithParsedJson = myPackages.map((pkg) => {
      const arrivedBoxes = pkg.arrivedBoxesJson || [];
      let pkgIsOversized = false;
      let pkgIsOverweight = false;
      let calculatedTotalFee = 0;

      const enrichedBoxes = arrivedBoxes.map((box) => {
        const l = parseFloat(box.length) || 0;
        const w = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;
        const type = box.type || "general";
        const rateInfo = RATES[type] || {
          weightRate: 0,
          volumeRate: 0,
          name: "未知",
        };

        const isOversized =
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          w >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT;
        const isOverweight = weight >= CONSTANTS.OVERWEIGHT_LIMIT;

        if (isOversized) pkgIsOversized = true;
        if (isOverweight) pkgIsOverweight = true;

        let cai = 0,
          volFee = 0,
          wtFee = 0,
          finalFee = 0,
          isVolWin = false;

        if (l > 0 && w > 0 && h > 0) {
          cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
          volFee = cai * rateInfo.volumeRate;
          wtFee = (Math.ceil(weight * 10) / 10) * rateInfo.weightRate;
          finalFee = Math.max(volFee, wtFee);
          isVolWin = volFee >= wtFee;
        }
        calculatedTotalFee += finalFee;

        return {
          ...box,
          cai,
          volFee,
          wtFee,
          calculatedFee: finalFee,
          isVolWin,
          isOversized,
          isOverweight,
          rateName: rateInfo.name,
        };
      });

      const finalTotalFee =
        pkg.totalCalculatedFee > 0
          ? pkg.totalCalculatedFee
          : calculatedTotalFee;

      return {
        ...pkg,
        arrivedBoxes: enrichedBoxes,
        arrivedBoxesJson: undefined,
        isOversized: pkgIsOversized,
        isOverweight: pkgIsOverweight,
        totalCalculatedFee: finalTotalFee,
      };
    });

    res.status(200).json({
      success: true,
      count: packagesWithParsedJson.length,
      packages: packagesWithParsedJson,
    });
  } catch (error) {
    console.error("查詢包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 會員修改自己的包裹
 * @route PUT /api/packages/:id
 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, productName, quantity, note, existingImages } =
      req.body;
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });
    if (pkg.status !== "PENDING")
      return res.status(400).json({ message: "包裹已入庫或處理中，無法修改" });

    // 單號唯一性檢查 (若有修改)
    if (trackingNumber && trackingNumber.trim() !== pkg.trackingNumber) {
      const dup = await prisma.package.findUnique({
        where: { trackingNumber: trackingNumber.trim() },
      });
      if (dup) return res.status(400).json({ message: "單號已存在" });
    }

    let originalImagesList = pkg.productImages || [];
    let keepImagesList = [];
    try {
      keepImagesList = existingImages ? JSON.parse(existingImages) : [];
    } catch (e) {
      keepImagesList = [];
    }

    const imagesToDelete = originalImagesList.filter(
      (img) => !keepImagesList.includes(img)
    );
    deleteFiles(imagesToDelete);

    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((f) => `/uploads/${f.filename}`);
      keepImagesList = [...keepImagesList, ...newPaths];
    }

    const updatedPackage = await prisma.package.update({
      where: { id },
      data: {
        trackingNumber: trackingNumber ? trackingNumber.trim() : undefined,
        productName,
        quantity: quantity ? parseInt(quantity) : undefined,
        note,
        productImages: keepImagesList.slice(0, 5),
      },
    });

    res
      .status(200)
      .json({ success: true, message: "更新成功", package: updatedPackage });
  } catch (error) {
    console.error("更新包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 會員刪除自己的包裹
 * @route DELETE /api/packages/:id
 */
const deleteMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });
    if (pkg.status !== "PENDING")
      return res.status(400).json({ message: "包裹已處理，無法刪除" });

    deleteFiles([...(pkg.productImages || []), ...(pkg.warehouseImages || [])]);

    await prisma.package.delete({ where: { id } });
    res.status(200).json({ success: true, message: "刪除成功" });
  } catch (error) {
    console.error("刪除包裹錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  createPackageForecast,
  bulkForecast,
  claimPackage,
  resolveException,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
};
