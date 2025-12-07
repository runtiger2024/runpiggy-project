// backend/controllers/recipientController.js

const prisma = require("../config/db.js");

/**
 * @description 取得我的所有常用收件人
 * @route GET /api/recipients
 */
const getMyRecipients = async (req, res) => {
  try {
    const userId = req.user.id;
    const recipients = await prisma.recipient.findMany({
      where: { userId: userId },
      orderBy: [
        { isDefault: "desc" }, // 預設的排在最前面
        { createdAt: "desc" },
      ],
    });

    res.status(200).json({ success: true, recipients });
  } catch (error) {
    console.error("取得常用收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 新增常用收件人
 * @route POST /api/recipients
 */
const createRecipient = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, address, idNumber, isDefault } = req.body;

    if (!name || !phone || !address || !idNumber) {
      return res
        .status(400)
        .json({ success: false, message: "請填寫完整資訊" });
    }

    // 如果設為預設，需先將其他收件人取消預設
    if (isDefault) {
      await prisma.recipient.updateMany({
        where: { userId: userId },
        data: { isDefault: false },
      });
    }

    const newRecipient = await prisma.recipient.create({
      data: {
        userId,
        name,
        phone,
        address,
        idNumber,
        isDefault: isDefault || false,
      },
    });

    res.status(201).json({
      success: true,
      message: "新增成功",
      recipient: newRecipient,
    });
  } catch (error) {
    console.error("新增收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 修改常用收件人
 * @route PUT /api/recipients/:id
 */
const updateRecipient = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, phone, address, idNumber, isDefault } = req.body;

    const recipient = await prisma.recipient.findFirst({
      where: { id, userId },
    });

    if (!recipient) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此收件人" });
    }

    // 如果設為預設，需先將其他收件人取消預設
    if (isDefault) {
      await prisma.recipient.updateMany({
        where: { userId: userId, id: { not: id } }, // 排除自己
        data: { isDefault: false },
      });
    }

    const updatedRecipient = await prisma.recipient.update({
      where: { id },
      data: {
        name,
        phone,
        address,
        idNumber,
        isDefault,
      },
    });

    res.status(200).json({
      success: true,
      message: "更新成功",
      recipient: updatedRecipient,
    });
  } catch (error) {
    console.error("更新收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 刪除常用收件人
 * @route DELETE /api/recipients/:id
 */
const deleteRecipient = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const recipient = await prisma.recipient.findFirst({
      where: { id, userId },
    });

    if (!recipient) {
      return res
        .status(404)
        .json({ success: false, message: "找不到此收件人" });
    }

    await prisma.recipient.delete({ where: { id } });

    res.status(200).json({ success: true, message: "刪除成功" });
  } catch (error) {
    console.error("刪除收件人失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getMyRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
};
