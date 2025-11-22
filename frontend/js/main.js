// frontend/js/main.js (V4 - 動態設定載入版)
// 功能：試算器邏輯、從後端載入設定(費率/公告/地址)、介面渲染

// --- (1) 計數器邏輯 ---
function initializeUsageCounter() {
  const usageCountSpan = document.getElementById("usageCount");
  if (!usageCountSpan) return;
  const baseCount = 5039;
  let currentCount = localStorage.getItem("usageCount");
  if (currentCount === null) {
    currentCount = baseCount + Math.floor(Math.random() * 50);
  } else {
    currentCount = parseInt(currentCount, 10);
    currentCount += Math.floor(Math.random() * 3) + 1;
  }
  localStorage.setItem("usageCount", currentCount);
  usageCountSpan.textContent = currentCount.toLocaleString();
}

// --- (2) 全域變數 ---
let currentCalculationResult = null;
let itemIdCounter = 1;

// --- (3) 初始化設定 (從後端抓取或使用預設) ---
async function loadPublicSettings() {
  try {
    // 嘗試呼叫公開 API (預留接口，若後端尚未實作，會跳到 catch 使用預設值)
    // 假設 API 路徑為 /api/calculator/config (需後端配合開放)
    const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        // 1. 更新全域變數 (覆蓋 shippingData.js 的預設值)
        if (data.rates) {
          window.RATES = data.rates.categories || window.RATES;
          window.CONSTANTS = data.rates.constants || window.CONSTANTS;
        }
        if (data.remoteAreas) {
          window.REMOTE_AREAS = data.remoteAreas;
        }

        // 2. 渲染公告
        renderAnnouncement(data.announcement);

        // 3. 渲染倉庫資訊
        renderWarehouseInfo(data.warehouseInfo);
      }
    }
  } catch (e) {
    // API 失敗或未實作，靜默失敗，繼續使用 shippingData.js 的預設值
    console.log("使用預設設定 (API 未連線或無資料)");
  }

  // 無論 API 是否成功，都執行渲染
  renderRateTable();
  renderRemoteAreaOptions();
  // 如果 API 沒給倉庫資訊，就用寫死的預設值渲染(或保持 HTML 原樣)
  // 這裡我們為了確保一致性，執行一次預設渲染
  if (!document.getElementById("wh-address").dataset.loaded) {
    renderWarehouseInfo();
  }
}

// --- (4) 渲染函式群 ---

function renderAnnouncement(ann) {
  const bar = document.getElementById("announcement-bar");
  if (ann && ann.enabled && ann.text) {
    bar.style.display = "block";
    bar.textContent = ann.text;

    // 設定顏色
    const colors = {
      info: "#17a2b8",
      warning: "#ffc107",
      danger: "#dc3545",
      success: "#28a745",
    };
    bar.style.backgroundColor = colors[ann.color] || colors.info;
    bar.style.color = ann.color === "warning" ? "#856404" : "white";
  } else {
    bar.style.display = "none";
  }
}

function renderWarehouseInfo(info) {
  // 預設值
  const defaultInfo = {
    address: "广东省东莞市虎门镇龙眼工业路28号139铺+小跑豬+[您的姓名]",
    recipient: "小跑豬+[您的姓名]",
    phone: "13652554906",
    zip: "523920",
  };
  const data = info || defaultInfo;

  const els = {
    addr: document.getElementById("wh-address"),
    recip: document.getElementById("wh-recipient"),
    phone: document.getElementById("wh-phone"),
    zip: document.getElementById("wh-zip"),
  };

  if (els.addr) els.addr.textContent = data.address;
  if (els.recip) els.recip.textContent = data.recipient;
  if (els.phone) els.phone.textContent = data.phone;
  if (els.zip) els.zip.textContent = data.zip;

  // 標記已載入，避免重複覆蓋
  if (els.addr) els.addr.dataset.loaded = "true";
}

