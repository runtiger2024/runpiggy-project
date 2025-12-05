// backend/routes/quoteRoutes.js
// V11 - Native JSON Support

const express = require("express");
const prisma = require("../config/db.js");
const router = express.Router();

// POST /api/quotes - 建立一個新的估價單分享
router.post("/", async (req, res) => {
  try {
    const { calculationResult } = req.body;

    if (!calculationResult) {
      console.error("缺少計算結果資料");
      return res.status(400).json({ error: "缺少計算結果" });
    }

    // [修改] 直接將物件存入資料庫 (Native Json)
    const quote = await prisma.calculationQuote.create({
      data: {
        calculationResult: calculationResult,
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

    // [修改] 直接回傳物件，無需 JSON.parse
    const result = {
      id: quote.id,
      createdAt: quote.createdAt,
      calculationResult: quote.calculationResult,
    };

    console.log("成功取得估價單:", id);
    res.json(result);
  } catch (error) {
    console.error("獲取估價單失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

module.exports = router;
