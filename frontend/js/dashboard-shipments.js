// frontend/js/dashboard-shipments.js
// V26.2 - Fixed: Added renderDeliveryLocations & Cancel Logic

// --- 1. 更新底部結帳條 ---
window.updateCheckoutBar = function () {
  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  // 更新數量顯示
  const countEl = document.getElementById("selected-pkg-count");
  if (countEl) countEl.textContent = count;

  // 啟用/停用按鈕
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

  // 找出選中的包裹資料
  const selectedPackages = window.allPackagesData.filter((pkg) =>
    selectedIds.includes(pkg.id)
  );

  // [UI 保留] 檢查是否有超重包裹 (單件 > 100kg)，顯示堆高機警示
  const hasHeavyItem = selectedPackages.some((pkg) => pkg.isOverweight);
  const warningBox = document.getElementById("forklift-warning");
  if (warningBox) warningBox.style.display = hasHeavyItem ? "block" : "none";

  // 渲染結帳彈窗中的包裹清單
  const listContainer = document.getElementById("shipment-package-list");
  listContainer.innerHTML = "";

  selectedPackages.forEach((pkg, idx) => {
    // 計算該包裹重量
    let weightStr = "-";
    if (pkg.arrivedBoxes && pkg.arrivedBoxes.length > 0) {
      const w = pkg.arrivedBoxes.reduce(
        (acc, b) => acc + (parseFloat(b.weight) || 0),
        0
      );
      weightStr = w.toFixed(1) + "kg";
    }

    // [UI 保留] 單項警示標籤
    let alerts = "";
    if (pkg.isOverweight) {
      alerts += `<span style="color:red; background:#ffebee; border:1px solid red; font-size:10px; padding:1px 4px; border-radius:4px; margin-left:5px; font-weight:bold;">[超重]</span>`;
    }
    if (pkg.isOversized) {
      alerts += `<span style="color:red; background:#ffebee; border:1px solid red; font-size:10px; padding:1px 4px; border-radius:4px; margin-left:5px; font-weight:bold;">[超長]</span>`;
    }

    listContainer.innerHTML += `
      <div class="shipment-package-item">
        <div class="info">
          <div style="font-weight:bold;">${idx + 1}. ${
      pkg.productName
    } ${alerts}</div>
          <div style="font-size:12px; color:#666;">${pkg.trackingNumber}</div>
        </div>
        <div class="cost">${weightStr}</div>
      </div>
    `;
  });

  // 填入預設收件資料 (從 User Profile)
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

  // [New] 重置付款方式為預設 (轉帳) 並觸發 UI 更新
  const radioTransfer = document.getElementById("pay-transfer");
  if (radioTransfer) radioTransfer.checked = true;
  togglePaymentMethod("TRANSFER"); // 確保初始化正確

  // 載入偏遠地區選單 (若尚未載入)
  // [Fix] 呼叫已修復的函式
  renderDeliveryLocations();

  // 顯示彈窗
  document.getElementById("create-shipment-modal").style.display = "flex";

  // 觸發一次運費預算
  window.recalculateShipmentTotal();
};

