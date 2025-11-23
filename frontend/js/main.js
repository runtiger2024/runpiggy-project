// frontend/js/main.js (V15 - 淘寶風格與詳細算式版)
// 相依: shippingData.js (預設值), apiConfig.js

// --- 全域變數 ---
let currentCalculationResult = null;
let itemIdCounter = 1;

// --- (1) 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  initializeUsageCounter();
  loadPublicSettings();
  setupEventListeners();
  // 初始化第一張卡片的 Radio 事件
  bindRadioEvents(document.querySelector(".item-group"));
});

function initializeUsageCounter() {
  const el = document.getElementById("usageCount");
  if (!el) return;
  const base = 5000;
  let count = parseInt(localStorage.getItem("usageCount") || base);
  // 每次重新整理隨機增加一點點，模擬人氣
  count += Math.floor(Math.random() * 5) + 1;
  localStorage.setItem("usageCount", count);
  el.textContent = count.toLocaleString();
}

async function loadPublicSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.rates) {
          window.RATES = data.rates.categories;
          window.CONSTANTS = data.rates.constants;
        }
        if (data.remoteAreas) window.REMOTE_AREAS = data.remoteAreas;

        renderAnnouncement(data.announcement);
        renderWarehouseInfo(data.warehouseInfo);
      }
    }
  } catch (e) {
    console.log("載入設定失敗，將使用預設值");
  }

  renderRateTable();
  renderRemoteAreaOptions();
  updateItemTypeSelects();
}

// --- (2) 渲染函式 ---

function renderAnnouncement(ann) {
  const bar = document.getElementById("announcement-bar");
  if (ann && ann.enabled && ann.text) {
    bar.style.display = "block";
    bar.textContent = ann.text;
    const colors = { info: "#1a73e8", warning: "#ff9800", danger: "#d32f2f" };
    bar.style.backgroundColor = colors[ann.color] || colors.info;
  }
}

function renderWarehouseInfo(info) {
  const data = info || {
    address: "广东省东莞市虎门镇龙眼工业路28号139铺",
    recipient: "小跑豬+[您的姓名]",
    phone: "13652554906",
    zip: "523920",
  };
  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setText("wh-address", data.address);
  setText("wh-recipient", data.recipient);
  setText("wh-phone", data.phone);
  setText("wh-zip", data.zip);
}

function renderRateTable() {
  const tbody = document.getElementById("rate-table-body");
  const noteList = document.getElementById("rate-notes-list");
  if (!tbody || !window.RATES) return;

  tbody.innerHTML = "";
  Object.values(window.RATES).forEach((rate) => {
    let desc = "一般傢俱";
    if (rate.name.includes("特殊")) desc = "易碎品/大理石/帶電";

    tbody.innerHTML += `
      <tr>
        <td data-label="類別"><strong>${rate.name}</strong></td>
        <td data-label="說明">${desc}</td>
        <td data-label="重量費率">$${rate.weightRate} / kg</td>
        <td data-label="材積費率">$${rate.volumeRate} / 材</td>
      </tr>
    `;
  });

  if (noteList && window.CONSTANTS) {
    noteList.innerHTML = `
      <li>海運低消 <span class="highlight">$${window.CONSTANTS.MINIMUM_CHARGE}</span></li>
      <li>超長限制 ${window.CONSTANTS.OVERSIZED_LIMIT}cm (費 $${window.CONSTANTS.OVERSIZED_FEE})</li>
      <li>超重限制 ${window.CONSTANTS.OVERWEIGHT_LIMIT}kg (費 $${window.CONSTANTS.OVERWEIGHT_FEE})</li>
    `;
  }
}

