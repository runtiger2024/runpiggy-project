// frontend/js/main.js (V16 - 自動初始化 & 詳細算式)

let currentCalculationResult = null;
let itemIdCounter = 1;

document.addEventListener("DOMContentLoaded", () => {
  loadPublicSettings(); // 載入後端設定
  setupEventListeners(); // 綁定按鈕

  // [關鍵修改] 自動初始化第一個商品輸入卡片，無需點擊
  const firstItem = createItemElement(itemIdCounter);
  document.getElementById("item-list").appendChild(firstItem);

  // 嘗試更新下拉選單 (若資料尚未回來，loadPublicSettings 會再次呼叫)
  updateItemTypeSelects();
});

// --- 1. 設定與載入 ---
async function loadPublicSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rates) {
        window.RATES = data.rates.categories;
        window.CONSTANTS = data.rates.constants;

        // 渲染倉庫資訊 (略，假設 HTML 已有預設值)
        if (data.warehouseInfo) {
          document.getElementById("wh-recipient").textContent =
            data.warehouseInfo.recipient || "小跑豬";
          document.getElementById("wh-address").textContent =
            data.warehouseInfo.address || "載入中...";
        }

        renderRemoteAreaOptions(data.remoteAreas);
        updateItemTypeSelects();
      }
    }
  } catch (e) {
    console.warn("使用預設設定或連線失敗");
  }
}

function renderRemoteAreaOptions(areas) {
  const select = document.getElementById("deliveryLocation");
  if (!select || !areas) return;
  select.innerHTML =
    '<option value="" selected disabled>--- 請選擇配送地區 ---</option>';
  select.innerHTML += '<option value="0">✅ 一般地區 (免加價)</option>';

  // 排序並渲染
  Object.keys(areas)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .forEach((fee) => {
      let html = `<optgroup label="加收 $${fee}">`;
      areas[fee].forEach(
        (area) => (html += `<option value="${fee}">${area}</option>`)
      );
      html += "</optgroup>";
      select.innerHTML += html;
    });
}

function updateItemTypeSelects() {
  if (!window.RATES) return;
  // 產生選項 HTML
  const options = Object.entries(window.RATES)
    .map(
      ([key, val]) =>
        `<option value="${key}">${val.name} (重$${val.weightRate}/kg, 材$${val.volumeRate})</option>`
    )
    .join("");

  // 更新所有已存在的下拉選單
  document.querySelectorAll(".item-type").forEach((sel) => {
    // 如果裡面是空的才填入，避免重置使用者選擇
    if (sel.children.length === 0) sel.innerHTML = options;
  });
}

// --- 2. 建立商品卡片 (HTML 結構與 CSS 配合) ---
function createItemElement(id) {
  const div = document.createElement("div");
  div.className = "item-group card-item";
  div.dataset.id = id;

  // 只有當不是第一個商品時，才顯示刪除按鈕
  const deleteBtn =
    id > 1
      ? `<button type="button" class="btn-remove-item" onclick="this.closest('.card-item').remove()" style="color:#e74c3c; border:none; background:none;"><i class="fas fa-trash"></i></button>`
      : "";

  div.innerHTML = `
    <div class="item-header">
      <span class="item-index"><i class="fas fa-box"></i> 商品 #${id}</span>
      ${deleteBtn}
    </div>
    <div class="item-body">
      <div class="form-group">
        <label>商品名稱</label>
        <input type="text" class="item-name form-control" placeholder="例如：三人座沙發">
      </div>
      <div class="form-group">
        <label>商品種類 (影響費率)</label>
        <select class="item-type form-control"></select>
      </div>
      
      <div class="form-group">
        <div class="calc-method-toggle">
          <label><input type="radio" name="method-${id}" value="dim" checked onchange="toggleMethod(this, ${id})"> 輸入長寬高 (cm)</label>
          <label><input type="radio" name="method-${id}" value="cbm" onchange="toggleMethod(this, ${id})"> 輸入體積 (CBM)</label>
        </div>
        
        <div class="dims-input input-group-3" id="dims-${id}">
          <div class="input-wrap"><input type="number" class="item-l" placeholder="長"><span class="unit">cm</span></div>
          <div class="input-wrap"><input type="number" class="item-w" placeholder="寬"><span class="unit">cm</span></div>
          <div class="input-wrap"><input type="number" class="item-h" placeholder="高"><span class="unit">cm</span></div>
        </div>
        
        <div class="cbm-input" id="cbm-${id}" style="display:none;">
          <div class="input-wrap"><input type="number" class="item-cbm" placeholder="總立方數"><span class="unit">m³</span></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div class="form-group">
          <label>單件重量 (kg)</label>
          <input type="number" class="item-weight form-control" placeholder="0">
        </div>
        <div class="form-group">
          <label>件數</label>
          <input type="number" class="item-qty form-control" value="1" min="1">
        </div>
      </div>
    </div>
  `;
  return div;
}

