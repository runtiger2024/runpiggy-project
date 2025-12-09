// backend/utils/sendEmail.js (V12 Debug版 - 強化錯誤訊息與檢查)

const sgMail = require("@sendgrid/mail");
const prisma = require("../config/db.js");
require("dotenv").config();

// 初始化 SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn(
    "⚠️ [Email Warning] SENDGRID_API_KEY 未設定，Email 功能將失效。"
  );
}

/**
 * 取得 Email 設定 (優先讀取資料庫，失敗則回退至環境變數)
 */
const getEmailConfig = async () => {
  // 預設值：來自環境變數
  let config = {
    senderName: "小跑豬物流", // 預設名稱
    senderEmail: process.env.SENDER_EMAIL_ADDRESS,
    recipients: [], // 管理員收件列表
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
  if (
    (!config.recipients || config.recipients.length === 0) &&
    process.env.ADMIN_EMAIL_RECIPIENT
  ) {
    config.recipients = process.env.ADMIN_EMAIL_RECIPIENT.split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  // Debug Log: 檢查最終配置
  // console.log("[Email Config Check]", {
  //   sender: config.senderEmail,
  //   recipientsCount: config.recipients.length,
  //   recipients: config.recipients
  // });

  return config;
};

// ==========================================
//  Part A: 通知管理員 (To Admin)
// ==========================================

/**
 * A-1. 發送「新集運單成立」的通知給管理員
 */
const sendNewShipmentNotification = async (shipment, customer) => {
  console.log(`[Email Debug] 準備發送新訂單通知 ID: ${shipment.id}`);
  try {
    const config = await getEmailConfig();

    // 詳細檢查並印出缺少的項目
    if (!process.env.SENDGRID_API_KEY) {
      console.error("❌ [Email Failed] 缺少 SENDGRID_API_KEY");
      return;
    }
    if (!config.senderEmail) {
      console.error(
        "❌ [Email Failed] 缺少寄件者 Email (SENDER_EMAIL_ADDRESS)"
      );
      return;
    }
    if (!config.recipients || config.recipients.length === 0) {
      console.error(
        "❌ [Email Failed] 缺少管理員收件列表 (ADMIN_EMAIL_RECIPIENT)"
      );
      return;
    }

    const subject = `[${config.senderName}] 新集運單成立 - ${
      shipment.recipientName
    } (NT$ ${shipment.totalCost.toLocaleString()})`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">新集運單成立通知！</h2>
        <p>客戶 <strong>${
          customer.name || customer.email
        }</strong> 剛剛建立了一筆新的集運單。</p>
        <hr style="border: 0; border-top: 1px solid #eee;">
        <h3>訂單摘要</h3>
        <ul style="padding-left: 20px;">
          <li><strong>訂單 ID:</strong> ${shipment.id}</li>
          <li><strong>總金額:</strong> NT$ ${shipment.totalCost.toLocaleString()}</li>
          <li><strong>收件人:</strong> ${shipment.recipientName}</li>
        </ul>
        <p><a href="${
          process.env.FRONTEND_URL
        }/admin-login.html">前往後台查看</a></p>
      </div>
    `;

    await sgMail.send({
      to: config.recipients,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(
      `✅ [Email Success] 已發送新訂單通知 (ID: ${
        shipment.id
      }) 至 ${config.recipients.join(", ")}`
    );
  } catch (error) {
    console.error(
      `❌ [Email Error] 發送新訂單通知失敗:`,
      error.response ? error.response.body : error.message
    );
  }
};

/**
 * A-2. 發送「客戶上傳轉帳憑證」的通知給管理員
 */
const sendPaymentProofNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (
      !process.env.SENDGRID_API_KEY ||
      !config.senderEmail ||
      config.recipients.length === 0
    )
      return;

    const subject = `[${
      config.senderName
    }] 客戶已上傳匯款憑證 - ${shipment.id.slice(-8)}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #2e7d32;">匯款憑證上傳通知</h2>
        <p>客戶 <strong>${
          customer.name || customer.email
        }</strong> 已為訂單 <strong>${shipment.id}</strong> 上傳了轉帳截圖。</p>
        <p>金額: <strong>NT$ ${shipment.totalCost.toLocaleString()}</strong></p>
        ${
          shipment.taxId
            ? `<p>統編: ${shipment.taxId} / 抬頭: ${shipment.invoiceTitle}</p>`
            : ""
        }
        <p>請盡快登入後台審核並開立發票。</p>
        <p><a href="${
          process.env.FRONTEND_URL
        }/admin-login.html">前往後台審核</a></p>
      </div>
    `;

    await sgMail.send({
      to: config.recipients,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(`[Email] 已發送憑證上傳通知 (訂單: ${shipment.id})`);
  } catch (error) {
    console.error(`[Email] 發送憑證通知失敗:`, error.message);
  }
};

/**
 * A-3. 發送「客戶申請錢包儲值」的通知給管理員
 */
const sendDepositRequestNotification = async (transaction, customer) => {
  try {
    const config = await getEmailConfig();
    if (
      !process.env.SENDGRID_API_KEY ||
      !config.senderEmail ||
      config.recipients.length === 0
    )
      return;

    const subject = `[${config.senderName}] 新的錢包儲值申請 - NT$ ${transaction.amount}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #f57c00;">錢包儲值申請</h2>
        <p>客戶 <strong>${
          customer.name || customer.email
        }</strong> 申請儲值。</p>
        <ul>
          <li><strong>申請金額:</strong> NT$ ${transaction.amount}</li>
          <li><strong>說明:</strong> ${transaction.description}</li>
          ${
            transaction.taxId
              ? `<li><strong>統編:</strong> ${transaction.taxId}</li>`
              : ""
          }
        </ul>
        <p>請確認款項無誤後，於後台通過審核。</p>
        <p><a href="${
          process.env.FRONTEND_URL
        }/admin-login.html">前往後台財務管理</a></p>
      </div>
    `;

    await sgMail.send({
      to: config.recipients,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(`[Email] 已發送儲值申請通知 (User: ${customer.email})`);
  } catch (error) {
    console.error(`[Email] 發送儲值通知失敗:`, error.message);
  }
};

// ==========================================
//  Part B: 通知客戶 (To Client)
// ==========================================

/**
 * B-1. 發送「包裹已入庫」通知給客戶
 */
const sendPackageArrivedNotification = async (pkg, customer) => {
  try {
    const config = await getEmailConfig();
    if (!process.env.SENDGRID_API_KEY || !config.senderEmail || !customer.email)
      return;

    const subject = `[${config.senderName}] 包裹已入庫通知 - 單號 ${pkg.trackingNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">包裹已到達倉庫！</h2>
        <p>親愛的 ${customer.name || "會員"} 您好：</p>
        <p>您的包裹 <strong>${pkg.trackingNumber}</strong> (${
      pkg.productName
    }) 已經到達我們的倉庫並完成測量。</p>
        <ul>
          <li><strong>重量:</strong> ${
            pkg.arrivedBoxesJson?.[0]?.weight || "-"
          } kg</li>
          <li><strong>狀態:</strong> 已入庫 (Arrived)</li>
        </ul>
        <p>您可以隨時登入系統申請打包集運。</p>
        <br>
        <a href="${
          process.env.FRONTEND_URL || "#"
        }" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">前往我的包裹</a>
      </div>
    `;

    await sgMail.send({
      to: customer.email,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(`[Email] 已發送包裹入庫通知給 ${customer.email}`);
  } catch (error) {
    console.error(`[Email] 發送包裹入庫通知失敗:`, error.message);
  }
};

/**
 * B-2. 發送「訂單已出貨」通知給客戶
 */
const sendShipmentShippedNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (!process.env.SENDGRID_API_KEY || !config.senderEmail || !customer.email)
      return;

    const subject = `[${
      config.senderName
    }] 訂單已出貨通知 - ${shipment.id.slice(-8)}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">您的訂單已出貨！</h2>
        <p>親愛的 ${customer.name || "會員"} 您好：</p>
        <p>通知您，您的集運訂單 <strong>${
          shipment.id
        }</strong> 已經安排裝櫃出貨。</p>
        <ul>
          <li><strong>收件人:</strong> ${shipment.recipientName}</li>
          <li><strong>台灣派送單號:</strong> ${
            shipment.trackingNumberTW || "尚未更新"
          }</li>
          <li><strong>目前狀態:</strong> 已裝櫃出貨 (Shipped)</li>
        </ul>
        <p>預計將在近期抵達台灣並進行清關，請留意後續通知。</p>
        <br>
        <a href="${
          process.env.FRONTEND_URL || "#"
        }" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">查看訂單詳情</a>
      </div>
    `;

    await sgMail.send({
      to: customer.email,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(`[Email] 已發送訂單出貨通知給 ${customer.email}`);
  } catch (error) {
    console.error(`[Email] 發送訂單出貨通知失敗:`, error.message);
  }
};

// B-3. 發送「訂單建立確認」通知給客戶
const sendShipmentCreatedNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (!process.env.SENDGRID_API_KEY || !config.senderEmail || !customer.email)
      return;

    const subject = `[${config.senderName}] 訂單建立確認 - ${shipment.id.slice(
      -8
    )}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">您的訂單已成功建立！</h2>
        <p>親愛的 ${customer.name || "會員"} 您好：</p>
        <p>您的集運訂單 <strong>${shipment.id}</strong> 已經建立。</p>
        <ul>
          <li><strong>總金額:</strong> NT$ ${shipment.totalCost.toLocaleString()}</li>
          <li><strong>收件人:</strong> ${shipment.recipientName}</li>
          <li><strong>狀態:</strong> ${
            shipment.status === "PROCESSING" ? "處理中" : "待付款"
          }</li>
        </ul>
        <p>若尚未付款，請盡速完成轉帳並上傳憑證，以便我們為您安排出貨。</p>
        <br>
        <a href="${
          process.env.FRONTEND_URL || "#"
        }" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">查看訂單詳情</a>
      </div>
    `;

    await sgMail.send({
      to: customer.email,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(`[Email] 已發送訂單建立通知給 ${customer.email}`);
  } catch (error) {
    console.error(`[Email] 發送訂單建立通知失敗:`, error.message);
  }
};

module.exports = {
  sendNewShipmentNotification,
  sendPaymentProofNotification,
  sendDepositRequestNotification,
  sendPackageArrivedNotification,
  sendShipmentShippedNotification,
  sendShipmentCreatedNotification,
};