function renderRemoteAreaOptions() {
  const select = document.getElementById("deliveryLocation");
  if (!select || !window.REMOTE_AREAS) return;

  let html = `<option value="" selected disabled>--- 選擇配送地區 ---</option>`;
  html += `<option value="0">✅ 一般地區 (免加價)</option>`;

  const sortedFees = Object.keys(window.REMOTE_AREAS).sort((a, b) => a - b);
  sortedFees.forEach((fee) => {
    const areas = window.REMOTE_AREAS[fee];
    html += `<optgroup label="加收 $${fee}">`;
    areas.forEach(
      (area) => (html += `<option value="${fee}">${area}</option>`)
    );
    html += `</optgroup>`;
  });
  select.innerHTML = html;
}

function updateItemTypeSelects() {
  const opts = Object.entries(window.RATES)
    .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
    .join("");
  document.querySelectorAll(".item-type").forEach((sel) => {
    const val = sel.value;
    sel.innerHTML = opts;
    sel.value = val; // 保持使用者原本的選擇
  });
}

// --- (3) 互動邏輯 ---

function setupEventListeners() {
  // 新增商品
  document.getElementById("btn-add-item").addEventListener("click", () => {
    itemIdCounter++;
    const newItem = createItemElement(itemIdCounter);
    document.getElementById("item-list").appendChild(newItem);
    updateItemTypeSelects();
  });

  // 計算按鈕 (綁定兩個位置的按鈕)
  const mainCalcBtn = document.getElementById("btn-calculate");
  if (mainCalcBtn) mainCalcBtn.addEventListener("click", handleCalculate);

  // 複製地址
  const copyBtn = document.getElementById("copyAddressBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const txt = `收件：${
        document.getElementById("wh-recipient").innerText
      }\n電話：${document.getElementById("wh-phone").innerText}\n地址：${
        document.getElementById("wh-address").innerText
      }`;
      navigator.clipboard.writeText(txt).then(() => alert("地址已複製！"));
    });
  }

  // Header 搜尋
  const searchInput = document.getElementById("areaSearch");
  const searchResults = document.getElementById("searchResults");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.trim().toLowerCase();
      if (!term) {
        searchResults.style.display = "none";
        return;
      }

      const matches = [];
      if (window.REMOTE_AREAS) {
        for (const [fee, areas] of Object.entries(window.REMOTE_AREAS)) {
          areas.forEach((area) => {
            if (area.toLowerCase().includes(term)) matches.push({ area, fee });
          });
        }
      }

      if (matches.length > 0) {
        searchResults.innerHTML = matches
          .map(
            (m) =>
              `<div class="search-result-item" onclick="selectRemoteArea('${m.area}', ${m.fee})">
             <span>📍 ${m.area}</span>
             <span style="color:#d32f2f; font-weight:bold;">+$${m.fee}</span>
           </div>`
          )
          .join("");
        searchResults.style.display = "block";
      } else {
        searchResults.style.display = "none";
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".header-search"))
        searchResults.style.display = "none";
    });
  }

  // 配送地區選擇顯示
  const delivSelect = document.getElementById("deliveryLocation");
  if (delivSelect) {
    delivSelect.addEventListener("change", () => {
      const infoBox = document.getElementById("remoteAreaInfo");
      const nameEl = document.getElementById("selectedAreaName");
      const feeEl = document.getElementById("selectedAreaFee");

      if (delivSelect.value !== "") {
        infoBox.style.display = "block";
        const opt = delivSelect.options[delivSelect.selectedIndex];
        // 只取地區名稱，去掉後面的金額提示
        nameEl.textContent = opt.text;
        const fee = parseInt(delivSelect.value);
        feeEl.textContent = fee > 0 ? `+$${fee}` : "免加價";
      } else {
        infoBox.style.display = "none";
      }
    });
  }
}

// 建立商品卡片
function createItemElement(id) {
  const div = document.createElement("div");
  div.className = "item-group card-item";
  div.dataset.id = id;
  div.innerHTML = `
    <div class="item-header">
      <span class="item-index"><i class="fas fa-box"></i> 商品 #${id}</span>
      <button type="button" class="btn-remove-item" onclick="this.closest('.item-group').remove()">
        <i class="fas fa-trash-alt"></i> 刪除
      </button>
    </div>
    <div class="item-body">
      <div class="form-group name-row">
        <label>品名 (選填)</label>
        <input type="text" class="item-name form-control" placeholder="例：椅子">
      </div>
      <div class="form-group type-row">
        <label>種類 <span class="required">*</span></label>
        <select class="item-type form-control"></select>
      </div>
      
      <div class="form-group method-row" style="grid-column: 1/-1;">
        <label>計算方式</label>
        <div class="calc-method-toggle">
          <label><input type="radio" name="calc-method-${id}" value="dimensions" checked> 依尺寸 (長寬高)</label>
          <label><input type="radio" name="calc-method-${id}" value="cbm"> 依體積 (CBM)</label>
        </div>
      </div>

      <div class="dimensions-inputs" style="grid-column: 1/-1;">
        <div class="input-group-3">
          <div class="input-wrap"><input type="number" class="item-length form-control" placeholder="長"><span class="unit">cm</span></div>
          <div class="input-wrap"><input type="number" class="item-width form-control" placeholder="寬"><span class="unit">cm</span></div>
          <div class="input-wrap"><input type="number" class="item-height form-control" placeholder="高"><span class="unit">cm</span></div>
        </div>
      </div>
      
      <div class="cbm-inputs" style="display: none; grid-column: 1/-1;">
        <div class="input-wrap"><input type="number" class="item-cbm form-control" placeholder="立方數"><span class="unit">m³</span></div>
      </div>

      <div class="weight-qty-row" style="grid-column: 1/-1;">
        <div class="form-group" style="flex:1;">
          <label>單件重量 <span class="required">*</span></label>
          <div class="input-wrap"><input type="number" class="item-weight form-control" placeholder="kg"><span class="unit">kg</span></div>
        </div>
        <div class="form-group" style="flex:1;">
          <label>數量</label>
          <div class="qty-control"><input type="number" class="item-quantity form-control" value="1" min="1"></div>
        </div>
      </div>
    </div>
  `;
  bindRadioEvents(div);
  return div;
}

function bindRadioEvents(el) {
  if (!el) return;
  const id = el.dataset.id;
  el.querySelectorAll(`input[name="calc-method-${id}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const val = e.target.value;
      const dimInputs = el.querySelector(".dimensions-inputs");
      const cbmInputs = el.querySelector(".cbm-inputs");
      if (dimInputs)
        dimInputs.style.display = val === "dimensions" ? "block" : "none";
      if (cbmInputs) cbmInputs.style.display = val === "cbm" ? "block" : "none";
    });
  });
}

