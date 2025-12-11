// backend/controllers/admin/shipmentController.js
// V14.0 - Added Manual Price Adjustment Feature

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js");
// 引入新的 Email 通知函數
const { sendShipmentShippedNotification } = require("../../utils/sendEmail.js");
const invoiceHelper = require("../../utils/invoiceHelper.js");
const {
  deleteFiles,
  buildShipmentWhereClause,
} = require("../../utils/adminHelpers.js");

// [Helper] 內部使用的退款處理函數
const processRefund = async (tx, shipment, description) => {
  if (shipment.paymentProof === "WALLET_PAY" && shipment.totalCost > 0) {
    await tx.transaction.create({
      data: {
        wallet: { connect: { userId: shipment.userId } },
        amount: shipment.totalCost,
        type: "REFUND",
        status: "COMPLETED",
        description: description,
      },
    });
    await tx.wallet.update({
      where: { userId: shipment.userId },
      data: { balance: { increment: shipment.totalCost } },
    });
    return true;
  }
  return false;
};

const getAllShipments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const where = buildShipmentWhereClause(status, search);
    const statsWhere = buildShipmentWhereClause(undefined, search);

    const [total, shipments, statusGroups] = await prisma.$transaction([
      prisma.shipment.count({ where }),
      prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          packages: { select: { productName: true, trackingNumber: true } },
        },
      }),
      prisma.shipment.groupBy({
        by: ["status"],
        where: statsWhere,
        _count: { status: true },
      }),
    ]);

    const statusCounts = {};
    let totalInSearch = 0;
    statusGroups.forEach((g) => {
      statusCounts[g.status] = g._count.status;
      totalInSearch += g._count.status;
    });
    statusCounts["ALL"] = totalInSearch;

    const processed = shipments.map((s) => {
      return {
        ...s,
        additionalServices: s.additionalServices || {},
        shipmentProductImages: s.shipmentProductImages || [],
      };
    });
    res.status(200).json({
      success: true,
      shipments: processed,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      statusCounts,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const exportShipments = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = buildShipmentWhereClause(status, search);
    const shipments = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, name: true } } },
    });
    const exportData = shipments.map((s) => ({
      訂單號: s.id,
      建立時間: new Date(s.createdAt).toLocaleDateString(),
      會員: s.user.email,
      收件人: s.recipientName,
      電話: s.phone,
      地址: s.shippingAddress,
      狀態: s.status,
      總金額: s.totalCost || 0,
      發票號碼: s.invoiceNumber || "未開立",
      台灣單號: s.trackingNumberTW || "",
      備註: s.note || "",
    }));
    res.status(200).json({ success: true, data: exportData });
  } catch (e) {
    res.status(500).json({ success: false, message: "匯出失敗" });
  }
};

const bulkUpdateShipmentStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !status)
      return res.status(400).json({ success: false, message: "參數錯誤" });

    if (status === "PROCESSING") {
      const shipments = await prisma.shipment.findMany({
        where: { id: { in: ids } },
        include: { user: true },
      });

      let invoiceCount = 0;
      let successCount = 0;

      for (const ship of shipments) {
        let updateData = { status: "PROCESSING" };
        const isWalletPay = ship.paymentProof === "WALLET_PAY";

        if (
          !ship.invoiceNumber &&
          ship.totalCost > 0 &&
          ship.invoiceStatus !== "VOID" &&
          !isWalletPay
        ) {
          const result = await invoiceHelper.createInvoice(ship, ship.user);
          if (result.success) {
            updateData.invoiceNumber = result.invoiceNumber;
            updateData.invoiceStatus = "ISSUED";
            updateData.invoiceDate = result.invoiceDate;
            updateData.invoiceRandomCode = result.randomCode;
            invoiceCount++;
          }
        }

        await prisma.shipment.update({
          where: { id: ship.id },
          data: updateData,
        });

        await createNotification(
          ship.userId,
          "訂單已確認收款",
          `您的訂單 ${ship.id.slice(-8)} 已確認收款，將安排裝櫃。`,
          "SHIPMENT",
          ship.id
        );

        successCount++;
      }

      await createLog(
        req.user.id,
        "BULK_UPDATE_SHIPMENT",
        "BATCH",
        `批量收款 ${successCount} 筆，自動開立發票 ${invoiceCount} 張`
      );
      return res.status(200).json({
        success: true,
        message: `批量更新成功 (含發票開立 ${invoiceCount} 張)`,
      });
    } else if (status === "CANCELLED") {
      const shipments = await prisma.shipment.findMany({
        where: { id: { in: ids } },
      });

      let refundCount = 0;
      await prisma.$transaction(async (tx) => {
        for (const ship of shipments) {
          if (ship.status === "CANCELLED") continue;

          const refunded = await processRefund(
            tx,
            ship,
            `批量取消退款 (${ship.id})`
          );
          if (refunded) refundCount++;

          await tx.shipment.update({
            where: { id: ship.id },
            data: { status: "CANCELLED" },
          });
          await tx.package.updateMany({
            where: { shipmentId: ship.id },
            data: { status: "ARRIVED", shipmentId: null },
          });

          await createNotification(
            ship.userId,
            "訂單已取消",
            `您的訂單 ${ship.id.slice(-8)} 已取消。`,
            "SHIPMENT",
            ship.id
          );
        }
      });

      const msg = refundCount > 0 ? ` (含退雪 ${refundCount} 筆)` : "";
      await createLog(
        req.user.id,
        "BULK_UPDATE_SHIPMENT",
        "BATCH",
        `批量取消 ${ids.length} 筆訂單${msg}`
      );
      return res
        .status(200)
        .json({ success: true, message: `批量取消成功${msg}` });
    } else {
      // SHIPPED, COMPLETED 等其他狀態
      await prisma.shipment.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });

      // 批量通知 & Email
      const shipments = await prisma.shipment.findMany({
        where: { id: { in: ids } },
        select: {
          userId: true,
          id: true,
          recipientName: true,
          trackingNumberTW: true,
        },
        include: { user: true }, // 需要 User 來發 Email
      });

      const statusMsgs = {
        SHIPPED: "已裝櫃出貨",
        CUSTOMS_CHECK: "海關查驗中",
        UNSTUFFING: "正在拆櫃派送",
        COMPLETED: "已送達完成",
      };

      if (statusMsgs[status]) {
        await Promise.all(
          shipments.map(async (s) => {
            // 1. 站內通知
            await createNotification(
              s.userId,
              `訂單狀態更新：${statusMsgs[status]}`,
              `您的訂單 ${s.id.slice(-8)} 目前狀態：${statusMsgs[status]}。`,
              "SHIPMENT",
              s.id
            );
            // 2. [New] 如果是 SHIPPED，發送 Email
            if (status === "SHIPPED") {
              await sendShipmentShippedNotification(s, s.user);
            }
          })
        );
      }

      await createLog(
        req.user.id,
        "BULK_UPDATE_SHIPMENT",
        "BATCH",
        `批量更新 ${ids.length} 筆訂單為 ${status}`
      );
      return res.status(200).json({ success: true, message: "批量更新成功" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const bulkDeleteShipments = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "未選擇訂單" });

    const shipments = await prisma.shipment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        userId: true,
        paymentProof: true,
        totalCost: true,
        status: true,
        shipmentProductImages: true,
      },
    });

    const files = [];
    shipments.forEach((s) => {
      if (s.paymentProof && s.paymentProof !== "WALLET_PAY")
        files.push(s.paymentProof);
      if (Array.isArray(s.shipmentProductImages)) {
        files.push(...s.shipmentProductImages);
      }
    });
    deleteFiles(files);

    let refundCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const ship of shipments) {
        if (ship.status !== "CANCELLED") {
          const refunded = await processRefund(
            tx,
            ship,
            `訂單刪除退款 (${ship.id})`
          );
          if (refunded) refundCount++;
        }

        await tx.package.updateMany({
          where: { shipmentId: ship.id },
          data: { status: "ARRIVED", shipmentId: null },
        });
      }

      await tx.shipment.deleteMany({ where: { id: { in: ids } } });
    });

    const msg = refundCount > 0 ? ` (含退款 ${refundCount} 筆)` : "";
    await createLog(
      req.user.id,
      "BULK_DELETE_SHIPMENT",
      "BATCH",
      `批量刪除 ${ids.length} 筆訂單${msg}`
    );
    res.status(200).json({ success: true, message: `批量刪除成功${msg}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      totalCost,
      trackingNumberTW,
      taxId,
      invoiceTitle,
      loadingDate,
    } = req.body;

    const originalShipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!originalShipment)
      return res.status(404).json({ success: false, message: "找不到訂單" });

    if (status === "CANCELLED" && originalShipment.status === "CANCELLED") {
      return res
        .status(400)
        .json({ success: false, message: "訂單已取消，請勿重複操作" });
    }

    if (
      totalCost !== undefined &&
      originalShipment.invoiceStatus === "ISSUED" &&
      originalShipment.invoiceNumber &&
      parseFloat(totalCost) !== originalShipment.totalCost
    ) {
      return res.status(400).json({
        success: false,
        message:
          "危險操作禁止：此訂單已開立發票，禁止直接修改金額！請先「作廢發票」後再行修改。",
      });
    }

    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;
    if (totalCost !== undefined) dataToUpdate.totalCost = parseFloat(totalCost);
    if (trackingNumberTW !== undefined)
      dataToUpdate.trackingNumberTW = trackingNumberTW;
    if (taxId !== undefined) dataToUpdate.taxId = taxId;
    if (invoiceTitle !== undefined) dataToUpdate.invoiceTitle = invoiceTitle;

    if (loadingDate !== undefined) {
      dataToUpdate.loadingDate = loadingDate ? new Date(loadingDate) : null;
    }

    if (status === "CANCELLED") {
      const result = await prisma.$transaction(async (tx) => {
        const refunded = await processRefund(
          tx,
          originalShipment,
          `訂單取消退款 (${originalShipment.id})`
        );

        const released = await tx.package.updateMany({
          where: { shipmentId: id },
          data: { status: "ARRIVED", shipmentId: null },
        });
        const updatedShipment = await tx.shipment.update({
          where: { id },
          data: dataToUpdate,
        });
        return { shipment: updatedShipment, count: released.count, refunded };
      });

      await createNotification(
        originalShipment.userId,
        "訂單已取消",
        `您的訂單 ${id.slice(-8)} 已取消並釋放包裹。`,
        "SHIPMENT",
        id
      );

      const refundMsg = result.refunded ? " (已退款)" : "";
      await createLog(
        req.user.id,
        "UPDATE_SHIPMENT",
        id,
        `訂單取消，已釋放 ${result.count} 件包裹${refundMsg}`
      );
      return res.status(200).json({
        success: true,
        shipment: result.shipment,
        message: `訂單已取消，釋放 ${result.count} 件包裹${refundMsg}`,
      });
    }

    const isWalletPay = originalShipment.paymentProof === "WALLET_PAY";

    if (
      status === "PROCESSING" &&
      !originalShipment.invoiceNumber &&
      originalShipment.totalCost > 0 &&
      !isWalletPay
    ) {
      const shipmentForInvoice = { ...originalShipment, ...dataToUpdate };
      const result = await invoiceHelper.createInvoice(
        shipmentForInvoice,
        originalShipment.user
      );
      if (result.success) {
        dataToUpdate.invoiceNumber = result.invoiceNumber;
        dataToUpdate.invoiceStatus = "ISSUED";
        dataToUpdate.invoiceDate = result.invoiceDate;
        dataToUpdate.invoiceRandomCode = result.randomCode;
        await createLog(
          req.user.id,
          "CREATE_INVOICE",
          id,
          `發票成功: ${result.invoiceNumber}`
        );
      }
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: dataToUpdate,
    });

    const statusMsgs = {
      PROCESSING: "訂單已收款，正在處理中",
      SHIPPED: "訂單已裝櫃出貨",
      CUSTOMS_CHECK: "訂單海關查驗中",
      UNSTUFFING: "貨櫃拆櫃派送中",
      COMPLETED: "訂單已完成",
    };
    if (status && statusMsgs[status]) {
      // 1. 站內通知
      await createNotification(
        originalShipment.userId,
        statusMsgs[status],
        `您的訂單 ${id.slice(-8)} 狀態更新：${statusMsgs[status]}`,
        "SHIPMENT",
        id
      );
      // 2. [New] 如果是 SHIPPED，發送 Email
      if (status === "SHIPPED") {
        await sendShipmentShippedNotification(updated, originalShipment.user);
      }
    }

    await createLog(
      req.user.id,
      "UPDATE_SHIPMENT",
      id,
      `狀態:${status}, 金額:${totalCost}`
    );
    res.status(200).json({ success: true, shipment: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

const rejectShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const { returnReason } = req.body;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        paymentProof: true,
        totalCost: true,
        status: true,
      },
    });

    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到訂單" });

    if (shipment.status === "CANCELLED" || shipment.status === "RETURNED")
      return res
        .status(400)
        .json({ success: false, message: "訂單已取消或退回，請勿重複操作" });

    const result = await prisma.$transaction(async (tx) => {
      const refunded = await processRefund(
        tx,
        shipment,
        `訂單退回退款 (${shipment.id})`
      );

      const updated = await tx.shipment.update({
        where: { id },
        data: {
          status: "RETURNED",
          returnReason: returnReason || "管理員退回 (未說明原因)",
        },
      });

      const released = await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      return { count: released.count, refunded };
    });

    await createNotification(
      shipment.userId,
      "訂單被退回",
      `您的訂單 ${id.slice(-8)} 已被退回，原因：${returnReason || "無"}。`,
      "SHIPMENT",
      id
    );

    const refundMsg = result.refunded ? " (已退款至錢包)" : "";
    await createLog(
      req.user.id,
      "RETURN_SHIPMENT",
      id,
      `退回訂單: ${returnReason || "無"} ${refundMsg}`
    );
    res.status(200).json({
      success: true,
      message: `訂單已退回並釋放 ${result.count} 件包裹${refundMsg}`,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "退回失敗" });
  }
};

const adminDeleteShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const ship = await prisma.shipment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        paymentProof: true,
        totalCost: true,
        status: true,
        shipmentProductImages: true,
      },
    });

    if (ship) {
      let files = [];
      if (ship.paymentProof && ship.paymentProof !== "WALLET_PAY")
        files.push(ship.paymentProof);
      if (Array.isArray(ship.shipmentProductImages)) {
        files.push(...ship.shipmentProductImages);
      }
      deleteFiles(files);
    }

    let refunded = false;
    await prisma.$transaction(async (tx) => {
      if (ship && ship.status !== "CANCELLED") {
        refunded = await processRefund(tx, ship, `訂單刪除退款 (${ship.id})`);
      }

      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id } });
    });

    const msg = refunded ? " (含退款)" : "";
    await createLog(req.user.id, "ADMIN_DELETE_SHIPMENT", id, `永久刪除${msg}`);
    res.status(200).json({ success: true, message: `已刪除${msg}` });
  } catch (e) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

const manualIssueInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!shipment) return res.status(404).json({ message: "找不到訂單" });

    if (shipment.invoiceNumber && shipment.invoiceStatus !== "VOID") {
      return res
        .status(400)
        .json({ message: "此訂單已開立發票，不可重複開立" });
    }

    if (shipment.paymentProof === "WALLET_PAY") {
      return res.status(400).json({
        message:
          "禁止開立：此訂單使用錢包餘額支付，發票已於儲值時開立，請勿重複作業。",
      });
    }

    const result = await invoiceHelper.createInvoice(shipment, shipment.user);

    if (result.success) {
      await prisma.shipment.update({
        where: { id },
        data: {
          invoiceNumber: result.invoiceNumber,
          invoiceDate: result.invoiceDate,
          invoiceRandomCode: result.randomCode,
          invoiceStatus: "ISSUED",
        },
      });
      await createLog(
        req.user.id,
        "INVOICE_ISSUE",
        id,
        `手動開立發票: ${result.invoiceNumber}`
      );
      res.json({
        success: true,
        message: "發票開立成功",
        invoiceNumber: result.invoiceNumber,
      });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "系統錯誤" });
  }
};

const manualVoidInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const shipment = await prisma.shipment.findUnique({ where: { id } });

    if (!shipment || !shipment.invoiceNumber)
      return res.status(400).json({ message: "此訂單尚未開立發票" });
    if (shipment.invoiceStatus === "VOID")
      return res.status(400).json({ message: "發票已作廢" });

    const result = await invoiceHelper.voidInvoice(
      shipment.invoiceNumber,
      reason
    );

    if (result.success) {
      await prisma.shipment.update({
        where: { id },
        data: { invoiceStatus: "VOID" },
      });
      await createLog(
        req.user.id,
        "INVOICE_VOID",
        id,
        `作廢發票: ${shipment.invoiceNumber}`
      );
      res.json({ success: true, message: "發票已成功作廢" });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "系統錯誤" });
  }
};

// [新增功能] 人工調整訂單價格 (含錢包多退少補邏輯)
const adjustShipmentPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPrice, reason } = req.body;

    // 1. 基本驗證
    if (newPrice === undefined || newPrice < 0) {
      return res
        .status(400)
        .json({ success: false, message: "請提供有效的新價格 (newPrice)" });
    }
    if (!reason || reason.trim() === "") {
      return res
        .status(400)
        .json({
          success: false,
          message: "為了稽核安全，請務必填寫「調整原因」",
        });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: "找不到訂單" });
    }

    // 2. 發票防呆：若已開立發票，必須先作廢才能改價
    if (shipment.invoiceStatus === "ISSUED" && shipment.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message:
          "危險操作禁止：此訂單已開立發票，禁止直接修改金額！請先「作廢發票」後再行調整。",
      });
    }

    const oldPrice = shipment.totalCost || 0;
    const targetPrice = parseFloat(newPrice);
    const diff = oldPrice - targetPrice; // 正數代表降價(需退款)，負數代表漲價(需補扣)
    const isWalletPay = shipment.paymentProof === "WALLET_PAY";

    // 若價格無變動則直接返回
    if (Math.abs(diff) < 0.01) {
      return res.status(200).json({ success: true, message: "價格無變動" });
    }

    // 3. 開始資料庫交易 (確保金額與錢包一致性)
    await prisma.$transaction(async (tx) => {
      // 3.1 更新訂單金額
      await tx.shipment.update({
        where: { id },
        data: { totalCost: targetPrice },
      });

      // 3.2 若已使用錢包支付，需處理多退少補
      if (isWalletPay) {
        if (diff > 0) {
          // === 降價：退還差額給客戶 ===
          await tx.wallet.update({
            where: { userId: shipment.userId },
            data: { balance: { increment: diff } },
          });

          await tx.transaction.create({
            data: {
              wallet: { connect: { userId: shipment.userId } },
              amount: diff,
              type: "REFUND",
              status: "COMPLETED",
              description: `訂單改價退款 #${
                shipment.trackingNumberTW || shipment.id.slice(-6)
              }: ${reason}`,
              shipment: { connect: { id: shipment.id } },
            },
          });
        } else {
          // === 漲價：補扣客戶餘額 ===
          const chargeAmount = Math.abs(diff);

          // 檢查餘額是否足夠
          const wallet = await tx.wallet.findUnique({
            where: { userId: shipment.userId },
          });
          if (!wallet || wallet.balance < chargeAmount) {
            throw new Error(
              `用戶錢包餘額不足，無法調漲價格 (需補扣 $${chargeAmount}，目前餘額 $${
                wallet?.balance || 0
              })。請先請用戶儲值或將訂單改為未付款狀態。`
            );
          }

          await tx.wallet.update({
            where: { userId: shipment.userId },
            data: { balance: { decrement: chargeAmount } },
          });

          await tx.transaction.create({
            data: {
              wallet: { connect: { userId: shipment.userId } },
              amount: chargeAmount,
              type: "ADJUST", // 使用 ADJUST 或 PAYMENT
              status: "COMPLETED",
              description: `訂單改價補扣 #${
                shipment.trackingNumberTW || shipment.id.slice(-6)
              }: ${reason}`,
              shipment: { connect: { id: shipment.id } },
            },
          });
        }
      }
    });

    // 4. 寫入操作日誌 (Audit Log)
    await createLog(
      req.user.id,
      "ADJUST_PRICE",
      id,
      `價格調整: $${oldPrice} -> $${targetPrice}, 原因: ${reason}`
    );

    // 5. 發送通知給用戶
    await createNotification(
      shipment.userId,
      "訂單金額調整通知",
      `您的訂單 ${id.slice(
        -8
      )} 金額已由系統管理員調整為 $${targetPrice}。原因：${reason}`,
      "SHIPMENT",
      id
    );

    res.status(200).json({
      success: true,
      message:
        `價格已更新為 $${targetPrice}` +
        (isWalletPay
          ? diff > 0
            ? ` (已退還 $${diff} 至錢包)`
            : ` (已補扣 $${Math.abs(diff)} 從錢包)`
          : ""),
    });
  } catch (e) {
    console.error("Adjust Price Error:", e);
    res
      .status(500)
      .json({ success: false, message: e.message || "調整價格失敗" });
  }
};

module.exports = {
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,
  manualIssueInvoice,
  manualVoidInvoice,
  adjustShipmentPrice,
};
