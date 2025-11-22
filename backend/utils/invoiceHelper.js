// backend/utils/invoiceHelper.js

const axios = require("axios");
const crypto = require("crypto");
const qs = require("qs"); // 處理 x-www-form-urlencoded 格式

// 1. 從環境變數讀取設定 (請確保 .env 已設定好)
const MERCHANT_ID = process.env.AMEGO_MERCHANT_ID;
const HASH_KEY = process.env.AMEGO_HASH_KEY;
// 如果 .env 沒設定 URL，預設使用正式環境；但在開發時請務必在 .env 設定測試網址
const API_URL =
  process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json/f0401";

/**
 * 產生 MD5 簽章 (光貿規定)
 * 規則: md5( data參數的JSON字串 + UnixTime + HashKey )
 */
const generateSign = (dataJson, time) => {
  const rawString = dataJson + time + HASH_KEY;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 核心功能：開立電子發票
 * @param {Object} shipment - 集運單資料 (需包含 id, totalCost, taxId, invoiceTitle 等)
 * @param {Object} user - 使用者資料 (需包含 email)
 * @returns {Object} { success: boolean, invoiceNumber: string, ... }
 */
const createInvoice = async (shipment, user) => {
  try {
    // --- A. 資料驗證 ---
    if (!MERCHANT_ID || !HASH_KEY) {
      throw new Error("環境變數 AMEGO_MERCHANT_ID 或 AMEGO_HASH_KEY 未設定");
    }
    if (!user.email) {
      throw new Error("客戶 Email 為空，無法寄送發票通知");
    }

    // --- B. 準備商品項目 (Items) ---
    // 為了簡化，我們將整筆運費視為單一品項「國際運費」
    // 若您需要列出詳細包裹，需在此處改寫迴圈 map shipment.packages
    const items = [
      {
        Description: "國際運費", // 品名
        Quantity: 1, // 數量
        UnitPrice: shipment.totalCost, // 單價
        Amount: shipment.totalCost, // 小計
        TaxType: "1", // 稅別: 1=應稅 (5%)
      },
    ];

    // --- C. 準備傳送給光貿的 Data 物件 ---
    // 判斷是否有統編 (有值且長度為8)
    const hasTaxId = shipment.taxId && shipment.taxId.length === 8;

    const dataObj = {
      MerchantID: MERCHANT_ID,
      MerchantOrderNo: shipment.id, // 使用我們的訂單 ID (不可重複)

      // 買受人資訊
      // 若有統編填統編，否則填 10 個 0
      BuyerIdentifier: hasTaxId ? shipment.taxId : "0000000000",
      // 買受人名稱：有抬頭用抬頭，沒抬頭用收件人，都沒填用"個人"
      BuyerName: shipment.invoiceTitle || shipment.recipientName || "個人",
      BuyerEmailAddress: user.email, // 這是寄送發票通知的關鍵

      SalesAmount: shipment.totalCost, // 發票總金額
      Category: "B2C", // 預設填 B2C (光貿系統會依據 BuyerIdentifier 自動識別是否轉 B2B 格式)
      Device: 0, // 0: 電腦版, 1: 手機版

      // 載具類型 (CarrierType)
      // 如果有統編 (B2B)，不能使用載具，留空。
      // 如果是 B2C，若我們沒收集手機條碼，留空代表使用「會員載具」(寄到 Email)。
      CarrierType: "",

      Print: "N", // N: 不列印 (電子發票), Y: 列印 (B2B通常會需要列印，但我們先設N由系統寄送PDF)
      LoveCode: "", // 捐贈碼 (若要捐贈可填)

      Items: items, // 商品陣列
    };

    // --- D. 加密與簽章 ---
    const dataJson = JSON.stringify(dataObj);
    // 取得當下 Unix Timestamp (秒)
    const time = Math.floor(Date.now() / 1000);
    // 產生簽章
    const sign = generateSign(dataJson, time);

    console.log(`[Invoice] 準備請求光貿 API...`);
    console.log(` - Order: ${shipment.id}`);
    console.log(` - Amount: ${shipment.totalCost}`);
    console.log(` - Email: ${user.email}`);

    // --- E. 發送 POST 請求 ---
    // 注意：光貿要求 Content-Type 為 application/x-www-form-urlencoded
    // 所以我們必須用 qs.stringify 把物件轉成 query string 格式 (key=value&key2=value2...)
    const response = await axios.post(
      API_URL,
      qs.stringify({
        MerchantID: MERCHANT_ID,
        invoice: MERCHANT_ID, // [修正] 光貿 API 錯誤代碼 11 要求此欄位
        time: time,
        sign: sign,
        data: dataJson,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    // --- F. 處理回應 ---
    const resData = response.data;
    console.log(`[Invoice] API 回應:`, JSON.stringify(resData));

    // 判斷成功條件 (Status 為 S 或 Success)
    if (resData && (resData.Status === "S" || resData.Status === "Success")) {
      return {
        success: true,
        invoiceNumber: resData.InvoiceNumber, // 發票號碼
        invoiceDate: new Date(), // 簡單紀錄當下時間，也可解析 resData.InvoiceTime
        randomCode: resData.RandomNumber, // 隨機碼
        raw: resData,
      };
    } else {
      // 開立失敗
      return {
        success: false,
        message: resData.Message || "發票開立失敗 (未知錯誤)",
        raw: resData,
      };
    }
  } catch (error) {
    console.error("[Invoice Error] 連線或程式錯誤:", error);
    return {
      success: false,
      message: error.message || "連線發生例外錯誤",
    };
  }
};

module.exports = { createInvoice };
