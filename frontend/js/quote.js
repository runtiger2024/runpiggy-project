// frontend/js/quote.js (V16 - 一致化樣式)

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get("id");
  const container = document.getElementById("results-container");
  const loading = document.getElementById("loading-spinner");
  const errorBox = document.getElementById("error-message");

  // 靜態規則備份 (若後端未回傳 rules)
  const DEFAULT_RULES = {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 2000,
  };

  if (!quoteId) {
    loading.style.display = "none";
    errorBox.textContent = "無效的連結";
    errorBox.style.display = "block";
    return;
  }

  fetch(`${API_BASE_URL}/api/quotes/${quoteId}`)
    .then((res) => res.json())
    .then((data) => {
      loading.style.display = "none";
      if (data.error) throw new Error(data.error);

      // 復用 main.js 的渲染邏輯 (這裡因為無法直接引用 main.js 的函式，我們重寫一個精簡版但樣式相同的)
      renderQuoteView(data.calculationResult, DEFAULT_RULES, data.createdAt);
      container.style.display = "block";
    })
    .catch((err) => {
      loading.style.display = "none";
      errorBox.textContent = err.message;
      errorBox.style.display = "block";
    });
});

function renderQuoteView(result, rules, date) {
  const container = document.getElementById("results-container");

  let html = `
    <div style="text-align:center; margin-bottom:20px; padding:15px; background:#e3f2fd; border-radius:8px;">
        <h2 style="color:#0056b3; margin:0;">🧾 運費估價單</h2>
        <p style="color:#666; font-size:14px; margin:5px 0 0 0;">建立日期：${new Date(
          date
        ).toLocaleDateString()}</p>
    </div>
  `;

  // 1. 明細渲染 (與 main.js 保持 HTML 結構一致)
  result.allItemsData.forEach((item) => {
    const formula =
      item.calcMethod === "dimensions"
        ? `(${item.length}x${item.width}x${item.height})÷${rules.VOLUME_DIVISOR}`
        : `${item.cbm} x ${rules.CBM_TO_CAI_FACTOR}`;

    const isVolWin = item.itemVolumeCost >= item.itemWeightCost;

    html += `
      <div class="result-detail-card">
        <h3>${item.name} <small>x${item.quantity}</small></h3>
        <div class="detail-section">
            <div class="calc-line">
                <span>材積 (${item.singleVolume}材)</span>
                <span class="formula-box">${formula}</span>
            </div>
            <div class="calc-line">
                <span>重量 (${item.singleWeight}kg)</span>
                <span>總重: <b>${item.totalWeight} kg</b></span>
            </div>
            
            <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:6px;">
                <div class="calc-line ${
                  isVolWin ? "winner" : ""
                }" style="margin-bottom:5px;">
                    <span>材積費</span> <b>$${item.itemVolumeCost.toLocaleString()}</b>
                </div>
                <div class="calc-line ${!isVolWin ? "winner" : ""}">
                    <span>重量費</span> <b>$${item.itemWeightCost.toLocaleString()}</b>
                </div>
            </div>
            <div style="text-align:right; margin-top:8px; font-weight:bold; color:#0056b3;">
                單項運費: $${item.itemFinalCost.toLocaleString()}
            </div>
        </div>
      </div>
    `;
  });

  // 2. 總計
  html += `
    <div class="result-summary-card">
        <h3>費用彙總</h3>
        <div class="summary-row"><span>基本運費</span><span>$${result.initialSeaFreightCost.toLocaleString()}</span></div>
        <div class="summary-row"><span>偏遠費</span><span>+$${result.remoteFee.toLocaleString()}</span></div>
        <div class="summary-row"><span>附加費</span><span>+$${(
          result.totalOverweightFee + result.totalOversizedFee
        ).toLocaleString()}</span></div>
        
        <div class="summary-total">總計：NT$ ${result.finalTotal.toLocaleString()}</div>
        
        <div style="padding:20px;">
            <a href="index.html" class="btn btn-primary" style="display:block; text-decoration:none; background:#ff6b01; color:white; font-weight:bold;">
                我也要試算運費
            </a>
        </div>
    </div>
  `;

  container.innerHTML = html;
}
