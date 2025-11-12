// 這是 backend/utils/upload.js

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 設定儲存位置和檔案名稱
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 建立 'public/uploads' 資料夾 (如果不存在)
    // __dirname 指的是目前檔案 (upload.js) 所在的資料夾 (utils)
    // 所以我們要用 ../ 回到 'backend'，然後再進入 'public/uploads'
    const uploadDir = path.join(__dirname, "../public/uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 產生獨特檔案名稱
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// 檔案過濾器 (只接受圖片)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new Error("只允許上傳圖片檔案!"), false);
  }
};

// 建立上傳實例
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 }, // 限制 5MB
});

module.exports = upload;
