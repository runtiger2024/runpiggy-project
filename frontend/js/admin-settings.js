// frontend/js/admin-settings.js
// V2025.Security - 包含結構預檢查 (Schema Validation)

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  // 1. Tab 切換邏輯
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
    });
  });

  // 2. 初始載入
  await loadSettings();

  // 3. 綁定表單提交
  document.getElementById("form-rates").addEventListener("submit", saveRates);
  document
    .getElementById("form-announcement")
    .addEventListener("submit", saveAnnouncement);
  document.getElementById("form-bank").addEventListener("submit", saveBankInfo);
  document
    .getElementById("form-invoice")
    .addEventListener("submit", saveInvoiceConfig);
  document
    .getElementById("form-email")
    .addEventListener("submit", saveEmailConfig);

  // 4. 綁定新增按鈕
  document.getElementById("btn-add-category").addEventListener("click", () => {
    addCategoryBlock("", {}, true);
  });

  // --- 核心函式 ---

  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const s = data.settings || {};

      // A. 運費設定
      if (s.rates_config) {
        const c = s.rates_config.constants || {};
        const cats = s.rates_config.categories || {};

        setValue("const-MINIMUM_CHARGE", c.MINIMUM_CHARGE);
        setValue("const-VOLUME_DIVISOR", c.VOLUME_DIVISOR);
        setValue("const-CBM_TO_CAI_FACTOR", c.CBM_TO_CAI_FACTOR);
        setValue("const-OVERSIZED_LIMIT", c.OVERSIZED_LIMIT || 300);
        setValue("const-OVERSIZED_FEE", c.OVERSIZED_FEE || 800);
        setValue("const-OVERWEIGHT_LIMIT", c.OVERWEIGHT_LIMIT || 100);
        setValue("const-OVERWEIGHT_FEE", c.OVERWEIGHT_FEE || 800);

        document.getElementById("categories-container").innerHTML = "";
        const order = ["general", "special_a", "special_b", "special_c"];
        const keys = Object.keys(cats).sort((a, b) => {
          const idxA = order.indexOf(a);
          const idxB = order.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });

        keys.forEach((key) => addCategoryBlock(key, cats[key], false));
      }

      // B. 公告
      if (s.announcement) {
        setValue("ann-text", s.announcement.text);
        document.getElementById("ann-enabled").checked = s.announcement.enabled;
        setValue("ann-color", s.announcement.color || "info");
      }

      // C. 銀行
      if (s.bank_info) {
        setValue("bank-name", s.bank_info.bankName);
        setValue("bank-branch", s.bank_info.branch);
        setValue("bank-account", s.bank_info.account);
        setValue("bank-holder", s.bank_info.holder);
      }

      // D. 發票設定 (New)
      if (s.invoice_config) {
        document.getElementById("inv-enabled").checked =
          s.invoice_config.enabled;
        setValue("inv-merchant-id", s.invoice_config.merchantId);
        setValue("inv-hash-key", s.invoice_config.hashKey);
        setValue("inv-mode", s.invoice_config.mode);
      }

      // E. Email 設定 (New)
      if (s.email_config) {
        setValue("email-sender-name", s.email_config.senderName);
        setValue("email-sender-addr", s.email_config.senderEmail);
        const recipients = Array.isArray(s.email_config.recipients)
          ? s.email_config.recipients.join(", ")
          : "";
        setValue("email-recipients", recipients);
      }
    } catch (e) {
      console.error("載入失敗", e);
      alert("載入設定失敗，請檢查 API 連線");
    }
  }

  function addCategoryBlock(key, data, isNew) {
    const container = document.getElementById("categories-container");
    let bgColor = "#fff";
    if (key.includes("special")) bgColor = "#fdfdfe";

    const keyInputHtml = isNew
      ? `<input type="text" class="form-control cat-key text-primary font-weight-bold" placeholder="設定代碼 (如: special_d)" required>`
      : `<input type="text" class="form-control cat-key" value="${key}" disabled style="background:#e9ecef; font-weight:bold;">`;

    const html = `
        <div class="category-block card mb-3" style="border-left: 4px solid #4e73df;">
            <div class="card-body p-3" style="background:${bgColor};">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="font-weight-bold text-primary m-0">類別設定</h6>
                    <i class="fas fa-trash-alt btn-remove-cat" title="刪除此類別" onclick="this.closest('.category-block').remove()"></i>
                </div>
                <div class="row">
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">系統代碼 (Key)</label>
                        ${keyInputHtml}
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">顯示名稱 (Name)</label>
                        <input type="text" class="form-control cat-name" value="${
                          data.name || ""
                        }" required>
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">重量費率 ($/KG)</label>
                        <input type="number" step="0.1" class="form-control cat-weight" value="${
                          data.weightRate || 0
                        }" required>
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">材積費率 ($/材)</label>
                        <input type="number" step="0.1" class="form-control cat-volume" value="${
                          data.volumeRate || 0
                        }" required>
                    </div>
                    <div class="col-12">
                        <label class="small text-muted">前台說明文字 (Description)</label>
                        <input type="text" class="form-control cat-desc" value="${
                          data.description || ""
                        }" placeholder="例如：易碎品、大理石...">
                    </div>
                </div>
            </div>
        </div>
      `;
    container.insertAdjacentHTML("beforeend", html);
  }

  async function saveRates(e) {
    e.preventDefault();
    const constants = {
      MINIMUM_CHARGE: parseFloat(
        document.getElementById("const-MINIMUM_CHARGE").value
      ),
      VOLUME_DIVISOR: parseFloat(
        document.getElementById("const-VOLUME_DIVISOR").value
      ),
      CBM_TO_CAI_FACTOR: parseFloat(
        document.getElementById("const-CBM_TO_CAI_FACTOR").value
      ),
      OVERSIZED_LIMIT:
        parseFloat(document.getElementById("const-OVERSIZED_LIMIT").value) ||
        300,
      OVERSIZED_FEE:
        parseFloat(document.getElementById("const-OVERSIZED_FEE").value) || 800,
      OVERWEIGHT_LIMIT:
        parseFloat(document.getElementById("const-OVERWEIGHT_LIMIT").value) ||
        100,
      OVERWEIGHT_FEE:
        parseFloat(document.getElementById("const-OVERWEIGHT_FEE").value) ||
        800,
    };

    const categories = {};
    let hasError = false;
    document.querySelectorAll(".category-block").forEach((block) => {
      const keyInput = block.querySelector(".cat-key");
      let key = keyInput.value.trim();
      const wRate = parseFloat(block.querySelector(".cat-weight").value);
      const vRate = parseFloat(block.querySelector(".cat-volume").value);

      if (!key) {
        alert("錯誤：有類別未填寫代碼 (Key)");
        hasError = true;
        return;
      }
      if (categories[key]) {
        alert(`錯誤：代碼 ${key} 重複，請修正`);
        hasError = true;
        return;
      }
      // [Security] 數值驗證
      if (isNaN(wRate) || isNaN(vRate) || wRate < 0 || vRate < 0) {
        alert(`錯誤：類別 ${key} 的費率必須為正數`);
        hasError = true;
        return;
      }

      categories[key] = {
        name: block.querySelector(".cat-name").value,
        description: block.querySelector(".cat-desc").value,
        weightRate: wRate,
        volumeRate: vRate,
      };
    });

    if (hasError) return;
    if (
      Object.keys(categories).length === 0 &&
      !confirm("警告：無類別，確定嗎？")
    )
      return;

    await sendUpdate("rates_config", { constants, categories }, "費率設定");
  }

  async function saveAnnouncement(e) {
    e.preventDefault();
    const data = {
      text: document.getElementById("ann-text").value,
      enabled: document.getElementById("ann-enabled").checked,
      color: document.getElementById("ann-color").value,
    };
    await sendUpdate("announcement", data, "公告");
  }

  async function saveBankInfo(e) {
    e.preventDefault();
    const data = {
      bankName: document.getElementById("bank-name").value,
      branch: document.getElementById("bank-branch").value,
      account: document.getElementById("bank-account").value,
      holder: document.getElementById("bank-holder").value,
    };
    if (!data.bankName || !data.account) {
      alert("請填寫銀行名稱與帳號");
      return;
    }
    await sendUpdate("bank_info", data, "銀行資訊");
  }

  async function saveInvoiceConfig(e) {
    e.preventDefault();
    const data = {
      enabled: document.getElementById("inv-enabled").checked,
      merchantId: document.getElementById("inv-merchant-id").value,
      hashKey: document.getElementById("inv-hash-key").value,
      mode: document.getElementById("inv-mode").value,
    };
    await sendUpdate("invoice_config", data, "發票設定");
  }

  async function saveEmailConfig(e) {
    e.preventDefault();
    const rawRecipients = document.getElementById("email-recipients").value;
    const recipients = rawRecipients
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    const data = {
      senderName: document.getElementById("email-sender-name").value,
      senderEmail: document.getElementById("email-sender-addr").value,
      recipients: recipients,
    };
    await sendUpdate("email_config", data, "郵件設定");
  }

  async function sendUpdate(key, value, name) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/${key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        alert(`[${name}] 更新成功！`);
        loadSettings();
      } else {
        const d = await res.json();
        alert(`更新失敗: ${d.message}`);
      }
    } catch (err) {
      alert("連線錯誤");
    }
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }
});