window.selectRemoteArea = function (name, fee) {
  const select = document.getElementById("deliveryLocation");
  for (let i = 0; i < select.options.length; i++) {
    if (
      select.options[i].value == fee &&
      select.options[i].text.includes(name)
    ) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event("change"));
      document.getElementById("areaSearch").value = name;
      document.getElementById("searchResults").style.display = "none";
      document
        .querySelector(".delivery-block")
        .scrollIntoView({ behavior: "smooth" });
      break;
    }
  }
};

async function handleCalculate() {
  const spinner = document.getElementById("loading-spinner");
  const itemsEl = document.querySelectorAll(".item-group");
  const locationVal = document.getElementById("deliveryLocation").value;

  if (locationVal === "") {
    alert("請選擇配送地區！");
    document
      .querySelector(".delivery-block")
      .scrollIntoView({ behavior: "smooth" });
    return;
  }

  const items = [];
  let valid = true;

  itemsEl.forEach((el) => {
    const id = el.dataset.id;
    const method = el.querySelector(
      `input[name="calc-method-${id}"]:checked`
    ).value;
    const weight = parseFloat(el.querySelector(".item-weight").value);

    if (isNaN(weight) || weight <= 0) {
      valid = false;
    }

    items.push({
      name: el.querySelector(".item-name").value || `商品 #${id}`,
      calcMethod: method,
      length: parseFloat(el.querySelector(".item-length").value) || 0,
      width: parseFloat(el.querySelector(".item-width").value) || 0,
      height: parseFloat(el.querySelector(".item-height").value) || 0,
      cbm: parseFloat(el.querySelector(".item-cbm").value) || 0,
      weight: weight,
      quantity: parseInt(el.querySelector(".item-quantity").value) || 1,
      type: el.querySelector(".item-type").value,
    });
  });

  if (!valid) {
    alert("請填寫正確的重量 (必須大於 0)");
    return;
  }

  spinner.style.display = "flex";
  const errorMsg = document.getElementById("error-message");
  errorMsg.style.display = "none";

  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        deliveryLocationRate: parseFloat(locationVal),
      }),
    });
    const data = await res.json();
    if (data.success) {
      currentCalculationResult = data.calculationResult;
      renderResults(data.calculationResult);
    } else {
      errorMsg.textContent = data.message;
      errorMsg.style.display = "block";
    }
  } catch (e) {
    errorMsg.textContent = "連線失敗，請檢查網路";
    errorMsg.style.display = "block";
  } finally {
    spinner.style.display = "none";
  }
}

