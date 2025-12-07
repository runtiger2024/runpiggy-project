// frontend/js/main.js (V21 - Fix Save Logic & Alerts)

// --- 前端備案設定 (僅含公開費率結構，不含個資) ---
// 當後端 API (/api/calculator/config) 無法連線時，前端會使用此設定顯示介面
// [Security] 已移除真實電話與地址，避免洩漏
const fallbackSettings = {
  rates: {
    general: {
      name: "一般家具",
      description: "沙發、床架、桌椅、櫃子、書架...",
      weightRate: 22,
      volumeRate: 125,
    },
    special_a: {
      name: "特殊家具A",
      description:
        "大理石、岩板家具、普通馬桶、床墊、地板、格柵、屏風、浴室架、水龍頭、浴室櫃、臉盆、浴缸...",
      weightRate: 32,
      volumeRate: 184,
    },
    special_b: {
      name: "特殊家具B",
      description:
        "門、磁磚、背景岩板、鏡子、玻璃屏風、智能家具、建材類、燈具、保險箱...",
      weightRate: 40,
      volumeRate: 224,
    },
    special_c: {
      name: "特殊家具C",
      description: "智能馬桶、冰箱、帶電大家電",
      weightRate: 50,
      volumeRate: 274,
    },
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
    address: "請登入系統查看最新倉庫地址",
    recipient: "小跑豬+[您的會員名]",
    phone: "136********", // [Security] 已遮蔽電話
    zip: "523920",
  },
  remoteAreas: { 0: ["一般地區"] },
};

let currentCalculationResult = null;
let itemIdCounter = 1;

document.addEventListener("DOMContentLoaded", () => {
  loadPublicSettings();
  setupEventListeners();

  const firstItem = createItemElement(itemIdCounter);
  document.getElementById("item-list").appendChild(firstItem);

  // 預先載入備案，避免空白
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
      if (data.rates) {
        window.RATES = data.rates.categories;
        window.CONSTANTS = data.rates.constants;
      }
      if (data.remoteAreas) window.REMOTE_AREAS = data.remoteAreas;

      updateUIWithSettings({
        warehouseInfo: data.warehouseInfo,
        announcement: data.announcement,
      });
    }
  } catch (e) {
    console.warn("API連線失敗，使用備案設定:", e);
    // 使用備案設定，但已遮蔽敏感資訊
    updateUIWithSettings(fallbackSettings);
  }
}

