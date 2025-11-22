// backend/utils/invoiceHelper.js

const axios = require("axios");
const crypto = require("crypto");
const qs = require("qs");

const MERCHANT_ID = process.env.AMEGO_MERCHANT_ID;
const HASH_KEY = process.env.AMEGO_HASH_KEY;
const API_URL = process.env.AMEGO_API_URL;

const generateSign = (dataJson, time) => {
  const rawString = dataJson + time + HASH_KEY;
  return crypto.createHash("md5").update(rawString).digest("hex");
};

const createInvoice = async (shipment, user) => {
  try {
    if (!MERCHANT_ID || !HASH_KEY) throw new Error("API 金鑰未設定");

    // --- 1. 準備數據 ---
    // 確保金額是數字
    const total = Math.round(Number(shipment.totalCost));

    // 檢查統編是否存在且長度為8
    // 注意：如果是測試用，請填寫 "28080623" (光貿範例) 或其他真實存在的統編
    const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
    const hasTaxId = rawTaxId.length === 8;

    // 決定傳送給光貿的統編 (關鍵！)
    // 如果有 8 碼就傳 8 碼，否則一律傳 10 個 0 (B2C)
    const buyerIdentifier = hasTaxId ? rawTaxId : "0000000000";

    // 營業稅計算 (5%)
    let taxAmount = 0;
    let salesAmount = total;

    if (hasTaxId) {
      // B2B: 銷售額 = 總額 / 1.05 (四捨五入)
      const exclusiveAmount = Math.round(total / 1.05);
      taxAmount = total - exclusiveAmount;
      salesAmount = exclusiveAmount;
    } else {
      // B2C: 銷售額 = 含稅總額, 稅額 = 0
      salesAmount = total;
      taxAmount = 0;
    }

    // --- 2. 準備商品陣列 (ProductItem) ---
    const productItems = [
      {
        Description: "國際運費",
        Quantity: 1,
        UnitPrice: total, // 光貿建議填含稅單價，讓系統反推
        Amount: total,
        TaxType: 1, // 1: 應稅
      },
    ];

    // --- 3. 準備 JSON 資料物件 (MIG 4.0 精簡版) ---
    // 移除了非必要的 Category, Device 欄位
    const dataObj = {
      OrderId: shipment.id,
      BuyerIdentifier: buyerIdentifier,
      BuyerName: shipment.invoiceTitle || shipment.recipientName || "個人",
      BuyerEmailAddress: user.email,

      // 金額欄位 (轉成字串傳送較保險，或保持 Number 皆可，這裡用 Number)
      SalesAmount: salesAmount,
      FreeTaxSalesAmount: 0,
      ZeroTaxSalesAmount: 0,
      TaxType: 1,
      TaxRate: 0.05,
      TaxAmount: taxAmount,
      TotalAmount: total,

      ProductItem: productItems,

      Print: "N", // N: 不列印
      // 若是 B2C (0000000000)，CarrierType 留空代表使用會員載具(Email)
      // 若是 B2B (有統編)，CarrierType 必須留空
      CarrierType: "",
    };

    const dataJson = JSON.stringify(dataObj);
    const time = Math.floor(Date.now() / 1000);
    const sign = generateSign(dataJson, time);

    // --- 4. 發送請求 ---
    const formData = {
      MerchantID: MERCHANT_ID,
      invoice: MERCHANT_ID,
      time: time,
      sign: sign,
      data: dataJson,
    };

    console.log(
      `[Invoice] 請求: Order=${dataObj.OrderId}, BuyerID=${dataObj.BuyerIdentifier}`
    );

    const response = await axios.post(API_URL, qs.stringify(formData), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const resData = response.data;

    // --- 5. 處理結果 ---
    // 檢查 code: 0 (成功)
    if (resData.code === 0) {
      return {
        success: true,
        invoiceNumber: resData.invoice_number,
        invoiceDate: new Date(),
        randomCode: resData.random_number,
        raw: resData,
      };
    } else {
      // 失敗
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
