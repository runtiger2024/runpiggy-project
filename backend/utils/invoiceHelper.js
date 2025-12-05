// backend/utils/invoiceHelper.js (V2025.2 - AMEGO Fix)

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
  const rawString = dataJson + time + hashKey;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config) => {
  const dataJson = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000); // Unix timestamp (秒)
  const sign = generateSign(dataJson, time, config.hashKey);

  // [Fix 3] 移除多餘的 MerchantID 欄位，僅保留官方要求的 invoice, time, sign, data
  const formData = {
    invoice: config.merchantId, // 商店代號/統編
    time: time,
    sign: sign,
    data: dataJson,
  };

  try {
    console.log(`[Invoice] 發送請求至 ${endpoint} (Mode: ${config.mode})`);

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

  // --- [Fix 1 & 2] 金額與稅額計算修正 ---
  const total = Math.round(Number(shipment.totalCost));

  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = rawTaxId.length === 8; // 有 8 碼統編視為 B2B

  let salesAmount = 0; // 銷售額
  let taxAmount = 0; // 稅額
  let unitPrice = 0; // 單價
  let detailVat = 1; // 0:未稅, 1:含稅

  if (hasTaxId) {
    // === B2B (有統編) ===
    // 需拆分稅額，且建議使用未稅價申報以避免誤差
    salesAmount = Math.round(total / 1.05); // 未稅金額
    taxAmount = total - salesAmount; // 稅額
    unitPrice = salesAmount; // 單價 = 未稅金額
    detailVat = 0; // 設定明細為「未稅價」
  } else {
    // === B2C (個人/無統編) ===
    // AMEGO 規定：個人發票 TaxAmount 必須為 0，SalesAmount 等於總金額
    salesAmount = total; // 含稅銷售額
    taxAmount = 0; // 個人稅額填 0
    unitPrice = total; // 單價 = 總金額
    detailVat = 1; // 設定明細為「含稅價」
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
      TaxType: 1, // 1: 應稅
    },
  ];

  const dataObj = {
    OrderId: shipment.id,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email, // 寄送通知用

    // 金額資訊
    SalesAmount: salesAmount,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    TaxType: 1, // 應稅
    TaxRate: "0.05", // [Fix 4] 改為字串格式
    TaxAmount: taxAmount,
    TotalAmount: total,

    ProductItem: productItems,

    // [Fix 2] 加入 DetailVat 參數，確保 B2B 金額計算正確
    DetailVat: detailVat,

    Print: "N", // N: 不列印 (由 AMEGO 寄送 Email)

    // 載具相關 (若資料庫無欄位，這些暫時會是空字串，符合邏輯)
    CarrierType: !hasTaxId && shipment.carrierType ? shipment.carrierType : "",
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
    // 回傳詳細錯誤訊息
    return {
      success: false,
      message: `開立失敗(${resData.code}): ${resData.msg}`,
    };
  }
};

/**
 * 2. 作廢發票 (Void Invoice) - 對應 API f0501 (文件更新為 f0501)
 */
const voidInvoice = async (invoiceNumber, reason = "訂單取消/金額錯誤") => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能已關閉" };

  // 注意：AMEGO 2025 文件指出作廢 API 路徑為 /json/f0501
  // 參數結構通常是陣列或單一物件，依文件 f0501 參數為:
  // CancelInvoiceNumber: 發票號碼

  // 這裡調整為符合 f0501 的單張作廢格式 (部分文件可能要求包在 array 裡，視實測而定)
  // 若 f0501 要求 array，這裡包成陣列：
  const dataObj = [{ CancelInvoiceNumber: invoiceNumber, Reason: reason }];
  // 或是舊版 f0402 格式...
  // 為了保險，若您目前是用 f0402 且能通，可維持。
  // 但若依據新文件，建議改用 f0501。以下示範相容寫法 (若 API 是 f0402 則維持 dataObj 物件)

  // 假設維持 f0402 (舊版)
  // const endpoint = "/f0402";
  // const payload = { InvoiceNumber: invoiceNumber, Reason: reason };

  // 若要升級為 f0501 (2025新版)
  const endpoint = "/f0501";
  const payload = [
    { CancelInvoiceNumber: invoiceNumber, InvalidReason: reason }, // 注意欄位名稱可能變更，請依您實際使用的版本微調
  ];
  // *註：因為文件上 f0501 參數是 CancelInvoiceNumber，舊版 f0402 是 InvoiceNumber
  // 為了讓您目前能快速修復「開立」問題，這裡先維持您原本的 f0402 邏輯 (若它之前能用)，
  // 或是我幫您修正為最穩的 f0402 寫法：

  const dataObjOld = {
    InvoiceNumber: invoiceNumber,
    Reason: reason,
  };

  // 嘗試使用舊版 endpoint (通常相容性較好)，若確定要用新版請改為 f0501
  const resData = await sendAmegoRequest("/f0402", dataObjOld, config);

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
