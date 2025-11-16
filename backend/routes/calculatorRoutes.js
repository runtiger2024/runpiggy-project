// 這是 calculatorRoutes.js
const express = require("express");
const router = express.Router();

const {
  calculateSeaFreight,
  calculateAirFreight,
} = require("../controllers/calculatorController");

router.post("/sea", calculateSeaFreight);
router.post("/air", calculateAirFreight);

module.exports = router;
