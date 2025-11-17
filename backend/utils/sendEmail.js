// 這是 backend/utils/sendEmail.js (修正版)

const sgMail = require("@sendgrid/mail");
require("dotenv").config(); // 確保 .env 檔案被讀取

// 檢查是否有設定 API Key
if (!process.env.SENDGRID_API_KEY) {
  console.warn(
    "****************************************************************"
  );
  console.warn(
    "* SENDGRID_API_KEY 未設定在 .env 檔案中，Email 通知功能將被停用。 *"
  );
  console.warn(
    "****************************************************************"
  );
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log("SendGrid Mail 服務已成功初始化。");
}

const SENDER_EMAIL = process.env.SENDER_EMAIL_ADDRESS;

// [!!! 關鍵修正 !!!]
// 讀取環境變數字串，並立即將其處理成一個 Email 陣列
let RECIPIENT_EMAILS = [];
if (process.env.ADMIN_EMAIL_RECIPIENT) {
  RECIPIENT_EMAILS = process.env.ADMIN_EMAIL_RECIPIENT.split(",") // 1. 透過逗號(,)切割字串
    .map((email) => email.trim()) // 2. 移除每個 email 地址前後可能有的空白
    .filter((email) => email.length > 0); // 3. 移除空字串 (以防萬一)
}
// [!!! 修正結束 !!!]

/**
 * [新功能] 發送「新集運單成立」的通知給管理員
 * @param {object} shipment - 剛剛在 Prisma 中建立的集運單物件
 * @param {object} customer - 執行此操作的客戶 (req.user)
 */
const sendNewShipmentNotification = async (shipment, customer) => {
  // [!!! 關鍵修正 !!!]
  // 檢查 SENDER_EMAIL 是否存在，以及 RECIPIENT_EMAILS 陣列是否為空
  if (
    !process.env.SENDGRID_API_KEY ||
    !SENDER_EMAIL ||
    RECIPIENT_EMAILS.length === 0
  ) {
    console.warn(
      "SendGrid 環境變數不完整 (API Key, 寄件人, 或收件人為空)，已跳過 Email 發送程序。"
    );
    return; // 不執行
  }

  const subject = `[小跑豬] 新集運單成立 - ${
    shipment.recipientName
  } (NT$ ${shipment.totalCost.toLocaleString()})`;

  // 組合 Email 內容
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color: #1a73e8;">小跑豬 - 新集運單成立通知！</h2>
      <p>客戶 <strong>${
        customer.name || customer.email
      }</strong> 剛剛建立了一筆新的集運單。</p>
      <p>請盡快登入管理後台確認訂單與後續款項。</p>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <h3>訂單摘要</h3>
      <ul style="padding-left: 20px;">
        <li><strong>訂單 ID:</strong> ${shipment.id}</li>
        <li><strong>客戶 Email:</strong> ${customer.email}</li>
        <li><strong>收件人:</strong> ${shipment.recipientName}</li>
        <li><strong>電話:</strong> ${shipment.phone}</li>
        <li><strong>身分證:</strong> ${shipment.idNumber}</li>
        <li><strong>總金額:</strong> <strong style="color: #d32f2f; font-size: 1.2em;">NT$ ${shipment.totalCost.toLocaleString()}</strong></li>
        <li><strong>配送地區費率:</strong> $${
          shipment.deliveryLocationRate
        }/方</li>
        <li><strong>地址:</strong> ${shipment.shippingAddress}</li>
        <li><strong>客戶備註:</strong> ${shipment.note || "(無)"}</li>
      </ul>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <p style="font-size: 0.9em; color: #888;">
        這是一封自動通知郵件，請勿直接回覆。
      </p>
    </div>
  `;

  // 建立 SendGrid 訊息物件
  const msg = {
    to: RECIPIENT_EMAILS, // [!!! 關鍵修正 !!!] 這裡現在傳入的是 Email 陣列
    from: SENDER_EMAIL, // 您在 SendGrid 驗證過的寄件人
    subject: subject,
    html: html,
  };

  try {
    await sgMail.send(msg);
    console.log(
      `[Email] 已成功發送新訂單 ${shipment.id} 的通知至 ${RECIPIENT_EMAILS.join(
        ", "
      )}`
    );
  } catch (error) {
    console.error(`[Email] 發送 SendGrid 郵件時發生嚴重錯誤:`, error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
};

module.exports = {
  sendNewShipmentNotification,
};
