// 這是 frontend/js/quote.js (已修復 API_BASE_URL)
// 負責處理 quote.html 頁面

document.addEventListener("DOMContentLoaded", () => {
  // (1) 取得 URL 中的 ?id=...
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get("id");

  const loadingSpinner = document.getElementById("loading-spinner");
  const errorMessage = document.getElementById("error-message");
  const resultsContainer = document.getElementById("results-container");

  // (2) 定義靜態規則 (因為後端只存了 'calculationResult'，沒有存 'rules')
  //     (這與 public/quote.js 的邏輯一致)
  const rules = {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 2000,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 800,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 800,
  };

  if (!quoteId) {
    showError("錯誤：找不到估價單 ID。");
    return;
  }

  // (3) 呼叫後端 API 取得資料
  fetchQuoteData(quoteId);

  async function fetchQuoteData(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quotes/${id}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "找不到估價單");
      }

      // (4) 成功，顯示結果
      showLoading(false);
      resultsContainer.style.display = "block";

      // (5) 呼叫和 main.js 一模一樣的 "顯示函式"
      displayResults(result.calculationResult, rules, result.createdAt);
    } catch (error) {
      showError(error.message);
    }
  }

  function showLoading(isLoading) {
    loadingSpinner.style.display = isLoading ? "block" : "none";
  }

  function showError(message) {
    showLoading(false);
    errorMessage.style.display = "block";
    errorMessage.textContent = `錯誤：${message}`;
  }

  // (6) 複製 main.js 的 displayResults 函式
  function displayResults(calc, rules, createdAt) {
    let html = `<h2>運費估價單 (建立於: ${new Date(
      createdAt
    ).toLocaleDateString()})</h2>`;

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
    resultsContainer.innerHTML = html;
  }
});
