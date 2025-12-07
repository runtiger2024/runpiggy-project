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

        if (
          !ship.invoiceNumber &&
          ship.totalCost > 0 &&
          ship.invoiceStatus !== "VOID"
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
      await createLog(
        req.user.id,
        "UPDATE_SHIPMENT",
        id,
        `訂單取消，已釋放 ${result.count} 件包裹`
      );
      return res.status(200).json({
        success: true,
        shipment: result.shipment,
        message: `訂單已取消，並成功釋放 ${result.count} 件包裹回倉庫`,
      });
    }

    if (
      status === "PROCESSING" &&
      !originalShipment.invoiceNumber &&
      originalShipment.totalCost > 0
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
    const result = await prisma.$transaction(async (tx) => {
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
    await createLog(
      req.user.id,
      "REJECT_SHIPMENT",
      id,
      `釋放${result.count}件包裹`
    );
    res.status(200).json({ success: true, message: "已退回並釋放包裹" });
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

module.exports = {
  getAllShipments,
  exportShipments,
  bulkUpdateShipmentStatus,
  bulkDeleteShipments,
  updateShipmentStatus,
  rejectShipment,
  adminDeleteShipment,
};