function renderRateTable() {
  const tbody = document.getElementById("rate-table-body");
  const notesList = document.getElementById("rate-notes-list");

  if (!tbody || !window.RATES) return;

  tbody.innerHTML = "";

  // 渲染表格
  Object.entries(window.RATES).forEach(([key, rate]) => {
    let desc = "";
    // 簡單對應說明 (這裡可以優化為從後端傳來的 description，目前先用硬編碼對應)
    if (key === "general") desc = "沙發、床架、桌椅、櫃子、書架...";
    else if (key === "special_a") desc = "大理石、岩板、床墊、馬桶、衛浴櫃...";
    else if (key === "special_b") desc = "門、磁磚、玻璃、燈具、建材類...";
    else if (key === "special_c") desc = "智能馬桶、冰箱、帶電大家電...";

    tbody.innerHTML += `
      <tr>
        <td data-label="類別"><strong>${rate.name}</strong></td>
        <td data-label="品項說明">${desc}</td>
        <td data-label="重量收費">${rate.weightRate} 台幣</td>
        <td data-label="材積收費">${rate.volumeRate} 台幣</td>
      </tr>
    `;
  });

  // 更新備註中的常數
  if (notesList && window.CONSTANTS) {
    notesList.innerHTML = `
      <li>海運低消 <span class="highlight">NT.${window.CONSTANTS.MINIMUM_CHARGE}</span> 元</li>
      <li>整票超過 <span class="highlight">${window.CONSTANTS.OVERSIZED_LIMIT}cm</span> 收取超長費 <span class="highlight">NT.${window.CONSTANTS.OVERSIZED_FEE}</span> 元</li>
      <li>整票超過 <span class="highlight">${window.CONSTANTS.OVERWEIGHT_LIMIT}kg</span> 收取超重費 <span class="highlight">NT.${window.CONSTANTS.OVERWEIGHT_FEE}</span> 元</li>
      <li>超重件台灣收件地請自行安排堆高機</li>
    `;
  }

  // 更新下拉選單 (如果有)
  updateItemTypeSelects();
}

function renderRemoteAreaOptions() {
  const select = document.getElementById("deliveryLocation");
  if (!select || !window.REMOTE_AREAS) return;

  let html = `<option value="" selected disabled>--- 請選擇您的配送地區 ---</option>`;
  html += `<option value="0" style="font-weight: bold; color: #27ae60">✅ 一般地區 (無額外費用)</option>`;

  // 排序 key (費用)
  const sortedFees = Object.keys(window.REMOTE_AREAS).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  sortedFees.forEach((fee) => {
    const areas = window.REMOTE_AREAS[fee];
    const feeVal = parseInt(fee);
    let label = `📍 偏遠地區 - NT$${feeVal.toLocaleString()}/方起`;
    let style = "";

    if (feeVal >= 4500) style = `color: #e74c3c`; // 紅色
    else if (feeVal >= 2000) style = `color: #000`;

    // 嘗試依費用分群組名稱 (簡易版)
    if (feeVal === 1800) label = `📍 中部/彰化偏遠 - NT$1,800`;
    else if (feeVal === 2000) label = `📍 北部/桃竹苗偏遠 - NT$2,000`;
    else if (feeVal === 2500) label = `📍 南部/雲嘉南偏遠 - NT$2,500`;
    else if (feeVal === 7000) label = `📍 特別偏遠 (離島/東部) - NT$7,000`;

    html += `<optgroup label="${label}" style="${style}">`;
    areas.forEach((area) => {
      html += `<option value="${fee}">${area}</option>`;
    });
    html += `</optgroup>`;
  });

  select.innerHTML = html;
}

// 更新所有貨物項目的「家具種類」下拉選單
function updateItemTypeSelects() {
  const optionsHtml = Object.entries(window.RATES)
    .map(([key, rate]) => `<option value="${key}">${rate.name}</option>`)
    .join("");

  document.querySelectorAll(".item-type").forEach((select) => {
    // 保存當前選值
    const currentVal = select.value;
    select.innerHTML = optionsHtml;
    // 嘗試恢復選值
    if (select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    }
  });
}

