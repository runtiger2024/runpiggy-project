// backend/utils/invoiceHelper.js (V2025.2 - AMEGO 修正版)

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
    merchantId: process.env.AMEGO_MERCHANT_ID,
    hashKey: process.env.AMEGO_HASH_KEY,
  };

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "invoice_config" },
    });

    if (setting && setting.value) {
      // 處理可能的 JSON 格式差異
      const dbConfig =
        typeof setting.value === "string"
          ? JSON.parse(setting.value)
          : setting.value;

      // [FIX] 相容性檢查：同時檢查 enabled 與 isEnabled
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
  const rawString = dataJson + time + hashKey;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config) => {
  const dataJson = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);
  const sign = generateSign(dataJson, time, config.hashKey);

  const formData = {
    MerchantID: config.merchantId,
    invoice: config.merchantId,
    time: time,
    sign: sign,
    data: dataJson,
  };

  try {
    console.log(`[Invoice] 發送請求至 ${endpoint} (Mode: ${config.mode})`);
    // Debug: 印出傳送的資料結構，方便除錯
    // console.log("Request Payload:", JSON.stringify(dataObj, null, 2));

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
    throw new Error("發票系統連線失敗");
  }
};

/**
 * 1. 開立發票 (Issue Invoice) - 對應 API f0401
 */
const createInvoice = async (shipment, user) => {
  const config = await getInvoiceConfig();
  if (!config.enabled)
    return { success: false, message: "系統設定：發票功能已關閉" };
  if (!config.merchantId || !config.hashKey)
    return { success: false, message: "API 金鑰未設定" };

  // --- 金額與稅額計算 [FIX: 修正金額計算邏輯] ---
  // 無論 B2B 或 B2C，若 TaxType=1 (應稅)，API 通常要求正確拆分銷售額與稅額
  // 公式：SalesAmount + TaxAmount = TotalAmount
  const total = Math.round(Number(shipment.totalCost));

  // 反推未稅金額 (四捨五入)
  const salesAmount = Math.round(total / 1.05);
  // 計算稅額 (總額 - 未稅)
  const taxAmount = total - salesAmount;

  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = rawTaxId.length === 8; // 有 8 碼統編視為 B2B

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
      // [FIX] 明細金額應使用「未稅金額 (SalesAmount)」，確保總和正確
      UnitPrice: salesAmount,
      Amount: salesAmount,
      TaxType: 1, // 1: 應稅
    },
  ];

  const dataObj = {
    OrderId: shipment.id,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email, // 寄送通知用

    // 金額資訊
    SalesAmount: salesAmount, // 未稅銷售額
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    TaxType: 1, // 應稅
    TaxRate: 0.05, // 5%
    TaxAmount: taxAmount, // 稅額
    TotalAmount: total, // 含稅總額

    ProductItem: productItems,
    Print: "N", // N: 不列印 (由 AMEGO 寄送 Email 或會員自行查詢)
    CarrierType: !hasTaxId && shipment.carrierType ? shipment.carrierType : "", // 手機條碼等載具
    CarrierId1: !hasTaxId && shipment.carrierId ? shipment.carrierId : "",
    CarrierId2: "",
  };

  const resData = await sendAmegoRequest("/f0401", dataObj, config);

  // AMEGO 回傳 code 0 代表成功
  if (resData.code === 0) {
    return {
      success: true,
      invoiceNumber: resData.invoice_number,
      invoiceDate: new Date(),
      randomCode: resData.random_number,
      message: "開立成功",
    };
  } else {
    // 回傳詳細錯誤訊息以便除錯
    return {
      success: false,
      message: `開立失敗(${resData.code}): ${resData.msg}`,
    };
  }
};

/**
 * 2. 作廢發票 (Void Invoice) - 對應 API f0402
 */
const voidInvoice = async (invoiceNumber, reason = "訂單取消/金額錯誤") => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能已關閉" };

  const dataObj = {
    InvoiceNumber: invoiceNumber,
    Reason: reason,
  };

  const resData = await sendAmegoRequest("/f0402", dataObj, config);

  if (resData.code === 0) {
    return { success: true, message: "作廢成功" };
  } else {
    // 錯誤碼 101 通常代表已作廢或號碼不存在
    return {
      success: false,
      message: `作廢失敗(${resData.code}): ${resData.msg}`,
    };
  }
};

module.exports = { createInvoice, voidInvoice };
