// frontend/js/dashboard-shipments.js
// V2025.Transparent - 優化費用試算顯示邏輯

// --- 1. 更新底部結帳條 ---
window.updateCheckoutBar = function () {
  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  const countEl = document.getElementById("selected-pkg-count");
  if (countEl) countEl.textContent = count;

  const btn = document.getElementById("btn-create-shipment");
  if (btn) {
    btn.disabled = count === 0;
    if (count > 0) {
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    } else {
      btn.classList.add("btn-secondary");
      btn.classList.remove("btn-primary");
    }
  }
};

// --- 2. 點擊「合併打包」按鈕 ---
window.handleCreateShipmentClick = async function () {
  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  if (selectedCheckboxes.length === 0) return;

  const selectedIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
  const selectedPackages = window.allPackagesData.filter((pkg) =>
    selectedIds.includes(pkg.id)
  );

  // 更新件數
  const countEl = document.getElementById("checkout-total-count");
  if (countEl) countEl.textContent = selectedPackages.length;

  // 檢查超重
  const hasHeavyItem = selectedPackages.some((pkg) => pkg.isOverweight);
  const warningBox = document.getElementById("forklift-warning");
  if (warningBox) warningBox.style.display = hasHeavyItem ? "block" : "none";

  // 渲染包裹清單 (增加尺寸資訊)
  const listContainer = document.getElementById("shipment-package-list");
  listContainer.innerHTML = "";

  selectedPackages.forEach((pkg, idx) => {
    // 計算該包裹的總實重與大致材積 (前端僅作顯示參考，實際以API為準)
    let weightDisplay = "待量測";
    let volDisplay = "";

    if (pkg.arrivedBoxes && pkg.arrivedBoxes.length > 0) {
      const totalW = pkg.arrivedBoxes.reduce(
        (acc, b) => acc + (parseFloat(b.weight) || 0),
        0
      );
      weightDisplay = `${totalW.toFixed(1)} kg`;

      // 簡單估算材積顯示給客戶看 (長x寬x高/28317)
      const totalCai = pkg.arrivedBoxes.reduce((acc, b) => {
        return acc + (b.length * b.width * b.height) / 28317;
      }, 0);
      if (totalCai > 0) volDisplay = ` | 約 ${totalCai.toFixed(1)} 材`;
    }

    let alerts = "";
    if (pkg.isOverweight)
      alerts += `<span class="badge badge-danger" style="margin-left:5px;">超重</span>`;
    if (pkg.isOversized)
      alerts += `<span class="badge badge-warning" style="margin-left:5px;">超長</span>`;

    listContainer.innerHTML += `
      <div class="shipment-package-item" style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
        <div class="info">
          <div style="font-weight:bold; font-size: 14px;">${idx + 1}. ${
      pkg.productName
    } ${alerts}</div>
          <div style="font-size:12px; color:#888;">單號: ${
            pkg.trackingNumber
          }</div>
        </div>
        <div class="cost" style="text-align: right; font-size: 13px; color: #555;">
            <div><i class="fas fa-weight-hanging"></i> ${weightDisplay}</div>
            <div style="font-size: 11px; color: #999;">${volDisplay}</div>
        </div>
      </div>
    `;
  });

  // 自動填入收件人 (如果之前有存)
  if (window.currentUser) {
    if (!document.getElementById("ship-name").value)
      document.getElementById("ship-name").value =
        window.currentUser.name || "";
    if (!document.getElementById("ship-phone").value)
      document.getElementById("ship-phone").value =
        window.currentUser.phone || "";
    if (!document.getElementById("ship-street-address").value)
      document.getElementById("ship-street-address").value =
        window.currentUser.defaultAddress || "";
  }

  // 重置付款方式
  const radioTransfer = document.getElementById("pay-transfer");
  if (radioTransfer) radioTransfer.checked = true;
  togglePaymentMethod("TRANSFER");

  renderDeliveryLocations();

  document.getElementById("create-shipment-modal").style.display = "flex";

  // 立即觸發試算
  window.recalculateShipmentTotal();
};

