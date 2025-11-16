// 這是 backend/routes/quoteRoutes.js (修正版)
// (參考 RUNPIGGY-V2 的 'quoteRoutes.js')

const express = require("express");
const prisma = require("../config/db.js"); // <-- (重要) 改用我們共用的 db.js
const router = express.Router();

// POST /api/quotes - 建立一個新的估價單分享
router.post("/", async (req, res) => {
  try {
    const { calculationResult } = req.body;

    if (!calculationResult) {
      console.error("缺少計算結果資料");
      return res.status(400).json({ error: "缺少計算結果" });
    }

    // 將物件轉換為 JSON 字串存入資料庫
    const quote = await prisma.calculationQuote.create({
      data: {
        calculationResult: JSON.stringify(calculationResult),
      },
    });

    console.log("成功建立估價單，ID:", quote.id);
    res.status(201).json({ id: quote.id });
  } catch (error) {
    console.error("建立估價單失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// GET /api/quotes/:id - 根據 ID 獲取一個已儲存的估價單
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("查詢估價單 ID:", id);

    const quote = await prisma.calculationQuote.findUnique({
      where: { id },
    });

    if (!quote) {
      console.log("找不到估價單:", id);
      return res.status(404).json({ error: "找不到此估價單" });
    }

    try {
      // 將 JSON 字串解析回物件
      const parsedResult = JSON.parse(quote.calculationResult);

      const result = {
        id: quote.id,
        createdAt: quote.createdAt,
        calculationResult: parsedResult,
      };

      console.log("成功取得估價單:", id);
      res.json(result);
    } catch (parseError) {
      console.error("解析 JSON 失敗:", parseError);
      res.json(quote);
    }
  } catch (error) {
    console.error("獲取估價單失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

module.exports = router;
