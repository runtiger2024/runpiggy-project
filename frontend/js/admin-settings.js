// frontend/js/admin-settings.js

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

  // --- 函式區 ---

  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const s = data.settings || {};

      // A. 運費
      if (s.rates_config) {
        const c = s.rates_config.constants || {};
        const cats = s.rates_config.categories || {};

        setValue("const-MINIMUM_CHARGE", c.MINIMUM_CHARGE);
        setValue("const-VOLUME_DIVISOR", c.VOLUME_DIVISOR);
        setValue("const-CBM_TO_CAI_FACTOR", c.CBM_TO_CAI_FACTOR);

        // 動態生成或填入類別
        // 這裡簡化：假設 HTML 只有 general，若要動態生成可擴充
        if (cats.general) {
          setValue("rate-general-weight", cats.general.weightRate);
          setValue("rate-general-volume", cats.general.volumeRate);
        }
        // 如果您有 special_a, special_b 等，請在 HTML 添加對應 ID 並在此填入
        // 為了完整性，這裡示範如何動態處理其他類別
        renderAdditionalCategories(cats);
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
    } catch (e) {
      console.error("載入失敗", e);
    }
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }

  // 動態渲染其他類別費率
  function renderAdditionalCategories(cats) {
    const container = document.getElementById("categories-container");
    // 清除舊的動態內容 (保留第一個靜態的 general)
    // 這裡簡單處理：除了 ID 為 rate-general-weight 的父層外，都視為動態
    // 實際專案中建議全部動態生成，這裡為了配合 HTML 模板做適配

    Object.keys(cats).forEach((key) => {
      if (key === "general") return; // 已在 HTML
      const cat = cats[key];
      const html = `
                <div class="p-3 bg-light rounded mb-3 border category-block" data-key="${key}">
                    <strong>${cat.name || key}</strong>
                    <div class="d-flex gap-3 mt-2">
                        <div style="flex:1"><label class="small text-muted">重量費率</label><input type="number" step="0.1" class="form-control cat-weight" value="${
                          cat.weightRate
                        }"></div>
                        <div style="flex:1"><label class="small text-muted">材積費率</label><input type="number" step="0.1" class="form-control cat-volume" value="${
                          cat.volumeRate
                        }"></div>
                    </div>
                </div>
            `;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  async function saveRates(e) {
    e.preventDefault();

    // 收集常數
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
      OVERSIZED_LIMIT: 300, // 若沒欄位則用預設
      OVERWEIGHT_LIMIT: 100,
      OVERSIZED_FEE: 800,
      OVERWEIGHT_FEE: 800,
    };

    // 收集類別 (一般)
    const categories = {
      general: {
        name: "一般家具",
        weightRate: parseFloat(
          document.getElementById("rate-general-weight").value
        ),
        volumeRate: parseFloat(
          document.getElementById("rate-general-volume").value
        ),
      },
    };

    // 收集動態類別
    document.querySelectorAll(".category-block").forEach((block) => {
      const key = block.dataset.key;
      const w = parseFloat(block.querySelector(".cat-weight").value);
      const v = parseFloat(block.querySelector(".cat-volume").value);
      const name = block.querySelector("strong").innerText;
      categories[key] = { name, weightRate: w, volumeRate: v };
    });

    const data = { constants, categories };
    await sendUpdate("rates_config", data, "費率");
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
    await sendUpdate("bank_info", data, "銀行資訊");
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
      if (res.ok) alert(`[${name}] 設定已更新！`);
      else alert("更新失敗");
    } catch (err) {
      alert("連線錯誤");
    }
  }
});