// --- (5) DOMContentLoaded (主程式) ---
document.addEventListener("DOMContentLoaded", () => {
  initializeUsageCounter();
  loadPublicSettings(); // 啟動設定載入

  // --- 獲取元素 ---
  const itemList = document.getElementById("item-list");
  const btnAddItem = document.getElementById("btn-add-item");
  const btnCalculate = document.getElementById("btn-calculate");
  const deliveryLocation = document.getElementById("deliveryLocation");
  const btnCopyAddress = document.getElementById("copyAddressBtn");
  const loadingSpinner = document.getElementById("loading-spinner");
  const errorMessage = document.getElementById("error-message");
  const resultsContainer = document.getElementById("results-container");

  // 搜尋相關
  const areaSearchInput = document.getElementById("areaSearch");
  const searchResultsDiv = document.getElementById("searchResults");

  // --- 事件監聽 ---
  if (btnAddItem) {
    btnAddItem.addEventListener("click", () => {
      itemIdCounter++;
      const newItem = createItemElement(itemIdCounter);
      itemList.appendChild(newItem);
      // 新增項目後，確保下拉選單是最新的
      updateItemTypeSelects();
    });
  }

  if (btnCalculate) {
    btnCalculate.addEventListener("click", handleCalculate);
  }

  if (btnCopyAddress) {
    btnCopyAddress.addEventListener("click", () => {
      // 動態獲取當前顯示的文字
      const addr = document.getElementById("wh-address").textContent;
      const recip = document.getElementById("wh-recipient").textContent;
      const phone = document.getElementById("wh-phone").textContent;
      const zip = document.getElementById("wh-zip").textContent;

      const addressText = `收件地址: ${addr}\n收件人: ${recip}\n手機號碼: ${phone}\n郵遞區號: ${zip}`;

      navigator.clipboard
        .writeText(addressText)
        .then(() => {
          const originalText = btnCopyAddress.textContent;
          btnCopyAddress.textContent = "✓ 已複製成功！";
          btnCopyAddress.style.backgroundColor = "#27ae60";
          setTimeout(() => {
            btnCopyAddress.textContent = originalText;
            btnCopyAddress.style.backgroundColor = "";
          }, 2000);
        })
        .catch((err) => {
          console.error("複製失敗:", err);
          alert("複製失敗，請手動複製");
        });
    });
  }

  // 綁定第一個項目的 radio
  bindRadioEvents(document.querySelector(".item-group"));

  // --- 配送地區相關邏輯 ---

  // 監聽配送地區選擇變更
  deliveryLocation.addEventListener("change", function () {
    const selectedOption = this.options[this.selectedIndex];
    const remoteAreaInfo = document.getElementById("remoteAreaInfo");
    const selectedAreaName = document.getElementById("selectedAreaName");
    const selectedAreaFee = document.getElementById("selectedAreaFee");

    if (this.value === "0") {
      remoteAreaInfo.style.display = "block";
      remoteAreaInfo.style.backgroundColor = "#d4edda";
      remoteAreaInfo.style.borderLeft = "4px solid #28a745";
      selectedAreaName.textContent = "一般地區";
      selectedAreaName.style.color = "#155724";
      selectedAreaFee.textContent = "無額外費用";
      selectedAreaFee.style.color = "#155724";
    } else if (this.value) {
      remoteAreaInfo.style.display = "block";
      const areaText = selectedOption.textContent.trim();
      const feeValue = parseInt(this.value);

      selectedAreaName.textContent = areaText;
      selectedAreaFee.textContent = `NT$ ${feeValue.toLocaleString()} /方起`;

      // 根據費用變色
      if (feeValue >= 5000) {
        remoteAreaInfo.style.backgroundColor = "#f8d7da";
        remoteAreaInfo.style.borderLeft = "4px solid #dc3545";
        selectedAreaName.style.color = "#721c24";
        selectedAreaFee.style.color = "#dc3545";
      } else {
        remoteAreaInfo.style.backgroundColor = "#fff3cd";
        remoteAreaInfo.style.borderLeft = "4px solid #ffc107";
        selectedAreaName.style.color = "#856404";
        selectedAreaFee.style.color = "#e74c3c";
      }
    } else {
      remoteAreaInfo.style.display = "none";
    }
  });

  // 搜尋功能
  areaSearchInput.addEventListener("input", function (e) {
    const searchTerm = e.target.value.trim().toLowerCase();

    if (searchTerm.length < 1) {
      searchResultsDiv.style.display = "none";
      return;
    }

    let results = [];
    // 使用全域變數 window.REMOTE_AREAS
    if (window.REMOTE_AREAS) {
      for (const [fee, areas] of Object.entries(window.REMOTE_AREAS)) {
        areas.forEach((area) => {
          if (area.toLowerCase().includes(searchTerm)) {
            results.push({ area: area, fee: parseInt(fee) });
          }
        });
      }
    }

    if (results.length > 0) {
      searchResultsDiv.style.display = "block";
      searchResultsDiv.innerHTML = results
        .map(
          (r) => `
        <div class="search-result-item" onclick="selectRemoteArea('${
          r.area
        }', ${r.fee})">
          📍 ${r.area} 
          <span style="color: #e74c3c; font-weight: bold; float: right;">
            NT$ ${r.fee.toLocaleString()}/方起
          </span>
        </div>
      `
        )
        .join("");
    } else {
      searchResultsDiv.style.display = "block";
      searchResultsDiv.innerHTML = `
        <div style="padding: 10px; color: #666; background: #f8f9fa;">
          ✅ 找不到 "${searchTerm}"，可能屬於一般地區。
        </div>
      `;
    }
  });

  // 點擊其他地方關閉搜尋結果
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".remote-area-search")) {
      searchResultsDiv.style.display = "none";
    }
  });

  // --- 選擇搜尋結果 (掛載到 window) ---
  window.selectRemoteArea = function (areaName, fee) {
    for (let i = 0; i < deliveryLocation.options.length; i++) {
      const option = deliveryLocation.options[i];
      if (
        option.value === fee.toString() &&
        option.textContent.includes(areaName)
      ) {
        deliveryLocation.selectedIndex = i;
        deliveryLocation.dispatchEvent(new Event("change"));
        areaSearchInput.value = areaName;
        searchResultsDiv.style.display = "none";
        deliveryLocation.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        break;
      }
    }
  };
});

