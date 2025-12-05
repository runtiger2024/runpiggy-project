// backend/utils/sendEmail.js (V10 旗艦版 - 資料庫驅動設定)

const sgMail = require("@sendgrid/mail");
const prisma = require("../config/db.js");
require("dotenv").config();

// 初始化 SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn("* SENDGRID_API_KEY 未設定，Email 通知功能將無法使用。 *");
}

/**
 * 取得 Email 設定 (優先讀取資料庫，失敗則回退至環境變數)
 */
const getEmailConfig = async () => {
  // 預設值：來自環境變數
  let config = {
    senderName: "小跑豬物流", // 預設名稱
    senderEmail: process.env.SENDER_EMAIL_ADDRESS,
    recipients: [],
  };

  try {
    // 1. 嘗試讀取資料庫 SystemSetting
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "email_config" },
    });

    if (setting && setting.value) {
      const dbConfig = JSON.parse(setting.value);
      if (dbConfig.senderName) config.senderName = dbConfig.senderName;
      if (dbConfig.senderEmail) config.senderEmail = dbConfig.senderEmail;
      if (Array.isArray(dbConfig.recipients))
        config.recipients = dbConfig.recipients;
    }
  } catch (error) {
    console.warn("[Email] 讀取 email_config 失敗，將使用環境變數備案");
  }

  // 2. 若資料庫無名單，則回退使用環境變數
  if (config.recipients.length === 0 && process.env.ADMIN_EMAIL_RECIPIENT) {
    config.recipients = process.env.ADMIN_EMAIL_RECIPIENT.split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  return config;
};

/**
 * 發送「新集運單成立」的通知給管理員
 */
const sendNewShipmentNotification = async (shipment, customer) => {
  try {
    // 1. 獲取最新設定
    const config = await getEmailConfig();

    // 檢查必要條件
    if (
      !process.env.SENDGRID_API_KEY ||
      !config.senderEmail ||
      config.recipients.length === 0
    ) {
      console.warn(
        "[Email] 設定不完整 (缺 API Key、寄件人或收件人列表)，跳過發送。"
      );
      return;
    }

    const subject = `[${config.senderName}] 新集運單成立 - ${
      shipment.recipientName
    } (NT$ ${shipment.totalCost.toLocaleString()})`;

    // 組合 Email 內容
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">${
          config.senderName
        } - 新集運單成立通知！</h2>
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
          <li><strong>總金額:</strong> <strong style="color: #d32f2f; font-size: 1.2em;">NT$ ${shipment.totalCost.toLocaleString()}</strong></li>
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
      to: config.recipients, // 動態收件人列表
      from: {
        email: config.senderEmail,
        name: config.senderName,
      },
      subject: subject,
      html: html,
    };

    await sgMail.send(msg);
    console.log(
      `[Email] 已成功發送新訂單通知至 ${config.recipients.length} 位管理員`
    );
  } catch (error) {
    console.error(`[Email] 發送 SendGrid 郵件時發生錯誤:`, error);
  }
};

module.exports = {
  sendNewShipmentNotification,
};
