// frontend/js/admin-settings.js (V14 - 修復數值顯示與預設值回填)

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("admin_token");
  if (!token) {
    alert("請先登入");
    window.location.href = "admin-login.html";
    return;
  }

  // --- 1. 頁籤切換邏輯 ---
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document
        .getElementById(tab.getAttribute("data-tab"))
        .classList.add("active");
    });
  });

  // 全域快取
  let serverSettingsCache = {};

  // --- [關鍵修復] 定義系統預設值 ---
  // 當資料庫抓不到資料時，使用這些數值作為 Placeholder
  const SYSTEM_DEFAULTS = {
    categories: {
      general: {
        name: "一般家具",
        description: "一般傢俱",
        weightRate: 22,
        volumeRate: 125,
      },
      special_a: {
        name: "特殊家具A",
        description: "易碎品/大理石/帶電",
        weightRate: 32,
        volumeRate: 184,
      },
      special_b: {
        name: "特殊家具B",
        description: "易碎品/大理石/帶電",
        weightRate: 40,
        volumeRate: 224,
      },
      special_c: {
        name: "特殊家具C",
        description: "易碎品/大理石/帶電",
        weightRate: 50,
        volumeRate: 274,
      },
    },
    constants: {
      MINIMUM_CHARGE: 2000,
      VOLUME_DIVISOR: 28317,
      CBM_TO_CAI_FACTOR: 35.3,
      OVERWEIGHT_LIMIT: 100,
      OVERWEIGHT_FEE: 800,
      OVERSIZED_LIMIT: 300,
      OVERSIZED_FEE: 800,
    },
  };

  // --- 2. 載入設定 (API) ---
  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      const settings = data.settings || {};
      serverSettingsCache = settings;

      // A. 填入運費 (Rates) - 混合 DB 數據與預設值
      let dbRates = settings.rates_config || {};

      // 如果 DB 是空的，嘗試讀取舊的 shipping_rates Key (兼容遷移)
      if (!settings.rates_config && settings.shipping_rates) {
        dbRates = settings.shipping_rates;
      }

      const dbCats = dbRates.categories || {};
      const dbConsts = dbRates.constants || {};

      // 輔助函式：設定 Placeholder (灰字)
      // 優先順序：資料庫值 -> 系統預設值 -> "0"
      const setPlaceholder = (id, dbVal, defaultVal) => {
        const el = document.getElementById(id);
        if (el) {
          // 判斷 DB 是否有值 (包含 0)
          const hasDbVal =
            dbVal !== undefined && dbVal !== null && dbVal !== "";
          const finalVal = hasDbVal ? dbVal : defaultVal;

          el.placeholder = finalVal;
          el.value = ""; // 清空輸入框，顯示 Placeholder
        }
      };

      // 1. 一般家具
      setPlaceholder(
        "rate-general-name",
        dbCats.general?.name,
        SYSTEM_DEFAULTS.categories.general.name
      );
      setPlaceholder(
        "rate-general-desc",
        dbCats.general?.description,
        SYSTEM_DEFAULTS.categories.general.description
      );
      setPlaceholder(
        "rate-general-weight",
        dbCats.general?.weightRate,
        SYSTEM_DEFAULTS.categories.general.weightRate
      );
      setPlaceholder(
        "rate-general-volume",
        dbCats.general?.volumeRate,
        SYSTEM_DEFAULTS.categories.general.volumeRate
      );

      // 2. 特殊家具 A
      setPlaceholder(
        "rate-special_a-name",
        dbCats.special_a?.name,
        SYSTEM_DEFAULTS.categories.special_a.name
      );
      setPlaceholder(
        "rate-special_a-desc",
        dbCats.special_a?.description,
        SYSTEM_DEFAULTS.categories.special_a.description
      );
      setPlaceholder(
        "rate-special_a-weight",
        dbCats.special_a?.weightRate,
        SYSTEM_DEFAULTS.categories.special_a.weightRate
      );
      setPlaceholder(
        "rate-special_a-volume",
        dbCats.special_a?.volumeRate,
        SYSTEM_DEFAULTS.categories.special_a.volumeRate
      );

      // 3. 特殊家具 B
      setPlaceholder(
        "rate-special_b-name",
        dbCats.special_b?.name,
        SYSTEM_DEFAULTS.categories.special_b.name
      );
      setPlaceholder(
        "rate-special_b-desc",
        dbCats.special_b?.description,
        SYSTEM_DEFAULTS.categories.special_b.description
      );
      setPlaceholder(
        "rate-special_b-weight",
        dbCats.special_b?.weightRate,
        SYSTEM_DEFAULTS.categories.special_b.weightRate
      );
      setPlaceholder(
        "rate-special_b-volume",
        dbCats.special_b?.volumeRate,
        SYSTEM_DEFAULTS.categories.special_b.volumeRate
      );

      // 4. 特殊家具 C
      setPlaceholder(
        "rate-special_c-name",
        dbCats.special_c?.name,
        SYSTEM_DEFAULTS.categories.special_c.name
      );
      setPlaceholder(
        "rate-special_c-desc",
        dbCats.special_c?.description,
        SYSTEM_DEFAULTS.categories.special_c.description
      );
      setPlaceholder(
        "rate-special_c-weight",
        dbCats.special_c?.weightRate,
        SYSTEM_DEFAULTS.categories.special_c.weightRate
      );
      setPlaceholder(
        "rate-special_c-volume",
        dbCats.special_c?.volumeRate,
        SYSTEM_DEFAULTS.categories.special_c.volumeRate
      );

      // 填入常數 (Constants)
      for (const [k, v] of Object.entries(SYSTEM_DEFAULTS.constants)) {
        setPlaceholder(`const-${k}`, dbConsts[k], v);
      }

      // B. 填入銀行 (Bank)
      if (settings.bank_info) {
        const bank = settings.bank_info;
        setPlaceholder("bank-name", bank.bankName, "");
        setPlaceholder("bank-branch", bank.branch, "");
        setPlaceholder("bank-account", bank.account, "");
        setPlaceholder("bank-holder", bank.holder, "");
      }

      // C. 填入發票 (Invoice)
      if (settings.invoice_config) {
        const inv = settings.invoice_config;
        const chk = document.getElementById("invoice-enabled");
        if (chk) chk.checked = inv.enabled === true;

        setPlaceholder("invoice-mode", inv.mode, "TEST");
        setPlaceholder("invoice-merchant-id", inv.merchantId, "");

        // HashKey
        const hashInput = document.getElementById("invoice-hash-key");
        if (hashInput) {
          if (inv.hashKey) {
            hashInput.placeholder = "******** (已設定，若不修改請留空)";
          } else {
            hashInput.placeholder = "請輸入 Hash Key";
          }
          hashInput.value = "";
        }
      }

      // D. Email
      if (settings.email_config) {
        const em = settings.email_config;
        setPlaceholder("email-sender-name", em.senderName, "");
        setPlaceholder("email-sender-addr", em.senderEmail, "");
        const recipientsStr = Array.isArray(em.recipients)
          ? em.recipients.join(", ")
          : "";
        setPlaceholder("email-recipients", recipientsStr, "");
      }

      // E. 公告
      if (settings.announcement) {
        const ann = settings.announcement;
        const annChk = document.getElementById("announcement-enabled");
        if (annChk) annChk.checked = ann.enabled === true;

        setPlaceholder("announcement-text", ann.text, "");
        const colorSel = document.getElementById("announcement-color");
        if (colorSel) colorSel.value = ann.color || "info";
      }

      // F. 偏遠地區 (JSON)
      if (settings.remote_areas) {
        const jsonEl = document.getElementById("remote-areas-json");
        if (jsonEl)
          jsonEl.value = JSON.stringify(settings.remote_areas, null, 2);
      }
    } catch (e) {
      console.error(e);
      alert("載入設定失敗: " + e.message);
    }
  }

  async function saveSetting(key, value, description) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/${key}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value, description }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`「${description}」儲存成功！`);
        loadSettings(); // 重新載入以更新快取與畫面
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      alert(`儲存失敗: ${e.message}`);
    }
  }

  // [核心工具] 取得輸入值或回退 (若輸入為空，取 placeholder 值當作目前值)
  function getVal(inputId, fallbackVal, isNumber = false) {
    const el = document.getElementById(inputId);
    if (!el) return isNumber ? 0 : "";

    const userVal = el.value.trim();
    // 如果使用者有輸入，用輸入值
    if (userVal !== "") {
      return isNumber ? parseFloat(userVal) : userVal;
    }

    // 如果使用者沒輸入，嘗試從 placeholder 取值 (這代表當前系統值)
    // 但要注意 placeholder 可能是 "********" 這種遮罩
    if (
      el.placeholder &&
      !el.placeholder.includes("*") &&
      el.placeholder !== "未設定"
    ) {
      const phVal = el.placeholder;
      return isNumber ? parseFloat(phVal) : phVal;
    }

    // 最後退回 cache 或 預設
    return fallbackVal;
  }

  // --- 表單提交監聽 ---

  // (A) 運費
  document.getElementById("form-rates").addEventListener("submit", (e) => {
    e.preventDefault();

    const oldRates = serverSettingsCache.rates_config || SYSTEM_DEFAULTS; // 使用預設值當備案
    const oldCats = oldRates.categories || SYSTEM_DEFAULTS.categories;
    const oldConsts = oldRates.constants || SYSTEM_DEFAULTS.constants;

    const getCatData = (key) => {
      const oldC = oldCats[key] || {};
      return {
        name: getVal(`rate-${key}-name`, oldC.name),
        description: getVal(`rate-${key}-desc`, oldC.description),
        weightRate: getVal(`rate-${key}-weight`, oldC.weightRate, true),
        volumeRate: getVal(`rate-${key}-volume`, oldC.volumeRate, true),
      };
    };

    const newRates = {
      categories: {
        general: getCatData("general"),
        special_a: getCatData("special_a"),
        special_b: getCatData("special_b"),
        special_c: getCatData("special_c"),
      },
      constants: {},
    };

    document.querySelectorAll('[id^="const-"]').forEach((input) => {
      const key = input.id.replace("const-", "");
      const oldVal = oldConsts[key] !== undefined ? oldConsts[key] : 0;
      newRates.constants[key] = getVal(input.id, oldVal, true);
    });

    saveSetting("rates_config", newRates, "運費費率設定");
  });

  // (B) 銀行
  document.getElementById("form-bank").addEventListener("submit", (e) => {
    e.preventDefault();
    const old = serverSettingsCache.bank_info || {};
    const data = {
      bankName: getVal("bank-name", old.bankName),
      branch: getVal("bank-branch", old.branch),
      account: getVal("bank-account", old.account),
      holder: getVal("bank-holder", old.holder),
    };
    saveSetting("bank_info", data, "銀行匯款資訊");
  });

  // (C) 發票
  document.getElementById("form-invoice").addEventListener("submit", (e) => {
    e.preventDefault();
    const old = serverSettingsCache.invoice_config || {};
    const inputHashKey = document
      .getElementById("invoice-hash-key")
      .value.trim();
    const finalHashKey = inputHashKey ? inputHashKey : old.hashKey || "";

    const data = {
      enabled: document.getElementById("invoice-enabled").checked,
      mode: getVal("invoice-mode", old.mode),
      merchantId: getVal("invoice-merchant-id", old.merchantId),
      hashKey: finalHashKey,
    };
    saveSetting("invoice_config", data, "電子發票設定");
  });

  // (D) Email
  document.getElementById("form-email").addEventListener("submit", (e) => {
    e.preventDefault();
    const old = serverSettingsCache.email_config || {};
    const rawRecipients = document.getElementById("email-recipients").value;
    let finalRecipients = old.recipients;
    if (rawRecipients.trim() !== "") {
      finalRecipients = rawRecipients
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
    }
    const data = {
      senderName: getVal("email-sender-name", old.senderName),
      senderEmail: getVal("email-sender-addr", old.senderEmail),
      recipients: finalRecipients,
    };
    saveSetting("email_config", data, "Email 通知設定");
  });

  // (E) 公告
  document
    .getElementById("form-announcement")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const old = serverSettingsCache.announcement || {};
      const data = {
        enabled: document.getElementById("announcement-enabled").checked,
        text: getVal("announcement-text", old.text),
        color: document.getElementById("announcement-color").value,
      };
      saveSetting("announcement", data, "網站公告");
    });

  // (F) 偏遠地區 JSON
  const jsonEditor = document.getElementById("remote-areas-json");
  const jsonMsg = document.getElementById("json-validation-msg");

  document.getElementById("btn-format-json").addEventListener("click", () => {
    try {
      const val = JSON.parse(jsonEditor.value);
      jsonEditor.value = JSON.stringify(val, null, 2);
      jsonMsg.textContent = "格式正確 ✓";
      jsonMsg.className = "json-status json-valid";
    } catch (e) {
      alert("JSON 格式錯誤");
    }
  });

  jsonEditor.addEventListener("input", () => {
    try {
      JSON.parse(jsonEditor.value);
      jsonMsg.textContent = "格式正確 ✓";
      jsonMsg.className = "json-status json-valid";
    } catch (e) {
      jsonMsg.textContent = "格式錯誤 ✕";
      jsonMsg.className = "json-status json-invalid";
    }
  });

  document.getElementById("form-remote").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const val = JSON.parse(jsonEditor.value);
      if (typeof val !== "object") throw new Error("必須是物件");
      saveSetting("remote_areas", val, "偏遠地區設定");
    } catch (e) {
      alert("JSON 錯誤: " + e.message);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("登出?")) {
      localStorage.removeItem("admin_token");
      window.location.href = "admin-login.html";
    }
  });

  loadSettings();
});
