// backend/controllers/admin/walletController.js
// V1.3 - Integrated with Notifications

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js"); // [New]
const invoiceHelper = require("../../utils/invoiceHelper.js");

/**
 * 取得交易紀錄列表 (支援篩選與分頁)
 * @route GET /api/admin/finance/transactions
 */
const getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, type, search } = req.query;

    const where = {};

    if (status) where.status = status;
    if (type) where.type = type;

    // 搜尋使用者 Email 或 姓名
    if (search) {
      where.wallet = {
        user: {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
      };
    }

    const [total, transactions] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          wallet: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      }),
    ]);

    // 整理回傳格式，扁平化使用者資訊
    const formatted = transactions.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      status: tx.status,
      description: tx.description,
      proofImage: tx.proofImage,
      // 回傳發票資訊
      invoiceNumber: tx.invoiceNumber,
      invoiceStatus: tx.invoiceStatus,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      user: tx.wallet.user,
    }));

    res.status(200).json({
      success: true,
      transactions: formatted,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Admin getTransactions error:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 審核交易 (同意儲值 / 駁回)
 * @route PUT /api/admin/finance/transactions/:id/review
 * @param {string} id - Transaction ID
 * @body {string} action - 'APPROVE' or 'REJECT'
 * @body {string} [rejectReason] - 駁回原因
 */
const reviewTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectReason } = req.body; // APPROVE or REJECT

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        wallet: {
          include: { user: true }, // 需要 User 資料來開立發票與發送通知
        },
      },
    });

    if (!tx) return res.status(404).json({ message: "找不到交易紀錄" });
    if (tx.status !== "PENDING")
      return res.status(400).json({ message: "此交易已處理過，無法再次審核" });

    if (action === "APPROVE") {
      let invoiceResult = null;
      let invoiceMsg = "";

      // 自動開立發票邏輯：只有 "DEPOSIT" (儲值) 且金額 > 0 才開立
      if (tx.type === "DEPOSIT" && tx.amount > 0) {
        try {
          invoiceResult = await invoiceHelper.createDepositInvoice(
            tx,
            tx.wallet.user
          );
          if (invoiceResult.success) {
            invoiceMsg = ` (發票已開立: ${invoiceResult.invoiceNumber})`;
          } else {
            console.warn(
              `[Invoice Warning] 儲值發票開立失敗 Tx:${id}`,
              invoiceResult.message
            );
            invoiceMsg = ` (發票失敗: ${invoiceResult.message})`;
          }
        } catch (e) {
          console.error("Invoice error:", e);
        }
      }

      // 使用 Transaction 確保餘額與狀態同步更新
      await prisma.$transaction(async (prismaTx) => {
        // 1. 更新交易狀態為完成，並寫入發票資訊
        await prismaTx.transaction.update({
          where: { id },
          data: {
            status: "COMPLETED",
            // 若有發票資訊則寫入
            invoiceNumber: invoiceResult?.invoiceNumber,
            invoiceDate: invoiceResult?.invoiceDate,
            invoiceRandomCode: invoiceResult?.randomCode,
            invoiceStatus: invoiceResult?.success
              ? "ISSUED"
              : invoiceResult
              ? "FAILED"
              : null,
          },
        });

        // 2. 增加錢包餘額
        await prismaTx.wallet.update({
          where: { id: tx.walletId },
          data: { balance: { increment: tx.amount } },
        });
      });

      // [New] 發送站內通知
      await createNotification(
        tx.wallet.userId,
        "儲值成功",
        `您申請的 $${tx.amount.toLocaleString()} 儲值已核准並入帳。`,
        "WALLET",
        "tab-wallet"
      );

      await createLog(
        req.user.id,
        "APPROVE_DEPOSIT",
        id,
        `審核通過儲值 $${tx.amount}${invoiceMsg}`
      );
      res
        .status(200)
        .json({ success: true, message: `儲值已核准${invoiceMsg}` });
    } else if (action === "REJECT") {
      // 駁回僅更新狀態，不更動餘額
      await prisma.transaction.update({
        where: { id },
        data: {
          status: "REJECTED",
          description:
            tx.description +
            (rejectReason ? ` (駁回原因: ${rejectReason})` : ""),
        },
      });

      // [New] 發送站內通知
      await createNotification(
        tx.wallet.userId,
        "儲值申請已駁回",
        `您的儲值申請已被駁回，原因：${rejectReason || "資料不符"}。`,
        "WALLET",
        "tab-wallet"
      );

      await createLog(req.user.id, "REJECT_DEPOSIT", id, "駁回儲值申請");
      res.status(200).json({ success: true, message: "已駁回申請" });
    } else {
      res.status(400).json({ message: "無效的操作指令" });
    }
  } catch (error) {
    console.error("Review transaction error:", error);
    res.status(500).json({ success: false, message: "處理失敗" });
  }
};

