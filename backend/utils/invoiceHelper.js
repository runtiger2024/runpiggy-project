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
    // 1. 基礎資料檢查
    if (!MERCHANT_ID || !HASH_KEY) throw new Error("API 金鑰未設定");

    // 2. 計算金額邏輯
    const total = Math.round(shipment.totalCost);
    const hasTaxId = shipment.taxId && shipment.taxId.length === 8;

    // 營業稅計算 (5%)
    // 若有統編(B2B)：稅額 = 總額 - round(總額 / 1.05)
    // 若無統編(B2C)：稅額 = 0 (光貿 B2C 預設不顯示稅額)
    let taxAmount = 0;
    let salesAmount = total; // 銷售額 (未稅)

    if (hasTaxId) {
      const exclusiveAmount = Math.round(total / 1.05);
      taxAmount = total - exclusiveAmount;
      salesAmount = exclusiveAmount;
    } else {
      // B2C 情況，SalesAmount 填含稅總額，TaxAmount 填 0
      salesAmount = total;
      taxAmount = 0;
    }

    // 3. 準備商品陣列 (ProductItem)
    // 注意：單價與金額我們填寫「含稅價」，讓系統自動去拆算
    const productItems = [
      {
        Description: "國際運費",
        Quantity: 1,
        UnitPrice: total, // 含稅單價
        Amount: total, // 含稅小計
        TaxType: 1, // 1: 應稅
      },
    ];

    // 4. 準備 JSON 資料物件 (依據光貿 MIG 4.0 規格)
    const dataObj = {
      // 訂單資訊
      OrderId: shipment.id, // [修正] 欄位名稱為 OrderId

      // 買受人資訊
      BuyerIdentifier: hasTaxId ? shipment.taxId : "0000000000",
      BuyerName: shipment.invoiceTitle || shipment.recipientName || "個人",
      BuyerEmailAddress: user.email,

      // 金額統計 (必填)
      SalesAmount: salesAmount, // 應稅銷售額
      FreeTaxSalesAmount: 0, // 免稅銷售額
      ZeroTaxSalesAmount: 0, // 零稅率銷售額
      TaxType: 1, // 1: 應稅
      TaxRate: 0.05, // 稅率
      TaxAmount: taxAmount, // 稅額
      TotalAmount: total, // 總計

      // 商品明細
      ProductItem: productItems, // [修正] 欄位名稱為 ProductItem

      // 其他設定
      Print: "N", // 不列印
      CarrierType: hasTaxId ? "" : "", // B2C 若留空則為會員載具(Email通知)
    };

    const dataJson = JSON.stringify(dataObj);
    const time = Math.floor(Date.now() / 1000);
    const sign = generateSign(dataJson, time);

    // 5. 發送請求
    const formData = {
      MerchantID: MERCHANT_ID,
      invoice: MERCHANT_ID, // 光貿某些版本要求帶此參數
      time: time,
      sign: sign,
      data: dataJson,
    };

    console.log(
      `[Invoice] 請求開立: Order=${dataObj.OrderId}, Total=${dataObj.TotalAmount}`
    );

    const response = await axios.post(API_URL, qs.stringify(formData), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const resData = response.data;

    // 6. 判斷結果
    // 光貿成功時可能是 { code: 0, msg: "", ... } 或 { Status: "S" } 視版本而定
    // 根據您的錯誤訊息 {"code": 3040113}，這版 API 應該是用 code: 0 判斷成功

    if (
      resData.code === 0 ||
      resData.Status === "S" ||
      resData.Status === "Success"
    ) {
      return {
        success: true,
        invoiceNumber: resData.invoice_number || resData.InvoiceNumber,
        invoiceDate: new Date(), // 或解析 resData.invoice_time
        randomCode: resData.random_number || resData.RandomNumber,
        raw: resData,
      };
    } else {
      return {
        success: false,
        message: resData.msg || resData.Message || `錯誤代碼: ${resData.code}`,
        raw: resData,
      };
    }
  } catch (error) {
    console.error("[Invoice Error]", error.message);
    return { success: false, message: error.message };
  }
};

module.exports = { createInvoice };
