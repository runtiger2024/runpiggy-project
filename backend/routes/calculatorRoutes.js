// backend/routes/calculatorRoutes.js
const express = require("express");
const router = express.Router();

const {
  getCalculatorConfig, // [新增] 引入新的控制器
  calculateSeaFreight,
  calculateAirFreight,
} = require("../controllers/calculatorController");

// 1. 取得公開設定 (費率、公告、銀行等)
router.get("/config", getCalculatorConfig);

// 2. 運費計算 API
router.post("/sea", calculateSeaFreight);
router.post("/air", calculateAirFreight);

module.exports = router;
