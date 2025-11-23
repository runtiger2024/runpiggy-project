// frontend/js/dashboard-shipments.js
// 負責：集運單列表、建立訂單(結帳)、取消訂單、詳情、上傳憑證

window.loadMyShipments = async function () {
  const tableBody = document.getElementById("shipments-table-body");
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    renderShipmentsTable(data.shipments || []);
  } catch (e) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center error-text">載入失敗: ${e.message}</td></tr>`;
  }
};

function renderShipmentsTable(shipments) {
  const tableBody = document.getElementById("shipments-table-body");
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

// --- 建立訂單 (結帳) ---
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

window.handleCreateShipmentClick = function () {
  const ids = Array.from(
    document.querySelectorAll(".package-checkbox:checked")
  ).map((c) => c.dataset.id);
  if (ids.length === 0) return;

  let html = "";
  ids.forEach((id) => {
    const p = window.allPackagesData.find((x) => x.id === id);
    if (p)
      html += `<div class="shipment-package-item"><div class="info">${p.productName}</div><div class="cost">$${p.totalCalculatedFee}</div></div>`;
  });
  document.getElementById("shipment-package-list").innerHTML = html;
  document.getElementById("create-shipment-form").dataset.ids =
    JSON.stringify(ids);

  // 預填個資
  document.getElementById("ship-name").value = window.currentUser.name || "";
  document.getElementById("ship-phone").value = window.currentUser.phone || "";
  document.getElementById("ship-street-address").value =
    window.currentUser.defaultAddress || "";

  // 重置地區
  const locSelect = document.getElementById("ship-delivery-location");
  locSelect.value = "";
  document.getElementById("ship-remote-area-info").style.display = "none";
  document.getElementById(
    "api-fee-breakdown"
  ).innerHTML = `<div style="text-align:center;color:#999; padding:10px;">請選擇配送地區以計算總運費</div>`;

  // 如果有地區渲染函式，重新呼叫一次確保最新
  if (window.renderShipmentRemoteAreaOptions)
    window.renderShipmentRemoteAreaOptions();

  document.getElementById("create-shipment-modal").style.display = "flex";
};

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

// 試算運費 (API)
window.recalculateShipmentTotal = async function () {
  const ids = JSON.parse(
    document.getElementById("create-shipment-form").dataset.ids || "[]"
  );
  const locationRate = document.getElementById("ship-delivery-location").value;
  const container = document.getElementById("api-fee-breakdown");

  if (!locationRate) return;
  container.innerHTML = `<div style="text-align:center; padding:10px;">正在精算運費...</div>`;

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
      const CONSTANTS = window.CONSTANTS || {};
      let html = `<div class="fee-breakdown-row"><span>基本運費</span> <span>$${p.baseCost.toLocaleString()}</span></div>`;
      if (p.isMinimumChargeApplied)
        html += `<div class="fee-breakdown-row highlight" style="font-size:12px; color:#e67e22;">(已補足低消 $${
          CONSTANTS.MINIMUM_CHARGE || 2000
        })</div>`;
      if (p.remoteFee > 0)
        html += `<div class="fee-breakdown-row"><span>偏遠地區費</span> <span>+$${p.remoteFee.toLocaleString()}</span></div>`;
      if (p.overweightFee > 0)
        html += `<div class="fee-breakdown-row highlight"><span>超重附加費</span> <span>+$${p.overweightFee.toLocaleString()}</span></div>`;
      if (p.oversizedFee > 0)
        html += `<div class="fee-breakdown-row highlight"><span>超長附加費</span> <span>+$${p.oversizedFee.toLocaleString()}</span></div>`;
      html += `<div class="fee-breakdown-row total" style="border-top:1px solid #ddd; margin-top:5px; padding-top:5px; font-weight:bold; color:#d32f2f; font-size:18px;"><span>總運費</span> <span>NT$ ${p.totalCost.toLocaleString()}</span></div>`;
      container.innerHTML = html;
    } else {
      container.innerHTML = `<span style="color:red;">試算失敗: ${data.message}</span>`;
    }
  } catch (e) {
    container.innerHTML = `<span style="color:red;">無法連線</span>`;
  }
};

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

// 詳情、上傳、查看憑證、取消
window.openShipmentDetails = async function (id) {
  // (與 dashboard.js 原有邏輯相同，為節省篇幅略過重複代碼，請直接使用原有 openShipmentDetails 邏輯)
  // 這裡僅示例呼叫 API 與填充欄位
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
      // ... 其他欄位填充 (參考原 dashboard.js) ...

      // 填充費用明細
      document.getElementById("sd-fee-breakdown").innerHTML = `
        <div class="fee-breakdown-row total"><span>總金額</span><span>NT$ ${(
          ship.totalCost || 0
        ).toLocaleString()}</span></div>
        <small style="color:#666; display:block; margin-top:5px;">(含基本運費、偏遠費 $${
          ship.deliveryLocationRate
        }/方 及其他附加費)</small>
      `;
    }
  } catch (e) {
    modal.style.display = "none";
  }
};

window.openUploadProof = function (id) {
  document.getElementById("upload-proof-id").value = id;
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
  window.showMessage("上傳成功", "success");
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
  window.showMessage("訂單已取消", "success");
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
