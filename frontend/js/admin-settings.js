// frontend/js/admin-settings.js (V11 - 定點回填版)

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

  // --- 2. 載入設定 (API) ---
  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      const settings = data.settings || {};

      // A. 填入運費 (Rates) - 使用定點回填，不依賴動態渲染
      const rates = settings.rates_config || {};
      const cats = rates.categories || {};
      const consts = rates.constants || {};

      // 1. 一般家具 (general) - 若資料庫無值，預設給空字串或0
      setInputValue("rate-general-name", cats.general?.name || "一般家具");
      setInputValue("rate-general-weight", cats.general?.weightRate);
      setInputValue("rate-general-volume", cats.general?.volumeRate);

      // 2. 特殊家具 A (special_a)
      setInputValue("rate-special_a-name", cats.special_a?.name || "特殊家具A");
      setInputValue("rate-special_a-weight", cats.special_a?.weightRate);
      setInputValue("rate-special_a-volume", cats.special_a?.volumeRate);

      // 3. 特殊家具 B (special_b)
      setInputValue("rate-special_b-name", cats.special_b?.name || "特殊家具B");
      setInputValue("rate-special_b-weight", cats.special_b?.weightRate);
      setInputValue("rate-special_b-volume", cats.special_b?.volumeRate);

      // 4. 特殊家具 C (special_c)
      setInputValue("rate-special_c-name", cats.special_c?.name || "特殊家具C");
      setInputValue("rate-special_c-weight", cats.special_c?.weightRate);
      setInputValue("rate-special_c-volume", cats.special_c?.volumeRate);

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

      // C. 填入發票 (Invoice)
      if (settings.invoice_config) {
        const inv = settings.invoice_config;
        document.getElementById("invoice-enabled").checked =
          inv.enabled === true;
        setInputValue("invoice-mode", inv.mode || "TEST");
        setInputValue("invoice-merchant-id", inv.merchantId);
        // HashKey 不回顯
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
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      alert(`儲存失敗: ${e.message}`);
    }
  }

  // --- 4. 各表單監聽 ---

  // (A) 儲存運費 - 改為定點抓取
  document.getElementById("form-rates").addEventListener("submit", (e) => {
    e.preventDefault();

    // 手動建構資料結構，確保四個類別都在
    const newRates = {
      categories: {
        general: {
          name:
            document.getElementById("rate-general-name").value || "一般家具",
          weightRate:
            parseFloat(document.getElementById("rate-general-weight").value) ||
            0,
          volumeRate:
            parseFloat(document.getElementById("rate-general-volume").value) ||
            0,
        },
        special_a: {
          name:
            document.getElementById("rate-special_a-name").value || "特殊家具A",
          weightRate:
            parseFloat(
              document.getElementById("rate-special_a-weight").value
            ) || 0,
          volumeRate:
            parseFloat(
              document.getElementById("rate-special_a-volume").value
            ) || 0,
        },
        special_b: {
          name:
            document.getElementById("rate-special_b-name").value || "特殊家具B",
          weightRate:
            parseFloat(
              document.getElementById("rate-special_b-weight").value
            ) || 0,
          volumeRate:
            parseFloat(
              document.getElementById("rate-special_b-volume").value
            ) || 0,
        },
        special_c: {
          name:
            document.getElementById("rate-special_c-name").value || "特殊家具C",
          weightRate:
            parseFloat(
              document.getElementById("rate-special_c-weight").value
            ) || 0,
          volumeRate:
            parseFloat(
              document.getElementById("rate-special_c-volume").value
            ) || 0,
        },
      },
      constants: {},
    };

    // 收集 Constants (這部分維持 ID 遍歷即可，因為也是寫死的)
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

  // (C) 儲存發票
  document.getElementById("form-invoice").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      enabled: document.getElementById("invoice-enabled").checked,
      mode: document.getElementById("invoice-mode").value,
      merchantId: document.getElementById("invoice-merchant-id").value,
      hashKey: document.getElementById("invoice-hash-key").value,
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