// --- 3. 觸發後端運費預算 (核心優化) ---
window.recalculateShipmentTotal = async function () {
  const breakdownDiv = document.getElementById("api-fee-breakdown");
  const actualWeightEl = document.getElementById("calc-actual-weight");
  const volumetricEl = document.getElementById("calc-volumetric");

  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  const locationSelect = document.getElementById("ship-delivery-location");

  if (selectedCheckboxes.length === 0) return;

  const packageIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
  const rate = locationSelect.value || 0;

  // 更新偏遠地區提示
  const remoteInfo = document.getElementById("ship-remote-area-info");
  const selectedOption = locationSelect.options[locationSelect.selectedIndex];
  if (rate > 0 && selectedOption) {
    document.getElementById("ship-selected-area-name").textContent =
      selectedOption.text;
    document.getElementById("ship-selected-area-fee").textContent = `$${rate}`;
    remoteInfo.style.display = "block";
  } else {
    remoteInfo.style.display = "none";
  }

  // 顯示 Loading
  breakdownDiv.innerHTML =
    '<div class="text-center" style="padding:15px;"><i class="fas fa-circle-notch fa-spin"></i> 正在向雲端取得最新報價...</div>';
  if (actualWeightEl) actualWeightEl.textContent = "...";
  if (volumetricEl) volumetricEl.textContent = "...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({
        packageIds: packageIds,
        deliveryLocationRate: parseFloat(rate),
      }),
    });

    const data = await res.json();
    if (data.success && data.preview) {
      const p = data.preview;
      window.currentShipmentTotal = p.totalCost;

      // 1. 更新重量/材積面板
      if (actualWeightEl)
        actualWeightEl.textContent = `${p.totalActualWeight} kg`;
      if (volumetricEl) volumetricEl.textContent = `${p.totalVolumetricCai} 材`;

      // 2. 建立費用明細 HTML
      let html = `<table style="width: 100%; font-size: 14px; margin-top: 5px;">`;

      // 基本運費
      html += `
        <tr>
            <td style="padding: 4px 0; color: #555;">基本海運費</td>
            <td style="padding: 4px 0; text-align: right; font-weight: bold;">$${p.baseCost.toLocaleString()}</td>
        </tr>
      `;

      // 低消提示
      if (p.isMinimumChargeApplied) {
        html += `
        <tr>
            <td colspan="2" style="padding: 0 0 8px 0; text-align: right; font-size: 11px; color: #e67e22;">
               <i class="fas fa-info-circle"></i> 未達最低消費，以低消 $${
                 p.ratesConstant?.minimumCharge || 0
               } 計算
            </td>
        </tr>`;
      }

      // 偏遠地區費
      if (p.remoteFee > 0) {
        html += `
        <tr>
            <td style="padding: 4px 0; color: #555;">
                偏遠地區費 <span style="font-size:11px; color:#999;">(${
                  p.totalCbm
                } CBM x ${rate})</span>
            </td>
            <td style="padding: 4px 0; text-align: right; color: #d35400;">+$${p.remoteFee.toLocaleString()}</td>
        </tr>`;
      }

      // 附加費
      if (p.oversizedFee > 0) {
        html += `<tr><td style="padding: 4px 0; color: #d35400;">超長附加費</td><td style="padding: 4px 0; text-align: right; color: #d35400;">+$${p.oversizedFee.toLocaleString()}</td></tr>`;
      }
      if (p.overweightFee > 0) {
        html += `<tr><td style="padding: 4px 0; color: #d35400;">超重附加費</td><td style="padding: 4px 0; text-align: right; color: #d35400;">+$${p.overweightFee.toLocaleString()}</td></tr>`;
      }

      html += `
        <tr style="border-top: 2px solid #eee;">
            <td style="padding: 10px 0; font-weight: bold; font-size: 16px;">總金額 (TWD)</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 20px; color: #2e7d32;">
                $${p.totalCost.toLocaleString()}
            </td>
        </tr>
      </table>`;

      breakdownDiv.innerHTML = html;

      // 重新檢查錢包餘額 (若已選)
      const walletRadio = document.getElementById("pay-wallet");
      if (walletRadio && walletRadio.checked) togglePaymentMethod("WALLET");
    } else {
      breakdownDiv.innerHTML = `<div class="alert alert-danger">試算失敗: ${data.message}</div>`;
    }
  } catch (e) {
    console.error(e);
    breakdownDiv.innerHTML = `<div class="alert alert-danger">連線錯誤，無法取得報價</div>`;
  }
};

