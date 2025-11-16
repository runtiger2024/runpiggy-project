// 這是 frontend/js/main.js (V3 - 佇列版)
// (修正「存入預報」功能，改為儲存 "佇列")

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

// --- (2) 全域變數 (分享用) ---
let currentCalculationResult = null;

// --- (3) DOMContentLoaded (主程式) ---
document.addEventListener("DOMContentLoaded", () => {
  // --- (4) 呼叫計數器 ---
  initializeUsageCounter();

  // --- (5) 獲取元素 ---
  const itemList = document.getElementById("item-list");
  const btnAddItem = document.getElementById("btn-add-item");
  const btnCalculate = document.getElementById("btn-calculate");
  const deliveryLocation = document.getElementById("deliveryLocation");
  const btnCopyAddress = document.getElementById("copyAddressBtn");
  const loadingSpinner = document.getElementById("loading-spinner");
  const errorMessage = document.getElementById("error-message");
  const resultsContainer = document.getElementById("results-container");
  let itemIdCounter = 1;

  // --- (6) 綁定事件監聽 ---
  if (btnAddItem) {
    btnAddItem.addEventListener("click", () => {
      itemIdCounter++;
      const newItem = createItemElement(itemIdCounter);
      itemList.appendChild(newItem);
    });
  }
  if (btnCalculate) {
    btnCalculate.addEventListener("click", handleCalculate);
  }
  if (btnCopyAddress) {
    btnCopyAddress.addEventListener("click", () => {
      const addressText = `收件地址: 广东省东莞市虎门镇龙眼工业路28号139铺+小跑猪+[您的姓名]
收件人: 小跑豬+[您的姓名]
手機號碼: 13652554906
郵遞區號: 523920`;
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
  document.querySelectorAll('input[name="calc-method-1"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const group = e.target.closest(".item-group");
      group.querySelector(".dimensions-inputs").style.display =
        e.target.value === "dimensions" ? "block" : "none";
      group.querySelector(".cbm-inputs").style.display =
        e.target.value === "cbm" ? "block" : "none";
    });
  });

  // --- (7) 函式: createItemElement ---
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
        <select class="item-type">
          <option value="general">一般家具 (沙發、床架、桌椅...)</option>
          <option value="special_a">特殊家具A (大理石、岩板、床墊...)</option>
          <option value="special_b">特殊家具B (門、磁磚、玻璃...)</option>
          <option value="special_c">特殊家具C (智能馬桶、冰箱...)</option>
        </select>
      </div>
    `;
    itemDiv.querySelector(".btn-remove-item").addEventListener("click", (e) => {
      e.target.closest(".item-group").remove();
    });
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
    return itemDiv;
  }

  // --- (8) 函式: handleCalculate (呼叫 API) ---
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
      items.push({
        // [*** 邏輯修正 ***]
        // 確保品名有值，如果為空，使用 item-type 的文字
        name:
          itemEl.querySelector(".item-name").value.trim() ||
          itemEl
            .querySelector(".item-type")
            .options[
              itemEl.querySelector(".item-type").selectedIndex
            ].text.split(" ")[0], // 例如 "一般家具"
        calcMethod: calcMethod,
        length: parseFloat(itemEl.querySelector(".item-length").value) || 0,
        width: parseFloat(itemEl.querySelector(".item-width").value) || 0,
        height: parseFloat(itemEl.querySelector(".item-height").value) || 0,
        cbm: parseFloat(itemEl.querySelector(".item-cbm").value) || 0,
        weight: weight,
        quantity: parseInt(itemEl.querySelector(".item-quantity").value) || 1,
        type: itemEl.querySelector(".item-type").value,
      });
    });
    if (hasError) return;
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
        resultsContainer.style.display = "block";
        errorMessage.style.display = "none";
        currentCalculationResult = result.calculationResult;
        displayResults(result.calculationResult, result.rulesApplied);
      }
    } catch (error) {
      console.error("Fetch 或 displayResults 失敗:", error);
      showError(
        `計算失敗 (錯誤: ${error.message})。請檢查後端伺服器 (npm run dev) 是否已啟動並允許 CORS。`
      );
    }
  }

  // --- (9) 函式: showLoading / showError ---
  function showLoading(isLoading) {
    if (isLoading) {
      loadingSpinner.style.display = "block";
      errorMessage.style.display = "none";
      resultsContainer.style.display = "none";
      btnCalculate.disabled = true;
      btnCalculate.textContent = "計算中...";
    } else {
      loadingSpinner.style.display = "none";
      btnCalculate.disabled = false;
      btnCalculate.textContent = "計算總運費";
    }
  }
  function showError(message) {
    showLoading(false);
    resultsContainer.style.display = "none";
    errorMessage.style.display = "block";
    errorMessage.textContent = `錯誤：${message}`;
  }

  // --- (10) 函式: displayResults (美化版) ---
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

    resultsContainer.innerHTML = html;
    resultsContainer.scrollIntoView({ behavior: "smooth" });

    document
      .getElementById("btn-share")
      .addEventListener("click", handleShareQuote);

    document
      .getElementById("btn-login-forecast")
      .addEventListener("click", handleForecastRedirect);
  }

  // --- (11) 函式: handleShareQuote ---
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
      if (!response.ok) {
        throw new Error(result.error || "產生連結失敗");
      }

      const shareUrl = `${window.location.origin}/quote.html?id=${result.id}`;

      await navigator.clipboard.writeText(shareUrl);
      shareButton.textContent = "✓ 連結已複製！";
      shareButton.style.backgroundColor = "#27ae60";
    } catch (error) {
      console.error("分享失敗:", error);
      shareButton.textContent = "產生失敗，請重試";
      shareButton.style.backgroundColor = "#e74c3c";
    } finally {
      setTimeout(() => {
        shareButton.disabled = false;
        shareButton.textContent = "產生分享連結 (複製)";
        shareButton.style.backgroundColor = "";
      }, 5000);
    }
  }

  // --- (12) [*** 關鍵修正 V3 ***] 函式: handleForecastRedirect ---
  function handleForecastRedirect() {
    if (!currentCalculationResult || !currentCalculationResult.allItemsData) {
      alert("沒有試算資料可儲存");
      return;
    }

    const allItems = currentCalculationResult.allItemsData; // 取得所有項目

    if (!allItems || allItems.length === 0) {
      alert("試算資料中沒有項目");
      return;
    }

    // 1. [*** 修正 ***]
    //    清除舊的(單筆)草稿，避免 dashboard.js 混淆
    localStorage.removeItem("forecast_draft");
    localStorage.removeItem("show_multi_item_warning");

    // 2. [*** 修正 ***]
    //    將 "所有" 試算項目存成一個 "佇列 (list)"
    localStorage.setItem("forecast_draft_list", JSON.stringify(allItems));

    // 3. 正常跳轉
    const token = localStorage.getItem("token");
    if (token) {
      window.location.href = "dashboard.html";
    } else {
      window.location.href = "login.html";
    }
  }

  // --- (13) 第一個項目的事件監聽 ---
  document.querySelectorAll('input[name="calc-method-1"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const group = e.target.closest(".item-group");
      group.querySelector(".dimensions-inputs").style.display =
        e.target.value === "dimensions" ? "block" : "none";
      group.querySelector(".cbm-inputs").style.display =
        e.target.value === "cbm" ? "block" : "none";
    });
  });
}); // DOMContentLoaded 結束
