// backend/utils/invoiceHelper.js
// V2025.Fix3 - 最終修正: 電話格式清理、稅率型別對齊、強化錯誤顯示

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
  const rawString = dataString + String(time) + String(hashKey);
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 字串清理 (移除特殊符號)
 */
const sanitizeString = (str) => {
  if (!str) return "";
  return str.replace(/[|'\"%<>\\]/g, "").trim();
};

/**
 * 電話清理 (移除 - 與空白，只留數字)
 */
const sanitizePhone = (str) => {
  if (!str) return "";
  return str.replace(/[^0-9]/g, "");
};

/**
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config, merchantOrderNo) => {
  if (!config.merchantId || !config.hashKey) {
    console.error("[Invoice Error] 缺少 MerchantID 或 HashKey");
    throw new Error("發票設定不完整：缺少 Merchant ID 或 Hash Key");
  }

  const dataString = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);
  const sign = generateSign(dataString, time, config.hashKey);

  const params = new URLSearchParams();
  params.append("MerchantID", config.merchantId);
  params.append("invoice", config.merchantId);
  params.append("data", dataString);
  params.append("time", time);
  params.append("sign", sign);

  try {
    console.log(
      `[Invoice] 發送: ${merchantOrderNo} (len:${merchantOrderNo.length})`
    );

    const response = await axios.post(`${BASE_URL}${endpoint}`, params);
    const result = response.data;
    const respData = Array.isArray(result) ? result[0] : result;

    // [Debug] 如果失敗，印出詳細原因
    if (
      respData.Status !== "SUCCESS" &&
      respData.RtnCode !== "1" &&
      respData.code !== 0
    ) {
      console.error(`[Invoice API Fail] Response:`, JSON.stringify(respData));
    }

    return respData;
  } catch (error) {
    console.error(`[Invoice API Error] ${error.message}`);
    if (error.response && error.response.data) {
      console.error(
        `[Invoice API Response Body]`,
        JSON.stringify(error.response.data)
      );
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

  const total = Math.round(Number(shipment.totalCost));
  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = rawTaxId.length === 8;

  // OrderId: S + ID後15碼 + 時間
  const unixTime = Math.floor(Date.now() / 1000);
  const shortId = shipment.id.slice(-15);
  const merchantOrderNo = `S${shortId}_${unixTime}`;

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

  // 載具處理
  let carrierType = "";
  let carrierId1 = "";
  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    const cType = shipment.carrierType;
    const cId = shipment.carrierId;
    // 簡單驗證
    if (cType === "3J0002" && !cId.startsWith("/")) {
      console.warn(`[Invoice] 載具格式錯誤忽略: ${cId}`);
    } else {
      carrierType = cType;
      carrierId1 = cId;
    }
  }

  const dataObj = {
    OrderId: merchantOrderNo,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: sanitizePhone(shipment.phone || ""), // [修正] 清理電話格式
    Print: printMark,
    Donation: "0",
    TaxType: "1",
    TaxRate: 0.05, // [修正] 改回 Number (Buy1688 使用 Number)
    SalesAmount: salesAmount,
    TaxAmount: taxAmount,
    TotalAmount: total,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    ItemName: "國際運費",
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
    const resData = await sendAmegoRequest(
      "/f0401",
      dataObj,
      config,
      merchantOrderNo
    );

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
        message: `API錯誤: ${resData.Message || resData.msg || "未知原因"}`,
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

  const invoiceDateStr = new Date().toISOString().split("T")[0];

  const dataObj = [
    {
      CancelInvoiceNumber: invoiceNumber,
      InvalidReason: sanitizeString(reason),
      InvoiceDate: invoiceDateStr,
      BuyerIdentifier: "0000000000",
      SellerIdentifier: config.merchantId,
    },
  ];

  try {
    const resData = await sendAmegoRequest(
      "/f0501",
      dataObj,
      config,
      "VOID-" + invoiceNumber
    );

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
 * 3. 儲值發票 (修正版)
 */
const createDepositInvoice = async (transaction, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能未啟用" };

  const total = Math.round(transaction.amount);
  const taxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const hasTaxId = taxId.length === 8;

  // OrderId: DEP + ID後15碼 + 時間
  const unixTime = Math.floor(Date.now() / 1000);
  const shortId = transaction.id.slice(-15);
  const merchantOrderNo = `DEP${shortId}_${unixTime}`;

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
    OrderId: merchantOrderNo,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: sanitizePhone(user.phone || ""), // [修正] 清理電話格式
    Print: printMark,
    Donation: "0",
    TaxType: "1",
    TaxRate: 0.05, // [修正] 改回 Number
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
    const resData = await sendAmegoRequest(
      "/f0401",
      dataObj,
      config,
      merchantOrderNo
    );
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