// --- 4. 提交建立訂單 ---
window.handleCreateShipmentSubmit = async function (e) {
  e.preventDefault();

  const btn = e.target.querySelector(".btn-place-order");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  const packageIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);

  let paymentMethod = "TRANSFER";
  const payWallet = document.getElementById("pay-wallet");
  if (payWallet && payWallet.checked) paymentMethod = "WALLET";

  const fd = new FormData();
  fd.append("packageIds", JSON.stringify(packageIds));
  fd.append("recipientName", document.getElementById("ship-name").value);
  fd.append("phone", document.getElementById("ship-phone").value);
  fd.append(
    "shippingAddress",
    (document.getElementById("ship-area-search").value || "") +
      " " +
      document.getElementById("ship-street-address").value
  );
  fd.append(
    "deliveryLocationRate",
    document.getElementById("ship-delivery-location").value || 0
  );

  fd.append("idNumber", document.getElementById("ship-idNumber").value);
  fd.append("note", document.getElementById("ship-note").value);
  fd.append("paymentMethod", paymentMethod);

  // 附加服務 (JSON)
  const services = {
    floor: {
      selected: document.getElementById("srv-floor").checked,
      hasElevator:
        document.querySelector('input[name="srv-elevator"]:checked')?.value ===
        "yes",
      note: document.getElementById("srv-floor-note").value,
    },
    wood: {
      selected: document.getElementById("srv-wood").checked,
      note: document.getElementById("srv-wood-note").value,
    },
    assembly: {
      selected: document.getElementById("srv-assembly").checked,
      note: document.getElementById("srv-assembly-note").value,
    },
    old: {
      selected: document.getElementById("srv-old").checked,
      note: document.getElementById("srv-old-note").value,
    },
  };
  fd.append("additionalServices", JSON.stringify(services));

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });

    const data = await res.json();
    if (res.ok) {
      document.getElementById("create-shipment-modal").style.display = "none";
      window.lastCreatedShipmentId = data.shipment.id;

      if (paymentMethod === "WALLET") {
        alert("訂單建立成功！費用已從錢包扣除，系統將自動安排出貨。");
        window.loadMyShipments();
        window.loadMyPackages();
        if (typeof window.loadWalletData === "function") {
          window.loadWalletData();
        }
      } else {
        if (window.BANK_INFO_CACHE) {
          const bName = document.getElementById("bank-name");
          if (bName) bName.textContent = window.BANK_INFO_CACHE.bankName;
          const bBranch = document.getElementById("bank-branch");
          if (bBranch) bBranch.textContent = window.BANK_INFO_CACHE.branch;
          const bAcc = document.getElementById("bank-account");
          if (bAcc) bAcc.textContent = window.BANK_INFO_CACHE.account;
          const bHolder = document.getElementById("bank-holder");
          if (bHolder) bHolder.textContent = window.BANK_INFO_CACHE.holder;
        }
        document.getElementById("bank-info-modal").style.display = "flex";
        window.loadMyShipments();
        window.loadMyPackages();
      }

      e.target.reset();
      const countEl = document.getElementById("selected-pkg-count");
      if (countEl) countEl.textContent = "0";
    } else {
      alert(data.message || "建立失敗");
    }
  } catch (err) {
    alert("網路錯誤");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "提交訂單";
  }
};

// --- 付款方式切換 ---
window.togglePaymentMethod = function (method) {
  const walletBalanceInfo = document.getElementById("wallet-pay-info");
  const btnSubmit = document.querySelector(".btn-place-order");

  if (method === "WALLET") {
    // 顯示餘額檢查
    if (walletBalanceInfo) {
      walletBalanceInfo.style.display = "block";
      const currentTotal = window.currentShipmentTotal || 0;

      fetch(`${API_BASE_URL}/api/wallet/my`, {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            const bal = d.wallet.balance;
            if (bal < currentTotal) {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:red; font-weight:bold;">(不足，請先儲值)</span>`;
              btnSubmit.disabled = true;
            } else {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:green; font-weight:bold;">(足夠支付)</span>`;
              btnSubmit.disabled = false;
            }
          }
        })
        .catch(() => {
          walletBalanceInfo.innerHTML = `<span style="color:red;">無法取得餘額</span>`;
        });
    }
  } else {
    // 轉帳模式
    if (walletBalanceInfo) walletBalanceInfo.style.display = "none";
    btnSubmit.disabled = false;
  }
};

