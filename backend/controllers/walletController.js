// backend/controllers/walletController.js
// V1.6 - Strict Validation for Deposit & Email Notification

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");
const fs = require("fs"); // 引入 fs
// 引入 Email 通知 (新增：通知客戶儲值申請)
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

    // [Backend Validation] 統編與抬頭的一致性檢查
    if (
      taxId &&
      taxId.trim() !== "" &&
      (!invoiceTitle || invoiceTitle.trim() === "")
    ) {
      // 驗證失敗：刪除上傳的檔案
      fs.unlink(proofFile.path, (err) => {
        if (err) console.warn("刪除暫存檔案失敗:", err.message);
      });
      return res.status(400).json({
        success: false,
        message: "填寫統一編號時，公司抬頭為必填項目",
      });
    }

    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });

    // [Data Sync] 建立交易紀錄時寫入 taxId / invoiceTitle
    const transaction = await prisma.transaction.create({
      data: {
        wallet: { connect: { userId } },
        amount: parseFloat(amount),
        type: "DEPOSIT",
        status: "PENDING",
        description: description || "會員申請儲值",
        proofImage: `/uploads/${proofFile.filename}`,
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

    // 觸發 Email 通知 (新增)
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
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("儲值申請失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getMyWallet,
  requestDeposit,
};
