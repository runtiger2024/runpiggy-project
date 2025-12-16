// backend/utils/upload.js (Cloudinary Version - Optimized)
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const path = require("path");

// 1. 設定 Cloudinary 連線資訊
// 加入 secure: true 以強制回傳 HTTPS 網址，解決混合內容 (Mixed Content) 造成的破圖問題
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// 2. 設定儲存引擎 (CloudinaryStorage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // (A) 優化檔名處理：
    // 不使用原始檔名 (file.originalname) 作為 public_id，避免中文編碼導致 URL 錯誤或亂碼
    // 改用 "時間戳-隨機碼" 確保全域唯一性與 URL 安全性
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    return {
      folder: "runpiggy-uploads", // 您在 Cloudinary 上的資料夾名稱
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      public_id: uniqueSuffix, // 例如: 1734318000000-123456789
    };
  },
});

// 3. 檔案過濾器 (維持原本邏輯，只允許圖片)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const mimeTypeMatch = allowedTypes.test(file.mimetype);

  if (mimeTypeMatch) {
    cb(null, true);
  } else {
    cb(new Error("不支援的檔案格式！僅允許上傳圖片"), false);
  }
};

// 4. 建立 Multer 實例
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制單檔 5MB
    files: 20, // 最多 20 張
  },
});

module.exports = upload;
