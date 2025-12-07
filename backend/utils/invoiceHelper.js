// backend/utils/invoiceHelper.js
// V2025.Security - 修正金鑰硬編碼漏洞 (最終版) + 支援儲值發票

const axios = require("axios");
const crypto = require("crypto");
const qs = require("qs");
const prisma = require("../config/db.js");
require("dotenv").config();

// AMEGO API 基礎路徑
const BASE_URL =
  process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json";

// 從環境變數讀取 (若無設定則為 undefined，絕不使用硬編碼字串)
const ENV_MERCHANT_ID = process.env.AMEGO_MERCHANT_ID;
const ENV_HASH_KEY = process.env.AMEGO_HASH_KEY;

/**
 * 取得發票設定 (優先讀取資料庫 SystemSetting)
 */
const getInvoiceConfig = async () => {
  let config = {
    enabled: false,
    mode: "TEST",
    merchantId: ENV_MERCHANT_ID,
    hashKey: ENV_HASH_KEY,
  };

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "invoice_config" },
    });

    if (setting && setting.value) {
      const dbConfig =
        typeof setting.value === "string"
          ? JSON.parse(setting.value)
          : setting.value;

      if (typeof dbConfig.enabled === "boolean")
        config.enabled = dbConfig.enabled;
      if (dbConfig.mode) config.mode = dbConfig.mode;

      // 若 DB 有值則覆蓋環境變數
      if (dbConfig.merchantId) config.merchantId = dbConfig.merchantId;
      if (dbConfig.hashKey) config.hashKey = dbConfig.hashKey;
    }
  } catch (error) {
    console.warn("[Invoice] 讀取設定失敗，使用預設環境變數", error.message);
  }
  return config;
};

/**
 * 簽章產生器 (MD5: data + time + hashKey)
 */
