// backend/controllers/authController.js
// V12 - Added Invoice Defaults to Response

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const generateToken = require("../utils/generateToken.js");
const sgMail = require("@sendgrid/mail");

const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "請提供 email 和 password" });
    const userExists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (userExists)
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: passwordHash,
        name: name,
        permissions: [],
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

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "請提供 email 和 password" });
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const permissions = user.permissions || [];

      res.status(200).json({
        success: true,
        message: "登入成功！",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          permissions: permissions,
          // [New] 回傳預設發票資料
          defaultTaxId: user.defaultTaxId,
          defaultInvoiceTitle: user.defaultInvoiceTitle,
        },
        token: generateToken(user.id, { permissions }),
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

const getMe = async (req, res) => {
  try {
    const user = req.user;
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
          // [New] 確保前端能拿到預設發票資料
          defaultTaxId: true,
          defaultInvoiceTitle: true,
        },
      });
      const permissions = userFromDb.permissions || [];

      res.status(200).json({
        success: true,
        user: { ...userFromDb, permissions: permissions },
      });
    } else {
      return res.status(404).json({ success: false, message: "找不到使用者" });
    }
  } catch (error) {
    console.error("取得個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, defaultAddress, defaultTaxId, defaultInvoiceTitle } =
      req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone,
        defaultAddress,
        // [New] 允許使用者更新預設發票資料
        defaultTaxId,
        defaultInvoiceTitle,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        defaultAddress: true,
        permissions: true,
        defaultTaxId: true,
        defaultInvoiceTitle: true,
      },
    });
    const permissions = updatedUser.permissions || [];

    res.status(200).json({
      success: true,
      message: "個人資料更新成功",
      user: { ...updatedUser, permissions: permissions },
    });
  } catch (error) {
    console.error("更新個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user)
      return res
        .status(200)
        .json({ success: true, message: "若 Email 存在，重設信件已發送" });
    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken, resetPasswordExpire },
      });
    } catch (dbError) {
      return res
        .status(500)
        .json({ success: false, message: "系統尚未支援此功能 (DB Error)" });
    }
    if (process.env.SENDGRID_API_KEY) {
      const resetUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/reset-password.html?token=${resetToken}`;
      const msg = {
        to: user.email,
        from: process.env.SENDER_EMAIL_ADDRESS || "noreply@runpiggy.com",
        subject: "小跑豬集運 - 重設密碼請求",
        html: `<h3>您已申請重設密碼</h3><p>請點擊以下連結重設您的密碼 (連結 10 分鐘內有效)：</p><a href="${resetUrl}" clicktracking=off>${resetUrl}</a><p>若您未申請此操作，請忽略此信。</p>`,
      };
      await sgMail.send(msg);
    }
    res.status(200).json({ success: true, message: "重設信件已發送" });
  } catch (error) {
    console.error("忘記密碼錯誤:", error);
    res.status(500).json({ success: false, message: "無法發送 Email" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const user = await prisma.user.findFirst({
      where: { resetPasswordToken, resetPasswordExpire: { gt: new Date() } },
    });
    if (!user)
      return res
        .status(400)
        .json({ success: false, message: "Token 無效或已過期" });
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

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (!currentPassword || !newPassword)
      return res
        .status(400)
        .json({ success: false, message: "請輸入舊密碼與新密碼" });
    if (newPassword.length < 6)
      return res
        .status(400)
        .json({ success: false, message: "新密碼長度至少需 6 位數" });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res.status(404).json({ success: false, message: "找不到使用者" });
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "目前的密碼輸入錯誤" });
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    res.json({ success: true, message: "密碼修改成功，下次登入請使用新密碼" });
  } catch (error) {
    console.error("修改密碼錯誤:", error);
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
  changePassword,
};
