// frontend/js/main.js (V18 - 新增分享估價單功能)
// 包含：前端預設值、後端API整合、詳細算式渲染、分享功能

// --- 前端備案設定 (當後端完全掛掉時使用) ---
const fallbackSettings = {
  rates: {
    general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
    special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
    special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
    special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
  },
  constants: {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 2000,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 800,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 800,
  },
  warehouseInfo: {
    address: "广东省东莞市虎门镇龙眼工业路28号139铺",
    recipient: "小跑豬+[您的姓名]",
    phone: "13652554906",
    zip: "523920",
  },
  remoteAreas: {
    0: ["一般地區"], // 至少要有這個選項
  },
};

let currentCalculationResult = null;
let itemIdCounter = 1;

document.addEventListener("DOMContentLoaded", () => {
  loadPublicSettings(); // 嘗試載入後端設定
  setupEventListeners(); // 綁定按鈕

  // 自動初始化第一個商品輸入卡片
  const firstItem = createItemElement(itemIdCounter);
  document.getElementById("item-list").appendChild(firstItem);

  // 先用備案資料渲染一次，避免畫面空白
  window.RATES = fallbackSettings.rates;
  window.CONSTANTS = fallbackSettings.constants;
  window.REMOTE_AREAS = fallbackSettings.remoteAreas;
  updateUIWithSettings(fallbackSettings);
});

// --- 1. 設定與載入 ---
async function loadPublicSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
    if (res.ok) {
      const data = await res.json();
      // 使用後端回傳的資料更新 UI
      if (data.rates) {
        window.RATES = data.rates.categories;
        window.CONSTANTS = data.rates.constants;
      }
      if (data.remoteAreas) window.REMOTE_AREAS = data.remoteAreas;

      updateUIWithSettings({
        warehouseInfo: data.warehouseInfo,
        announcement: data.announcement,
      });
    } else {
      throw new Error("API response not ok");
    }
  } catch (e) {
    console.warn("後端連線失敗，使用前端備案設定:", e);
    // 如果連線失敗，確保 UI 顯示的是備案資料
    updateUIWithSettings(fallbackSettings);
  }
}

// 統一更新 UI 的函式
function updateUIWithSettings(data) {
  // 1. 更新倉庫資訊
  if (data.warehouseInfo) {
    const info = data.warehouseInfo;
    setText(
      "wh-address",
      info.address || fallbackSettings.warehouseInfo.address
    );
    setText(
      "wh-recipient",
      info.recipient || fallbackSettings.warehouseInfo.recipient
    );
    setText("wh-phone", info.phone || fallbackSettings.warehouseInfo.phone);
    setText("wh-zip", info.zip || fallbackSettings.warehouseInfo.zip);
  }

  // 2. 更新公告
  if (data.announcement) {
    renderAnnouncement(data.announcement);
  }

  // 3. 更新費率表與地區選單
  renderRateTable();
  renderRemoteAreaOptions();
  updateItemTypeSelects();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderAnnouncement(ann) {
  const bar = document.getElementById("announcement-bar");
  if (!bar) return;

  if (ann && ann.enabled && ann.text) {
    bar.style.display = "block";
    bar.textContent = ann.text;
    const colors = { info: "#1a73e8", warning: "#ff9800", danger: "#d32f2f" };
    bar.style.backgroundColor = colors[ann.color] || colors.info;
  } else {
    bar.style.display = "none";
  }
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
    if (fee === "0") return;

    const areas = window.REMOTE_AREAS[fee];
    if (Array.isArray(areas) && areas.length > 0) {
      html += `<optgroup label="加收 $${fee}">`;
      areas.forEach(
        (area) => (html += `<option value="${fee}">${area}</option>`)
      );
      html += `</optgroup>`;
    }
  });
  select.innerHTML = html;
}

function updateItemTypeSelects() {
  if (!window.RATES) return;
  const opts = Object.entries(window.RATES)
    .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
    .join("");

  document.querySelectorAll(".item-type").forEach((sel) => {
    const val = sel.value;
    sel.innerHTML = opts;
    if (val) sel.value = val;
  });
}

