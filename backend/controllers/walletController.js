// backend/controllers/walletController.js
// V1.8 - Fix Cloudinary Broken Images (HTTPS) & Optimize Path Logic

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");
const fs = require("fs");
// 引入 Email 通知
const { sendDepositRequestNotification } = require("../utils/sendEmail.js");

const getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    const wallet = await prisma.wallet.upsert({
      where: { userId: userId },
      update: {},
      create: {
        userId: userId,
        balance: 0,
      },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    res.status(200).json({ success: true, wallet });
  } catch (error) {
    console.error("取得錢包失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const requestDeposit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, description, taxId, invoiceTitle } = req.body;
    const proofFile = req.file;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入有效的儲值金額" });
    }
    if (!proofFile) {
      return res
        .status(400)
        .json({ success: false, message: "請上傳轉帳憑證" });
    }

    // [Fix] 優化路徑處理邏輯，確保圖片不破圖
    let proofImagePath;

    // 檢查是否為 Cloudinary 網址 (http 或 https 開頭)
    if (
      proofFile.path &&
      (proofFile.path.startsWith("http") || proofFile.path.startsWith("https"))
    ) {
      // 強制將 http 取代為 https，避免 Mixed Content 導致圖片無法顯示
      proofImagePath = proofFile.path.replace(/^http:\/\//i, "https://");
    } else if (proofFile.filename) {
      // 本地模式 (fallback)：若 Cloudinary 上傳失敗或未設定，回退到本地 uploads
      proofImagePath = `/uploads/${proofFile.filename}`;
    } else {
      // 極端情況防呆
      proofImagePath = "";
    }

    // [Backend Validation] 統編與抬頭的一致性檢查
    if (
      taxId &&
      taxId.trim() !== "" &&
      (!invoiceTitle || invoiceTitle.trim() === "")
    ) {
      // 驗證失敗：若為本地檔案則刪除，Cloudinary 檔案雖已上傳但不寫入 DB (日後可透過腳本清理)
      if (proofFile.path && !proofFile.path.startsWith("http")) {
        fs.unlink(proofFile.path, (err) => {
          if (err) console.warn("刪除暫存檔案失敗:", err.message);
        });
      }
      return res.status(400).json({
        success: false,
        message: "填寫統一編號時，公司抬頭為必填項目",
      });
    }

    // 確保錢包存在
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });

    // [Data Sync] 建立交易紀錄
    const transaction = await prisma.transaction.create({
      data: {
        wallet: { connect: { userId } },
        amount: parseFloat(amount),
        type: "DEPOSIT",
        status: "PENDING",
        description: description || "會員申請儲值",
        proofImage: proofImagePath, // 使用修正後的 HTTPS 路徑
        taxId: taxId || null,
        invoiceTitle: invoiceTitle || null,
      },
    });

    await createLog(
      userId,
      "WALLET_DEPOSIT_REQUEST",
      transaction.id,
      `申請儲值 $${amount} ${taxId ? "(含統編)" : ""}`
    );

    // 觸發 Email 通知
    try {
      await sendDepositRequestNotification(transaction, req.user);
    } catch (e) {
      console.warn("Email通知發送失敗 (Deposit):", e.message);
    }

    res.status(201).json({
      success: true,
      message: "儲值申請已提交，請等待管理員審核",
      transaction,
    });
  } catch (error) {
    // 發生錯誤時的清理邏輯 (僅限本地檔案)
    if (req.file && req.file.path && !req.file.path.startsWith("http")) {
      fs.unlink(req.file.path, () => {});
    }
    console.error("儲值申請失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getMyWallet,
  requestDeposit,
};
