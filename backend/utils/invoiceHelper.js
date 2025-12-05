// backend/utils/invoiceHelper.js (V10.1 修正版 - 修復 API 網址)

const axios = require("axios");
const crypto = require("crypto");
const qs = require("qs");
const prisma = require("../config/db.js");
require("dotenv").config();

// 發票 API 網址 (測試與正式)
const API_URLS = {
  TEST: "https://invoice-api.amego.tw/json/f0401",
  PROD: "https://invoice-api.amego.tw/json/f0401",
};

/**
 * 取得發票設定 (優先讀取資料庫)
 */
const getInvoiceConfig = async () => {
  // 預設值：使用環境變數，預設為關閉與測試模式
  let config = {
    enabled: false,
    mode: "TEST",
    merchantId: process.env.AMEGO_MERCHANT_ID,
    hashKey: process.env.AMEGO_HASH_KEY,
    apiUrl: null,
  };

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "invoice_config" },
    });

    if (setting && setting.value) {
      const dbConfig = JSON.parse(setting.value);
      // 資料庫設定覆蓋預設值
      if (typeof dbConfig.enabled === "boolean")
        config.enabled = dbConfig.enabled;
      if (dbConfig.mode) config.mode = dbConfig.mode;

      // 允許 DB 覆蓋金鑰
      if (dbConfig.merchantId) config.merchantId = dbConfig.merchantId;
      if (dbConfig.hashKey) config.hashKey = dbConfig.hashKey;

      // 若資料庫有設定 apiUrl，優先使用
      if (dbConfig.apiUrl) config.apiUrl = dbConfig.apiUrl;
    }
  } catch (error) {
    console.warn("[Invoice] 讀取 invoice_config 失敗，使用預設環境變數");
  }

  // 僅在 config.apiUrl 尚未設定時，才使用 API_URLS 備案
  if (!config.apiUrl) {
    if (config.mode === "PROD") {
      config.apiUrl = API_URLS.PROD;
    } else {
      config.apiUrl = API_URLS.TEST;
    }
  }

  return config;
};

const generateSign = (dataJson, time, hashKey) => {
  const rawString = dataJson + time + hashKey;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

const createInvoice = async (shipment, user) => {
  try {
    // 1. 讀取動態設定
    const config = await getInvoiceConfig();

    // 檢查總開關
    if (!config.enabled) {
      console.log("[Invoice] 系統設定為關閉，跳過發票開立");
      return { success: false, message: "系統設定：電子發票功能已關閉" };
    }

    if (!config.merchantId || !config.hashKey) {
      return {
        success: false,
        message: "API 金鑰未設定 (MerchantID 或 HashKey)",
      };
    }

    // --- 2. 準備數據 ---
    const total = Math.round(Number(shipment.totalCost));
    const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
    const hasTaxId = rawTaxId.length === 8;
    const buyerIdentifier = hasTaxId ? rawTaxId : "0000000000";

    // 營業稅計算 (5%)
    let taxAmount = 0;
    let salesAmount = total;

    if (hasTaxId) {
      // B2B: 銷售額 = 總額 / 1.05
      const exclusiveAmount = Math.round(total / 1.05);
      taxAmount = total - exclusiveAmount;
      salesAmount = exclusiveAmount;
    } else {
      // B2C: 銷售額 = 含稅總額, 稅額 = 0
      salesAmount = total;
      taxAmount = 0;
    }

    const productItems = [
      {
        Description: "理貨費",
        Quantity: 1,
        UnitPrice: total,
        Amount: total,
        TaxType: 1, // 1: 應稅
      },
    ];

    const dataObj = {
      OrderId: shipment.id,
      BuyerIdentifier: buyerIdentifier,
      BuyerName: shipment.invoiceTitle || shipment.recipientName || "個人",
      BuyerEmailAddress: user.email,
      SalesAmount: salesAmount,
      FreeTaxSalesAmount: 0,
      ZeroTaxSalesAmount: 0,
      TaxType: 1,
      TaxRate: 0.05,
      TaxAmount: taxAmount,
      TotalAmount: total,
      ProductItem: productItems,
      Print: "N",
      CarrierType: "", // 視需求調整
    };

    const dataJson = JSON.stringify(dataObj);
    const time = Math.floor(Date.now() / 1000);

    // 使用動態取得的 Hash Key 進行簽章
    const sign = generateSign(dataJson, time, config.hashKey);

    // --- 3. 發送請求 ---
    const formData = {
      MerchantID: config.merchantId,
      invoice: config.merchantId,
      time: time,
      sign: sign,
      data: dataJson,
    };

    console.log(`[Invoice] 請求 (${config.mode}): Order=${dataObj.OrderId}`);

    const response = await axios.post(config.apiUrl, qs.stringify(formData), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const resData = response.data;

    // --- 4. 處理結果 ---
    if (resData.code === 0) {
      return {
        success: true,
        invoiceNumber: resData.invoice_number,
        invoiceDate: new Date(),
        randomCode: resData.random_number,
        raw: resData,
      };
    } else {
      return {
        success: false,
        message: `API回應錯誤 (${resData.code}): ${resData.msg}`,
        raw: resData,
      };
    }
  } catch (error) {
    console.error("[Invoice Error]", error.message);
    return { success: false, message: error.message };
  }
};

module.exports = { createInvoice };
