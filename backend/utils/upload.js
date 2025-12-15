// backend/utils/upload.js (Cloudinary Version)
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const path = require("path");

// 1. 設定 Cloudinary 連線資訊
// 這些變數會從環境變數 (.env) 讀取，確保您的密鑰安全
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. 設定儲存引擎 (CloudinaryStorage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // (A) 處理中文檔名 (雖然雲端會自動編碼，但保留原意是好習慣)
    let originalName = "unknown";
    if (file.originalname) {
      originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    }
    // 去除副檔名，Cloudinary 會自動處理
    const publicId = path.parse(originalName).name;

    return {
      folder: "runpiggy-uploads", // 您在 Cloudinary 上的資料夾名稱
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      // 使用 "時間戳-檔名" 確保唯一性
      public_id: `${Date.now()}-${publicId}`,
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
