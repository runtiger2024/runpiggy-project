// frontend/js/dashboard-shipments.js
// V24.1 (優化版) - 移除重複計算邏輯，完全依賴後端提供的數據

// --- 1. 載入我的集運單 ---
window.loadMyShipments = async function () {
  const tableBody = document.getElementById("shipments-table-body");
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    renderShipmentsTable(data.shipments || []);
  } catch (e) {
    if (tableBody)
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center error-text">載入失敗: ${e.message}</td></tr>`;
  }
};

// --- 2. 渲染集運單列表 ---
function renderShipmentsTable(shipments) {
  const tableBody = document.getElementById("shipments-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (shipments.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">目前沒有集運單</td></tr>';
    return;
  }

  const statusMap = window.SHIPMENT_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};

  shipments.forEach((ship) => {
    let statusText = statusMap[ship.status] || ship.status;
    let statusClass = statusClasses[ship.status] || "";

    if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
      statusText = "已付款 (待審核)";
      statusClass = "status-PENDING_REVIEW";
    }

    let actionBtns = `<button class="btn btn-sm btn-primary" onclick="openShipmentDetails('${ship.id}')">詳情</button> `;
    if (ship.status === "PENDING_PAYMENT") {
      if (!ship.paymentProof) {
        actionBtns += `<button class="btn btn-sm btn-primary" onclick="window.openUploadProof('${ship.id}')">去付款</button>`;
      } else {
        actionBtns += `<button class="btn btn-sm btn-success" onclick="window.viewProof('${ship.paymentProof}')">憑證</button>`;
      }
      actionBtns += `<button class="btn btn-sm btn-danger" onclick="handleCancelShipment('${ship.id}')">取消</button>`;
    } else {
      actionBtns += `<button class="btn btn-sm btn-secondary" onclick="window.open('shipment-print.html?id=${ship.id}', '_blank')">明細</button>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="visibility:hidden;"></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        <div>${ship.recipientName}</div>
        <small>訂單: ${ship.id.slice(-8).toUpperCase()}</small>
        <div style="font-size:12px; color:#888; margin-top:4px;">${new Date(
          ship.createdAt
        ).toLocaleDateString()}</div>
      </td>
      <td><span style="color:#d32f2f; font-weight:bold;">NT$ ${(
        ship.totalCost || 0
      ).toLocaleString()}</span></td>
      <td>${actionBtns}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// --- 3. 更新結帳列狀態 ---
window.updateCheckoutBar = function () {
  const count = document.querySelectorAll(".package-checkbox:checked").length;
  const btn = document.getElementById("btn-create-shipment");
  const span = document.getElementById("selected-pkg-count");
  if (span) span.textContent = count;
  if (btn) {
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `合併打包 (${count})` : "請勾選包裹";
    btn.style.opacity = count > 0 ? "1" : "0.6";
  }
};

// --- [新增] 附加服務邏輯初始化 ---
function setupServiceOptionsLogic() {
  const floorCheck = document.getElementById("srv-floor");
  const floorOptions = document.getElementById("srv-floor-options");
  if (floorCheck && floorOptions) {
    floorCheck.addEventListener("change", (e) => {
      floorOptions.style.display = e.target.checked ? "block" : "none";
    });
  }

  const toggleInput = (checkboxId, inputDivId) => {
    const cb = document.getElementById(checkboxId);
    const div = document.getElementById(inputDivId);
    if (cb && div) {
      cb.addEventListener("change", (e) => {
        div.style.display = e.target.checked ? "block" : "none";
      });
    }
  };

  toggleInput("srv-wood", "srv-wood-input");
  toggleInput("srv-assembly", "srv-assembly-input");
  toggleInput("srv-old", "srv-old-input");
}

function resetServiceForm() {
  const checkboxes = ["srv-floor", "srv-wood", "srv-assembly", "srv-old"];
  checkboxes.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.checked = false;
      el.dispatchEvent(new Event("change"));
    }
  });

  const radios = document.querySelectorAll('input[name="srv-elevator"]');
  radios.forEach((r) => (r.checked = false));

  const inputs = [
    "srv-floor-note",
    "srv-wood-note",
    "srv-assembly-note",
    "srv-old-note",
  ];
  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// --- 4. 點擊合併打包 (生成詳細清單，但不重複計算) ---
window.handleCreateShipmentClick = function () {
  const ids = Array.from(
    document.querySelectorAll(".package-checkbox:checked")
  ).map((c) => c.dataset.id);
  if (ids.length === 0) return;

  if (window.setupServiceOptionsLogic) setupServiceOptionsLogic(); // 確保函式已定義
  if (window.resetServiceForm) resetServiceForm();

  let html = "";

  // [變數] 追蹤超重超長 (使用後端提供的旗標)
  let shipmentHasOverweight = false;
  let shipmentHasOversized = false;

  ids.forEach((id) => {
    // 取得緩存的包裹資料 (來自 getMyPackages)
    const p = window.allPackagesData.find((x) => x.id === id);
    if (!p) return;

    // --- 優化：直接使用後端已計算好的數據 ---
    const boxes = Array.isArray(p.arrivedBoxes) ? p.arrivedBoxes : [];
    let breakdownHtml = "";
    let badgesHtml = "";

    // 累加包裹總重 (僅作顯示用)
    let pkgTotalWeight = 0;
    if (boxes.length > 0) {
      pkgTotalWeight = boxes.reduce(
        (sum, b) => sum + (parseFloat(b.weight) || 0),
        0
      );
    }

    // 檢查旗標 (由後端提供)
    if (p.isOversized) {
      shipmentHasOversized = true;
      badgesHtml += `<span class="badge-alert small" style="color:#c62828; border:1px solid #ef9a9a; background:#ffebee;">超長</span> `;
    }
    if (p.isOverweight) {
      shipmentHasOverweight = true;
      badgesHtml += `<span class="badge-alert small" style="color:#c62828; border:1px solid #ef9a9a; background:#ffebee;">超重</span>`;
    }

    // 生成箱子明細 (顯示後端計算結果)
    if (boxes.length > 0) {
      boxes.forEach((b, idx) => {
        // 使用後端注入的 calculatedFee
        const boxFee = b.calculatedFee || 0;
        const isVolWin = b.isVolWin;
        const cai = b.cai || 0; // 後端有算

        breakdownHtml += `
                <div class="checkout-box-row">
                    <span class="box-idx">#${idx + 1}</span>
                    <span class="box-dim">${b.length}x${b.width}x${b.height}/${
          b.weight
        }kg</span>
                    <span class="box-fee">
                        ${
                          isVolWin ? `材(${cai})` : `重`
                        } $${boxFee.toLocaleString()}
                    </span>
                </div>
            `;
      });
    } else {
      breakdownHtml = `<div style="color:#999;font-size:12px;">(尚無詳細測量數據)</div>`;
    }

    // 使用後端存儲的總費用
    const pkgTotalFee = p.totalCalculatedFee || 0;

    html += `
    <div class="shipment-package-item detailed-mode">
      <div class="item-main-row">
          <div class="item-info">
            <div class="item-name">${p.productName}</div>
            <div class="item-track">${p.trackingNumber}</div>
          </div>
          <div class="item-cost">$${pkgTotalFee.toLocaleString()}</div>
      </div>
      
      <div class="item-meta-row">
         <span>共 ${boxes.length} 箱 / 總重 ${pkgTotalWeight.toFixed(
      1
    )} kg</span>
         <div class="item-badges">${badgesHtml}</div>
      </div>

      <div class="item-breakdown-box">
         ${breakdownHtml}
      </div>
    </div>`;
  });

  document.getElementById("shipment-package-list").innerHTML = html;
  document.getElementById("create-shipment-form").dataset.ids =
    JSON.stringify(ids);

  // 預填個資
  if (window.currentUser) {
    document.getElementById("ship-name").value = window.currentUser.name || "";
    document.getElementById("ship-phone").value =
      window.currentUser.phone || "";
    document.getElementById("ship-street-address").value =
      window.currentUser.defaultAddress || "";
  }

  // 重置 UI 狀態
  const locSelect = document.getElementById("ship-delivery-location");
  if (locSelect) locSelect.value = "";
  const remoteInfo = document.getElementById("ship-remote-area-info");
  if (remoteInfo) remoteInfo.style.display = "none";
  const feeContainer = document.getElementById("api-fee-breakdown");
  if (feeContainer)
    feeContainer.innerHTML = `<div style="text-align:center;color:#999; padding:10px;">請選擇配送地區以計算總運費</div>`;

  // 清空圖片預覽
  document.getElementById("ship-product-url").value = "";
  const imgInput = document.getElementById("ship-product-images");
  if (imgInput && imgInput.resetUploader) imgInput.resetUploader();

  if (window.renderShipmentRemoteAreaOptions)
    window.renderShipmentRemoteAreaOptions();

  // 顯示堆高機與超長警告 (根據旗標)
  const warningEl = document.getElementById("forklift-warning");
  if (warningEl) {
    if (shipmentHasOverweight) {
      warningEl.innerHTML = `<i class="fas fa-dolly"></i> <strong>超重提醒：</strong> 偵測到超重物品 (≥100kg)，請確認收件地可<strong>自行安排堆高機</strong>卸貨。`;
      warningEl.style.display = "block";
    } else if (shipmentHasOversized) {
      warningEl.innerHTML = `<i class="fas fa-ruler-combined"></i> <strong>超長提醒：</strong> 偵測到超長物品 (≥300cm)，請確認收件地動線可供貨車進出。`;
      warningEl.style.display = "block";
    } else {
      warningEl.style.display = "none";
    }
  }

  document.getElementById("create-shipment-modal").style.display = "flex";
};

// --- 5. 渲染地區選項 ---
window.renderShipmentRemoteAreaOptions = function () {
  const sel = document.getElementById("ship-delivery-location");
  if (!sel || !window.REMOTE_AREAS) return;
  let html = `<option value="" selected disabled>--- 請選擇 ---</option>`;
  html += `<option value="0" style="color:green; font-weight:bold;">✅ 一般地區 (無額外費用)</option>`;

  Object.keys(window.REMOTE_AREAS)
    .sort((a, b) => a - b)
    .forEach((fee) => {
      if (fee === "0") return;
      html += `<optgroup label="偏遠地區 +$${fee}/方">`;
      window.REMOTE_AREAS[fee].forEach(
        (area) => (html += `<option value="${fee}">${area}</option>`)
      );
      html += `</optgroup>`;
    });
  sel.innerHTML = html;
};

// --- 6. 重新計算總運費 (呼叫後端 API) ---
// 注意：這裡本來就是呼叫 API，所以邏輯是正確的，無需變更
window.recalculateShipmentTotal = async function () {
  const ids = JSON.parse(
    document.getElementById("create-shipment-form").dataset.ids || "[]"
  );
  const locationRate = document.getElementById("ship-delivery-location").value;
  const container = document.getElementById("api-fee-breakdown");

  if (!locationRate) return;
  container.innerHTML = `<div style="text-align:center; padding:10px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;"></div> 正在精算運費...</div>`;

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({
        packageIds: ids,
        deliveryLocationRate: parseFloat(locationRate),
      }),
    });
    const data = await res.json();

    if (data.success) {
      const p = data.preview;

      let html = `<div class="fee-breakdown-row"><span>基本運費總計</span> <span>$${p.baseCost.toLocaleString()}</span></div>`;

      if (p.isMinimumChargeApplied) {
        const gap = p.baseCost - p.originalBaseCost;
        html += `<div class="fee-breakdown-row highlight" style="background:#fff3cd; color:#856404; padding:5px; border-radius:4px;">
                    <span><i class="fas fa-info-circle"></i> 未達低消，補足差額</span>
                    <span>+$${gap.toLocaleString()}</span>
                 </div>`;
      }

      if (p.remoteFee > 0) {
        html += `<div class="fee-breakdown-row">
              <span>偏遠派送費 <br><small style="color:#888; font-size:11px;">(總體積 ${
                p.totalCbm
              } CBM x $${locationRate})</small></span> 
              <span>+$${p.remoteFee.toLocaleString()}</span>
          </div>`;
      }

      if (p.overweightFee > 0) {
        html += `<div class="fee-breakdown-row highlight" style="color:#c62828;"><span>⚠️ 超重附加費</span> <span>+$${p.overweightFee.toLocaleString()}</span></div>`;
      }

      if (p.oversizedFee > 0) {
        html += `<div class="fee-breakdown-row highlight" style="color:#c62828;"><span>⚠️ 超長附加費</span> <span>+$${p.oversizedFee.toLocaleString()}</span></div>`;
      }

      html += `<div class="fee-breakdown-row total" style="border-top:2px solid #1a73e8; margin-top:10px; padding-top:10px; font-weight:bold; color:#d32f2f; font-size:1.4em;">
                  <span>總費用</span> 
                  <span>NT$ ${p.totalCost.toLocaleString()}</span>
               </div>
               <div style="text-align:right; font-size:12px; color:#666; margin-top:5px;">(含基本運費 + 偏遠費 + 附加費)</div>`;

      container.innerHTML = html;
    } else {
      container.innerHTML = `<span style="color:red;">試算失敗: ${data.message}</span>`;
    }
  } catch (e) {
    container.innerHTML = `<span style="color:red;">無法連線</span>`;
  }
};

// --- 7. 提交建立訂單 ---
window.handleCreateShipmentSubmit = async function (e) {
  e.preventDefault();
  const form = e.target;
  const ids = JSON.parse(form.dataset.ids);
  const locationRate = document.getElementById("ship-delivery-location").value;

  if (!locationRate) return alert("請選擇配送地區");

  const street = document.getElementById("ship-street-address").value.trim();
  const selOpt = document.getElementById("ship-delivery-location")
    .selectedOptions[0];
  const areaName = selOpt.text
    .replace(/[✅📍]/g, "")
    .split("-")[0]
    .trim();
  const fullAddress = (areaName === "一般地區" ? "" : areaName + " ") + street;

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

  const fd = new FormData();
  fd.append("packageIds", JSON.stringify(ids));
  fd.append("recipientName", document.getElementById("ship-name").value);
  fd.append("phone", document.getElementById("ship-phone").value);
  fd.append("shippingAddress", fullAddress);
  fd.append("deliveryLocationRate", locationRate);
  fd.append("idNumber", document.getElementById("ship-idNumber").value);
  fd.append("taxId", document.getElementById("ship-taxId").value);
  fd.append("invoiceTitle", document.getElementById("ship-invoiceTitle").value);
  fd.append("note", document.getElementById("ship-note").value);
  fd.append("productUrl", document.getElementById("ship-product-url").value);
  fd.append("additionalServices", JSON.stringify(services));

  const files = document.getElementById("ship-product-images").files;
  for (let i = 0; i < files.length; i++) fd.append("shipmentImages", files[i]);

  const btn = form.querySelector(".btn-place-order");
  btn.disabled = true;
  btn.textContent = "提交中...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      document.getElementById("create-shipment-modal").style.display = "none";
      document.getElementById("bank-info-modal").style.display = "flex";
      window.loadMyPackages();
      window.loadMyShipments();
    } else {
      const err = await res.json();
      alert("提交失敗: " + err.message);
    }
  } catch (e) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "提交訂單";
  }
};

// --- 8. 開啟集運單詳情 ---
window.openShipmentDetails = async function (id) {
  const modal = document.getElementById("shipment-details-modal");
  document.getElementById("sd-id").textContent = "載入中...";
  modal.style.display = "flex";
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (data.success) {
      const ship = data.shipment;
      document.getElementById("sd-id").textContent = ship.id
        .slice(-8)
        .toUpperCase();
      const statusMap = window.SHIPMENT_STATUS_MAP || {};
      document.getElementById("sd-status").textContent =
        statusMap[ship.status] || ship.status;
      document.getElementById("sd-date").textContent = new Date(
        ship.createdAt
      ).toLocaleDateString();
      document.getElementById("sd-trackingTW").textContent =
        ship.trackingNumberTW || "尚未產生";
      document.getElementById("sd-name").textContent = ship.recipientName;
      document.getElementById("sd-phone").textContent = ship.phone;
      document.getElementById("sd-address").textContent = ship.shippingAddress;

      document.getElementById("sd-fee-breakdown").innerHTML = `
        <div class="fee-breakdown-row total"><span>總金額</span><span>NT$ ${(
          ship.totalCost || 0
        ).toLocaleString()}</span></div>
        <small style="color:#666; display:block; margin-top:5px;">(含基本運費、偏遠費 $${
          ship.deliveryLocationRate
        }/方 及其他附加費)</small>
        <div style="margin-top:5px; font-size:12px; color:#888;">備註: ${
          ship.note || "無"
        }</div>
      `;

      const proofContainer = document.getElementById("sd-proof-images");
      proofContainer.innerHTML = "";
      const pImages = ship.shipmentProductImages || [];
      if (pImages.length > 0) {
        pImages.forEach((url) => {
          const img = document.createElement("img");
          img.src = `${API_BASE_URL}${url}`;
          img.style.cssText =
            "width:100%; height:80px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid #eee;";
          img.onclick = () => window.open(img.src, "_blank");
          proofContainer.appendChild(img);
        });
      } else if (ship.productUrl) {
        proofContainer.innerHTML = `<a href="${ship.productUrl}" target="_blank" style="word-break:break-all;">${ship.productUrl}</a>`;
      } else {
        proofContainer.innerHTML = "<span style='color:#999'>無</span>";
      }
    }
  } catch (e) {
    modal.style.display = "none";
  }
};

// --- 9. 其他輔助功能 ---
window.openUploadProof = function (id) {
  document.getElementById("upload-proof-id").value = id;
  const bankContainer = document.getElementById("upload-proof-bank-info");
  if (bankContainer) {
    if (window.BANK_INFO_CACHE) {
      const b = window.BANK_INFO_CACHE;
      bankContainer.innerHTML = `
            <div style="text-align:center; margin-bottom:10px; font-weight:bold; color:#1a73e8;">請匯款至以下帳戶</div>
            <div><strong>銀行：</strong> ${b.bankName} ${b.branch || ""}</div>
            <div>
                <strong>帳號：</strong> 
                <span id="proof-account-text" style="color:#d32f2f; font-weight:bold; font-size:1.1em; user-select:all;">${
                  b.account
                }</span>
                <button type="button" class="btn btn-outline-primary btn-sm" 
                    style="padding: 1px 8px; font-size: 12px; width: auto; display: inline-block; margin-left: 8px; border-radius: 12px;" 
                    onclick="window.copyToClipboard('${b.account}')">
                    <i class="far fa-copy"></i> 複製
                </button>
            </div>
            <div><strong>戶名：</strong> ${b.holder}</div>
            <div style="margin-top:10px; font-size:12px; color:#888; text-align:center;">(請上傳包含「轉帳金額」與「成功畫面」的截圖)</div>
          `;
    } else {
      bankContainer.innerHTML = `<p style="color:#999; text-align:center;">暫無匯款資訊，請聯繫客服。</p>`;
    }
  }
  document.getElementById("upload-proof-modal").style.display = "flex";
};

window.handleUploadProofSubmit = async function (e) {
  e.preventDefault();
  const id = document.getElementById("upload-proof-id").value;
  const file = document.getElementById("proof-file").files[0];
  const fd = new FormData();
  fd.append("paymentProof", file);

  await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${window.dashboardToken}` },
    body: fd,
  });
  document.getElementById("upload-proof-modal").style.display = "none";
  if (window.showMessage) window.showMessage("上傳成功", "success");
  window.loadMyShipments();
};

window.viewProof = function (url) {
  window.open(`${API_BASE_URL}${url}`, "_blank");
};

window.handleCancelShipment = async function (id) {
  if (!confirm("確定取消?")) return;
  await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${window.dashboardToken}` },
  });
  window.loadMyShipments();
  window.loadMyPackages();
  if (window.showMessage) window.showMessage("訂單已取消", "success");
};

window.updateBankInfoDOM = function (info) {
  if (document.getElementById("bank-name"))
    document.getElementById("bank-name").textContent = `${info.bankName} ${
      info.branch || ""
    }`;
  if (document.getElementById("bank-account"))
    document.getElementById("bank-account").textContent = info.account;
  if (document.getElementById("bank-holder"))
    document.getElementById("bank-holder").textContent = info.holder;
};

window.copyToClipboard = function (text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        alert("✅ 已複製帳號：" + text);
      })
      .catch((err) => {
        console.error("複製失敗:", err);
        prompt("您的瀏覽器不支援自動複製，請手動複製：", text);
      });
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      alert("✅ 已複製帳號：" + text);
    } catch (err) {
      prompt("您的瀏覽器不支援自動複製，請手動複製：", text);
    }
    document.body.removeChild(textArea);
  }
};