// --- (6) 輔助函式 ---

function bindRadioEvents(itemDiv) {
  if (!itemDiv) return;
  const id = itemDiv.getAttribute("data-id");
  itemDiv
    .querySelectorAll(`input[name="calc-method-${id}"]`)
    .forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const group = e.target.closest(".item-group");
        group.querySelector(".dimensions-inputs").style.display =
          e.target.value === "dimensions" ? "block" : "none";
        group.querySelector(".cbm-inputs").style.display =
          e.target.value === "cbm" ? "block" : "none";
      });
    });
}

function createItemElement(id) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "item-group";
  itemDiv.setAttribute("data-id", id);
  itemDiv.innerHTML = `
    <div class="item-header">
      <h4>貨物 #${id}</h4>
      <button type="button" class="btn-remove-item" data-id="${id}">✕ 刪除</button>
    </div>
    <div class="form-group">
      <label>品名描述</label>
      <input type="text" class="item-name" placeholder="例：書桌">
    </div>
    <div class="form-group calc-method-toggle">
      <label><input type="radio" name="calc-method-${id}" value="dimensions" checked> 依尺寸 (公分)</label>
      <label><input type="radio" name="calc-method-${id}" value="cbm"> 依立方米 (CBM/方)</label>
    </div>
    <div class="dimensions-inputs">
      <div class="form-grid-3">
        <div class="form-group"><label>長 (cm)</label><input type="number" class="item-length" min="0" step="0.1"></div>
        <div class="form-group"><label>寬 (cm)</label><input type="number" class="item-width" min="0" step="0.1"></div>
        <div class="form-group"><label>高 (cm)</label><input type="number" class="item-height" min="0" step="0.1"></div>
      </div>
    </div>
    <div class="cbm-inputs" style="display: none;">
      <div class="form-group"><label>立方米 (CBM/方)</label><input type="number" class="item-cbm" min="0" step="0.01"></div>
    </div>
    <div class="form-grid-2">
      <div class="form-group"><label>單件重量 (kg) <span class="required">*</span></label><input type="number" class="item-weight" min="0.1" step="0.1"></div>
      <div class="form-group"><label>數量 <span class="required">*</span></label><input type="number" class="item-quantity" value="1" min="1"></div>
    </div>
    <div class="form-group">
      <label>家具種類 (影響費率) <span class="required">*</span></label>
      <select class="item-type" id="item-type-select-${id}">
        </select>
    </div>
  `;

  itemDiv.querySelector(".btn-remove-item").addEventListener("click", (e) => {
    e.target.closest(".item-group").remove();
  });

  bindRadioEvents(itemDiv);

  return itemDiv;
}