// --- 2. 建立商品卡片 (HTML 結構) ---
function createItemElement(id) {
  const div = document.createElement("div");
  div.className = "item-group card-item";
  div.dataset.id = id;

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
        <label>商品名稱 (選填)</label>
        <input type="text" class="item-name form-control" placeholder="例如：三人座沙發">
      </div>
      <div class="form-group">
        <label>商品種類 <span class="required">*</span></label>
        <select class="item-type form-control"></select>
      </div>
      
      <div class="form-group">
        <div class="calc-method-toggle">
          <label><input type="radio" name="method-${id}" value="dim" checked onchange="toggleMethod(this, ${id})"> 輸入尺寸 (cm)</label>
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
          <label>單件重量 <span class="required">*</span></label>
          <div class="input-wrap"><input type="number" class="item-weight form-control" placeholder="kg"><span class="unit">kg</span></div>
        </div>
        <div class="form-group">
          <label>數量</label>
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

// --- 3. 計算邏輯 ---
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

  let valid = true;

  itemEls.forEach((el) => {
    const id = el.dataset.id;
    const method = el.querySelector(`input[name="method-${id}"]:checked`).value;
    const weight = parseFloat(el.querySelector(".item-weight").value);

    if (isNaN(weight) || weight <= 0) valid = false;

    items.push({
      name: el.querySelector(".item-name").value || `商品 ${id}`,
      type: el.querySelector(".item-type").value,
      calcMethod: method === "dim" ? "dimensions" : "cbm",
      length: parseFloat(el.querySelector(".item-l").value) || 0,
      width: parseFloat(el.querySelector(".item-w").value) || 0,
      height: parseFloat(el.querySelector(".item-h").value) || 0,
      cbm: parseFloat(el.querySelector(".item-cbm").value) || 0,
      weight: weight,
      quantity: parseInt(el.querySelector(".item-qty").value) || 1,
    });
  });

  if (!valid) {
    alert("請填寫正確的重量 (必須 > 0)");
    return;
  }

  const btn = document.getElementById("btn-calculate");
  const spinner = document.getElementById("loading-spinner");
  const results = document.getElementById("results-container");
  const errorMsg = document.getElementById("error-message");

  btn.disabled = true;
  btn.textContent = "計算中...";
  spinner.style.display = "flex";
  results.style.display = "none";
  errorMsg.style.display = "none";

  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        deliveryLocationRate: parseFloat(locationRate),
      }),
    });
    const data = await res.json();

    if (data.success) {
      currentCalculationResult = data.calculationResult;
      renderDetailedResults(data.calculationResult, data.rulesApplied);
    } else {
      errorMsg.textContent = data.message;
      errorMsg.style.display = "block";
    }
  } catch (e) {
    errorMsg.textContent = "無法連線至伺服器，請檢查網路";
    errorMsg.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "開始計算";
    spinner.style.display = "none";
  }
}

