// backend/utils/invoiceHelper.js (V2025.3 - AMEGO Final Fix)

const axios = require("axios");
const crypto = require("crypto");
const qs = require("qs");
const prisma = require("../config/db.js");
require("dotenv").config();

// AMEGO API 基礎路徑
const BASE_URL = "https://invoice-api.amego.tw/json";

/**
 * 取得發票設定 (優先讀取資料庫 SystemSetting)
 */
const getInvoiceConfig = async () => {
  let config = {
    enabled: false,
    mode: "TEST",
    merchantId: process.env.AMEGO_MERCHANT_ID, // ⚠️ 注意：這裡必須是「賣方統編 (8碼)」
    hashKey: process.env.AMEGO_HASH_KEY, // AMEGO 後台提供的 App Key
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

      if (typeof dbConfig.enabled === "boolean") {
        config.enabled = dbConfig.enabled;
      } else if (typeof dbConfig.isEnabled === "boolean") {
        config.enabled = dbConfig.isEnabled;
      }

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
const generateSign = (dataJson, time, hashKey) => {
  // AMEGO 規則: md5(dataJSON字串 + unixTime + HashKey)
  // 注意：dataJson 必須是尚未 URL Encode 的原始 JSON 字串
  const rawString = dataJson + time + hashKey;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config) => {
  // 1. 將資料物件轉為 JSON 字串
  const dataJson = JSON.stringify(dataObj);

  // 2. 取得時間戳記 (秒)
  const time = Math.floor(Date.now() / 1000);

  // 3. 計算簽章 (針對原始 JSON 字串簽名)
  const sign = generateSign(dataJson, time, config.hashKey);

  // 4. 組建 POST 表單資料
  // 注意：invoice 參數必須是「賣方統編」
  const formData = {
    invoice: config.merchantId,
    time: time,
    sign: sign,
    data: dataJson, // axios/qs 會自動進行 URL Encode
  };

  try {
    console.log(`[Invoice] 發送請求至 ${endpoint}`);
    // console.log(`[Debug] Data Payload:`, dataJson); // 除錯用，正式環境可註解

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
    // 若有回應內容，印出以供除錯
    if (error.response && error.response.data) {
      console.error(`[Invoice API Response]`, error.response.data);
    }
    throw new Error("發票系統連線失敗");
  }
};

/**
 * 1. 開立發票 (Issue Invoice) - 對應 API f0401 (2025新版)
 */
const createInvoice = async (shipment, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled)
    return { success: false, message: "系統設定：發票功能已關閉" };
  if (!config.merchantId || !config.hashKey)
    return { success: false, message: "API 金鑰未設定 (請檢查統編與HashKey)" };

  // --- 金額計算邏輯 ---
  const total = Math.round(Number(shipment.totalCost));
  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = rawTaxId.length === 8; // 有 8 碼統編視為 B2B

  let salesAmount = 0; // 銷售額 (未稅 or 含稅)
  let taxAmount = 0; // 稅額
  let unitPrice = 0; // 單價
  let detailVat = 1; // 1:含稅(B2C預設), 0:未稅(B2B專用)

  if (hasTaxId) {
    // === B2B (有統編) ===
    // 設定為「未稅價模式 (DetailVat=0)」
    // SalesAmount 填未稅總額
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = salesAmount;
    detailVat = 0;
  } else {
    // === B2C (個人/無統編) ===
    // 設定為「含稅價模式 (DetailVat=1)」
    // AMEGO 強制規定：B2C 發票 TaxAmount 必須為 0
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
      Quantity: 1, // 必填 Number
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1, // 1: 應稅
    },
  ];

  // 載具邏輯
  let carrierType = "";
  let carrierId1 = "";

  // 只有 B2C 且有設定載具時才傳送
  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    carrierType = shipment.carrierType;
    carrierId1 = shipment.carrierId;
  }

  const dataObj = {
    OrderId: shipment.id, // 必填
    BuyerIdentifier: buyerId, // 必填 (0000000000 or 統編)
    BuyerName: buyerName, // 必填
    BuyerEmailAddress: user.email || "", // 選填

    // 金額資訊
    SalesAmount: salesAmount, // 必填 Number
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    TaxType: 1, // 1: 應稅
    TaxRate: "0.05", // 必填 String (注意是字串)
    TaxAmount: taxAmount, // 必填 Number
    TotalAmount: total, // 必填 Number

    ProductItem: productItems, // 必填 Array

    DetailVat: detailVat, // 選填 Number (0:未稅, 1:含稅)

    // [FIX] 移除了錯誤的 "Print" 參數
    // 若不需要列印紙本，不傳送 PrinterType 即可

    // 載具參數 (若無載具則留空字串或不傳，這裡傳空字串較安全)
    CarrierType: carrierType,
    CarrierId1: carrierId1,
    // CarrierId2 通常用於特定載具，無特殊需求可省略
  };

  const resData = await sendAmegoRequest("/f0401", dataObj, config);

  if (resData.code === 0) {
    return {
      success: true,
      invoiceNumber: resData.invoice_number,
      invoiceDate: new Date(),
      randomCode: resData.random_number,
      message: "開立成功",
    };
  } else {
    return {
      success: false,
      message: `開立失敗(${resData.code}): ${resData.msg}`,
    };
  }
};

/**
 * 2. 作廢發票 (Void Invoice) - 對應 API f0501 (2025新版)
 */
const voidInvoice = async (invoiceNumber, reason = "訂單取消") => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能已關閉" };

  // [FIX] 2025 AMEGO 文件指定使用 /json/f0501
  // 且資料結構必須為「物件陣列」
  const dataObj = [
    {
      CancelInvoiceNumber: invoiceNumber, // 參數名稱改變：InvoiceNumber -> CancelInvoiceNumber
      // InvalidReason: reason // 若文件未強制要求原因，可省略，或依文件加入
    },
  ];

  const resData = await sendAmegoRequest("/f0501", dataObj, config);

  if (resData.code === 0) {
    return { success: true, message: "作廢成功" };
  } else {
    return {
      success: false,
      message: `作廢失敗(${resData.code}): ${resData.msg}`,
    };
  }
};

module.exports = { createInvoice, voidInvoice };
