const prisma = require("../../config/db.js");
const bcrypt = require("bcryptjs");
const createLog = require("../../utils/createLog.js");
const generateToken = require("../../utils/generateToken.js");

const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search, role, filter } = req.query;
    const where = {};
    if (status !== undefined && status !== "")
      where.isActive = status === "true";
    if (search) {
      const s = search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { email: { contains: s, mode: "insensitive" } },
        { phone: { contains: s, mode: "insensitive" } },
      ];
    }
    if (role) {
      if (role === "ADMIN")
        where.permissions = { array_contains: "CAN_MANAGE_USERS" };
    }

    if (filter === "new_today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      where.createdAt = { gte: start };
    }

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          permissions: true,
          createdAt: true,
          isActive: true,
          // [新增] 關聯查詢錢包餘額
          wallet: {
            select: {
              balance: true,
            },
          },
        },
      }),
    ]);
    res.status(200).json({
      success: true,
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const getUsersList = async (req, res) => {
  try {
    const { search } = req.query;
    const where = { isActive: true };
    if (search)
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    const users = await prisma.user.findMany({
      where,
      take: 20,
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    });
    res.status(200).json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, message: "錯誤" });
  }
};

const createStaffUser = async (req, res) => {
  try {
    const { email, password, name, permissions } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ message: "資料不全" });
    const exists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (exists) return res.status(400).json({ message: "Email 已存在" });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hash,
        name,
        permissions: permissions || [],
        isActive: true,
      },
    });
    await createLog(req.user.id, "CREATE_STAFF", user.id, `建立員工 ${email}`);
    res.status(201).json({ success: true, user });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    await prisma.user.update({ where: { id }, data: { isActive } });
    await createLog(req.user.id, "TOGGLE_USER", id, `狀態:${isActive}`);
    res.status(200).json({ success: true, message: "狀態已更新" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const adminUpdateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, defaultAddress } = req.body;
    await prisma.user.update({
      where: { id },
      data: { name, phone, defaultAddress },
    });
    await createLog(req.user.id, "UPDATE_USER_PROFILE", id, "更新個資");
    res.status(200).json({ success: true, message: "更新成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const hash = await bcrypt.hash("8888", 10);
    await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    await createLog(req.user.id, "RESET_PASSWORD", id, "重設為8888");
    res.status(200).json({ success: true, message: "重設成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id === id)
      return res.status(400).json({ message: "不能刪除自己" });

    const activeShipments = await prisma.shipment.count({
      where: {
        userId: id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });

    const activePackages = await prisma.package.count({
      where: {
        userId: id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });

    if (activeShipments > 0 || activePackages > 0) {
      return res.status(400).json({
        message: `無法刪除！此會員尚有 ${activePackages} 件未完成包裹及 ${activeShipments} 筆未完成訂單。請先結案後再試。`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { userId: id } });
      await tx.package.deleteMany({ where: { userId: id } });
      await tx.shipment.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    await createLog(req.user.id, "DELETE_USER", id, "永久刪除");
    res.status(200).json({ success: true, message: "已刪除" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "刪除失敗" });
  }
};

const impersonateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: "找不到" });
    const token = generateToken(user.id, { permissions: user.permissions });
    await createLog(req.user.id, "IMPERSONATE", id, `模擬 ${user.email}`);
    res.status(200).json({ success: true, token, user });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const updateUserPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    if (req.user.id === id)
      return res.status(400).json({ message: "不能改自己權限" });

    await prisma.user.update({
      where: { id },
      data: { permissions: permissions || [] },
    });
    await createLog(req.user.id, "UPDATE_PERMS", id, "更新權限");
    res.status(200).json({ success: true, message: "更新成功" });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

module.exports = {
  getUsers,
  getUsersList,
  createStaffUser,
  toggleUserStatus,
  adminUpdateUserProfile,
  resetUserPassword,
  deleteUser,
  impersonateUser,
  updateUserPermissions,
};
