// backend/utils/createLog.js
// 專門用來異步寫入操作日誌

const prisma = require("../config/db.js");

/**
 * 建立一筆操作日誌
 * @param {string} userId - 執行動作的員工 ID
 * @param {string} action - 動作的代號 (例如 "UPDATE_PACKAGE")
 * @param {string} targetId - 被操作的物件 ID
 * @param {string} details - (選填) 額外的詳細資訊
 */
const createLog = async (userId, action, targetId = "", details = "") => {
  try {
    // 為了方便查詢，我們也把 userEmail 存一份
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      console.warn(`[Log] 找不到 UserID ${userId}，無法記錄日誌`);
      return;
    }

    await prisma.activityLog.create({
      data: {
        userId: userId,
        userEmail: user.email, // 儲存 Email 副本
        action: action,
        targetId: targetId,
        details: details,
      },
    });
  } catch (error) {
    // 日誌寫入失敗不應該中斷主流程，所以在後台印出錯誤即可
    console.error("!!! 寫入日誌失敗 !!!:", error);
  }
};

module.exports = createLog;
