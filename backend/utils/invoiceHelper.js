// backend/utils/invoiceHelper.js
// V2025.Final - 深度修復：對齊 Buy1688 規格 (型別、欄位、金鑰清理)

const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../config/db.js");
require("dotenv").config();

// AMEGO API 基礎路徑
const BASE_URL =
  process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json";

// 從環境變數讀取 (預設)
const ENV_MERCHANT_ID = process.env.AMEGO_MERCHANT_ID;
const ENV_HASH_KEY = process.env.AMEGO_HASH_KEY;

/**
 * 取得發票設定 (優先讀取資料庫 SystemSetting，並強制去除空白)
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
    console.error(
      "[Invoice Error] 缺少 MerchantID 或 HashKey，請檢查 Render 環境變數或後台設定"
    );
    throw new Error("發票設定不完整：缺少 Merchant ID 或 Hash Key");
  }

  // 1. 轉 JSON 字串 (注意: 物件屬性順序不影響，但值必須精確)
  const dataString = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);

  // 2. 產生簽章
  const sign = generateSign(dataString, time, config.hashKey);

  // 3. 組建 Form Data
  const params = new URLSearchParams();
  params.append("MerchantID", config.merchantId);
  params.append("invoice", config.merchantId);
  params.append("data", dataString);
  params.append("time", time);
  params.append("sign", sign);

  try {
    // 遮蔽金鑰後 Log
    const maskedKey = config.hashKey.substring(0, 4) + "****";
    console.log(
      `[Invoice] 發送: ${merchantOrderNo} -> ${BASE_URL}${endpoint} (ID:${config.merchantId}, Key:${maskedKey})`
    );

    const response = await axios.post(`${BASE_URL}${endpoint}`, params);
    const result = response.data;

    // Amego 有時回傳 Array，有時回傳 Object
    const respData = Array.isArray(result) ? result[0] : result;

    // [Debug] 若回傳非 JSON 物件 (如純字串 "error")，手動包裝以便除錯
    if (typeof respData === "string") {
      console.error(`[Invoice API Fatal] Raw Response: ${respData}`);
      return { Status: "ERROR", Message: `API 回傳原始錯誤: ${respData}` };
    }

    return respData;
  } catch (error) {
    console.error(`[Invoice Network Error] ${error.message}`);
    if (error.response && error.response.data) {
      console.error(
        `[Invoice Response Body]`,
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

  // OrderId: S + ID後15碼 + 時間 (避免長度超過40)
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
      Quantity: 1, // [Fix] Number
      Unit: "式",
      UnitPrice: unitPrice, // [Fix] Number
      Amount: unitPrice, // [Fix] Number
      TaxType: 1, // [Fix] Number (Buy1688 uses Number)
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
    TaxType: 1, // [Fix] Number
    TaxRate: 0.05, // [Fix] Number
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
    CustomerIdentifier: "", // [Fix] 補上此欄位以對齊 Buy1688
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
        message: `API錯誤: ${
          resData.Message || resData.msg || JSON.stringify(resData)
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
  const taxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const hasTaxId = taxId.length === 8;

  // OrderId: DEP + ID後15碼 + 時間 (確保唯一且 < 40字)
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
      Quantity: 1, // [Fix] Number
      Unit: "式",
      UnitPrice: unitPrice, // [Fix] Number
      Amount: unitPrice, // [Fix] Number
      TaxType: 1, // [Fix] Number
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
    TaxType: 1, // [Fix] Number
    TaxRate: 0.05, // [Fix] Number
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
    CustomerIdentifier: "", // [Fix] 補上
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
        message: `API錯誤: ${
          resData.Message || resData.msg || JSON.stringify(resData)
        }`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

module.exports = { createInvoice, voidInvoice, createDepositInvoice };
