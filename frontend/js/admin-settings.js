// frontend/js/admin-settings.js (V13 - 灰色預覽與智慧回填版)

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
      // 移除所有 active
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      // 加上當前 active
      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
    });
  });

  // --- [核心] 全域設定快取 (用於回填與比對) ---
  let serverSettingsCache = {};

  // --- 2. 載入設定 (API) ---
  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      const settings = data.settings || {};
      serverSettingsCache = settings; // 將原始資料存入快取

      // A. 填入運費 (Rates)
      const rates = settings.rates_config || {};
      const cats = rates.categories || {};

      // 輔助函式：設定 Placeholder (顯示目前數值) 並清空 Value
      const setPlaceholder = (id, currentVal, defaultText) => {
        const el = document.getElementById(id);
        if (el) {
          const displayVal =
            currentVal !== undefined && currentVal !== null ? currentVal : "";
          el.placeholder = displayVal || defaultText || "未設定";
          el.value = ""; // 確保輸入框是空的，顯示灰字
        }
      };

      // 1. 一般家具
      setPlaceholder("rate-general-name", cats.general?.name, "一般家具");
      setPlaceholder("rate-general-desc", cats.general?.description, "無說明");
      setPlaceholder("rate-general-weight", cats.general?.weightRate, "0");
      setPlaceholder("rate-general-volume", cats.general?.volumeRate, "0");

      // 2. 特殊家具 A
      setPlaceholder("rate-special_a-name", cats.special_a?.name, "特殊家具A");
      setPlaceholder(
        "rate-special_a-desc",
        cats.special_a?.description,
        "無說明"
      );
      setPlaceholder("rate-special_a-weight", cats.special_a?.weightRate, "0");
      setPlaceholder("rate-special_a-volume", cats.special_a?.volumeRate, "0");

      // 3. 特殊家具 B
      setPlaceholder("rate-special_b-name", cats.special_b?.name, "特殊家具B");
      setPlaceholder(
        "rate-special_b-desc",
        cats.special_b?.description,
        "無說明"
      );
      setPlaceholder("rate-special_b-weight", cats.special_b?.weightRate, "0");
      setPlaceholder("rate-special_b-volume", cats.special_b?.volumeRate, "0");

      // 4. 特殊家具 C
      setPlaceholder("rate-special_c-name", cats.special_c?.name, "特殊家具C");
      setPlaceholder(
        "rate-special_c-desc",
        cats.special_c?.description,
        "無說明"
      );
      setPlaceholder("rate-special_c-weight", cats.special_c?.weightRate, "0");
      setPlaceholder("rate-special_c-volume", cats.special_c?.volumeRate, "0");

      // 填入常數 (Constants)
      if (rates.constants) {
        for (const [k, v] of Object.entries(rates.constants)) {
          setPlaceholder(`const-${k}`, v, "0");
        }
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
        // Checkbox 直接設定狀態
        const chk = document.getElementById("invoice-enabled");
        if (chk) chk.checked = inv.enabled === true;

        setPlaceholder("invoice-mode", inv.mode, "TEST");
        setPlaceholder("invoice-merchant-id", inv.merchantId, "");

        // HashKey 特殊處理
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

      // E. 公告 (Announcement)
      if (settings.announcement) {
        const ann = settings.announcement;
        const annChk = document.getElementById("announcement-enabled");
        if (annChk) annChk.checked = ann.enabled === true;

        setPlaceholder("announcement-text", ann.text, "");
        // Select 下拉選單不能用 placeholder，必須直接選中值
        const colorSel = document.getElementById("announcement-color");
        if (colorSel) colorSel.value = ann.color || "info";
      }

      // F. 偏遠地區 (JSON Editor)
      // JSON 編輯器特殊，建議直接顯示內容以便編輯，因為 placeholder 難以閱讀長 JSON
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

  // --- 3. 儲存邏輯 (共用函式) ---
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
        // 儲存成功後重新載入，讓輸入框清空並更新 Placeholder 為新值
        loadSettings();
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      alert(`儲存失敗: ${e.message}`);
    }
  }

  // --- [核心工具] 取得輸入值或回退快取值 ---
  // 如果 input 有值 -> 使用 input 值
  // 如果 input 空白 -> 使用 cache 中的舊值 (fallback)
  function getVal(inputId, fallbackVal, isNumber = false) {
    const el = document.getElementById(inputId);
    if (!el) return isNumber ? 0 : "";

    const userVal = el.value.trim();
    if (userVal !== "") {
      return isNumber ? parseFloat(userVal) : userVal;
    }
    // 如果使用者沒填，回傳 fallback
    return fallbackVal;
  }

  // --- 4. 各表單監聽 ---

  // (A) 儲存運費
  document.getElementById("form-rates").addEventListener("submit", (e) => {
    e.preventDefault();

    // 從快取中取得舊資料結構，避免 undefined
    const oldRates = serverSettingsCache.rates_config || {};
    const oldCats = oldRates.categories || {};
    const oldConsts = oldRates.constants || {};

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

    // 收集 Constants
    document.querySelectorAll('[id^="const-"]').forEach((input) => {
      const key = input.id.replace("const-", "");
      const oldVal = oldConsts[key] !== undefined ? oldConsts[key] : 0;
      newRates.constants[key] = getVal(input.id, oldVal, true);
    });

    saveSetting("rates_config", newRates, "運費費率設定");
  });

  // (B) 儲存銀行
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

  // (C) 儲存發票
  document.getElementById("form-invoice").addEventListener("submit", (e) => {
    e.preventDefault();
    const old = serverSettingsCache.invoice_config || {};

    const data = {
      enabled: document.getElementById("invoice-enabled").checked,
      mode: getVal("invoice-mode", old.mode),
      merchantId: getVal("invoice-merchant-id", old.merchantId),
      hashKey: getVal("invoice-hash-key", old.hashKey), // 自動處理 HashKey 留空回填
    };
    saveSetting("invoice_config", data, "電子發票設定");
  });

  // (D) 儲存 Email
  document.getElementById("form-email").addEventListener("submit", (e) => {
    e.preventDefault();
    const old = serverSettingsCache.email_config || {};

    // 處理 Recipient List (字串轉陣列)
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

  // (E) 儲存公告
  document
    .getElementById("form-announcement")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const old = serverSettingsCache.announcement || {};

      const data = {
        enabled: document.getElementById("announcement-enabled").checked,
        text: getVal("announcement-text", old.text),
        color: document.getElementById("announcement-color").value, // Select 一定有值
      };
      saveSetting("announcement", data, "網站公告");
    });

  // (F) 偏遠地區 JSON (保持原樣，因為直接顯示內容編輯)
  const jsonEditor = document.getElementById("remote-areas-json");
  const jsonMsg = document.getElementById("json-validation-msg");

  document.getElementById("btn-format-json").addEventListener("click", () => {
    try {
      const val = JSON.parse(jsonEditor.value);
      jsonEditor.value = JSON.stringify(val, null, 2);
      jsonMsg.textContent = "格式正確 ✓";
      jsonMsg.className = "json-status json-valid";
    } catch (e) {
      alert("JSON 格式錯誤，無法格式化");
    }
  });

  jsonEditor.addEventListener("input", () => {
    try {
      JSON.parse(jsonEditor.value);
      jsonMsg.textContent = "格式正確 ✓";
      jsonMsg.className = "json-status json-valid";
    } catch (e) {
      jsonMsg.textContent = "格式錯誤 ✕ : " + e.message;
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

  // 登出
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("登出?")) {
      localStorage.removeItem("admin_token");
      window.location.href = "admin-login.html";
    }
  });

  // 啟動
  loadSettings();
});