// --- 3. 觸發後端運費預算 ---
window.recalculateShipmentTotal = async function () {
  const breakdownDiv = document.getElementById("api-fee-breakdown");
  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  const locationSelect = document.getElementById("ship-delivery-location");

  if (selectedCheckboxes.length === 0) return;

  const packageIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
  const rate = locationSelect.value || 0;

  breakdownDiv.innerHTML =
    '<div class="spinner" style="width:20px;height:20px;"></div> <span style="font-size:12px;color:#666;">計算中...</span>';

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

      // [New] 暫存總金額供錢包檢查使用 (關鍵！)
      window.currentShipmentTotal = p.totalCost;

      // [UI 保留] 渲染費用明細
      let html = `
        <div class="fee-breakdown-row">
            <span>基本海運費</span>
            <span>$${p.baseCost.toLocaleString()}</span>
        </div>
      `;

      if (p.isMinimumChargeApplied) {
        html += `<div style="font-size:11px; color:#28a745; text-align:right; margin-top:-5px; margin-bottom:5px;">(已補足低消)</div>`;
      }

      if (p.remoteFee > 0) {
        html += `
        <div class="fee-breakdown-row">
            <span>偏遠地區費</span>
            <span>+$${p.remoteFee.toLocaleString()}</span>
        </div>`;
      }

      if (p.oversizedFee > 0) {
        html += `
        <div class="fee-breakdown-row" style="color:#d35400;">
            <span>超長附加費</span>
            <span>+$${p.oversizedFee.toLocaleString()}</span>
        </div>`;
      }

      if (p.overweightFee > 0) {
        html += `
        <div class="fee-breakdown-row" style="color:#d35400;">
            <span>超重附加費</span>
            <span>+$${p.overweightFee.toLocaleString()}</span>
        </div>`;
      }

      html += `
        <div class="fee-breakdown-row total">
            <span>總金額 (台幣)</span>
            <span>$${p.totalCost.toLocaleString()}</span>
        </div>
      `;

      breakdownDiv.innerHTML = html;

      // [New] 如果當前選擇錢包支付，重新檢查餘額是否足夠 (因為金額可能變了)
      const walletRadio = document.getElementById("pay-wallet");
      if (walletRadio && walletRadio.checked) togglePaymentMethod("WALLET");
    } else {
      breakdownDiv.innerHTML = `<span style="color:red;">試算失敗: ${data.message}</span>`;
    }
  } catch (e) {
    breakdownDiv.innerHTML = `<span style="color:red;">連線錯誤</span>`;
  }
};

