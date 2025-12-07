const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");

const getSystemSettings = async (req, res) => {
  try {
    const settingsList = await prisma.systemSetting.findMany();
    const settings = {};

    settingsList.forEach((item) => {
      let val = item.value;
      if (item.key === "invoice_config" && val && val.hashKey) {
        val = { ...val, hashKey: "********" };
      }
      settings[item.key] = val;
    });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("取得系統設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

const updateSystemSetting = async (req, res) => {
  try {
    const { key } = req.params;
    let { value, description } = req.body;

    if (value === undefined)
      return res.status(400).json({ success: false, message: "缺少設定值" });

    if (key === "invoice_config" && value && value.hashKey === "********") {
      const oldSetting = await prisma.systemSetting.findUnique({
        where: { key: "invoice_config" },
      });
      if (oldSetting && oldSetting.value && oldSetting.value.hashKey) {
        value.hashKey = oldSetting.value.hashKey;
      } else {
        value.hashKey = "";
      }
    }

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value, ...(description && { description }) },
      create: { key, value: value, description: description || "系統設定" },
    });

    await createLog(
      req.user.id,
      "UPDATE_SYSTEM_SETTING",
      "SYSTEM",
      `更新設定: ${key}`
    );

    res.status(200).json({ success: true, message: `設定 ${key} 已更新` });
  } catch (error) {
    console.error(`更新設定 ${req.params.key} 失敗:`, error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getSystemSettings,
  updateSystemSetting,
};