async function handleCalculate() {
  showLoading(true);
  currentCalculationResult = null;
  const items = [];
  const itemElements = document.querySelectorAll(".item-group");
  let hasError = false;

  itemElements.forEach((itemEl) => {
    const id = itemEl.dataset.id;
    const calcMethod = itemEl.querySelector(
      `input[name="calc-method-${id}"]:checked`
    ).value;
    const weight = parseFloat(itemEl.querySelector(".item-weight").value);

    if (!weight || weight <= 0) {
      showError(`貨物 #${id} 的「重量」是必填欄位且必須 > 0`);
      hasError = true;
    }

    const typeSelect = itemEl.querySelector(".item-type");
    const typeText =
      typeSelect.options[typeSelect.selectedIndex].text.split(" ")[0];

    items.push({
      name: itemEl.querySelector(".item-name").value.trim() || typeText,
      calcMethod: calcMethod,
      length: parseFloat(itemEl.querySelector(".item-length").value) || 0,
      width: parseFloat(itemEl.querySelector(".item-width").value) || 0,
      height: parseFloat(itemEl.querySelector(".item-height").value) || 0,
      cbm: parseFloat(itemEl.querySelector(".item-cbm").value) || 0,
      weight: weight,
      quantity: parseInt(itemEl.querySelector(".item-quantity").value) || 1,
      type: typeSelect.value,
    });
  });

  if (hasError) return;

  const deliveryLocation = document.getElementById("deliveryLocation");
  const rateValue = deliveryLocation.value;
  if (rateValue === "") {
    showError("請選擇「配送地區」！");
    return;
  }

  const requestData = {
    items: items,
    deliveryLocationRate: parseFloat(rateValue),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });
    const result = await response.json();

    if (!response.ok) {
      showError(result.message || "計算失敗，請檢查輸入欄位");
    } else {
      showLoading(false);
      document.getElementById("results-container").style.display = "block";
      document.getElementById("error-message").style.display = "none";
      currentCalculationResult = result.calculationResult;
      displayResults(result.calculationResult, result.rulesApplied);
    }
  } catch (error) {
    console.error("Fetch 或 displayResults 失敗:", error);
    showError(
      `計算失敗 (錯誤: ${error.message})。請檢查後端伺服器是否已啟動。`
    );
  }
}

function showLoading(isLoading) {
  const spinner = document.getElementById("loading-spinner");
  const errorMsg = document.getElementById("error-message");
  const resultsDiv = document.getElementById("results-container");
  const btn = document.getElementById("btn-calculate");

  if (isLoading) {
    spinner.style.display = "block";
    errorMsg.style.display = "none";
    resultsDiv.style.display = "none";
    btn.disabled = true;
    btn.textContent = "計算中...";
  } else {
    spinner.style.display = "none";
    btn.disabled = false;
    btn.textContent = "計算總運費";
  }
}

function showError(message) {
  showLoading(false);
  document.getElementById("results-container").style.display = "none";
  const errorMsg = document.getElementById("error-message");
  errorMsg.style.display = "block";
  errorMsg.textContent = `錯誤：${message}`;
}