// --- 5. 載入我的集運單列表 ---
window.loadMyShipments = async function () {
  const tbody = document.getElementById("shipments-table-body");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.shipments && data.shipments.length > 0) {
      tbody.innerHTML = "";
      const statusMap = window.SHIPMENT_STATUS_MAP || {};
      const statusClasses = window.STATUS_CLASSES || {};

      data.shipments.forEach((s) => {
        const statusText = statusMap[s.status] || s.status;
        const statusClass = statusClasses[s.status] || "";

        let actionsHtml = `<button class="btn btn-sm btn-primary" onclick="window.openShipmentDetails('${s.id}')">詳情</button>`;

        if (s.status === "PENDING_PAYMENT") {
          if (s.paymentProof) {
            actionsHtml += `<span style="font-size:12px; color:#e67e22; display:block; margin-top:5px;">已傳憑證<br>審核中</span>`;
          } else {
            // [注意] 呼叫 window.openUploadProof (在 dashboard-main.js 中定義)
            actionsHtml += `<button class="btn btn-sm btn-secondary" style="margin-top:5px;" onclick="window.openUploadProof('${s.id}')">上傳憑證</button>`;
            actionsHtml += `<button class="btn btn-sm btn-danger" style="margin-top:5px;" onclick="window.cancelShipment('${s.id}')">取消訂單</button>`;
          }
        }

        tbody.innerHTML += `
            <tr>
                <td>
                    <span style="font-weight:bold; color:#1a73e8;">${s.id
                      .slice(-8)
                      .toUpperCase()}</span><br>
                    <small>${new Date(s.createdAt).toLocaleDateString()}</small>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div>${s.recipientName}</div>
                    <small style="color:#666;">${
                      s.packages.length
                    } 件包裹</small>
                </td>
                <td style="color:#d32f2f; font-weight:bold;">$${(
                  s.totalCost || 0
                ).toLocaleString()}</td>
                <td><div style="display:flex; flex-direction:column; gap:5px;">${actionsHtml}</div></td>
            </tr>
        `;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">尚無集運單</td></tr>`;
    }
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">載入失敗</td></tr>`;
  }
};

// [Deleted] 移除了衝突的 window.openUploadProof 和 window.handleUploadProofSubmit
// 現在將使用 dashboard-main.js 中的完整版本 (含 TaxID 支援)

// --- 7. 查看訂單詳情 ---
window.openShipmentDetails = async function (id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.shipment;
    document.getElementById("sd-id").textContent = s.id.slice(-8).toUpperCase();

    const timelineContainer = document.getElementById("sd-timeline");
    if (timelineContainer) {
      renderTimeline(timelineContainer, s.status);
    } else {
      const statusEl = document.getElementById("sd-status");
      if (statusEl) statusEl.textContent = s.status;
    }

    const statusEl = document.getElementById("sd-status");
    if (s.status === "RETURNED") {
      statusEl.innerHTML = `<span class="status-badge status-CANCELLED">訂單已退回</span>
        <div style="background:#fff1f0; border:1px solid #ffa39e; padding:8px; border-radius:4px; margin-top:5px; font-size:13px; color:#c0392b;">
            <strong>退回原因：</strong> ${s.returnReason || "未說明"}
        </div>`;
    } else {
      statusEl.textContent = window.SHIPMENT_STATUS_MAP[s.status] || s.status;
    }

    let dateHtml = `<div><strong>建立日期:</strong> <span>${new Date(
      s.createdAt
    ).toLocaleString()}</span></div>`;
    if (s.loadingDate) {
      dateHtml += `<div style="color:#28a745; font-weight:bold; margin-top:5px;">
            <i class="fas fa-ship"></i> 裝櫃日期: ${new Date(
              s.loadingDate
            ).toLocaleDateString()}
        </div>`;
    }
    document.getElementById("sd-date").innerHTML = dateHtml;

    document.getElementById("sd-trackingTW").textContent =
      s.trackingNumberTW || "尚未產生";

    document.getElementById("sd-name").textContent = s.recipientName;
    document.getElementById("sd-phone").textContent = s.phone;
    document.getElementById("sd-address").textContent = s.shippingAddress;

    const breakdown = document.getElementById("sd-fee-breakdown");
    breakdown.innerHTML = `
        <div>運費總計: <strong>$${(
          s.totalCost || 0
        ).toLocaleString()}</strong></div>
        ${
          s.invoiceNumber
            ? `<div style="margin-top:5px; color:#28a745;">發票已開立: ${s.invoiceNumber}</div>`
            : ""
        }
    `;

    const gallery = document.getElementById("sd-proof-images");
    gallery.innerHTML = "";

    if (s.paymentProof) {
      if (s.paymentProof === "WALLET_PAY") {
        gallery.innerHTML = `<div style="text-align:center; padding:10px; background:#f0f8ff; border-radius:5px; color:#0056b3;">
                <i class="fas fa-wallet"></i> 使用錢包餘額支付
            </div>`;
      } else {
        gallery.innerHTML += `<div style="text-align:center;"><p>付款憑證</p><img src="${API_BASE_URL}${s.paymentProof}" onclick="window.open(this.src)" style="max-width:100px; cursor:pointer;"></div>`;
      }
    }

    document.getElementById("shipment-details-modal").style.display = "flex";
  } catch (e) {
    alert("無法載入詳情");
  }
};