// --- 4. 提交建立訂單 ---
window.handleCreateShipmentSubmit = async function (e) {
  e.preventDefault();

  const btn = e.target.querySelector(".btn-place-order");
  btn.disabled = true;
  btn.textContent = "提交中...";

  // 收集資料
  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  const packageIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);

  // [New] 取得付款方式
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
  fd.append("taxId", document.getElementById("ship-taxId").value);
  fd.append("invoiceTitle", document.getElementById("ship-invoiceTitle").value);
  fd.append("note", document.getElementById("ship-note").value);
  fd.append("productUrl", document.getElementById("ship-product-url").value);
  fd.append("paymentMethod", paymentMethod); // [New] 傳送付款方式

  // [UI 保留] 附加服務 (JSON)
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

  // 圖片
  const files = document.getElementById("ship-product-images").files;
  for (let f of files) {
    fd.append("shipmentImages", f);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });

    const data = await res.json();
    if (res.ok) {
      // 成功
      document.getElementById("create-shipment-modal").style.display = "none";

      // 暫存新建立的訂單 ID
      window.lastCreatedShipmentId = data.shipment.id;

      if (paymentMethod === "WALLET") {
        // [New] 錢包支付成功，直接顯示成功訊息，不需上傳憑證
        alert("訂單建立成功！費用已從錢包扣除，系統將自動安排出貨。");
        window.loadMyShipments();
        window.loadMyPackages(); // 更新包裹狀態

        // 如果有 dashboard-wallet.js，重新載入餘額
        if (typeof window.loadWalletData === "function") {
          window.loadWalletData();
        }
      } else {
        // [Original] 轉帳支付，顯示匯款資訊
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

      // 清空選擇
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

// --- [New] 付款方式切換邏輯 (控制 UI 顯示) ---
window.togglePaymentMethod = function (method) {
  const proofSection = document.querySelector(".proof-section");
  const walletBalanceInfo = document.getElementById("wallet-pay-info");
  const btnSubmit = document.querySelector(".btn-place-order");

  if (method === "WALLET") {
    // 隱藏憑證上傳區 (錢包支付不需憑證)
    if (proofSection) proofSection.style.display = "none";

    // 顯示餘額檢查
    if (walletBalanceInfo) {
      walletBalanceInfo.style.display = "block";
      const currentTotal = window.currentShipmentTotal || 0;

      // 查詢錢包餘額 (使用 API 確保是最新的)
      fetch(`${API_BASE_URL}/api/wallet/my`, {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            const bal = d.wallet.balance;
            if (bal < currentTotal) {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:red; font-weight:bold;">(不足，請先儲值)</span>`;
              btnSubmit.disabled = true; // 餘額不足禁止提交
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
    // 轉帳模式 (預設)
    if (proofSection) proofSection.style.display = "block";
    if (walletBalanceInfo) walletBalanceInfo.style.display = "none";
    btnSubmit.disabled = false; // 轉帳模式總是允許提交
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

        // 動作按鈕邏輯
        let actionsHtml = `<button class="btn btn-sm btn-primary" onclick="window.openShipmentDetails('${s.id}')">詳情</button>`;

        // [Fix] 只有 PENDING_PAYMENT 且使用轉帳 (非WALLET_PAY) 且無憑證時，顯示上傳按鈕
        // 如果是錢包支付，paymentProof 會是 'WALLET_PAY'，後端已自動處理
        if (s.status === "PENDING_PAYMENT") {
          if (s.paymentProof) {
            actionsHtml += `<span style="font-size:12px; color:#e67e22; display:block; margin-top:5px;">已傳憑證<br>審核中</span>`;
          } else {
            actionsHtml += `<button class="btn btn-sm btn-secondary" style="margin-top:5px;" onclick="window.openUploadProof('${s.id}')">上傳憑證</button>`;
            // [New] 取消訂單按鈕
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

// --- 6. 上傳憑證相關 ---
window.openUploadProof = function (id) {
  document.getElementById("upload-proof-id").value = id;
  document.getElementById("upload-proof-modal").style.display = "flex";

  // 顯示銀行資訊提示
  const infoBox = document.getElementById("upload-proof-bank-info");
  if (window.BANK_INFO_CACHE) {
    infoBox.innerHTML = `
            <strong>請匯款至：</strong><br>
            銀行：${window.BANK_INFO_CACHE.bankName}<br>
            帳號：<span style="color:#d32f2f; font-weight:bold;">${window.BANK_INFO_CACHE.account}</span><br>
            戶名：${window.BANK_INFO_CACHE.holder}
        `;
  }
};

window.handleUploadProofSubmit = async function (e) {
  e.preventDefault();
  const id = document.getElementById("upload-proof-id").value;
  const file = document.getElementById("proof-file").files[0];
  if (!file) return alert("請選擇圖片");

  const fd = new FormData();
  fd.append("paymentProof", file);

  const btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "上傳中...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      alert("上傳成功，請等待管理員審核。");
      document.getElementById("upload-proof-modal").style.display = "none";
      window.loadMyShipments();
    } else {
      alert("上傳失敗");
    }
  } catch (err) {
    alert("錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "上傳";
  }
};

// --- 7. 查看訂單詳情 (新增軌跡與錢包支付顯示) ---
window.openShipmentDetails = async function (id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.shipment;
    document.getElementById("sd-id").textContent = s.id.slice(-8).toUpperCase();

    // [New] 呼叫物流軌跡渲染
    const timelineContainer = document.getElementById("sd-timeline");
    if (timelineContainer) {
      renderTimeline(timelineContainer, s.status);
    } else {
      // Fallback (若 HTML 尚未更新)
      const statusEl = document.getElementById("sd-status");
      if (statusEl) statusEl.textContent = s.status;
    }

    document.getElementById("sd-date").textContent = new Date(
      s.createdAt
    ).toLocaleString();
    document.getElementById("sd-trackingTW").textContent =
      s.trackingNumberTW || "尚未產生";

    document.getElementById("sd-name").textContent = s.recipientName;
    document.getElementById("sd-phone").textContent = s.phone;
    document.getElementById("sd-address").textContent = s.shippingAddress;

    // [UI 保留] 費用明細
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

    // 圖片顯示邏輯
    const gallery = document.getElementById("sd-proof-images");
    gallery.innerHTML = "";

    // 顯示付款憑證
    if (s.paymentProof) {
      if (s.paymentProof === "WALLET_PAY") {
        // [New] 錢包支付的特殊顯示
        gallery.innerHTML = `<div style="text-align:center; padding:10px; background:#f0f8ff; border-radius:5px; color:#0056b3;">
                <i class="fas fa-wallet"></i> 使用錢包餘額支付
            </div>`;
      } else {
        // 一般轉帳憑證
        gallery.innerHTML += `<div style="text-align:center;"><p>付款憑證</p><img src="${API_BASE_URL}${s.paymentProof}" onclick="window.open(this.src)" style="max-width:100px; cursor:pointer;"></div>`;
      }
    }

    document.getElementById("shipment-details-modal").style.display = "flex";
  } catch (e) {
    alert("無法載入詳情");
  }
};

// --- [New] 取消訂單邏輯 ---
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
      window.loadMyPackages(); // 包裹釋放了，需更新包裹列表
    } else {
      alert(data.message || "取消失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  }
};

// --- [New] 渲染物流軌跡 (Timeline) ---
function renderTimeline(container, currentStatus) {
  // 定義狀態順序
  const steps = [
    { code: "PENDING_PAYMENT", label: "待付款" },
    { code: "PROCESSING", label: "處理中" },
    { code: "SHIPPED", label: "已發貨" },
    { code: "COMPLETED", label: "已完成" },
  ];

  // 特殊狀態處理
  if (currentStatus === "CANCELLED") {
    container.innerHTML = `<div class="alert alert-error text-center" style="margin:10px 0;">此訂單已取消</div>`;
    return;
  }
  if (currentStatus === "PENDING_REVIEW") currentStatus = "PENDING_PAYMENT";

  let currentIndex = steps.findIndex((s) => s.code === currentStatus);
  if (currentIndex === -1) currentIndex = 0; // Default

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; margin:20px 0; position:relative; padding:0 10px;">`;

  // 進度條背景
  html += `<div style="position:absolute; top:15px; left:20px; right:20px; height:4px; background:#eee; z-index:0;"></div>`;
  // 進度條顏色 (計算寬度)
  const progressPercent = (currentIndex / (steps.length - 1)) * 100;
  // 修正進度條寬度計算，確保對齊圓圈中心
  html += `<div style="position:absolute; top:15px; left:20px; width:calc(${progressPercent}% - 40px); max-width:calc(100% - 40px); height:4px; background:#28a745; z-index:0; transition:width 0.3s;"></div>`;

  steps.forEach((step, idx) => {
    const isCompleted = idx <= currentIndex;
    const color = isCompleted ? "#28a745" : "#ccc";
    const icon = isCompleted ? "fa-check-circle" : "fa-circle";

    html += `
            <div style="position:relative; z-index:1; text-align:center; flex:1;">
                <i class="fas ${icon}" style="color:${color}; font-size:24px; background:#fff; border-radius:50%;"></i>
                <div style="font-size:12px; margin-top:5px; color:${
                  isCompleted ? "#333" : "#999"
                }; font-weight:${idx === currentIndex ? "bold" : "normal"};">
                    ${step.label}
                </div>
            </div>
        `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// --- [關鍵修復] 渲染偏遠地區選單 ---
// 必須定義為 window.renderDeliveryLocations 以便外部呼叫
window.renderDeliveryLocations = function () {
  const select = document.getElementById("ship-delivery-location");
  if (!select || select.options.length > 1) return; // 避免重複渲染

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

// [UI 保留] 附加服務 UI 連動邏輯
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
