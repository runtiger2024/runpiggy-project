// frontend/js/main.js (V13 - 修正版)
// 相依: shippingData.js (預設值), apiConfig.js

// --- 全域變數 ---
let currentCalculationResult = null;
let itemIdCounter = 1;

// --- (1) 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  initializeUsageCounter();
  loadPublicSettings();
  setupEventListeners();
  bindRadioEvents(document.querySelector(".item-group"));
});

function initializeUsageCounter() {
  const el = document.getElementById("usageCount");
  if (!el) return;
  const base = 5000;
  let count = parseInt(localStorage.getItem("usageCount") || base);
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
    console.log("使用預設設定");
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

// [關鍵修正] 渲染費率表，加入 data-label 供 CSS 手機版使用
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
        <td data-label="品項說明">${desc}</td>
        <td data-label="重量收費">$${rate.weightRate} / kg</td>
        <td data-label="材積收費">$${rate.volumeRate} / 材</td>
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

  let html = `<option value="" selected disabled>--- 選擇地區 ---</option>`;
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
    sel.value = val;
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

  // 計算按鈕
  const mainCalcBtn = document.getElementById("btn-calculate");
  if (mainCalcBtn) mainCalcBtn.addEventListener("click", handleCalculate);

  // 複製地址
  document.getElementById("copyAddressBtn").addEventListener("click", () => {
    const txt = `收件：${
      document.getElementById("wh-recipient").innerText
    }\n電話：${document.getElementById("wh-phone").innerText}\n地址：${
      document.getElementById("wh-address").innerText
    }`;
    navigator.clipboard.writeText(txt).then(() => alert("地址已複製！"));
  });

  // Header 搜尋
  const searchInput = document.getElementById("areaSearch");
  const searchResults = document.getElementById("searchResults");

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

  // 配送地區選擇顯示
  const delivSelect = document.getElementById("deliveryLocation");
  delivSelect.addEventListener("change", () => {
    const infoBox = document.getElementById("remoteAreaInfo");
    const nameEl = document.getElementById("selectedAreaName");
    const feeEl = document.getElementById("selectedAreaFee");

    if (delivSelect.value !== "") {
      infoBox.style.display = "block";
      const opt = delivSelect.options[delivSelect.selectedIndex];
      nameEl.textContent = opt.text;
      const fee = parseInt(delivSelect.value);
      feeEl.textContent = fee > 0 ? `+$${fee}` : "免加價";
    } else {
      infoBox.style.display = "none";
    }
  });
}

// 建立商品卡片
function createItemElement(id) {
  const div = document.createElement("div");
  div.className = "item-group card-item";
  div.dataset.id = id;
  div.innerHTML = `
    <div class="item-header">
      <span class="item-index">商品 #${id}</span>
      <button type="button" class="btn-remove-item" onclick="this.closest('.item-group').remove()">
        <i class="fas fa-trash"></i> 刪除
      </button>
    </div>
    <div class="item-body">
      <div class="form-group name-row">
        <label>品名</label>
        <input type="text" class="item-name" placeholder="例：椅子">
      </div>
      <div class="form-group type-row">
        <label>種類 <span class="required">*</span></label>
        <select class="item-type"></select>
      </div>
      <div class="form-group method-row">
        <div class="calc-method-toggle">
          <label><input type="radio" name="calc-method-${id}" value="dimensions" checked> 尺寸</label>
          <label><input type="radio" name="calc-method-${id}" value="cbm"> 體積</label>
        </div>
      </div>
      <div class="dimensions-inputs">
        <div class="input-group-3">
          <div class="input-wrap"><input type="number" class="item-length" placeholder="長"><span class="unit">cm</span></div>
          <div class="input-wrap"><input type="number" class="item-width" placeholder="寬"><span class="unit">cm</span></div>
          <div class="input-wrap"><input type="number" class="item-height" placeholder="高"><span class="unit">cm</span></div>
        </div>
      </div>
      <div class="cbm-inputs" style="display: none;">
        <div class="input-wrap"><input type="number" class="item-cbm" placeholder="立方數"><span class="unit">m³</span></div>
      </div>
      <div class="weight-qty-row">
        <div class="form-group">
          <label>單重 <span class="required">*</span></label>
          <div class="input-wrap"><input type="number" class="item-weight" placeholder="kg"><span class="unit">kg</span></div>
        </div>
        <div class="form-group">
          <label>數量</label>
          <div class="qty-control"><input type="number" class="item-quantity" value="1" min="1"></div>
        </div>
      </div>
    </div>
  `;
  bindRadioEvents(div);
  return div;
}

function bindRadioEvents(el) {
  const id = el.dataset.id;
  el.querySelectorAll(`input[name="calc-method-${id}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const val = e.target.value;
      el.querySelector(".dimensions-inputs").style.display =
        val === "dimensions" ? "block" : "none";
      el.querySelector(".cbm-inputs").style.display =
        val === "cbm" ? "block" : "none";
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
    document.querySelector(".delivery-block").scrollIntoView();
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
    if (!weight || weight <= 0) valid = false;

    items.push({
      name: el.querySelector(".item-name").value || "未命名",
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
    alert("請填寫正確的重量");
    return;
  }

  spinner.style.display = "flex";
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
      alert(data.message);
    }
  } catch (e) {
    alert("計算服務連線失敗");
  } finally {
    spinner.style.display = "none";
  }
}

function renderResults(result) {
  const container = document.getElementById("results-container");
  const stickyTotal = document.getElementById("sticky-total-price");
  if (stickyTotal)
    stickyTotal.textContent = `NT$ ${result.finalTotal.toLocaleString()}`;

  let html = `
    <div class="result-summary-card">
      <h3><i class="fas fa-receipt"></i> 費用明細</h3>
      <div class="summary-row"><span>基本運費</span><span>$${result.initialSeaFreightCost.toLocaleString()}</span></div>
      <div class="summary-row"><span>偏遠地區費</span><span>$${result.remoteFee.toLocaleString()}</span></div>
      ${
        result.totalOverweightFee > 0
          ? `<div class="summary-row danger"><span>超重費</span><span>$${result.totalOverweightFee}</span></div>`
          : ""
      }
      ${
        result.totalOversizedFee > 0
          ? `<div class="summary-row danger"><span>超長費</span><span>$${result.totalOversizedFee}</span></div>`
          : ""
      }
      <div class="summary-total">
        總計：NT$ ${result.finalTotal.toLocaleString()}
      </div>
      <button class="btn btn-secondary btn-share" onclick="saveToForecast()">
        <i class="fas fa-save"></i> 將此結果帶入包裹預報
      </button>
    </div>
  `;
  container.innerHTML = html;
  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth" });
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
