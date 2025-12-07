// backend/controllers/admin/shipmentController.js
// V13.5 - Fix: Auto refund for Cancelled/Rejected Wallet Orders

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const invoiceHelper = require("../../utils/invoiceHelper.js");
const {
  deleteFiles,
  buildShipmentWhereClause,
} = require("../../utils/adminHelpers.js");

const getAllShipments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;
    const where = buildShipmentWhereClause(status, search);
    const [total, shipments] = await prisma.$transaction([
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
    ]);
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
    });
  } catch (e) {
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
          } else {
            await createLog(
              req.user.id,
              "INVOICE_FAILED",
              ship.id,
              `批量開立失敗: ${result.message}`
            );
          }
        }

        await prisma.shipment.update({
          where: { id: ship.id },
          data: updateData,
        });
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
    } else {
      await prisma.shipment.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });
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
      select: { paymentProof: true, shipmentProductImages: true },
    });
    const files = [];
    shipments.forEach((s) => {
      if (s.paymentProof) files.push(s.paymentProof);
      if (Array.isArray(s.shipmentProductImages)) {
        files.push(...s.shipmentProductImages);
      }
    });
    deleteFiles(files);
    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: { in: ids } },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.deleteMany({ where: { id: { in: ids } } });
    });
    await createLog(
      req.user.id,
      "BULK_DELETE_SHIPMENT",
      "BATCH",
      `批量刪除 ${ids.length} 筆訂單`
    );
    res.status(200).json({ success: true, message: "批量刪除成功" });
  } catch (e) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, totalCost, trackingNumberTW, taxId, invoiceTitle } =
      req.body;

    const originalShipment = await prisma.shipment.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!originalShipment)
      return res.status(404).json({ success: false, message: "找不到訂單" });

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

    if (
      status === "SHIPPED" &&
      originalShipment.status !== "PROCESSING" &&
      !originalShipment.paymentProof
    ) {
      if (originalShipment.status === "PENDING_PAYMENT") {
        return res.status(400).json({
          success: false,
          message: "出貨禁止：此訂單尚未付款或收款確認，無法發貨！",
        });
      }
    }

    const dataToUpdate = {};
    if (status) dataToUpdate.status = status;
    if (totalCost !== undefined) dataToUpdate.totalCost = parseFloat(totalCost);
    if (trackingNumberTW !== undefined)
      dataToUpdate.trackingNumberTW = trackingNumberTW;
    if (taxId !== undefined) dataToUpdate.taxId = taxId;
    if (invoiceTitle !== undefined) dataToUpdate.invoiceTitle = invoiceTitle;

    if (status === "CANCELLED") {
      const result = await prisma.$transaction(async (tx) => {
        // [New] 自動退款邏輯 (若為錢包支付)
        if (
          originalShipment.paymentProof === "WALLET_PAY" &&
          originalShipment.totalCost > 0
        ) {
          // 建立退款交易
          await tx.transaction.create({
            data: {
              wallet: { connect: { userId: originalShipment.userId } },
              amount: originalShipment.totalCost,
              type: "REFUND",
              status: "COMPLETED",
              description: `訂單取消退款 (${originalShipment.id})`,
            },
          });
          // 返還餘額
          await tx.wallet.update({
            where: { userId: originalShipment.userId },
            data: { balance: { increment: originalShipment.totalCost } },
          });
        }

        const released = await tx.package.updateMany({
          where: { shipmentId: id },
          data: { status: "ARRIVED", shipmentId: null },
        });
        const updatedShipment = await tx.shipment.update({
          where: { id },
          data: dataToUpdate,
        });
        return { shipment: updatedShipment, count: released.count };
      });

      const refundMsg =
        originalShipment.paymentProof === "WALLET_PAY" ? " (已退款)" : "";
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
      } else {
        await createLog(
          req.user.id,
          "INVOICE_FAILED",
          id,
          `發票失敗: ${result.message}`
        );
      }
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: dataToUpdate,
    });
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

    // [Fix] 先查詢訂單以判斷付款方式
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
    if (shipment.status === "CANCELLED")
      return res
        .status(400)
        .json({ success: false, message: "訂單已取消，請勿重複操作" });

    const result = await prisma.$transaction(async (tx) => {
      // [New] 自動退款邏輯 (若為錢包支付)
      if (shipment.paymentProof === "WALLET_PAY" && shipment.totalCost > 0) {
        await tx.transaction.create({
          data: {
            wallet: { connect: { userId: shipment.userId } },
            amount: shipment.totalCost,
            type: "REFUND",
            status: "COMPLETED",
            description: `訂單駁回退款 (${shipment.id})`,
          },
        });
        await tx.wallet.update({
          where: { userId: shipment.userId },
          data: { balance: { increment: shipment.totalCost } },
        });
      }

      const updated = await tx.shipment.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      const released = await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      return { count: released.count };
    });

    const refundMsg =
      shipment.paymentProof === "WALLET_PAY" ? " (已退款至錢包)" : "";
    await createLog(
      req.user.id,
      "REJECT_SHIPMENT",
      id,
      `釋放${result.count}件包裹${refundMsg}`
    );
    res
      .status(200)
      .json({ success: true, message: `已退回並釋放包裹${refundMsg}` });
  } catch (e) {
    res.status(500).json({ success: false, message: "退回失敗" });
  }
};

const adminDeleteShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const ship = await prisma.shipment.findUnique({
      where: { id },
      select: { paymentProof: true, shipmentProductImages: true },
    });
    if (ship) {
      let files = [];
      if (ship.paymentProof) files.push(ship.paymentProof);
      if (Array.isArray(ship.shipmentProductImages)) {
        files.push(...ship.shipmentProductImages);
      }
      deleteFiles(files);
    }
    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id } });
    });
    await createLog(req.user.id, "ADMIN_DELETE_SHIPMENT", id, "永久刪除");
    res.status(200).json({ success: true, message: "已刪除" });
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
};
