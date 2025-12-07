// backend/controllers/walletController.js

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");

/**
 * @description 取得我的錢包 (餘額與交易紀錄)
 * @route GET /api/wallet/my
 */
const getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    // 使用 upsert 確保用戶一定有錢包資料 (若無則自動建立)
    const wallet = await prisma.wallet.upsert({
      where: { userId: userId },
      update: {}, // 如果存在，不更新任何欄位
      create: {
        userId: userId,
        balance: 0,
      },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 50, // 只取最近 50 筆
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
 * @description 申請儲值 (上傳憑證)
 * @route POST /api/wallet/deposit
 */
const requestDeposit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, description } = req.body;
    const proofFile = req.file; // 透過 multer 上傳

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

    // 確保錢包存在
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      // 理論上 getMyWallet 會處理，但防呆
      await prisma.wallet.create({ data: { userId, balance: 0 } });
    }

    // 建立交易紀錄 (狀態: PENDING)
    const transaction = await prisma.transaction.create({
      data: {
        wallet: { connect: { userId } },
        amount: parseFloat(amount),
        type: "DEPOSIT",
        status: "PENDING",
        description: description || "會員申請儲值",
        proofImage: `/uploads/${proofFile.filename}`,
      },
    });

    // 寫入操作日誌
    await createLog(
      userId,
      "WALLET_DEPOSIT_REQUEST",
      transaction.id,
      `申請儲值 $${amount}`
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
