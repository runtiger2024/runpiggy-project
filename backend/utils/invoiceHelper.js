// backend/utils/invoiceHelper.js
// V2025.Fix - 修正 AMEGO API 串接規格 (修正 OrderId 重複、型別與載具問題)

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
  // 確保 time 與 hashKey 轉為字串連接 [Fix: 明確轉型]
  const rawString = dataString + String(time) + String(hashKey);
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
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config, merchantOrderNo) => {
  if (!config.merchantId || !config.hashKey) {
    throw new Error("發票設定不完整：缺少 Merchant ID 或 Hash Key");
  }

  // 1. 直接將資料物件轉為 JSON 字串
  const dataString = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);

  // 2. 計算簽章
  const sign = generateSign(dataString, time, config.hashKey);

  // 3. 組建 POST 表單資料
  const params = new URLSearchParams();
  params.append("MerchantID", config.merchantId);
  params.append("invoice", config.merchantId);
  params.append("data", dataString);
  params.append("time", time);
  params.append("sign", sign);

  try {
    console.log(
      `[Invoice] Request: ${merchantOrderNo} -> ${BASE_URL}${endpoint}`
    );

    const response = await axios.post(`${BASE_URL}${endpoint}`, params);

    // AMEGO 回傳格式有時是陣列，有時是物件
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

  // [修正1] OrderId 必須唯一，加入時間戳記防止重複錯誤
  // 這是解決 400 Bad Request (Duplicate Order) 的關鍵
  const unixTime = Math.floor(Date.now() / 1000);
  const merchantOrderNo = `${shipment.id}_${unixTime}`;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let printMark = "0";

  if (hasTaxId) {
    // B2B (有統編)
    printMark = "1";
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

  // [修正3] 載具邏輯防呆
  // 避免傳送錯誤格式導致整張發票失敗 (400 Bad Request)
  let carrierType = "";
  let carrierId1 = "";

  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    const cType = shipment.carrierType;
    const cId = shipment.carrierId;

    // 簡單驗證：手機條碼 (3J0002) 必須是 / 開頭
    if (cType === "3J0002" && !cId.startsWith("/")) {
      console.warn(
        `[Invoice] 訂單 ${shipment.id} 載具格式錯誤 (${cId})，已自動忽略載具設定`
      );
      // 忽略載具，改為開立一般個人發票，避免失敗
    } else {
      carrierType = cType;
      carrierId1 = cId;
    }
  }

  const dataObj = {
    OrderId: merchantOrderNo, // [修正] 使用唯一編號
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: shipment.phone || "",
    Print: printMark,
    Donation: "0",
    TaxType: "1", // 文件範例為字串
    TaxRate: "0.05", // [修正2] 強制轉為字串，避免 API 驗證失敗
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
    // 作廢不需要 Unique ID (因為是對發票號碼操作)，但為了 log 方便帶入
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

  if (!config.merchantId || !config.hashKey)
    return { success: false, message: "API 金鑰未設定" };

  const total = Math.round(transaction.amount);
  const taxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const hasTaxId = taxId.length === 8;

  // [修正] 儲值發票也要修正 OrderId 唯一性
  const unixTime = Math.floor(Date.now() / 1000);
  const merchantOrderNo = `DEP${transaction.id}_${unixTime}`;

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
    OrderId: merchantOrderNo, // [修正] 唯一編號
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: "",
    Print: printMark,
    Donation: "0",
    TaxType: "1",
    TaxRate: "0.05", // [修正] 字串
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