function setupEventListeners() {
  const addBtn = document.getElementById("btn-add-item");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      itemIdCounter++;
      const newItem = createItemElement(itemIdCounter);
      document.getElementById("item-list").appendChild(newItem);
      updateItemTypeSelects();
    });
  }

  const calcBtn = document.getElementById("btn-calculate");
  if (calcBtn) {
    calcBtn.addEventListener("click", handleCalculate);
  }

  const copyBtn = document.getElementById("copyAddressBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const txt = `收件：${
        document.getElementById("wh-recipient").innerText
      }\n電話：${document.getElementById("wh-phone").innerText}\n地址：${
        document.getElementById("wh-address").innerText
      }\n郵編：${document.getElementById("wh-zip").innerText}`;

      navigator.clipboard.writeText(txt).then(() => alert("地址已複製！"));
    });
  }

  const searchInput = document.getElementById("areaSearch");
  const searchResults = document.getElementById("searchResults");

  if (searchInput && searchResults) {
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

  const delivSelect = document.getElementById("deliveryLocation");
  if (delivSelect) {
    delivSelect.addEventListener("change", () => {
      const infoBox = document.getElementById("remoteAreaInfo");
      const nameEl = document.getElementById("selectedAreaName");
      const feeEl = document.getElementById("selectedAreaFee");

      if (delivSelect.value !== "") {
        infoBox.style.display = "block";
        const opt = delivSelect.options[delivSelect.selectedIndex];
        nameEl.textContent = opt.text;
        const fee = parseInt(delivSelect.value);
        feeEl.textContent = fee > 0 ? `(加收 $${fee})` : "(免加價)";
      } else {
        infoBox.style.display = "none";
      }
    });
  }
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

// --- 4. 詳細算式渲染 ---
function renderDetailedResults(result, rules) {
  const container = document.getElementById("results-container");
  const stickyTotal = document.getElementById("sticky-total-price");
  if (stickyTotal)
    stickyTotal.textContent = `$${result.finalTotal.toLocaleString()}`;

  let html = `<h3 style="text-align:center; color:#0056b3; margin-bottom:20px;">📊 費用計算明細表</h3>`;

  // 1. 逐項明細
  result.allItemsData.forEach((item, index) => {
    const isVolWin = item.itemVolumeCost >= item.itemWeightCost;

    let formulaHtml = "";
    if (item.calcMethod === "dimensions") {
      formulaHtml = `<span class="formula-box">(${item.length}x${item.width}x${item.height})÷${rules.VOLUME_DIVISOR}</span>`;
    } else {
      formulaHtml = `<span class="formula-box">${item.cbm} x ${rules.CBM_TO_CAI_FACTOR}</span>`;
    }

    html += `
      <div class="result-detail-card">
        <h3><i class="fas fa-cube"></i> 第 ${index + 1} 項：${
      item.name
    } <small>x${item.quantity}件</small></h3>
        
        <div class="detail-section">
          <h4>1. 數據計算</h4>
          <div class="calc-line">
            <span>單件重量:</span> <b>${item.singleWeight} kg</b>
          </div>
          <div class="calc-line">
            <span>單件材積:</span> <div>${formulaHtml} = <b>${
      item.singleVolume
    } 材</b></div>
          </div>
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
            ${
              isVolWin
                ? '<i class="fas fa-check-circle" style="color:#fa8c16;"></i>'
                : ""
            }
          </div>
          
          <div class="calc-line ${!isVolWin ? "winner" : ""}" style="opacity:${
      !isVolWin ? 1 : 0.5
    }">
            <span>重量費 (${item.rateInfo.weightRate}/kg)</span>
            <b>$${item.itemWeightCost.toLocaleString()}</b>
            ${
              !isVolWin
                ? '<i class="fas fa-check-circle" style="color:#fa8c16;"></i>'
                : ""
            }
          </div>

          <div style="text-align:right; margin-top:10px; font-weight:bold; color:#0056b3;">
            本項小計：$${item.itemFinalCost.toLocaleString()}
          </div>
        </div>
        
        ${
          item.hasOversizedItem
            ? '<div class="alert alert-error" style="margin:10px; font-size:12px;">⚠️ 此商品尺寸超長，整單將加收超長費。</div>'
            : ""
        }
        ${
          item.isOverweight
            ? '<div class="alert alert-error" style="margin:10px; font-size:12px;">⚠️ 此商品單件超重，整單將加收超重費。</div>'
            : ""
        }
      </div>
    `;
  });

  // 2. 總結卡片 (包含分享按鈕)
  html += `
    <div class="result-summary-card">
      <h3>💰 費用總結</h3>
      <div class="summary-row">
        <span>基本運費加總</span>
        <span>$${result.initialSeaFreightCost.toLocaleString()}</span>
      </div>
      
      ${
        result.finalSeaFreightCost > result.initialSeaFreightCost
          ? `<div class="summary-row" style="color:#2e7d32; background:#f6ffed;">
           <span><i class="fas fa-arrow-up"></i> 未達低消，以低消計</span>
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
          ? `<div class="summary-row" style="color:#fa8c16"><span>⚠️ 超重附加費</span><span>+$${result.totalOverweightFee}</span></div>`
          : ""
      }
      ${
        result.totalOversizedFee > 0
          ? `<div class="summary-row" style="color:#fa8c16"><span>⚠️ 超長附加費</span><span>+$${result.totalOversizedFee}</span></div>`
          : ""
      }

      <div class="summary-total">
        <small>預估總運費 (台幣)</small>
        NT$ ${result.finalTotal.toLocaleString()}
      </div>
      
      <div style="padding:0 20px 20px 20px; display: flex; gap: 10px;">
        <button class="btn btn-secondary" style="flex: 1;" onclick="window.saveToForecast()">
          <i class="fas fa-box-open"></i> 帶入預報
        </button>
        <button class="btn btn-outline-primary" style="flex: 1; border-color: var(--color-primary); color: var(--color-primary);" onclick="window.createShareLink()">
          <i class="fas fa-share-alt"></i> 分享結果
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = "block";

  setTimeout(() => {
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);

  window.currentCalculationResult = result;
}

// --- 功能 1: 帶入預報 ---
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

// --- 功能 2: 產生分享連結 (V18.1 - 修復手機版複製問題) ---
window.createShareLink = async function () {
  if (!window.currentCalculationResult) {
    alert("目前沒有試算結果可分享！");
    return;
  }

  // 按鈕防呆
  const shareBtn = document.querySelector(
    ".result-summary-card .btn-outline-primary"
  );
  if (shareBtn) {
    shareBtn.disabled = true;
    shareBtn.textContent = "產生連結中...";
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calculationResult: window.currentCalculationResult,
      }),
    });

    if (!res.ok) {
      throw new Error("無法建立分享連結");
    }

    const data = await res.json();
    const shareUrl = `${window.location.origin}/quote.html?id=${data.id}`;

    // [核心修正] 嘗試自動複製
    // 注意：在 iOS Safari 或部分環境，fetch 後的 writeText 可能會被擋
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        // 情況 A: 瀏覽器允許自動複製 -> 直接成功
        alert("✅ 連結已自動複製！\n您可以直接貼上分享給朋友。");
      })
      .catch((err) => {
        // 情況 B: 自動複製失敗 (常見於手機) -> 呼叫專用彈窗
        console.warn("自動複製被攔截，改用彈窗模式:", err);
        showShareModal(shareUrl);
      });
  } catch (e) {
    alert("分享失敗: " + e.message);
  } finally {
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> 分享結果';
    }
  }
};

// [新增] 專用分享彈窗 (解決手機無法複製的問題)
function showShareModal(url) {
  // 1. 檢查是否已存在，不存在則建立 DOM
  let modal = document.getElementById("share-link-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "share-link-modal";
    modal.className = "modal-overlay";
    modal.style.zIndex = "3000"; // 確保在最上層

    // 彈窗 HTML 結構 (包含輸入框以便手機長按複製)
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <button class="modal-close-btn" onclick="document.getElementById('share-link-modal').style.display='none'">&times;</button>
        <h3 style="margin-top:0; color:var(--primary-color);">🔗 分享連結</h3>
        <p style="color:#666; font-size:14px; margin-bottom:10px;">連結已建立！請點擊按鈕複製：</p>
        
        <div style="display:flex; gap:8px; margin-bottom:15px;">
          <input type="text" id="share-url-input" class="form-control" readonly 
                 style="text-align:center; font-size:13px; background:#f9f9f9; color:#555;" 
                 onclick="this.select();">
        </div>
        
        <button id="btn-manual-copy" class="btn btn-primary">
          <i class="fas fa-copy"></i> 點擊複製連結
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    // 綁定複製按鈕事件 (這是同步點擊，保證成功)
    document.getElementById("btn-manual-copy").addEventListener("click", () => {
      const input = document.getElementById("share-url-input");

      // 選取文字 (相容手機)
      input.select();
      input.setSelectionRange(0, 99999); // For iOS

      // 執行複製
      try {
        // 優先嘗試新 API
        navigator.clipboard.writeText(input.value).then(() => {
          alert("已複製成功！");
          modal.style.display = "none";
        });
      } catch (err) {
        // 舊版 Fallback
        document.execCommand("copy");
        alert("已複製成功！");
        modal.style.display = "none";
      }
    });
  }

  // 2. 更新連結並顯示
  const input = document.getElementById("share-url-input");
  input.value = url;
  modal.style.display = "flex";
}