function updateUIWithSettings(data) {
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

  if (data.announcement) renderAnnouncement(data.announcement);

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

// [核心修復] 渲染費率表
function renderRateTable() {
  const tbody = document.getElementById("rate-table-body");
  const noteList = document.getElementById("rate-notes-list");
  if (!tbody || !window.RATES) return;

  tbody.innerHTML = "";
  Object.entries(window.RATES).forEach(([key, rate]) => {
    // 防呆邏輯：如果 description 是 undefined 或 "undefined" 字串，使用預設值
    let desc = rate.description;

    // 如果後端沒有回傳說明，根據 key 給予預設文字
    if (!desc || desc === "undefined" || desc.trim() === "") {
      if (key === "general") desc = "一般傢俱";
      else desc = "易碎品/大理石/帶電";
    }

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
      <li>長度超過 ${window.CONSTANTS.OVERSIZED_LIMIT}cm (超長費 $${window.CONSTANTS.OVERSIZED_FEE}/整筆訂單)</li>
      <li>重量超過 ${window.CONSTANTS.OVERWEIGHT_LIMIT}kg (超重費 $${window.CONSTANTS.OVERWEIGHT_FEE}/整筆訂單)</li>
      <li style="color: #d32f2f; font-weight: bold;">⚠️ 若貨物超重(單件>=${window.CONSTANTS.OVERWEIGHT_LIMIT}kg)，請客戶於台灣端自行安排堆高機。</li>
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
      // [關鍵修改] 將後端回傳的 rulesApplied 合併進去，確保保存時有規則
      currentCalculationResult = {
        ...data.calculationResult,
        rulesApplied: data.rulesApplied,
      };
      renderDetailedResults(currentCalculationResult, data.rulesApplied);
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
  if (calcBtn) calcBtn.addEventListener("click", handleCalculate);

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
              `<div class="search-result-item" onclick="selectRemoteArea('${m.area}', ${m.fee})"><span>📍 ${m.area}</span><span style="color:#d32f2f; font-weight:bold;">+$${m.fee}</span></div>`
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

// [核心修改] 渲染明細，並將 undefined 修復為具體數值
function renderDetailedResults(result, rules) {
  const container = document.getElementById("results-container");
  const stickyTotal = document.getElementById("sticky-total-price");
  if (stickyTotal)
    stickyTotal.textContent = `$${result.finalTotal.toLocaleString()}`;

  let html = `<h3 style="text-align:center; color:#0056b3; margin-bottom:20px;">📊 費用計算明細表</h3>`;
  result.allItemsData.forEach((item, index) => {
    const isVolWin = item.itemVolumeCost >= item.itemWeightCost;
    let formulaHtml =
      item.calcMethod === "dimensions"
        ? `<span class="formula-box">(${item.length}x${item.width}x${item.height})÷${rules.VOLUME_DIVISOR}</span>`
        : `<span class="formula-box">${item.cbm} x ${rules.CBM_TO_CAI_FACTOR}</span>`;

    // [New] 構建動態警示訊息 (不再顯示 static text，而是顯示 >= 數值)
    const oversizedLimit = rules.OVERSIZED_LIMIT || 300;
    const overweightLimit = rules.OVERWEIGHT_LIMIT || 100;

    html += `
      <div class="result-detail-card">
        <h3><i class="fas fa-cube"></i> 第 ${index + 1} 項：${
      item.name
    } <small>x${item.quantity}件</small></h3>
        <div class="detail-section">
          <h4>1. 數據計算</h4>
          <div class="calc-line"><span>單件重量:</span> <b>${
            item.singleWeight
          } kg</b></div>
          <div class="calc-line"><span>單件材積:</span> <div>${formulaHtml} = <b>${
      item.singleVolume
    } 材</b></div></div>
          <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #eee; font-size:13px; color:#666;">總重 ${
            item.totalWeight
          } kg / 總材積 ${item.totalVolume} 材</div>
        </div>
        <div class="detail-section">
          <h4>2. 費用試算 (取較高者)</h4>
          <div class="calc-line ${isVolWin ? "winner" : ""}" style="opacity:${
      isVolWin ? 1 : 0.5
    }">
            <span>材積費 (${
              item.rateInfo.volumeRate
            }/材)</span><b>$${item.itemVolumeCost.toLocaleString()}</b>${
      isVolWin
        ? '<i class="fas fa-check-circle" style="color:#fa8c16;"></i>'
        : ""
    }
          </div>
          <div class="calc-line ${!isVolWin ? "winner" : ""}" style="opacity:${
      !isVolWin ? 1 : 0.5
    }">
            <span>重量費 (${
              item.rateInfo.weightRate
            }/kg)</span><b>$${item.itemWeightCost.toLocaleString()}</b>${
      !isVolWin
        ? '<i class="fas fa-check-circle" style="color:#fa8c16;"></i>'
        : ""
    }
          </div>
          <div style="text-align:right; margin-top:10px; font-weight:bold; color:#0056b3;">本項小計：$${item.itemFinalCost.toLocaleString()}</div>
        </div>
        
        ${
          item.hasOversizedItem
            ? `<div class="alert alert-error" style="margin:10px; font-size:13px; font-weight:bold;">⚠️ 此商品尺寸超長 (>= ${oversizedLimit}cm)，整單將加收超長費。</div>`
            : ""
        }
        ${
          item.isOverweight
            ? `<div class="alert alert-error" style="margin:10px; font-size:13px; font-weight:bold;">⚠️ 此商品單件超重 (>= ${overweightLimit}kg)，整單將加收超重費。</div>`
            : ""
        }
      </div>
    `;
  });

  html += `
    <div class="result-summary-card">
      <h3>💰 費用總結</h3>
      <div class="summary-row"><span>基本運費加總</span><span>$${result.initialSeaFreightCost.toLocaleString()}</span></div>
      ${
        result.finalSeaFreightCost > result.initialSeaFreightCost
          ? `<div class="summary-row" style="color:#2e7d32; background:#f6ffed;"><span><i class="fas fa-arrow-up"></i> 未達低消，以低消計</span><span>$${rules.MINIMUM_CHARGE.toLocaleString()}</span></div>`
          : ""
      }
      <div class="summary-row"><span>偏遠地區費 ($${
        result.remoteAreaRate
      }/方)</span><span>+$${result.remoteFee.toLocaleString()}</span></div>
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
      <div class="summary-total"><small>預估總運費 (台幣)</small>NT$ ${result.finalTotal.toLocaleString()}</div>
      <div style="padding:0 20px 20px 20px; display: flex; gap: 10px;">
        <button class="btn btn-secondary" style="flex: 1;" onclick="window.saveToForecast()"><i class="fas fa-box-open"></i> 帶入預報</button>
        <button class="btn btn-outline-primary" style="flex: 1; border-color: var(--color-primary); color: var(--color-primary);" onclick="window.createShareLink()"><i class="fas fa-share-alt"></i> 分享結果</button>
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

window.createShareLink = async function () {
  if (!window.currentCalculationResult) {
    alert("目前沒有試算結果可分享！");
    return;
  }
  const shareBtn = document.querySelector(
    ".result-summary-card .btn-outline-primary"
  );
  if (shareBtn) {
    shareBtn.disabled = true;
    shareBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 連結產生中...';
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calculationResult: window.currentCalculationResult,
      }),
    });
    if (!res.ok) throw new Error("無法建立分享連結 (API Error)");
    const data = await res.json();
    const shareUrl = `${window.location.origin}/quote.html?id=${data.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        alert("✅ 連結已複製！\n您可以直接貼上分享給朋友。");
      })
      .catch((err) => {
        console.warn("自動複製被攔截，改用手動模式:", err);
        showShareModal(shareUrl);
      });
  } catch (e) {
    console.error(e);
    alert("分享失敗，請檢查網路或聯絡管理員。\n錯誤: " + e.message);
  } finally {
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> 分享結果';
    }
  }
};

function showShareModal(url) {
  let modal = document.getElementById("share-link-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "share-link-modal";
    modal.className = "modal-overlay";
    modal.style.zIndex = "9999";
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center; padding: 25px;">
        <button class="modal-close-btn" type="button" onclick="document.getElementById('share-link-modal').style.display='none'">&times;</button>
        <div style="margin-bottom: 15px;"><i class="fas fa-link" style="font-size: 40px; color: var(--color-primary);"></i></div>
        <h3 style="margin: 0 0 10px 0; color: #333;">分享連結已建立</h3>
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;">由於瀏覽器安全限制，請點擊下方按鈕複製，<br>或是長按輸入框選取文字。</p>
        <div style="position: relative; margin-bottom: 20px;">
          <input type="text" id="share-url-input" class="form-control" readonly style="text-align: center; font-size: 14px; padding-right: 40px; background: #f8f9fa; border: 1px solid #ddd; color: #1a73e8; font-weight: bold;" onclick="this.select();">
        </div>
        <button id="btn-manual-copy" class="btn btn-primary" style="width: 100%; padding: 12px; font-size: 16px;"><i class="far fa-copy"></i> 點擊複製連結</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("btn-manual-copy").addEventListener("click", () => {
      const input = document.getElementById("share-url-input");
      input.select();
      input.setSelectionRange(0, 99999);
      try {
        navigator.clipboard
          .writeText(input.value)
          .then(() => {
            alert("✅ 複製成功！");
            document.getElementById("share-link-modal").style.display = "none";
          })
          .catch(() => {
            document.execCommand("copy");
            alert("✅ 複製成功！");
            document.getElementById("share-link-modal").style.display = "none";
          });
      } catch (err) {
        alert("請長按輸入框內的網址進行手動複製。");
      }
    });
  }
  const input = document.getElementById("share-url-input");
  if (input) input.value = url;
  modal.style.display = "flex";
}