function displayResults(calc, rules) {
  let html = "<h2>運費試算結果</h2>";
  calc.allItemsData.forEach((item) => {
    let volumeFormula = "";
    if (item.calcMethod === "dimensions") {
      volumeFormula = `(${item.length}cm × ${item.width}cm × ${item.height}cm) ÷ ${rules.VOLUME_DIVISOR}`;
    } else {
      volumeFormula = `${item.cbm} CBM × ${rules.CBM_TO_CAI_FACTOR}`;
    }
    html += `
      <div class="result-detail-card">
        <h3>[${item.name} × ${item.quantity} 件 - ${item.rateInfo.name}]</h3>
        <div class="detail-section calc-volume">
          <h4>材積計算：</h4>
          <div class="calc-line"><span class="formula">${volumeFormula} = </span><b>${
      item.singleVolume
    } 材/件</b></div>
        </div>
        <div class="detail-section calc-quantity">
          <h4>數量計算：</h4>
          <div class="calc-line">總材積: ${item.singleVolume} 材/件 × ${
      item.quantity
    } 件 = <b>${item.totalVolume} 材</b></div>
          <div class="calc-line">總重量: ${item.singleWeight} kg/件 × ${
      item.quantity
    } 件 = <b>${item.totalWeight} kg</b></div>
        </div>
        <div class="detail-section calc-cost">
          <h4>運費計算：</h4>
          <div class="calc-line">材積費用: ${item.totalVolume} 材 × ${
      item.rateInfo.volumeRate
    } 元/材 = <b>${item.itemVolumeCost.toLocaleString()} 台幣</b></div>
          <div class="calc-line">重量費用: ${item.totalWeight} kg × ${
      item.rateInfo.weightRate
    } 元/kg = <b>${item.itemWeightCost.toLocaleString()} 台幣</b></div>
          <div class="calc-line" style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
            → 基本運費(取較高者): <b>${item.itemFinalCost.toLocaleString()} 台幣</b>
          </div>
        </div>
      </div>
    `;
  });
  html += `
    <div class="result-summary-card">
      <h3>費用彙總</h3>
      <div class="summary-row">
        <span>初步海運費 (所有項目加總)</span>
        <span>${calc.initialSeaFreightCost.toLocaleString()} 元</span>
      </div>
      <div class="summary-row" style="color: ${
        calc.finalSeaFreightCost > calc.initialSeaFreightCost
          ? "#e74c3c"
          : "green"
      };">
        <span>海運費 (含低消 ${rules.MINIMUM_CHARGE} 元)</span>
        <span><b>${calc.finalSeaFreightCost.toLocaleString()} 元</b></span>
      </div>
      <div class="summary-row">
        <span>超重附加費 (>${rules.OVERWEIGHT_LIMIT}kg, 整單)</span>
        <span>${calc.totalOverweightFee.toLocaleString()} 元</span>
      </div>
      <div class="summary-row">
        <span>超長附加費 (>${rules.OVERSIZED_LIMIT}cm, 整單)</span>
        <span>${calc.totalOversizedFee.toLocaleString()} 元</span>
      </div>
      <div class="summary-row">
        <span>偏遠地區費 (${calc.totalCbm.toFixed(2)} 方 × ${
    calc.remoteAreaRate
  })</span>
        <span>${calc.remoteFee.toLocaleString()} 元</span>
      </div>
      <div class="summary-total">
        總金額: NT$ ${calc.finalTotal.toLocaleString()}
        <small>
          (海運費 ${calc.finalSeaFreightCost.toLocaleString()} + 附加費 ${
    calc.totalOverweightFee + calc.totalOversizedFee
  } + 偏遠費 ${calc.remoteFee.toLocaleString()})
        </small>
      </div>
    </div>
  `;

  html += `<button type="button" id="btn-share" class="btn btn-share">產生分享連結 (複製)</button>`;

  const token = localStorage.getItem("token");
  if (!token) {
    html += `<button type="button" id="btn-login-forecast" class="btn btn-primary">登入/註冊 以預報此包裹</button>`;
  } else {
    html += `<button type="button" id="btn-login-forecast" class="btn btn-primary">將此試算存入包裹預報</button>`;
  }

  const resultsContainer = document.getElementById("results-container");
  resultsContainer.innerHTML = html;
  resultsContainer.scrollIntoView({ behavior: "smooth" });

  document
    .getElementById("btn-share")
    .addEventListener("click", handleShareQuote);
  document
    .getElementById("btn-login-forecast")
    .addEventListener("click", handleForecastRedirect);
}

async function handleShareQuote() {
  const shareButton = document.getElementById("btn-share");
  if (!currentCalculationResult) {
    alert("沒有計算結果可分享");
    return;
  }
  shareButton.disabled = true;
  shareButton.textContent = "產生連結中...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calculationResult: currentCalculationResult,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "產生連結失敗");

    const shareUrl = `${window.location.origin}/quote.html?id=${result.id}`;
    await navigator.clipboard.writeText(shareUrl);
    shareButton.textContent = "✓ 連結已複製！";
    shareButton.style.backgroundColor = "#27ae60";
  } catch (error) {
    console.error("分享失敗:", error);
    shareButton.textContent = "產生失敗";
    shareButton.style.backgroundColor = "#e74c3c";
  } finally {
    setTimeout(() => {
      shareButton.disabled = false;
      shareButton.textContent = "產生分享連結 (複製)";
      shareButton.style.backgroundColor = "";
    }, 5000);
  }
}

function handleForecastRedirect() {
  if (!currentCalculationResult || !currentCalculationResult.allItemsData) {
    alert("沒有試算資料可儲存");
    return;
  }
  const allItems = currentCalculationResult.allItemsData;
  if (!allItems || allItems.length === 0) {
    alert("試算資料中沒有項目");
    return;
  }
  localStorage.removeItem("forecast_draft");
  localStorage.removeItem("show_multi_item_warning");
  localStorage.setItem("forecast_draft_list", JSON.stringify(allItems));

  const token = localStorage.getItem("token");
  if (token) {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = "login.html";
  }
}
