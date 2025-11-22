document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settings-form");
  const ratesContainer = document.getElementById("rates-container");
  const token = localStorage.getItem("admin_token");

  if (!token) window.location.href = "admin-login.html";

  // 載入設定
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/config/rates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      renderForm(data.rates);
    }
  } catch (e) {
    alert("載入設定失敗");
  }

  function renderForm(rates) {
    // 渲染 Categories
    ratesContainer.innerHTML = "";
    Object.keys(rates.categories).forEach((key) => {
      const cat = rates.categories[key];
      ratesContainer.innerHTML += `
                <div class="sub-package-item" style="margin-bottom:10px;">
                    <h4>${key}</h4>
                    <div class="form-grid-3">
                        <div class="form-group">
                            <label>名稱</label>
                            <input type="text" name="cat-${key}-name" value="${cat.name}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>重量費率</label>
                            <input type="number" name="cat-${key}-weight" value="${cat.weightRate}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>材積費率</label>
                            <input type="number" name="cat-${key}-volume" value="${cat.volumeRate}" class="form-control">
                        </div>
                    </div>
                </div>
            `;
    });

    // 渲染 Constants
    for (const [k, v] of Object.entries(rates.constants)) {
      const el = document.getElementById(`const-${k}`);
      if (el) el.value = v;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newRates = { categories: {}, constants: {} };

    // 收集 Categories
    ["general", "special_a", "special_b", "special_c"].forEach((key) => {
      newRates.categories[key] = {
        name: document.querySelector(`input[name="cat-${key}-name"]`).value,
        weightRate: parseFloat(
          document.querySelector(`input[name="cat-${key}-weight"]`).value
        ),
        volumeRate: parseFloat(
          document.querySelector(`input[name="cat-${key}-volume"]`).value
        ),
      };
    });

    // 收集 Constants
    document.querySelectorAll('[id^="const-"]').forEach((input) => {
      const key = input.id.replace("const-", "");
      newRates.constants[key] = parseFloat(input.value);
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/config/rates`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rates: newRates }),
      });
      if (res.ok) alert("設定已更新！");
      else alert("更新失敗");
    } catch (e) {
      alert("錯誤: " + e.message);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("admin_token");
    window.location.href = "admin-login.html";
  });
});