window.toggleMethod = function (radio, id) {
  document.getElementById(`dims-${id}`).style.display =
    radio.value === "dim" ? "grid" : "none";
  document.getElementById(`cbm-${id}`).style.display =
    radio.value === "cbm" ? "block" : "none";
};

// --- 3. 計算邏輯與 API 呼叫 ---
async function handleCalculate() {
  const items = [];
  const itemEls = document.querySelectorAll(".item-group");
  const locationRate = document.getElementById("deliveryLocation").value;

  if (locationRate === "") {
    alert("請捲動到底部，選擇您的「配送目的地」！");
    document
      .querySelector(".delivery-block")
      .scrollIntoView({ behavior: "smooth" });
    return;
  }

  // 收集數據
  itemEls.forEach((el) => {
    const id = el.dataset.id;
    const method = el.querySelector(`input[name="method-${id}"]:checked`).value;
    items.push({
      name: el.querySelector(".item-name").value || `商品 ${id}`,
      type: el.querySelector(".item-type").value,
      calcMethod: method === "dim" ? "dimensions" : "cbm",
      length: parseFloat(el.querySelector(".item-l").value) || 0,
      width: parseFloat(el.querySelector(".item-w").value) || 0,
      height: parseFloat(el.querySelector(".item-h").value) || 0,
      cbm: parseFloat(el.querySelector(".item-cbm").value) || 0,
      weight: parseFloat(el.querySelector(".item-weight").value) || 0,
      quantity: parseInt(el.querySelector(".item-qty").value) || 1,
    });
  });

  // UI Loading 狀態
  const btn = document.getElementById("btn-calculate");
  const spinner = document.getElementById("loading-spinner");
  const results = document.getElementById("results-container");

  btn.disabled = true;
  btn.textContent = "計算中...";
  spinner.style.display = "block";
  results.style.display = "none";

  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, deliveryLocationRate: locationRate }),
    });
    const data = await res.json();

    if (data.success) {
      renderDetailedResults(data.calculationResult, data.rulesApplied);
    } else {
      alert("計算錯誤: " + data.message);
    }
  } catch (e) {
    alert("無法連線至伺服器，請稍後再試。");
  } finally {
    btn.disabled = false;
    btn.textContent = "開始計算";
    spinner.style.display = "none";
  }
}

function setupEventListeners() {
  document.getElementById("btn-add-item").addEventListener("click", () => {
    itemIdCounter++;
    document
      .getElementById("item-list")
      .appendChild(createItemElement(itemIdCounter));
    updateItemTypeSelects();
  });
  document
    .getElementById("btn-calculate")
    .addEventListener("click", handleCalculate);
}

