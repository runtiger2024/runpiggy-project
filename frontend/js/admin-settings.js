// frontend/js/admin-settings.js (V15 - 修復常數需重新填寫問題)

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

  // --- 定義系統預設值 (當 DB 為空時使用) ---
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

      // A. 填入運費 (Rates)
      let dbRates = settings.rates_config || {};
      // 兼容舊資料
      if (!settings.rates_config && settings.shipping_rates) {
        dbRates = settings.shipping_rates;
      }

      const dbCats = dbRates.categories || {};
      const dbConsts = dbRates.constants || {};

      // [關鍵修正] 將數值直接填入 input 的 value，而不是 placeholder
      const setInputValue = (id, dbVal, defaultVal) => {
        const el = document.getElementById(id);
        if (el) {
          // 判斷 DB 是否有值 (包含 0)
          const hasDbVal =
            dbVal !== undefined && dbVal !== null && dbVal !== "";
          const finalVal = hasDbVal ? dbVal : defaultVal;

          el.value = finalVal; // 直接設定值，使用者無需重新輸入
        }
      };

      // 1. 一般家具
      setInputValue(
        "rate-general-name",
        dbCats.general?.name,
        SYSTEM_DEFAULTS.categories.general.name
      );
      setInputValue(
        "rate-general-desc",
        dbCats.general?.description,
        SYSTEM_DEFAULTS.categories.general.description
      );
      setInputValue(
        "rate-general-weight",
        dbCats.general?.weightRate,
        SYSTEM_DEFAULTS.categories.general.weightRate
      );
      setInputValue(
        "rate-general-volume",
        dbCats.general?.volumeRate,
        SYSTEM_DEFAULTS.categories.general.volumeRate
      );

      // 2. 特殊家具 A
      setInputValue(
        "rate-special_a-name",
        dbCats.special_a?.name,
        SYSTEM_DEFAULTS.categories.special_a.name
      );
      setInputValue(
        "rate-special_a-desc",
        dbCats.special_a?.description,
        SYSTEM_DEFAULTS.categories.special_a.description
      );
      setInputValue(
        "rate-special_a-weight",
        dbCats.special_a?.weightRate,
        SYSTEM_DEFAULTS.categories.special_a.weightRate
      );
      setInputValue(
        "rate-special_a-volume",
        dbCats.special_a?.volumeRate,
        SYSTEM_DEFAULTS.categories.special_a.volumeRate
      );

      // 3. 特殊家具 B
      setInputValue(
        "rate-special_b-name",
        dbCats.special_b?.name,
        SYSTEM_DEFAULTS.categories.special_b.name
      );
      setInputValue(
        "rate-special_b-desc",
        dbCats.special_b?.description,
        SYSTEM_DEFAULTS.categories.special_b.description
      );
      setInputValue(
        "rate-special_b-weight",
        dbCats.special_b?.weightRate,
        SYSTEM_DEFAULTS.categories.special_b.weightRate
      );
      setInputValue(
        "rate-special_b-volume",
        dbCats.special_b?.volumeRate,
        SYSTEM_DEFAULTS.categories.special_b.volumeRate
      );

      // 4. 特殊家具 C
      setInputValue(
        "rate-special_c-name",
        dbCats.special_c?.name,
        SYSTEM_DEFAULTS.categories.special_c.name
      );
      setInputValue(
        "rate-special_c-desc",
        dbCats.special_c?.description,
        SYSTEM_DEFAULTS.categories.special_c.description
      );
      setInputValue(
        "rate-special_c-weight",
        dbCats.special_c?.weightRate,
        SYSTEM_DEFAULTS.categories.special_c.weightRate
      );
      setInputValue(
        "rate-special_c-volume",
        dbCats.special_c?.volumeRate,
        SYSTEM_DEFAULTS.categories.special_c.volumeRate
      );

      // 填入常數 (Constants)
      // 這裡會自動迭代 SYSTEM_DEFAULTS 中的 key，確保所有欄位都被填入
      for (const [k, v] of Object.entries(SYSTEM_DEFAULTS.constants)) {
        setInputValue(`const-${k}`, dbConsts[k], v);
      }

      // B. 填入銀行 (Bank)
      if (settings.bank_info) {
        const bank = settings.bank_info;
        setInputValue("bank-name", bank.bankName, "");
        setInputValue("bank-branch", bank.branch, "");
        setInputValue("bank-account", bank.account, "");
        setInputValue("bank-holder", bank.holder, "");
      }

      // C. 填入發票 (Invoice)
      if (settings.invoice_config) {
        const inv = settings.invoice_config;
        const chk = document.getElementById("invoice-enabled");
        if (chk) chk.checked = inv.enabled === true;

        setInputValue("invoice-mode", inv.mode, "TEST");
        setInputValue("invoice-merchant-id", inv.merchantId, "");

        // HashKey (特殊處理：不預填明文，只顯示 placeholder 提示)
        const hashInput = document.getElementById("invoice-hash-key");
        if (hashInput) {
          if (inv.hashKey) {
            hashInput.placeholder = "******** (已設定，若不修改請留空)";
            hashInput.value = ""; // 密碼欄位保持空白
          } else {
            hashInput.placeholder = "請輸入 Hash Key";
            hashInput.value = "";
          }
        }
      }

      // D. Email
      if (settings.email_config) {
        const em = settings.email_config;
        setInputValue("email-sender-name", em.senderName, "");
        setInputValue("email-sender-addr", em.senderEmail, "");
        const recipientsStr = Array.isArray(em.recipients)
          ? em.recipients.join(", ")
          : "";
        setInputValue("email-recipients", recipientsStr, "");
      }

      // E. 公告
      if (settings.announcement) {
        const ann = settings.announcement;
        const annChk = document.getElementById("announcement-enabled");
        if (annChk) annChk.checked = ann.enabled === true;

        setInputValue("announcement-text", ann.text, "");
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
        loadSettings(); // 重新載入以確保顯示最新狀態
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      alert(`儲存失敗: ${e.message}`);
    }
  }

  // [核心工具] 取得輸入值
  // 由於現在會直接填入 value，此函式可以簡化，直接讀取 value 即可
  function getVal(inputId, fallbackVal, isNumber = false) {
    const el = document.getElementById(inputId);
    if (!el) return isNumber ? 0 : "";

    const userVal = el.value.trim();

    if (userVal !== "") {
      return isNumber ? parseFloat(userVal) : userVal;
    }

    // 如果使用者刻意清空，且有 fallback，則回傳 fallback
    // 但如果是 HashKey 這種特殊欄位，空值代表「不修改」
    if (inputId === "invoice-hash-key") return "";

    return fallbackVal;
  }

  // --- 表單提交監聽 ---

  // (A) 運費
  document.getElementById("form-rates").addEventListener("submit", (e) => {
    e.preventDefault();

    const oldRates = serverSettingsCache.rates_config || SYSTEM_DEFAULTS;
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

    // 抓取所有常數欄位
    document.querySelectorAll('[id^="const-"]').forEach((input) => {
      const key = input.id.replace("const-", "");
      // 若原本有值則用原本的做 fallback (防呆)
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
    // Hash Key 特殊處理：如果輸入框為空，則沿用舊設定
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
    // 如果有輸入內容，則解析；若清空則設為空陣列
    if (rawRecipients !== "") {
      finalRecipients = rawRecipients
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
    } else {
      // 若使用者清空欄位，表示不寄給任何人
      finalRecipients = [];
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
