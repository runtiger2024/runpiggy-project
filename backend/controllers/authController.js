// backend/controllers/authController.js (V9 完整版 - 含忘記密碼)

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto"); // 用於產生重設 token
const generateToken = require("../utils/generateToken.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js"); // 這裡借用 sendEmail 模組發送重設信
const sgMail = require("@sendgrid/mail"); // 直接引用 sgMail 發送重設信

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

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        permissions: "[]", // 預設無特殊權限
      },
    });

    if (newUser) {
      res.status(201).json({
        success: true,
        message: "註冊成功！",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          permissions: [],
        },
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
      // 確保權限是陣列格式回傳
      let permissions = [];
      try {
        permissions = JSON.parse(user.permissions || "[]");
      } catch (e) {}

      res.status(200).json({
        success: true,
        message: "登入成功！",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          permissions: permissions,
        },
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
 * @access      Private
 */
const getMe = async (req, res) => {
  try {
    const user = req.user; // 由 protect middleware 注入
    if (user) {
      const userFromDb = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          permissions: true,
          phone: true,
          defaultAddress: true,
          createdAt: true,
        },
      });

      let permissions = [];
      try {
        permissions = JSON.parse(userFromDb.permissions || "[]");
      } catch (e) {}

      res.status(200).json({
        success: true,
        user: {
          ...userFromDb,
          permissions: permissions,
        },
      });
    } else {
      return res.status(404).json({ success: false, message: "找不到使用者" });
    }
  } catch (error) {
    console.error("取得個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 更新會員個人資料
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
        id: true,
        email: true,
        name: true,
        phone: true,
        defaultAddress: true,
        permissions: true,
      },
    });

    let permissions = [];
    try {
      permissions = JSON.parse(updatedUser.permissions || "[]");
    } catch (e) {}

    res.status(200).json({
      success: true,
      message: "個人資料更新成功",
      user: {
        ...updatedUser,
        permissions: permissions,
      },
    });
  } catch (error) {
    console.error("更新個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 忘記密碼 - 發送重設連結
 * @route       POST /api/auth/forgot-password
 * @access      Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // 為了安全，即使找不到 Email 也不要明確告知
      return res
        .status(200)
        .json({ success: true, message: "若 Email 存在，重設信件已發送" });
    }

    // 產生隨機 Token
    const resetToken = crypto.randomBytes(20).toString("hex");
    // Hash Token 存入 DB
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000); // 10分鐘有效期

    // 更新使用者紀錄 (需確保 schema 有這兩個欄位，若無則需 migration)
    // 若 Schema 尚未支援，此處會報錯，請確保 backend/prisma/schema.prisma 已新增欄位
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken,
          resetPasswordExpire,
        },
      });
    } catch (dbError) {
      console.error(
        "DB Schema 可能缺少 resetPasswordToken 欄位:",
        dbError.message
      );
      return res
        .status(500)
        .json({ success: false, message: "系統尚未支援此功能 (DB Error)" });
    }

    // 發送 Email (使用 SendGrid)
    // 注意：這裡假設您已設定 SENDGRID_API_KEY
    if (process.env.SENDGRID_API_KEY) {
      // 取得前端網址 (假設)
      const resetUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/reset-password.html?token=${resetToken}`;

      const msg = {
        to: user.email,
        from: process.env.SENDER_EMAIL_ADDRESS || "noreply@runpiggy.com",
        subject: "小跑豬集運 - 重設密碼請求",
        html: `
                <h3>您已申請重設密碼</h3>
                <p>請點擊以下連結重設您的密碼 (連結 10 分鐘內有效)：</p>
                <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
                <p>若您未申請此操作，請忽略此信。</p>
            `,
      };
      await sgMail.send(msg);
    } else {
      console.log(
        `[Dev Mode] 重設連結: /reset-password.html?token=${resetToken}`
      );
    }

    res.status(200).json({ success: true, message: "重設信件已發送" });
  } catch (error) {
    console.error("忘記密碼錯誤:", error);
    res.status(500).json({ success: false, message: "無法發送 Email" });
  }
};

/**
 * @description 重設密碼
 * @route       POST /api/auth/reset-password/:token
 * @access      Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken,
        resetPasswordExpire: { gt: new Date() },
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Token 無效或已過期" });
    }

    // 重設密碼
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpire: null,
      },
    });

    res
      .status(200)
      .json({ success: true, message: "密碼重設成功，請重新登入" });
  } catch (error) {
    console.error("重設密碼錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateMe,
  forgotPassword,
  resetPassword,
};