const generateSign = (dataJson, time, hashKey) => {
  // AMEGO 規則: md5(dataJSON字串 + unixTime + HashKey)
  const rawString = dataJson + time + hashKey;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * AES 加密 (使用 AES-128-CBC)
 */
const encrypt = (data, key, iv) => {
  if (!key) throw new Error("缺少 HashKey，無法進行加密");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
};

/**
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config) => {
  // [Security] 安全檢查：絕對禁止在程式碼中硬編碼金鑰
  if (!config.merchantId || !config.hashKey) {
    throw new Error("發票設定不完整：缺少 Merchant ID 或 Hash Key");
  }

  // 1. 將資料物件轉為 JSON 字串
  const dataJson = JSON.stringify(dataObj);

  // 2. 取得時間戳記 (秒)
  const time = Math.floor(Date.now() / 1000);

  // 3. 準備加密資料
  // AMEGO 使用 HashKey 的前 16 碼作為 IV
  const iv = config.hashKey.substring(0, 16);

  // 4. 加密 Data
  const encryptedData = encrypt(dataJson, config.hashKey, iv);

  // 5. 計算簽章 (針對原始 JSON 字串簽名)
  const sign = generateSign(dataJson, time, config.hashKey);

  // 6. 組建 POST 表單資料
  // 注意：invoice 參數名稱需依照 AMEGO 文件，通常是 merchant 或 invoice
  const formData = {
    merchant: config.merchantId,
    time: time,
    sign: sign,
    data: encryptedData,
  };

  try {
    console.log(`[Invoice] 發送請求至 ${BASE_URL}${endpoint}`);

    const response = await axios.post(
      `${BASE_URL}${endpoint}`,
      qs.stringify(formData),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`[Invoice API Error] ${error.message}`);
    if (error.response && error.response.data) {
      console.error(`[Invoice API Response]`, error.response.data);
    }
    throw new Error("發票系統連線失敗");
  }
};

/**
 * 1. 開立發票 (Issue Invoice) - 用於集運單
 */
const createInvoice = async (shipment, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled)
    return { success: false, message: "系統設定：發票功能已關閉" };

  if (!config.merchantId || !config.hashKey)
    return {
      success: false,
      message: "API 金鑰未設定 (請檢查後台設定或環境變數)",
    };

  // --- 金額計算邏輯 ---
  const total = Math.round(Number(shipment.totalCost));
  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = rawTaxId.length === 8; // 有 8 碼統編視為 B2B

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let detailVat = 1; // 1:含稅(B2C預設), 0:未稅(B2B專用)

  if (hasTaxId) {
    // === B2B (有統編) ===
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = salesAmount;
    detailVat = 0;
  } else {
    // === B2C (個人/無統編) ===
    salesAmount = total;
    taxAmount = 0;
    unitPrice = total;
    detailVat = 1;
  }

  // 買受人資訊
  const buyerId = hasTaxId ? rawTaxId : "0000000000";
  const buyerName = hasTaxId
    ? shipment.invoiceTitle || shipment.recipientName
    : shipment.recipientName || "個人";

  // 商品明細
  const productItems = [
    {
      Description: "國際運費",
      Quantity: 1,
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1,
    },
  ];

  // 載具邏輯
  let carrierType = "";
  let carrierId1 = "";

  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    carrierType = shipment.carrierType;
    carrierId1 = shipment.carrierId;
  }

  const dataObj = {
    OrderId: shipment.id,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    SalesAmount: salesAmount,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    TaxType: 1,
    TaxRate: "0.05",
    TaxAmount: taxAmount,
    TotalAmount: total,
    ProductItem: productItems,
    DetailVat: detailVat,
    CarrierType: carrierType,
    CarrierId1: carrierId1,
  };

  try {
    const resData = await sendAmegoRequest("/f0401", dataObj, config);

    if (resData.code === 0 || resData.TransCode === "0000") {
      return {
        success: true,
        invoiceNumber: resData.invoice_number || resData.InvoiceNumber,
        invoiceDate: new Date(),
        randomCode: resData.random_number || resData.RandomNumber,
        message: "開立成功",
      };
    } else {
      return {
        success: false,
        message: `開立失敗: ${resData.msg || resData.Message || "未知錯誤"}`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 2. 作廢發票 (Void Invoice)
 */
const voidInvoice = async (invoiceNumber, reason = "訂單取消") => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能已關閉" };

  // f0501 格式通常為陣列
  const dataObj = [
    {
      CancelInvoiceNumber: invoiceNumber,
      InvalidReason: reason,
    },
  ];

  try {
    const resData = await sendAmegoRequest("/f0501", dataObj, config);

    if (resData.code === 0 || resData.TransCode === "0000") {
      return { success: true, message: "作廢成功" };
    } else {
      return {
        success: false,
        message: `作廢失敗: ${resData.msg || resData.Message}`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 3. [NEW] 針對「儲值交易」開立發票
 * @param {Object} transaction - 交易物件 (需包含 id, amount)
 * @param {Object} user - 使用者物件 (需包含 email, defaultTaxId 等)
 */
const createDepositInvoice = async (transaction, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能未啟用" };

  if (!config.merchantId || !config.hashKey)
    return {
      success: false,
      message: "API 金鑰未設定",
    };

  // 1. 計算金額
  const total = Math.round(transaction.amount); // 儲值金額
  // 優先使用 User 設定的統編，若無則視為個人
  const taxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const hasTaxId = taxId.length === 8;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let detailVat = 1; // 1:含稅(預設), 0:未稅

  if (hasTaxId) {
    // B2B
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = salesAmount;
    detailVat = 0;
  } else {
    // B2C
    salesAmount = total;
    taxAmount = 0;
    unitPrice = total;
    detailVat = 1;
  }

  // 2. 買受人
  const buyerId = hasTaxId ? taxId : "0000000000";
  const buyerName = hasTaxId
    ? user.defaultInvoiceTitle || user.name
    : user.name || "會員儲值";

  // 3. 建立 Payload
  const dataObj = {
    OrderId: transaction.id, // 使用交易 ID 當作訂單編號
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    SalesAmount: salesAmount,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    TaxType: 1,
    TaxRate: "0.05",
    TaxAmount: taxAmount,
    TotalAmount: total,
    ProductItem: [
      {
        Description: "運費儲值金", // 品名
        Quantity: 1,
        UnitPrice: unitPrice,
        Amount: unitPrice,
        TaxType: 1,
      },
    ],
    DetailVat: detailVat,
    CarrierType: "", // 儲值通常預設無載具或發送 Email
    CarrierId1: "",
  };

  try {
    const resData = await sendAmegoRequest("/f0401", dataObj, config);
    if (resData.code === 0 || resData.TransCode === "0000") {
      return {
        success: true,
        invoiceNumber: resData.invoice_number || resData.InvoiceNumber,
        invoiceDate: new Date(),
        randomCode: resData.random_number || resData.RandomNumber,
        message: "儲值發票開立成功",
      };
    } else {
      return { success: false, message: `API錯誤: ${resData.msg || "未知"}` };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

module.exports = { createInvoice, voidInvoice, createDepositInvoice };