// ★★★ 核心：詳細算式渲染 ★★★
function renderResults(result) {
  const container = document.getElementById("results-container");
  const stickyTotal = document.getElementById("sticky-total-price");

  // 更新底部懸浮價格
  if (stickyTotal) {
    stickyTotal.textContent = `NT$ ${result.finalTotal.toLocaleString()}`;
  }

  let html = "";

  // 1. 逐項顯示詳細算式
  result.allItemsData.forEach((item, index) => {
    // 判斷該項目是取材積費還是重量費
    const isVolumeWin = item.itemVolumeCost >= item.itemWeightCost;

    // 建構材積算式字串
    let volumeFormulaHtml = "";
    if (item.calcMethod === "dimensions") {
      volumeFormulaHtml = `
        <div class="calc-line">
          <span class="formula">尺寸換算: (${item.length} x ${item.width} x ${
        item.height
      }) ÷ ${window.CONSTANTS.VOLUME_DIVISOR} = </span>
          <b>${item.singleVolume.toFixed(2)} 材/件</b>
        </div>
      `;
    } else {
      volumeFormulaHtml = `
        <div class="calc-line">
          <span class="formula">CBM換算: ${item.cbm} x ${
        window.CONSTANTS.CBM_TO_CAI_FACTOR
      } = </span>
          <b>${item.singleVolume.toFixed(2)} 材/件</b>
        </div>
      `;
    }

    html += `
      <div class="result-detail-card">
        <h3>
          <i class="fas fa-cube"></i> 第 ${index + 1} 項：${item.name} 
          <span style="float:right; font-size:13px; color:#666;">x ${
            item.quantity
          } 件</span>
        </h3>
        
        <div class="detail-section">
          <h4>1. 數據計算</h4>
          <div class="calc-line">
            <span class="formula">總重量: ${item.singleWeight} kg x ${
      item.quantity
    } = </span>
            <b>${item.totalWeight.toFixed(1)} kg</b>
          </div>
          ${volumeFormulaHtml}
          <div class="calc-line">
            <span class="formula">總材積: ${item.singleVolume} 材 x ${
      item.quantity
    } = </span>
            <b>${item.totalVolume.toFixed(2)} 材</b>
          </div>
        </div>

        <div class="detail-section">
          <h4>2. 運費試算 (取高者)</h4>
          
          <div class="calc-line ${!isVolumeWin ? "winner" : ""}">
            <span class="formula">
              <i class="fas fa-weight-hanging"></i> 重量計費: 
              ${item.totalWeight} kg x $${item.rateInfo.weightRate} = 
            </span>
            <b>$${item.itemWeightCost.toLocaleString()}</b>
            ${
              !isVolumeWin
                ? '<i class="fas fa-check-circle" style="color:#28a745; margin-left:5px;"></i>'
                : ""
            }
          </div>

          <div class="calc-line ${isVolumeWin ? "winner" : ""}">
            <span class="formula">
              <i class="fas fa-ruler-combined"></i> 材積計費: 
              ${item.totalVolume.toFixed(2)} 材 x $${
      item.rateInfo.volumeRate
    } = 
            </span>
            <b>$${item.itemVolumeCost.toLocaleString()}</b>
            ${
              isVolumeWin
                ? '<i class="fas fa-check-circle" style="color:#28a745; margin-left:5px;"></i>'
                : ""
            }
          </div>
        </div>
        
        ${
          item.hasOversizedItem
            ? '<div style="padding:5px 16px; color:#d32f2f; font-size:12px; background:#fff5f5;"><i class="fas fa-exclamation-triangle"></i> 注意：此商品尺寸超長，將產生附加費。</div>'
            : ""
        }
        ${
          item.isOverweight
            ? '<div style="padding:5px 16px; color:#d32f2f; font-size:12px; background:#fff5f5;"><i class="fas fa-exclamation-triangle"></i> 注意：此商品單件超重，將產生附加費。</div>'
            : ""
        }
      </div>
    `;
  });

  // 2. 總結卡片
  html += `
    <div class="result-summary-card">
      <h3><i class="fas fa-receipt"></i> 最終費用明細</h3>
      
      <div class="summary-row">
        <span>基本運費加總</span>
        <span>$${result.initialSeaFreightCost.toLocaleString()}</span>
      </div>

      ${
        result.finalSeaFreightCost > result.initialSeaFreightCost
          ? `<div class="summary-row" style="color:#2e7d32; background:#e8f5e9;">
           <span><i class="fas fa-arrow-up"></i> 未達低消，補至低消</span>
           <span>$${window.CONSTANTS.MINIMUM_CHARGE.toLocaleString()}</span>
         </div>`
          : ""
      }

      ${
        result.remoteFee > 0
          ? `<div class="summary-row">
           <span>
             <i class="fas fa-truck"></i> 偏遠地區派送費<br>
             <small style="color:#999">總材積 ${result.totalCbm.toFixed(
               2
             )} 材 x $${result.remoteAreaRate}/材</small>
           </span>
           <span>$${result.remoteFee.toLocaleString()}</span>
         </div>`
          : ""
      }

      ${
        result.totalOversizedFee > 0
          ? `<div class="summary-row" style="color:#d32f2f;">
           <span>超長附加費</span>
           <span>+$${result.totalOversizedFee.toLocaleString()}</span>
         </div>`
          : ""
      }

      ${
        result.totalOverweightFee > 0
          ? `<div class="summary-row" style="color:#d32f2f;">
           <span>超重附加費</span>
           <span>+$${result.totalOverweightFee.toLocaleString()}</span>
         </div>`
          : ""
      }

      <div class="summary-total">
        <small>預估總運費 (台幣)</small>
        NT$ ${result.finalTotal.toLocaleString()}
      </div>

      <div style="padding: 0 16px 16px 16px;">
        <button class="btn btn-secondary btn-share" onclick="saveToForecast()" style="width:100%; border-radius:24px; background:#333; color:#fff; padding:12px;">
          <i class="fas fa-save"></i> 將試算結果帶入預報單
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = "block";

  // 平滑捲動到結果區
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.saveToForecast = function () {
  if (!currentCalculationResult) return;
  localStorage.setItem(
    "forecast_draft_list",
    JSON.stringify(currentCalculationResult.allItemsData)
  );
  const token = localStorage.getItem("token");
  window.location.href = token ? "dashboard.html" : "login.html";
};
