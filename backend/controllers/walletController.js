// backend/controllers/walletController.js
// V1.4 - Added Tax ID Validation

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");

/**
 * @description 取得我的錢包 (餘額與交易紀錄)
 * @route GET /api/wallet/my
 */
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

/**
 * @description 申請儲值 (上傳憑證 + [新增] 統編)
 * @route POST /api/wallet/deposit
 */
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

    // [Validation] 統編與抬頭的一致性檢查
    if (
      taxId &&
      taxId.trim() !== "" &&
      (!invoiceTitle || invoiceTitle.trim() === "")
    ) {
      // 刪除上傳的檔案 (清理暫存)
      const fs = require("fs");
      fs.unlink(proofFile.path, () => {});
      return res
        .status(400)
        .json({
          success: false,
          message: "填寫統一編號時，公司抬頭為必填項目",
        });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      await prisma.wallet.create({ data: { userId, balance: 0 } });
    }

    // [Updated] 建立交易紀錄時寫入 taxId / invoiceTitle
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

    res.status(201).json({
      success: true,
      message: "儲值申請已提交，請等待管理員審核",
      transaction,
    });
  } catch (error) {
    console.error("儲值申請失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getMyWallet,
  requestDeposit,
};
