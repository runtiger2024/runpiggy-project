// backend/utils/adminHelpers.js
const fs = require("fs");
const path = require("path");

// 刪除多個檔案
const deleteFiles = (filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  // 注意：這裡假設此檔案在 backend/utils/ 下
  const uploadDir = path.join(__dirname, "../public/uploads");

  filePaths.forEach((filePath) => {
    try {
      const fileName = path.basename(filePath);
      if (!fileName) return;
      const absolutePath = path.join(uploadDir, fileName);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (err) {
      console.warn(`[File Warning] 刪除檔案失敗 (${filePath}):`, err.message);
    }
  });
};

// 建構包裹查詢條件
const buildPackageWhereClause = (status, search) => {
  const where = {};
  if (status) where.status = status;
  if (search) {
    const searchLower = search.trim();
    where.OR = [
      { trackingNumber: { contains: searchLower, mode: "insensitive" } },
      { productName: { contains: searchLower, mode: "insensitive" } },
      { user: { email: { contains: searchLower, mode: "insensitive" } } },
      { user: { name: { contains: searchLower, mode: "insensitive" } } },
    ];
  }
  return where;
};

// 建構訂單查詢條件
const buildShipmentWhereClause = (status, search) => {
  const where = {};
  if (status) {
    if (status === "PENDING_REVIEW") {
      where.status = "PENDING_PAYMENT";
      where.paymentProof = { not: null };
    } else if (status === "PENDING_PAYMENT") {
      where.status = "PENDING_PAYMENT";
      where.paymentProof = null;
    } else {
      where.status = status;
    }
  }
  if (search) {
    const searchLower = search.trim();
    where.OR = [
      { id: { contains: searchLower, mode: "insensitive" } },
      { recipientName: { contains: searchLower, mode: "insensitive" } },
      { phone: { contains: searchLower, mode: "insensitive" } },
      { idNumber: { contains: searchLower, mode: "insensitive" } },
      { user: { email: { contains: searchLower, mode: "insensitive" } } },
      { user: { name: { contains: searchLower, mode: "insensitive" } } },
      { trackingNumberTW: { contains: searchLower, mode: "insensitive" } },
    ];
  }
  return where;
};

module.exports = {
  deleteFiles,
  buildPackageWhereClause,
  buildShipmentWhereClause,
};
