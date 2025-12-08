// backend/utils/invoiceHelper.js
// V2025.Final.Fix - 自動修正環境變數 URL 錯誤，解決 400 Bad Request & B2B 統編計算修正

const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../config/db.js");
require("dotenv").config();

// [核心修正] 強制清洗 BASE_URL
// 無論環境變數填寫 https://invoice-api.amego.tw/json 還是 .../json/f0401
// 這裡都會強制修正為 https://invoice-api.amego.tw/json (不含尾部斜線)
const RAW_BASE_URL =
  process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json";
const BASE_URL = RAW_BASE_URL.replace(/\/f0401\/?$/, "").replace(/\/$/, "");

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
    merchantId: ENV_MERCHANT_ID ? String(ENV_MERCHANT_ID).trim() : "",
    hashKey: ENV_HASH_KEY ? String(ENV_HASH_KEY).trim() : "",
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

      if (dbConfig.merchantId)
        config.merchantId = String(dbConfig.merchantId).trim();
      if (dbConfig.hashKey) config.hashKey = String(dbConfig.hashKey).trim();
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
 * 字串清理
 */
const sanitizeString = (str) => {
  if (!str) return "";
  return str.replace(/[|'\"%<>\\]/g, "").trim();
};

/**
 * 電話清理
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

  // [修正] 確保 URL 組合正確
  const fullUrl = `${BASE_URL}${endpoint}`;

  try {
    console.log(`[Invoice] 發送: ${merchantOrderNo} -> ${fullUrl}`);

    const response = await axios.post(fullUrl, params);
    const result = response.data;
    const respData = Array.isArray(result) ? result[0] : result;

    // [防呆] 若 API 回傳純字串 "error" 或其他非物件格式
    if (typeof respData !== "object") {
      console.error(`[Invoice API Fatal] Raw Response: ${respData}`);
      throw new Error(`API 回傳異常格式: ${respData} (請檢查網址或參數)`);
    }

    return respData;
  } catch (error) {
    console.error(`[Invoice API Error] ${error.message}`);
    if (error.response && error.response.data) {
      console.error(
        `[Invoice API Response]`,
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

  // [B2B 統編處理修正]
  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  // 嚴格檢查：必須是8位數字
  const hasTaxId = /^[0-9]{8}$/.test(rawTaxId);

  // OrderId: S + ID後15碼 + 時間 (避免長度超過限制)
  const unixTime = Math.floor(Date.now() / 1000);
  const shortId = shipment.id.slice(-15);
  const merchantOrderNo = `S${shortId}_${unixTime}`;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let printMark = "0";

  if (hasTaxId) {
    // B2B (公司戶)
    printMark = "1"; // 強制列印
    // 公式：銷售額 = 總金額 / 1.05 (四捨五入)
    salesAmount = Math.round(total / 1.05);
    // 公式：稅額 = 總金額 - 銷售額 (確保相加等於總額)
    taxAmount = total - salesAmount;
    unitPrice = salesAmount; // B2B 單價為未稅價
  } else {
    // B2C (個人戶)
    printMark = "0";
    salesAmount = total;
    taxAmount = 0; // 零稅率或內含 (Amego 建議 B2C 稅額帶 0)
    unitPrice = total; // B2C 單價為含稅價
  }

  const buyerId = hasTaxId ? rawTaxId : "0000000000";

  // [修正] 若有統編但沒有抬頭，嘗試使用收件人姓名，或給予預設值
  let buyerName = "";
  if (hasTaxId) {
    buyerName = shipment.invoiceTitle || shipment.recipientName || "貴公司";
  } else {
    buyerName = shipment.recipientName || "個人";
  }
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

  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    const cType = shipment.carrierType;
    const cId = shipment.carrierId;
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
    BuyerPhone: sanitizePhone(shipment.phone || ""),
    Print: printMark,
    Donation: "0",
    TaxType: 1,
    TaxRate: 0.05,
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
    CustomerIdentifier: "",
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
        message: `開立失敗: ${
          resData.Message || resData.msg || "API 回傳錯誤"
        }`,
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
 * 3. 儲值發票
 */
const createDepositInvoice = async (transaction, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能未啟用" };

  const total = Math.round(transaction.amount);

  // [B2B 儲值發票修正]
  const rawTaxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const hasTaxId = /^[0-9]{8}$/.test(rawTaxId);

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

  const buyerId = hasTaxId ? rawTaxId : "0000000000";
  let buyerName = "";
  if (hasTaxId) {
    buyerName = user.defaultInvoiceTitle || user.name || "貴公司";
  } else {
    buyerName = user.name || "會員儲值";
  }
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
    BuyerPhone: sanitizePhone(user.phone || ""),
    Print: printMark,
    Donation: "0",
    TaxType: 1,
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
    CustomerIdentifier: "",
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
        message: `開立失敗: ${
          resData.Message || resData.msg || "API 回傳錯誤"
        }`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

module.exports = { createInvoice, voidInvoice, createDepositInvoice };