/**
 * 手動調整會員餘額 (人工加扣款)
 * @route POST /api/admin/finance/adjust
 * @body {string} userId
 * @body {number} amount - 正數加款，負數扣款
 * @body {string} note
 */
const manualAdjust = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const adjustAmount = parseFloat(amount);

    if (!userId || isNaN(adjustAmount) || adjustAmount === 0) {
      return res.status(400).json({ message: "請輸入正確的金額與會員 ID" });
    }

    // 確保錢包存在 (若無則建立)
    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      // 防呆：如果該用戶還沒有錢包紀錄，幫他建立一個
      wallet = await prisma.wallet.create({
        data: { userId, balance: 0 },
      });
    }

    await prisma.$transaction(async (prismaTx) => {
      // 1. 建立調整紀錄 (類型為 ADJUST)
      await prismaTx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: adjustAmount,
          type: "ADJUST", // 系統調整/人工調整
          status: "COMPLETED",
          description: note || "管理員手動調整",
        },
      });

      // 2. 更新餘額 (原子操作)
      await prismaTx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: adjustAmount } },
      });
    });

    // [New] 發送站內通知
    const actionText = adjustAmount > 0 ? "補款" : "扣款";
    await createNotification(
      userId,
      "錢包餘額變動",
      `管理員執行了人工${actionText} $${Math.abs(
        adjustAmount
      ).toLocaleString()}，備註：${note || "無"}。`,
      "WALLET",
      "tab-wallet"
    );

    await createLog(
      req.user.id,
      "MANUAL_ADJUST",
      userId,
      `手動調整金額: ${adjustAmount}`
    );
    res.status(200).json({ success: true, message: "餘額調整成功" });
  } catch (error) {
    console.error("Manual adjust error:", error);
    res.status(500).json({ success: false, message: "調整失敗" });
  }
};

/**
 * 手動補開儲值發票 (針對已完成但發票失敗的交易)
 * @route POST /api/admin/finance/transactions/:id/invoice
 */
const manualIssueDepositInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. 查詢交易
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        wallet: { include: { user: true } },
      },
    });

    // 2. 驗證狀態
    if (!tx) return res.status(404).json({ message: "找不到交易" });
    if (tx.type !== "DEPOSIT")
      return res.status(400).json({ message: "僅限儲值交易可開立發票" });
    if (tx.status !== "COMPLETED")
      return res.status(400).json({ message: "交易尚未完成，無法開立" });
    if (tx.invoiceStatus === "ISSUED" && tx.invoiceNumber)
      return res.status(400).json({ message: "此交易已開立過發票" });

    // 3. 呼叫 Helper 開立
    const invoiceResult = await invoiceHelper.createDepositInvoice(
      tx,
      tx.wallet.user
    );

    if (invoiceResult.success) {
      // 4. 更新 DB
      await prisma.transaction.update({
        where: { id },
        data: {
          invoiceNumber: invoiceResult.invoiceNumber,
          invoiceDate: invoiceResult.invoiceDate,
          invoiceRandomCode: invoiceResult.randomCode,
          invoiceStatus: "ISSUED",
        },
      });

      await createLog(
        req.user.id,
        "MANUAL_INVOICE_DEPOSIT",
        id,
        `補開儲值發票: ${invoiceResult.invoiceNumber}`
      );

      return res.json({
        success: true,
        message: "發票補開成功",
        invoiceNumber: invoiceResult.invoiceNumber,
      });
    } else {
      // 記錄失敗狀態
      await prisma.transaction.update({
        where: { id },
        data: { invoiceStatus: "FAILED" },
      });
      return res.status(400).json({
        success: false,
        message: `開立失敗: ${invoiceResult.message}`,
      });
    }
  } catch (error) {
    console.error("Manual issue deposit invoice error:", error);
    res.status(500).json({ success: false, message: "系統錯誤" });
  }
};

module.exports = {
  getTransactions,
  reviewTransaction,
  manualAdjust,
  manualIssueDepositInvoice,
};