window.cancelShipment = async function (id) {
  if (
    !confirm(
      "確定要取消此訂單嗎？\n取消後，包裹將會釋放回「已入庫」狀態，您可以重新打包。"
    )
  )
    return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (res.ok) {
      alert(data.message);
      window.loadMyShipments();
      window.loadMyPackages();
    } else {
      alert(data.message || "取消失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  }
};

function renderTimeline(container, currentStatus) {
  const steps = [
    { code: "PENDING_PAYMENT", label: "待付款" },
    { code: "PROCESSING", label: "處理中" },
    { code: "SHIPPED", label: "已裝櫃" },
    { code: "CUSTOMS_CHECK", label: "海關查驗" },
    { code: "UNSTUFFING", label: "拆櫃派送" },
    { code: "COMPLETED", label: "已完成" },
  ];

  if (currentStatus === "CANCELLED" || currentStatus === "RETURNED") {
    const text = currentStatus === "RETURNED" ? "訂單已退回" : "訂單已取消";
    container.innerHTML = `<div class="alert alert-error text-center" style="margin:10px 0;">${text}</div>`;
    return;
  }
  if (currentStatus === "PENDING_REVIEW") currentStatus = "PENDING_PAYMENT";

  let currentIndex = steps.findIndex((s) => s.code === currentStatus);
  if (currentIndex === -1) currentIndex = 0;

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; margin:20px 0; position:relative; padding:0 10px; overflow-x:auto;">`;
  html += `<div style="position:absolute; top:15px; left:20px; right:20px; height:4px; background:#eee; z-index:0; min-width:400px;"></div>`;

  const stepCount = steps.length;
  const progressPercent = (currentIndex / (stepCount - 1)) * 100;

  html += `<div style="position:absolute; top:15px; left:20px; width:calc(${progressPercent}% - 40px); max-width:calc(100% - 40px); height:4px; background:#28a745; z-index:0; transition:width 0.3s; min-width:0;"></div>`;

  steps.forEach((step, idx) => {
    const isCompleted = idx <= currentIndex;
    const color = isCompleted ? "#28a745" : "#ccc";
    const icon = isCompleted ? "fa-check-circle" : "fa-circle";

    html += `
            <div style="position:relative; z-index:1; text-align:center; flex:1; min-width:60px;">
                <i class="fas ${icon}" style="color:${color}; font-size:24px; background:#fff; border-radius:50%;"></i>
                <div style="font-size:12px; margin-top:5px; color:${
                  isCompleted ? "#333" : "#999"
                }; font-weight:${
      idx === currentIndex ? "bold" : "normal"
    }; white-space:nowrap;">
                    ${step.label}
                </div>
            </div>
        `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

window.renderDeliveryLocations = function () {
  const select = document.getElementById("ship-delivery-location");
  if (!select || select.options.length > 1) return;

  let html = `<option value="" selected disabled>--- 選擇配送地區 ---</option>`;
  html += `<option value="0">✅ 一般地區 (免加價)</option>`;

  if (window.REMOTE_AREAS) {
    const sortedFees = Object.keys(window.REMOTE_AREAS).sort((a, b) => a - b);
    sortedFees.forEach((fee) => {
      if (fee == "0") return;
      const areas = window.REMOTE_AREAS[fee];
      html += `<optgroup label="加收 $${fee}">`;
      areas.forEach((area) => {
        html += `<option value="${fee}">${area}</option>`;
      });
      html += `</optgroup>`;
    });
  }
  select.innerHTML = html;
};

document.addEventListener("DOMContentLoaded", () => {
  const toggles = {
    "srv-floor": "srv-floor-options",
    "srv-wood": "srv-wood-input",
    "srv-assembly": "srv-assembly-input",
    "srv-old": "srv-old-input",
  };

  Object.keys(toggles).forEach((id) => {
    const checkbox = document.getElementById(id);
    const target = document.getElementById(toggles[id]);
    if (checkbox && target) {
      checkbox.addEventListener("change", (e) => {
        target.style.display = e.target.checked ? "block" : "none";
      });
    }
  });
});
