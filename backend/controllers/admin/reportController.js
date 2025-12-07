const prisma = require("../../config/db.js");

const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      totalRev,
      pendingRev,
      totalUser,
      newUserToday,
      pkgGroup,
      shipGroup,
      recentPkg,
      recentShip,
    ] = await Promise.all([
      prisma.shipment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { totalCost: true },
      }),
      prisma.shipment.aggregate({
        where: { status: "PENDING_PAYMENT" },
        _sum: { totalCost: true },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.package.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.shipment.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.package.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
      prisma.shipment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
    ]);
    const pkgStats = {};
    pkgGroup.forEach((p) => (pkgStats[p.status] = p._count.id));
    const shipStats = {};
    shipGroup.forEach((s) => (shipStats[s.status] = s._count.id));
    res.status(200).json({
      success: true,
      stats: {
        totalRevenue: totalRev._sum.totalCost || 0,
        pendingRevenue: pendingRev._sum.totalCost || 0,
        totalUsers: totalUser,
        newUsersToday: newUserToday,
        packageStats: pkgStats,
        shipmentStats: shipStats,
        recentPackages: recentPkg,
        recentShipments: recentShip,
      },
    });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const getActivityLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, action } = req.query;
    const where = {};
    if (search)
      where.OR = [
        { userEmail: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
      ];
    if (action) where.action = { contains: action };
    const [total, logs] = await prisma.$transaction([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    res.status(500).json({ message: "錯誤" });
  }
};

const getDailyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const revenue =
      await prisma.$queryRaw`SELECT DATE_TRUNC('day', "updatedAt")::DATE as date, SUM("totalCost") as revenue FROM "Shipment" WHERE "status" = 'COMPLETED' AND "updatedAt" >= ${start} AND "updatedAt" <= ${end} GROUP BY date ORDER BY date ASC`;
    const users =
      await prisma.$queryRaw`SELECT DATE_TRUNC('day', "createdAt")::DATE as date, COUNT(id) as newusers FROM "User" WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} GROUP BY date ORDER BY date ASC`;
    const safeRevenue = revenue.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
    }));
    const safeUsers = users.map((u) => ({
      date: u.date,
      newUsers: Number(u.newusers),
    }));
    res.status(200).json({
      success: true,
      report: { revenueData: safeRevenue, userData: safeUsers },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "報表錯誤" });
  }
};

module.exports = {
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
};
