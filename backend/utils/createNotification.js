// backend/utils/createNotification.js

const prisma = require("../config/db.js");

/**
 * 建立站內通知
 * @param {string} userId - 接收通知的會員 ID
 * @param {string} title - 通知標題
 * @param {string} message - 通知內容
 * @param {string} type - 類型: SYSTEM, SHIPMENT, PACKAGE, WALLET
 * @param {string} link - (選填) 點擊跳轉連結或關聯 ID
 */
const createNotification = async (
  userId,
  title,
  message,
  type = "SYSTEM",
  link = null
) => {
  try {
    if (!userId) return;

    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
        isRead: false,
      },
    });
  } catch (error) {
    // 通知寫入失敗不應中斷主流程，僅紀錄錯誤
    console.error(
      `[Notification Error] Failed to create for user ${userId}:`,
      error.message
    );
  }
};

module.exports = createNotification;
