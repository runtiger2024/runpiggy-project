// 這是 authController.js (V3 權限系統版)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken.js");

/**
 * @description 註冊一個新會員
 * @route       POST /api/auth/register
 * @access      Public
 */
const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 email 和 password" });
    }
    const userExists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // [*** V3 修正：新註冊的 "客戶" 權限為空 ***]
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        permissions: "[]", // "USER" 預設權限為空
      },
    });
    // [*** 修正結束 ***]

    if (newUser) {
      res.status(201).json({
        success: true,
        message: "註冊成功！",
        user: { id: newUser.id, email: newUser.email, name: newUser.name },
        token: generateToken(newUser.id),
      });
    } else {
      return res.status(400).json({ success: false, message: "註冊失敗" });
    }
  } catch (error) {
    console.error("註冊時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 登入會員 & 取得 token
 * @route       POST /api/auth/login
 * @access      Public
 */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 email 和 password" });
    }
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      res.status(200).json({
        success: true,
        message: "登入成功！",
        user: { id: user.id, email: user.email, name: user.name },
        token: generateToken(user.id),
      });
    } else {
      return res
        .status(401)
        .json({ success: false, message: "Email 或密碼錯誤" });
    }
  } catch (error) {
    console.error("登入時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 取得會員個人資料
 * @route       GET /api/auth/me
 * @access      Private (受保護)
 */
const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (user) {
      // (我們從 DB 撈出完整的 user)
      const userFromDb = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          permissions: true, // [*** V3 修正：讀取 permissions ***]
          phone: true,
          defaultAddress: true,
          createdAt: true,
        },
      });

      // [*** V3 修正：回傳前解析權限 ***]
      let permissions = [];
      try {
        permissions = JSON.parse(userFromDb.permissions || "[]");
      } catch (e) {}

      res.status(200).json({
        success: true,
        user: {
          ...userFromDb,
          permissions: permissions, // 回傳陣列，而非 JSON 字串
        },
      });
    } else {
      return res.status(404).json({ success: false, message: "找不到使用者" });
    }
  } catch (error) {
    console.error("取得個人資料時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description (新) 更新會員個人資料
 * @route       PUT /api/auth/me
 * @access      Private
 */
const updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, defaultAddress } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name,
        phone: phone,
        defaultAddress: defaultAddress,
      },
      select: {
        // 只回傳安全的資料
        id: true,
        email: true,
        name: true,
        phone: true,
        defaultAddress: true,
        permissions: true, // [*** V3 修正：讀取 permissions ***]
      },
    });

    // [*** V3 修正：回傳前解析權限 ***]
    let permissions = [];
    try {
      permissions = JSON.parse(updatedUser.permissions || "[]");
    } catch (e) {}

    res.status(200).json({
      success: true,
      message: "個人資料更新成功",
      user: {
        ...updatedUser,
        permissions: permissions, // 回傳陣列
      },
    });
  } catch (error) {
    console.error("更新個人資料時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// 匯出所有函式
module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateMe,
};
