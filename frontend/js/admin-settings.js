// frontend/js/admin-settings.js (V12 - 智慧回填與局部更新修復版)

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

  // --- [關鍵新增] 全域快取，用於暫存後端回傳的完整設定 ---
  // 這能解決「未修改欄位被清空」以及「敏感資料(如HashKey)不需每次重填」的問題
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
      serverSettingsCache = settings; // 將設定存入快取

      // A. 填入運費 (Rates) - 使用定點回填
      const rates = settings.rates_config || {};
      const cats = rates.categories || {};
      // const consts = rates.constants || {}; // constants 直接遍歷填入

      // 輔助函式：填入單一分類 (包含新增的 description)
      const fillCategory = (key, defaultName) => {
        const c = cats[key] || {};
        setInputValue(`rate-${key}-name`, c.name || defaultName);
        setInputValue(`rate-${key}-desc`, c.description || ""); // [New] 回填說明
        setInputValue(`rate-${key}-weight`, c.weightRate);
        setInputValue(`rate-${key}-volume`, c.volumeRate);
      };

      // 1. 一般家具
      fillCategory("general", "一般家具");
      // 2. 特殊家具 A
      fillCategory("special_a", "特殊家具A");
      // 3. 特殊家具 B
      fillCategory("special_b", "特殊家具B");
      // 4. 特殊家具 C
      fillCategory("special_c", "特殊家具C");

      // 填入常數 (Constants)
      if (rates.constants) {
        for (const [k, v] of Object.entries(rates.constants)) {
          const el = document.getElementById(`const-${k}`);
          if (el) el.value = v;
        }
      }

      // B. 填入銀行 (Bank)
      if (settings.bank_info) {
        const bank = settings.bank_info;
        setInputValue("bank-name", bank.bankName);
        setInputValue("bank-branch", bank.branch);
        setInputValue("bank-account", bank.account);
        setInputValue("bank-holder", bank.holder);
      }

      // C. 填入發票 (Invoice) - [智慧顯示邏輯]
      if (settings.invoice_config) {
        const inv = settings.invoice_config;
        document.getElementById("invoice-enabled").checked =
          inv.enabled === true;
        setInputValue("invoice-mode", inv.mode || "TEST");
        setInputValue("invoice-merchant-id", inv.merchantId);

        // HashKey 特殊處理：若已設定，顯示提示但不顯示明文，讓使用者知道不用重填
        const hashInput = document.getElementById("invoice-hash-key");
        if (hashInput) {
          if (inv.hashKey) {
            hashInput.placeholder = "******** (已設定，若不修改請留空)";
            hashInput.value = ""; // 清空數值，避免顯示
          } else {
            hashInput.placeholder = "請輸入 Hash Key";
          }
        }
      }

      // D. 填入 Email
      if (settings.email_config) {
        const em = settings.email_config;
        setInputValue("email-sender-name", em.senderName);
        setInputValue("email-sender-addr", em.senderEmail);
        setInputValue(
          "email-recipients",
          Array.isArray(em.recipients) ? em.recipients.join(", ") : ""
        );
      }

      // E. 填入公告 (Announcement)
      if (settings.announcement) {
        const ann = settings.announcement;
        document.getElementById("announcement-enabled").checked =
          ann.enabled === true;
        setInputValue("announcement-text", ann.text);
        setInputValue("announcement-color", ann.color || "info");
      }

      // F. 填入偏遠地區 (Remote Areas - JSON)
      if (settings.remote_areas) {
        const jsonStr = JSON.stringify(settings.remote_areas, null, 2);
        setInputValue("remote-areas-json", jsonStr);
      }
    } catch (e) {
      console.error(e);
      alert("載入設定失敗: " + e.message);
    }
  }

  // 輔助：安全填值 (找不到元素不報錯，值為 undefined 填空)
  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.value = value !== undefined && value !== null ? value : "";
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
        // 儲存成功後，重新載入一次設定以更新快取 (特別是 HashKey 狀態)
        loadSettings();
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      alert(`儲存失敗: ${e.message}`);
    }
  }

  // --- 4. 各表單監聽 ---

  // (A) 儲存運費 (包含說明欄位)
  document.getElementById("form-rates").addEventListener("submit", (e) => {
    e.preventDefault();

    // 收集分類數據的輔助函式
    const getCatData = (key, defaultName) => ({
      name: document.getElementById(`rate-${key}-name`).value || defaultName,
      description: document.getElementById(`rate-${key}-desc`).value || "", // [New] 讀取說明
      weightRate:
        parseFloat(document.getElementById(`rate-${key}-weight`).value) || 0,
      volumeRate:
        parseFloat(document.getElementById(`rate-${key}-volume`).value) || 0,
    });

    const newRates = {
      categories: {
        general: getCatData("general", "一般家具"),
        special_a: getCatData("special_a", "特殊家具A"),
        special_b: getCatData("special_b", "特殊家具B"),
        special_c: getCatData("special_c", "特殊家具C"),
      },
      constants: {},
    };

    // 收集 Constants
    document.querySelectorAll('[id^="const-"]').forEach((input) => {
      const key = input.id.replace("const-", "");
      newRates.constants[key] = parseFloat(input.value) || 0;
    });

    saveSetting("rates_config", newRates, "運費費率設定");
  });

  // (B) 儲存銀行
  document.getElementById("form-bank").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      bankName: document.getElementById("bank-name").value,
      branch: document.getElementById("bank-branch").value,
      account: document.getElementById("bank-account").value,
      holder: document.getElementById("bank-holder").value,
    };
    saveSetting("bank_info", data, "銀行匯款資訊");
  });

  // (C) 儲存發票 - [關鍵修正：局部更新邏輯]
  document.getElementById("form-invoice").addEventListener("submit", (e) => {
    e.preventDefault();

    // 檢查使用者是否有輸入新的 Hash Key
    const inputHashKey = document
      .getElementById("invoice-hash-key")
      .value.trim();

    // 智慧判斷：
    // 1. 如果輸入框有值 -> 使用新輸入的值
    // 2. 如果輸入框是空的 -> 使用快取中的舊值 (serverSettingsCache)
    // 這樣使用者就不需要每次都重新翻找並輸入金鑰
    const finalHashKey = inputHashKey
      ? inputHashKey
      : serverSettingsCache.invoice_config?.hashKey || "";

    const data = {
      enabled: document.getElementById("invoice-enabled").checked,
      mode: document.getElementById("invoice-mode").value,
      merchantId: document.getElementById("invoice-merchant-id").value,
      hashKey: finalHashKey, // 使用判斷後的金鑰
    };
    saveSetting("invoice_config", data, "電子發票設定");
  });

  // (D) 儲存 Email
  document.getElementById("form-email").addEventListener("submit", (e) => {
    e.preventDefault();
    const rawRecipients = document.getElementById("email-recipients").value;
    const recipientList = rawRecipients
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);

    const data = {
      senderName: document.getElementById("email-sender-name").value,
      senderEmail: document.getElementById("email-sender-addr").value,
      recipients: recipientList,
    };
    saveSetting("email_config", data, "Email 通知設定");
  });

  // (E) 儲存公告
  document
    .getElementById("form-announcement")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const data = {
        enabled: document.getElementById("announcement-enabled").checked,
        text: document.getElementById("announcement-text").value,
        color: document.getElementById("announcement-color").value,
      };
      saveSetting("announcement", data, "網站公告");
    });

  // (F) 儲存偏遠地區 (JSON)
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
      const jsonObj = JSON.parse(jsonEditor.value);
      if (typeof jsonObj !== "object" || Array.isArray(jsonObj)) {
        throw new Error("根節點必須是物件 (Object)");
      }
      saveSetting("remote_areas", jsonObj, "偏遠地區設定");
    } catch (e) {
      alert("JSON 格式錯誤，無法儲存！\n" + e.message);
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
