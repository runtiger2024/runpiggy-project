// backend/utils/invoiceHelper.js
// V2025.Fix - 參照 buy1688 成功模式修正 (移除 AES 加密，修正參數名稱)

const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../config/db.js");
require("dotenv").config();

// AMEGO API 基礎路徑
const BASE_URL =
  process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json";

// 從環境變數讀取
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
const generateSign = (dataString, time, hashKey) => {
  // AMEGO 規則: md5(dataJSON字串 + unixTime + HashKey)
  const rawString = dataString + time + hashKey;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 字串清理 (避免特殊符號導致 API 錯誤)
 */
const sanitizeString = (str) => {
  if (!str) return "";
  return str.replace(/[|'\"%<>\\]/g, "").trim();
};

/**
 * 通用 API 請求發送器 (修正版)
 */
const sendAmegoRequest = async (endpoint, dataObj, config) => {
  if (!config.merchantId || !config.hashKey) {
    throw new Error("發票設定不完整：缺少 Merchant ID 或 Hash Key");
  }

  // [修正 1] 不進行 AES 加密，直接轉 JSON 字串
  const dataString = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);

  // [修正 2] 計算簽章使用原始 JSON 字串
  const sign = generateSign(dataString, time, config.hashKey);

  // [修正 3] 參數名稱需完全對應 buy1688 成功模式
  // 使用 URLSearchParams 確保格式正確 (application/x-www-form-urlencoded)
  const params = new URLSearchParams();
  params.append("MerchantID", config.merchantId); // 注意大小寫
  params.append("invoice", config.merchantId); // buy1688 有多傳這個參數
  params.append("data", dataString); // 傳送明文 JSON
  params.append("time", time);
  params.append("sign", sign);

  try {
    console.log(`[Invoice] 發送請求至 ${BASE_URL}${endpoint}`);
    // console.log(`[Invoice Payload]`, dataString); // Debug 用

    const response = await axios.post(`${BASE_URL}${endpoint}`, params);

    // AMEGO 有時回傳陣列，有時回傳物件，統一處理
    const result = response.data;
    const respData = Array.isArray(result) ? result[0] : result;

    return respData;
  } catch (error) {
    console.error(`[Invoice API Error] ${error.message}`);
    if (error.response && error.response.data) {
      console.error(`[Invoice API Response]`, error.response.data);
    }
    throw new Error("發票系統連線失敗: " + error.message);
  }
};

/**
 * 1. 開立發票 (集運單)
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

  const total = Math.round(Number(shipment.totalCost));
  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = rawTaxId.length === 8;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let printMark = "0"; // [修正 4] 新增 Print 欄位

  if (hasTaxId) {
    // B2B (有統編)
    printMark = "1"; // 強制列印
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = salesAmount;
  } else {
    // B2C
    printMark = "0";
    salesAmount = total;
    taxAmount = 0;
    unitPrice = total;
  }

  const buyerId = hasTaxId ? rawTaxId : "0000000000";
  let buyerName = hasTaxId
    ? shipment.invoiceTitle || shipment.recipientName
    : shipment.recipientName || "個人";
  buyerName = sanitizeString(buyerName);

  const productItems = [
    {
      Description: "國際運費",
      Quantity: 1,
      Unit: "式",
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1,
    },
  ];

  let carrierType = "";
  let carrierId1 = "";
  // 只有 B2C 且無統編時才處理載具
  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    carrierType = shipment.carrierType;
    carrierId1 = shipment.carrierId;
  }

  const dataObj = {
    OrderId: shipment.id,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: shipment.phone || "",
    Print: printMark, // 必填
    Donation: "0",
    TaxType: "1",
    TaxRate: 0.05,
    SalesAmount: salesAmount,
    TaxAmount: taxAmount,
    TotalAmount: total,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    ItemName: "國際運費", // 為了相容性補上
    ItemCount: "1",
    ItemUnit: "式",
    ItemPrice: unitPrice,
    ItemAmount: unitPrice,
    ProductItem: productItems,
    CarrierType: carrierType,
    CarrierId1: carrierId1,
    LoveCode: "",
  };

  try {
    const resData = await sendAmegoRequest("/f0401", dataObj, config);

    // 判斷成功: Status=SUCCESS 或 RtnCode=1 或 code=0
    if (
      (resData.Status && resData.Status === "SUCCESS") ||
      resData.RtnCode === "1" ||
      resData.code === 0 ||
      (resData.InvoiceNumber && resData.InvoiceNumber.length > 0)
    ) {
      return {
        success: true,
        invoiceNumber: resData.InvoiceNumber || resData.invoice_number,
        invoiceDate: new Date(),
        randomCode: resData.RandomCode || resData.random_number || "",
        message: "開立成功",
      };
    } else {
      return {
        success: false,
        message: `開立失敗: ${resData.Message || resData.msg || "未知錯誤"}`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 2. 作廢發票
 */
const voidInvoice = async (invoiceNumber, reason = "訂單取消") => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能已關閉" };

  const invoiceDateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // f0501 格式為陣列
  const dataObj = [
    {
      CancelInvoiceNumber: invoiceNumber,
      InvalidReason: sanitizeString(reason),
      InvoiceDate: invoiceDateStr, // 部分 API 需要日期
      BuyerIdentifier: "0000000000", // 預設
      SellerIdentifier: config.merchantId,
    },
  ];

  try {
    const resData = await sendAmegoRequest("/f0501", dataObj, config);

    if (
      resData.Status === "SUCCESS" ||
      resData.RtnCode === "1" ||
      resData.code === 0
    ) {
      return { success: true, message: "作廢成功" };
    } else {
      return {
        success: false,
        message: `作廢失敗: ${resData.Message || resData.msg}`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 3. 儲值發票
 */
const createDepositInvoice = async (transaction, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能未啟用" };

  if (!config.merchantId || !config.hashKey)
    return { success: false, message: "API 金鑰未設定" };

  const total = Math.round(transaction.amount);
  const taxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const hasTaxId = taxId.length === 8;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let printMark = "0";

  if (hasTaxId) {
    printMark = "1";
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = salesAmount;
  } else {
    printMark = "0";
    salesAmount = total;
    taxAmount = 0;
    unitPrice = total;
  }

  const buyerId = hasTaxId ? taxId : "0000000000";
  let buyerName = hasTaxId
    ? user.defaultInvoiceTitle || user.name
    : user.name || "會員儲值";
  buyerName = sanitizeString(buyerName);

  const productItems = [
    {
      Description: "運費儲值金",
      Quantity: 1,
      Unit: "式",
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1,
    },
  ];

  const dataObj = {
    OrderId: transaction.id,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: "", // 儲值可能沒電話，留空
    Print: printMark,
    Donation: "0",
    TaxType: "1",
    TaxRate: 0.05,
    SalesAmount: salesAmount,
    TaxAmount: taxAmount,
    TotalAmount: total,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    ItemName: "運費儲值金",
    ItemCount: "1",
    ItemUnit: "式",
    ItemPrice: unitPrice,
    ItemAmount: unitPrice,
    ProductItem: productItems,
    CarrierType: "",
    CarrierId1: "",
    LoveCode: "",
  };

  try {
    const resData = await sendAmegoRequest("/f0401", dataObj, config);

    if (
      (resData.Status && resData.Status === "SUCCESS") ||
      resData.RtnCode === "1" ||
      resData.code === 0 ||
      (resData.InvoiceNumber && resData.InvoiceNumber.length > 0)
    ) {
      return {
        success: true,
        invoiceNumber: resData.InvoiceNumber || resData.invoice_number,
        invoiceDate: new Date(),
        randomCode: resData.RandomCode || resData.random_number || "",
        message: "儲值發票開立成功",
      };
    } else {
      return {
        success: false,
        message: `API錯誤: ${resData.Message || resData.msg || "未知"}`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

module.exports = { createInvoice, voidInvoice, createDepositInvoice };
