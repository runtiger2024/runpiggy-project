// backend/utils/upload.js (V10 優化版 - 安全性與中文支援)

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 1. 設定儲存引擎 (DiskStorage)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 確保上傳目錄存在
    const uploadDir = path.join(__dirname, "../public/uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // (A) 解決中文檔名亂碼問題 (視 Node環境與Multer版本而定，這是保險做法)
    // file.originalname 在某些環境下會是 latin1 編碼
    const originalName = Buffer.from(file.originalname, "latin1").toString(
      "utf8"
    );

    // (B) 產生唯一檔名：欄位名-時間戳-隨機數.副檔名
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(originalName); // 取得副檔名 (如 .jpg)

    // 組合新檔名 (不使用原始檔名以避免衝突與資安問題)
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// 2. 檔案過濾器 (安全性檢查)
const fileFilter = (req, file, cb) => {
  // 允許的 MIME Types
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  // 檢查 MIME
  const mimeTypeMatch = allowedTypes.test(file.mimetype);
  // 檢查副檔名 (雙重確認)
  const extNameMatch = allowedTypes.test(
    path.extname(file.originalname).toLowerCase().substring(1)
  );

  if (mimeTypeMatch && extNameMatch) {
    cb(null, true);
  } else {
    cb(
      new Error("不支援的檔案格式！僅允許上傳圖片 (jpg, png, gif, webp)"),
      false
    );
  }
};

// 3. 建立 Multer 實例
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制單檔 5MB
    files: 20, // [修改] 將限制提升至 20，讓客戶可以依包裹數量上傳對應截圖
  },
});

module.exports = upload;