// --- 4. 渲染結果 (HTML 生成) ---
function renderDetailedResults(result, rules) {
  const container = document.getElementById("results-container");
  const stickyTotal = document.getElementById("sticky-total-price");
  if (stickyTotal)
    stickyTotal.textContent = `$${result.finalTotal.toLocaleString()}`;

  let html = `<h3 style="text-align:center; color:#0056b3; margin-bottom:20px;">📊 費用計算明細表</h3>`;

  // 1. 逐項明細
  result.allItemsData.forEach((item) => {
    // 判斷公式顯示
    let formulaHtml = "";
    if (item.calcMethod === "dimensions") {
      formulaHtml = `<span class="formula-box">(${item.length}x${item.width}x${item.height})÷${rules.VOLUME_DIVISOR}</span>`;
    } else {
      formulaHtml = `<span class="formula-box">${item.cbm} x ${rules.CBM_TO_CAI_FACTOR}</span>`;
    }

    // 判斷誰是贏家
    const isVolWin = item.itemVolumeCost >= item.itemWeightCost;

    html += `
      <div class="result-detail-card">
        <h3>${item.name} <small>x${item.quantity}</small></h3>
        
        <div class="detail-section">
          <h4>1. 數據計算</h4>
          <div class="calc-line"><span>單件重量:</span> <b>${
            item.singleWeight
          } kg</b></div>
          <div class="calc-line"><span>單件材積:</span> <div>${formulaHtml} = <b>${
      item.singleVolume
    } 材</b></div></div>
          <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #eee; font-size:13px; color:#666;">
            總重 ${item.totalWeight} kg / 總材積 ${item.totalVolume} 材
          </div>
        </div>

        <div class="detail-section">
          <h4>2. 費用試算 (取較高者)</h4>
          
          <div class="calc-line ${isVolWin ? "winner" : ""}" style="opacity:${
      isVolWin ? 1 : 0.5
    }">
            <span>材積費 (${item.rateInfo.volumeRate}/材)</span>
            <b>$${item.itemVolumeCost.toLocaleString()}</b>
          </div>
          
          <div class="calc-line ${!isVolWin ? "winner" : ""}" style="opacity:${
      !isVolWin ? 1 : 0.5
    }">
            <span>重量費 (${item.rateInfo.weightRate}/kg)</span>
            <b>$${item.itemWeightCost.toLocaleString()}</b>
          </div>

          <div style="text-align:right; margin-top:10px; font-weight:bold; color:#0056b3;">
            本項小計：$${item.itemFinalCost.toLocaleString()}
          </div>
        </div>
      </div>
    `;
  });

  // 2. 總表
  html += `
    <div class="result-summary-card">
      <h3>💰 費用總結</h3>
      <div class="summary-row">
        <span>基本運費加總</span>
        <span>$${result.initialSeaFreightCost.toLocaleString()}</span>
      </div>
      
      ${
        result.finalSeaFreightCost > result.initialSeaFreightCost
          ? `<div class="summary-row" style="color:#d32f2f; background:#fff5f5;">
           <span>⚠️ 未達低消，以低消計</span>
           <span>$${rules.MINIMUM_CHARGE.toLocaleString()}</span>
         </div>`
          : ""
      }

      <div class="summary-row">
        <span>偏遠地區費 ($${result.remoteAreaRate}/方)</span>
        <span>+$${result.remoteFee.toLocaleString()}</span>
      </div>

      ${
        result.totalOverweightFee > 0
          ? `<div class="summary-row" style="color:#e67e22"><span>⚠️ 超重附加費</span><span>+$${result.totalOverweightFee}</span></div>`
          : ""
      }
      ${
        result.totalOversizedFee > 0
          ? `<div class="summary-row" style="color:#e67e22"><span>⚠️ 超長附加費</span><span>+$${result.totalOversizedFee}</span></div>`
          : ""
      }

      <div class="summary-total">
        總運費：NT$ ${result.finalTotal.toLocaleString()}
      </div>
      
      <div style="padding:0 20px 20px 20px;">
        <button class="btn btn-primary" style="width:100%; background:#e3f2fd; color:#0056b3; border:none;" onclick="window.saveToForecast()">
          <i class="fas fa-box-open"></i> 帶入預報單
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = "block";

  // 平滑滾動至結果
  setTimeout(() => {
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);

  window.currentCalculationResult = result;
}

// 帶入預報功能
window.saveToForecast = function () {
  if (!window.currentCalculationResult) return;
  localStorage.setItem(
    "forecast_draft_list",
    JSON.stringify(window.currentCalculationResult.allItemsData)
  );
  const token = localStorage.getItem("token");
  if (token) {
    window.location.href = "dashboard.html";
  } else {
    if (confirm("您尚未登入。要現在登入以儲存這些預報資料嗎？")) {
      window.location.href = "login.html";
    }
  }
};
