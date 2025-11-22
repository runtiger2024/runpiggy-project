// frontend/js/admin-settings.js (V10 旗艦版 - 完整實作)

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

      // A. 填入運費 (Rates)
      if (settings.rates_config) {
        renderRatesForm(settings.rates_config);
      }

      // B. 填入銀行 (Bank)
      if (settings.bank_info) {
        const bank = settings.bank_info;
        document.getElementById("bank-name").value = bank.bankName || "";
        document.getElementById("bank-branch").value = bank.branch || "";
        document.getElementById("bank-account").value = bank.account || "";
        document.getElementById("bank-holder").value = bank.holder || "";
      }

      // C. 填入發票 (Invoice)
      if (settings.invoice_config) {
        const inv = settings.invoice_config;
        document.getElementById("invoice-enabled").checked =
          inv.enabled === true;
        document.getElementById("invoice-mode").value = inv.mode || "TEST";
        document.getElementById("invoice-merchant-id").value =
          inv.merchantId || "";
        // HashKey 不回顯或顯示遮罩，視需求，這裡留空代表不修改
      }

      // D. 填入 Email
      if (settings.email_config) {
        const em = settings.email_config;
        document.getElementById("email-sender-name").value =
          em.senderName || "";
        document.getElementById("email-sender-addr").value =
          em.senderEmail || "";
        document.getElementById("email-recipients").value = Array.isArray(
          em.recipients
        )
          ? em.recipients.join(", ")
          : "";
      }

      // E. 填入公告 (Announcement)
      if (settings.announcement) {
        const ann = settings.announcement;
        document.getElementById("announcement-enabled").checked =
          ann.enabled === true;
        document.getElementById("announcement-text").value = ann.text || "";
        document.getElementById("announcement-color").value =
          ann.color || "info";
      }

      // F. 填入偏遠地區 (Remote Areas - JSON)
      if (settings.remote_areas) {
        // 將物件轉為美化的 JSON 字串
        const jsonStr = JSON.stringify(settings.remote_areas, null, 2);
        document.getElementById("remote-areas-json").value = jsonStr;
      }
    } catch (e) {
      console.error(e);
      alert("載入設定失敗: " + e.message);
    }
  }

  // 輔助：渲染運費表單
  function renderRatesForm(rates) {
    const container = document.getElementById("rates-categories-container");
    container.innerHTML = "";

    // 渲染 Categories
    if (rates.categories) {
      Object.keys(rates.categories).forEach((key) => {
        const cat = rates.categories[key];
        container.innerHTML += `
          <div class="sub-package-item" style="margin-bottom:10px; padding:15px; border:1px solid #eee; border-radius:5px;">
            <h4 style="margin-top:0; color:#1a73e8;">${key} (${cat.name})</h4>
            <div class="form-grid-3">
              <div class="form-group">
                <label>顯示名稱</label>
                <input type="text" name="cat-${key}-name" value="${cat.name}" class="form-control">
              </div>
              <div class="form-group">
                <label>重量費率 ($/kg)</label>
                <input type="number" name="cat-${key}-weight" value="${cat.weightRate}" class="form-control">
              </div>
              <div class="form-group">
                <label>材積費率 ($/材)</label>
                <input type="number" name="cat-${key}-volume" value="${cat.volumeRate}" class="form-control">
              </div>
            </div>
          </div>
        `;
      });
    }

    // 渲染 Constants
    if (rates.constants) {
      for (const [k, v] of Object.entries(rates.constants)) {
        const el = document.getElementById(`const-${k}`);
        if (el) el.value = v;
      }
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

  // (A) 儲存運費
  document.getElementById("form-rates").addEventListener("submit", (e) => {
    e.preventDefault();
    const newRates = { categories: {}, constants: {} };

    // 收集 Categories
    // 假設固定這四種，若要動態增減需更複雜邏輯
    ["general", "special_a", "special_b", "special_c"].forEach((key) => {
      const nameEl = document.querySelector(`input[name="cat-${key}-name"]`);
      if (nameEl) {
        newRates.categories[key] = {
          name: nameEl.value,
          weightRate: parseFloat(
            document.querySelector(`input[name="cat-${key}-weight"]`).value
          ),
          volumeRate: parseFloat(
            document.querySelector(`input[name="cat-${key}-volume"]`).value
          ),
        };
      }
    });

    // 收集 Constants
    document.querySelectorAll('[id^="const-"]').forEach((input) => {
      const key = input.id.replace("const-", "");
      newRates.constants[key] = parseFloat(input.value);
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
      hashKey: document.getElementById("invoice-hash-key").value, // 若為空，後端不會覆蓋
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

  // 格式化按鈕
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

  // 即時檢查
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
      // 簡單驗證結構 (必須是物件)
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
