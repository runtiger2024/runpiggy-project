// frontend/js/quote.js (V21.0 - Fix undefined issue)

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get("id");
  const container = document.getElementById("results-container");
  const loading = document.getElementById("loading-spinner");
  const errorBox = document.getElementById("error-message");

  // 靜態規則備份 (若後端未回傳 rules 時的備案)
  const DEFAULT_RULES = {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 2000,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 800,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 800,
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

      // 渲染詳細視圖
      renderQuoteView(data.calculationResult, DEFAULT_RULES, data.createdAt);
      container.style.display = "block";
    })
    .catch((err) => {
      loading.style.display = "none";
      errorBox.textContent = err.message;
      errorBox.style.display = "block";
    });
});

function renderQuoteView(result, defaultRules, date) {
  const container = document.getElementById("results-container");

  // [Fix] 讀取規則邏輯：優先使用 JSON 內的 rulesApplied，若無則回退到 defaultRules
  // 這樣能修復舊資料或保存不全導致的 undefined
  let rules = result.rulesApplied || defaultRules;

  // 再次檢查 rules 內是否有必要常數，若無則補齊
  if (!rules.OVERSIZED_LIMIT)
    rules.OVERSIZED_LIMIT = defaultRules.OVERSIZED_LIMIT;
  if (!rules.OVERWEIGHT_LIMIT)
    rules.OVERWEIGHT_LIMIT = defaultRules.OVERWEIGHT_LIMIT;
  if (!rules.VOLUME_DIVISOR) rules.VOLUME_DIVISOR = defaultRules.VOLUME_DIVISOR;
  if (!rules.CBM_TO_CAI_FACTOR)
    rules.CBM_TO_CAI_FACTOR = defaultRules.CBM_TO_CAI_FACTOR;

  let html = `
    <div style="text-align:center; margin-bottom:20px; padding:15px; background:#e3f2fd; border-radius:8px;">
        <h2 style="color:#0056b3; margin:0;">🧾 運費估價單</h2>
        <p style="color:#666; font-size:14px; margin:5px 0 0 0;">建立日期：${new Date(
          date
        ).toLocaleDateString()}</p>
    </div>
  `;

  // --- 1. 商品明細渲染 ---
  result.allItemsData.forEach((item, index) => {
    // 判斷材積重與實重誰大
    const isVolWin = item.itemVolumeCost >= item.itemWeightCost;

    // 取得費率資訊 (若無則顯示為0)
    const volRate = item.rateInfo ? item.rateInfo.volumeRate : 0;
    const wtRate = item.rateInfo ? item.rateInfo.weightRate : 0;

    // 材積計算公式顯示
    let formulaDesc = "";
    if (item.calcMethod === "dimensions") {
      formulaDesc = `(${item.length}x${item.width}x${item.height})÷${rules.VOLUME_DIVISOR}`;
    } else {
      formulaDesc = `${item.cbm} x ${rules.CBM_TO_CAI_FACTOR}`;
    }

    html += `
      <div class="result-detail-card">
        <h3><i class="fas fa-cube"></i> 第 ${index + 1} 項：${
      item.name
    } <small>x${item.quantity}件</small></h3>
        
        <div class="detail-section">
            <div style="margin-bottom:10px; font-size:13px; color:#555;">
                <div class="calc-line">
                    <span>📏 單件規格：</span>
                    <span>${item.length}x${item.width}x${item.height} cm / ${
      item.singleWeight
    } kg</span>
                </div>
                <div class="calc-line">
                    <span>Sq 材積換算：</span>
                    <span class="formula-box">${formulaDesc} = <b>${
      item.singleVolume
    } 材</b></span>
                </div>
            </div>
            
            <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:6px;">
                <div class="calc-line ${
                  isVolWin ? "winner" : ""
                }" style="margin-bottom:5px; opacity:${isVolWin ? 1 : 0.6};">
                    <span>
                        材積費 <small style="color:#888;">(總 ${item.totalVolume.toFixed(
                          1
                        )}材 x $${volRate})</small>
                    </span> 
                    <b>$${item.itemVolumeCost.toLocaleString()}</b>
                    ${
                      isVolWin
                        ? '<i class="fas fa-check-circle" style="color:#fa8c16; margin-left:5px;"></i>'
                        : ""
                    }
                </div>
                <div class="calc-line ${
                  !isVolWin ? "winner" : ""
                }" style="opacity:${!isVolWin ? 1 : 0.6};">
                    <span>
                        重量費 <small style="color:#888;">(總 ${item.totalWeight.toFixed(
                          1
                        )}kg x $${wtRate})</small>
                    </span> 
                    <b>$${item.itemWeightCost.toLocaleString()}</b>
                    ${
                      !isVolWin
                        ? '<i class="fas fa-check-circle" style="color:#fa8c16; margin-left:5px;"></i>'
                        : ""
                    }
                </div>
            </div>

            <div style="text-align:right; margin-top:8px; font-weight:bold; color:#0056b3; border-top:1px dashed #eee; padding-top:8px;">
                本項小計: $${item.itemFinalCost.toLocaleString()}
            </div>

            ${
              item.hasOversizedItem
                ? `<div class="alert alert-error" style="margin:10px; font-size:12px; font-weight:bold;">⚠️ 此商品超長 (>= ${rules.OVERSIZED_LIMIT}cm)</div>`
                : ""
            }
            ${
              item.isOverweight
                ? `<div class="alert alert-error" style="margin:10px; font-size:12px; font-weight:bold;">⚠️ 此商品超重 (>= ${rules.OVERWEIGHT_LIMIT}kg)</div>`
                : ""
            }
        </div>
      </div>
    `;
  });

  // --- 2. 總計摘要區塊 (詳細版) ---

  // 計算是否有補低消
  const isMinChargeApplied =
    result.finalSeaFreightCost > result.initialSeaFreightCost;
  const minChargeGap =
    result.finalSeaFreightCost - result.initialSeaFreightCost;

  html += `
    <div class="result-summary-card">
        <h3>💰 費用試算總結</h3>
        
        <div class="summary-row">
            <span>基本運費總和</span>
            <span>$${result.initialSeaFreightCost.toLocaleString()}</span>
        </div>

        ${
          isMinChargeApplied
            ? `
        <div class="summary-row" style="color:#28a745; background:#f6ffed;">
            <span><i class="fas fa-arrow-up"></i> 未達低消補足 <small>($${
              rules.MINIMUM_CHARGE
            })</small></span>
            <span>+$${minChargeGap.toLocaleString()}</span>
        </div>
        `
            : ""
        }
        
        ${
          result.remoteFee > 0
            ? `
        <div class="summary-row">
            <span>
                偏遠地區費 <br>
                <small style="color:#999; font-weight:normal;">(總體積 ${
                  result.totalCbm
                } CBM x $${result.remoteAreaRate})</small>
            </span>
            <span>+$${result.remoteFee.toLocaleString()}</span>
        </div>
        `
            : ""
        }
        
        ${
          result.totalOversizedFee > 0
            ? `
        <div class="summary-row" style="color:#e65100;">
            <span>⚠️ 超長附加費</span>
            <span>+$${result.totalOversizedFee.toLocaleString()}</span>
        </div>
        `
            : ""
        }

        ${
          result.totalOverweightFee > 0
            ? `
        <div class="summary-row" style="color:#e65100;">
            <span>⚠️ 超重附加費</span>
            <span>+$${result.totalOverweightFee.toLocaleString()}</span>
        </div>
        `
            : ""
        }
        
        <div class="summary-total">
            <small>預估總運費 (新台幣)</small>
            NT$ ${result.finalTotal.toLocaleString()}
        </div>
        
        <div style="padding:20px;">
            <a href="index.html" class="btn btn-primary" style="display:block; text-decoration:none; background:#ff6b01; color:white; font-weight:bold; box-shadow:0 4px 12px rgba(255,107,1,0.3);">
                我也要試算運費
            </a>
        </div>
    </div>
    
    <div style="text-align:center; color:#999; font-size:12px; margin-bottom:30px;">
        此估價單僅供參考，實際費用以倉庫入庫測量為準。
    </div>
  `;

  container.innerHTML = html;
}
