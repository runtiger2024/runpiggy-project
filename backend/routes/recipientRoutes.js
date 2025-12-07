// backend/routes/recipientRoutes.js

const express = require("express");
const router = express.Router();
const {
  getMyRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
} = require("../controllers/recipientController"); // 確保你有建立這個 Controller

const { protect } = require("../middleware/authMiddleware");

// 所有操作都需要登入
router.use(protect);

router.route("/").get(getMyRecipients).post(createRecipient);

router.route("/:id").put(updateRecipient).delete(deleteRecipient);

module.exports = router;
