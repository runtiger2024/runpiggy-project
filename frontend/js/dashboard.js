// frontend/js/dashboard.js (V22.0 - Mobile Card Fix)

// --- 全域變數 ---
let currentEditPackageImages = [];
let currentUser = null;
let allPackagesData = [];

// --- [全域函式] ---

window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;

  gallery.innerHTML = "";
  if (images && Array.isArray(images) && images.length > 0) {
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.alt = "預覽圖";
      img.style.cssText =
        "width:100%; object-fit:cover; border-radius:4px; cursor:pointer;";
      img.onclick = () => window.open(img.src, "_blank");
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML =
      "<p style='grid-column:1/-1;text-align:center;color:#999;'>沒有照片</p>";
  }
  modal.style.display = "flex";
};

window.openPackageDetails = function (pkgDataStr) {
  try {
    const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
    const modal = document.getElementById("package-details-modal");
    const boxesListContainer = document.getElementById("details-boxes-list");
    const imagesGallery = document.getElementById("details-images-gallery");

    const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
      ? pkg.arrivedBoxes
      : [];
    let boxesHtml = "";

    if (arrivedBoxes.length > 0) {
      boxesHtml += `
        <div class="table-responsive" style="box-shadow:none; background:transparent; padding:0;">
          <table style="width:100%; font-size:14px; border-collapse:collapse;">
            <thead style="display:table-header-group;">
              <tr style="background:#f0f0f0;">
                <th style="padding:8px; text-align:left;">箱號</th>
                <th style="padding:8px; text-align:left;">規格 (cm)</th>
                <th style="padding:8px; text-align:left;">材/重</th>
                <th style="padding:8px; text-align:right;">費用</th>
              </tr>
            </thead>
            <tbody>`;

      arrivedBoxes.forEach((box, idx) => {
        const l = parseFloat(box.length) || 0;
        const w_dim = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const w = parseFloat(box.weight) || 0;
        const finalFee = box.fee || 0;

        boxesHtml += `
          <tr style="border-bottom:1px solid #eee; background:none; box-shadow:none; padding:0; margin:0; border-radius:0;">
            <td style="padding:8px; border:none; position:static;">#${
              idx + 1
            }</td>
            <td style="padding:8px; border:none; position:static; text-align:left;">${l}x${w_dim}x${h}</td>
            <td style="padding:8px; border:none; position:static; text-align:left;">${w}kg</td>
            <td style="padding:8px; border:none; position:static; text-align:right; color:#d32f2f;">$${finalFee.toLocaleString()}</td>
          </tr>
        `;
      });
      boxesHtml += `</tbody></table></div>`;
      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888; padding:10px;">📦 暫無分箱測量數據</p>';
    }

    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);
    document.getElementById("details-total-fee").textContent = `NT$ ${(
      pkg.totalCalculatedFee || 0
    ).toLocaleString()}`;

    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
    imagesGallery.innerHTML = "";
    if (warehouseImages.length > 0) {
      warehouseImages.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = `${API_BASE_URL}${imgUrl}`;
        img.loading = "lazy";
        img.style.cssText =
          "width:100%; height:100px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid #eee;";
        img.onclick = () => window.open(img.src, "_blank");
        imagesGallery.appendChild(img);
      });
    } else {
      imagesGallery.innerHTML =
        "<p style='grid-column:1/-1; text-align:center; color:#999'>尚無倉庫照片</p>";
    }

    modal.style.display = "flex";
  } catch (e) {
    alert("無法載入詳情");
  }
};

window.openUploadProof = function (shipmentId) {
  document.getElementById("upload-proof-id").value = shipmentId;
  document.getElementById("proof-file").value = null;
  document.getElementById("upload-proof-modal").style.display = "flex";
};

window.viewProof = function (imgUrl) {
  window.open(`${API_BASE_URL}${imgUrl}`, "_blank");
};

window.handleCancelShipment = async function (id) {
  if (
    !confirm(
      "確定要取消此集運單嗎？\n\n注意：取消後，包裹將會釋放回「我的包裹」列表。"
    )
  )
    return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (res.ok) {
      alert("訂單已取消，包裹已釋放。");
      window.location.reload();
    } else {
      const err = await res.json();
      alert("取消失敗: " + err.message);
    }
  } catch (e) {
    alert("網路錯誤");
  }
};

window.openShipmentDetails = async function (id) {
  try {
    const modal = document.getElementById("shipment-details-modal");
    document.getElementById("sd-id").textContent = "載入中...";
    modal.style.display = "flex";

    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
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

    const breakdownContainer = document.getElementById("sd-fee-breakdown");
    breakdownContainer.innerHTML = `
      <div class="fee-breakdown-row total"><span>總金額</span><span>NT$ ${(
        ship.totalCost || 0
      ).toLocaleString()}</span></div>
      <small style="color:#666; display:block; margin-top:5px;">費率: $${
        ship.deliveryLocationRate
      }/方</small>
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
      proofContainer.innerHTML = `<a href="${ship.productUrl}" target="_blank" style="word-break:break-all; color:#1a73e8;">${ship.productUrl}</a>`;
    } else {
      proofContainer.innerHTML =
        "<p style='color:#999; font-size:14px;'>無證明</p>";
    }
  } catch (e) {
    alert("載入失敗");
  }
};

// --- 主程式 DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // DOM Elements
  const messageBox = document.getElementById("message-box");
  const welcomeMessage = document.getElementById("welcome-message");
  const userEmail = document.getElementById("user-email");
  const userPhone = document.getElementById("user-phone");
  const userAddress = document.getElementById("user-address");
  const tabPackages = document.getElementById("tab-packages");
  const tabShipments = document.getElementById("tab-shipments");
  const packagesSection = document.getElementById("packages-section");
  const shipmentsSection = document.getElementById("shipments-section");
  const forecastForm = document.getElementById("forecast-form");
  const imagesInput = document.getElementById("images");
  const fileCountDisplay = document.getElementById("file-count-display");
  const shipProofInput = document.getElementById("ship-product-images");
  const shipProofDisplay = document.getElementById(
    "ship-product-files-display"
  );
  const packagesTableBody = document.getElementById("packages-table-body");
  const shipmentsTableBody = document.getElementById("shipments-table-body");
  const selectedPkgCountSpan = document.getElementById("selected-pkg-count");
  const btnCreateShipment = document.getElementById("btn-create-shipment");
  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const shipmentPackageList = document.getElementById("shipment-package-list");
  const shipmentFeeContainer = document.getElementById("api-fee-breakdown");
  const shipDeliveryLocation = document.getElementById(
    "ship-delivery-location"
  );
  const shipAreaSearch = document.getElementById("ship-area-search");
  const shipSearchResults = document.getElementById("ship-search-results");
  const shipRemoteAreaInfo = document.getElementById("ship-remote-area-info");
  const shipSelectedAreaName = document.getElementById(
    "ship-selected-area-name"
  );
  const shipSelectedAreaFee = document.getElementById("ship-selected-area-fee");
  const bankInfoModal = document.getElementById("bank-info-modal");
  const btnCopyBankInfo = document.getElementById("btn-copy-bank-info");
  const uploadProofModal = document.getElementById("upload-proof-modal");
  const uploadProofForm = document.getElementById("upload-proof-form");
  const editProfileModal = document.getElementById("edit-profile-modal");
  const editProfileForm = document.getElementById("edit-profile-form");
  const btnEditProfile = document.getElementById("btn-edit-profile");
  const editPackageModal = document.getElementById("edit-package-modal");
  const editPackageForm = document.getElementById("edit-package-form");

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    setTimeout(() => {
      messageBox.style.display = "none";
    }, 3000);
  }

  async function loadSystemSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.rates) {
            window.RATES = data.rates.categories;
            window.CONSTANTS = data.rates.constants;
          }
          if (data.remoteAreas) window.REMOTE_AREAS = data.remoteAreas;
          if (data.bankInfo) updateBankInfoDOM(data.bankInfo);
        }
      }
    } catch (e) {}
    renderShipmentRemoteAreaOptions();
  }

  function updateBankInfoDOM(info) {
    if (document.getElementById("bank-name") && info.bankName)
      document.getElementById("bank-name").textContent = `${info.bankName} ${
        info.branch || ""
      }`;
    if (document.getElementById("bank-account") && info.account)
      document.getElementById("bank-account").textContent = info.account;
    if (document.getElementById("bank-holder") && info.holder)
      document.getElementById("bank-holder").textContent = info.holder;
  }

  function renderShipmentRemoteAreaOptions() {
    if (!shipDeliveryLocation || !window.REMOTE_AREAS) return;
    shipDeliveryLocation.innerHTML = "";
    let html = `<option value="" selected disabled>--- 請選擇您的配送地區 ---</option>`;
    html += `<option value="0" style="font-weight: bold; color: #27ae60">✅ 一般地區 (無額外費用)</option>`;
    const sortedFees = Object.keys(window.REMOTE_AREAS).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );
    sortedFees.forEach((fee) => {
      if (fee === "0") return;
      const areas = window.REMOTE_AREAS[fee];
      let label = `📍 偏遠地區 - NT$${parseInt(fee).toLocaleString()}/方起`;
      html += `<optgroup label="${label}">`;
      areas.forEach((area) => {
        html += `<option value="${fee}">${area}</option>`;
      });
      html += `</optgroup>`;
    });
    shipDeliveryLocation.innerHTML = html;
  }

  async function loadUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Auth failed");
      const data = await response.json();
      currentUser = data.user;
      welcomeMessage.textContent = `${currentUser.name || "會員"}，您好`;
      userEmail.textContent = currentUser.email;
      userPhone.textContent = currentUser.phone || "(未填寫)";
      userAddress.textContent = currentUser.defaultAddress || "(未填寫)";
    } catch (error) {
      localStorage.removeItem("token");
      window.location.href = "login.html";
    }
  }

  // --- [核心] 渲染包裹列表 ---
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      allPackagesData = data.packages || [];
      renderPackagesTable();
    } catch (e) {
      packagesTableBody.innerHTML = `<tr><td colspan="5" class="text-center">載入失敗</td></tr>`;
    }
  }

  function renderPackagesTable() {
    packagesTableBody.innerHTML = "";
    if (allPackagesData.length === 0) {
      packagesTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center" style="padding:30px;">沒有包裹，請先預報</td></tr>';
      updateCheckoutBar();
      return;
    }
    const statusMap = window.PACKAGE_STATUS_MAP || {};
    const statusClasses = window.STATUS_CLASSES || {};

    allPackagesData.forEach((pkg) => {
      const statusText = statusMap[pkg.status] || pkg.status;
      const statusClass = statusClasses[pkg.status] || "";
      const isArrived = pkg.status === "ARRIVED";

      let infoText = "<span>(無數據)</span>";
      const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
        ? pkg.arrivedBoxes
        : [];
      if (arrivedBoxes.length > 0) {
        const totalW = arrivedBoxes.reduce(
          (sum, b) => sum + (parseFloat(b.weight) || 0),
          0
        );
        infoText = `<span>${arrivedBoxes.length}箱 / ${totalW.toFixed(
          1
        )}kg</span>`;
        if (pkg.totalCalculatedFee) {
          infoText += ` <span>$${pkg.totalCalculatedFee.toLocaleString()}</span>`;
        }
      }
      const pkgStr = encodeURIComponent(JSON.stringify(pkg));
      const tr = document.createElement("tr");

      // HTML 結構對應 CSS nth-child
      // 1. Checkbox
      // 2. Status
      // 3. Content (Title/Tracking)
      // 4. Specs/Fee
      // 5. Actions
      tr.innerHTML = `
        <td><input type="checkbox" class="package-checkbox" data-id="${
          pkg.id
        }" ${!isArrived ? "disabled" : ""}></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div>${pkg.productName}</div>
          <small>${pkg.trackingNumber}</small>
        </td>
        <td>${infoText}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick='window.openPackageDetails("${pkgStr}")'>詳情</button>
          ${
            pkg.status === "PENDING"
              ? `<button class="btn btn-sm btn-secondary btn-edit">修改</button> <button class="btn btn-sm btn-danger btn-delete">刪除</button>`
              : ""
          }
        </td>
      `;

      tr.querySelector(".package-checkbox").addEventListener(
        "change",
        updateCheckoutBar
      );
      if (tr.querySelector(".btn-edit"))
        tr.querySelector(".btn-edit").addEventListener("click", () =>
          openEditPackageModal(pkg)
        );
      if (tr.querySelector(".btn-delete"))
        tr.querySelector(".btn-delete").addEventListener("click", () =>
          handleDeletePackage(pkg)
        );
      packagesTableBody.appendChild(tr);
    });
    updateCheckoutBar();
  }

  function updateCheckoutBar() {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    selectedPkgCountSpan.textContent = checked.length;
    btnCreateShipment.disabled = checked.length === 0;
  }

  async function handleDeletePackage(pkg) {
    if (confirm("確定刪除?")) {
      try {
        await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        loadMyPackages();
        showMessage("已刪除", "success");
      } catch (e) {
        alert("失敗");
      }
    }
  }

  // --- [核心] 渲染集運單列表 (結構對齊) ---
  async function loadMyShipments() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      renderShipmentsTable(data.shipments || []);
    } catch (e) {
      shipmentsTableBody.innerHTML = `<tr><td colspan="5" class="text-center">載入失敗</td></tr>`;
    }
  }

  function renderShipmentsTable(shipments) {
    shipmentsTableBody.innerHTML = "";
    if (shipments.length === 0) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center" style="padding:30px;">沒有集運單</td></tr>';
      return;
    }
    const statusMap = window.SHIPMENT_STATUS_MAP || {};
    const statusClasses = window.STATUS_CLASSES || {};

    shipments.forEach((ship) => {
      let statusText = statusMap[ship.status] || ship.status;
      let statusClass = statusClasses[ship.status] || "";
      if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
        statusText = "已付款，待審核";
        statusClass = "status-PENDING_REVIEW";
      }

      let btns = `<button class="btn btn-sm btn-primary" onclick="openShipmentDetails('${ship.id}')">詳情</button>`;
      if (ship.status === "PENDING_PAYMENT") {
        if (!ship.paymentProof)
          btns += `<button class="btn btn-sm btn-primary" onclick="window.openUploadProof('${ship.id}')">去付款</button>`;
        else
          btns += `<button class="btn btn-sm btn-success" onclick="window.viewProof('${ship.paymentProof}')">憑證</button>`;
        btns += `<button class="btn btn-sm btn-danger" onclick="handleCancelShipment('${ship.id}')">取消</button>`;
      } else {
        btns += `<button class="btn btn-sm btn-secondary" onclick="window.open('shipment-print.html?id=${ship.id}', '_blank')">明細</button>`;
      }

      const tr = document.createElement("tr");
      // HTML 結構對應 CSS nth-child (集運單沒有 checkbox，補空 td 佔位)
      // 1. [Empty] for Checkbox alignment
      // 2. Status
      // 3. Content (Recipient/Order ID)
      // 4. Cost
      // 5. Actions
      tr.innerHTML = `
        <td style="visibility: hidden;"></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div>${ship.recipientName}</div>
          <small>訂單: ${ship.id.slice(-8).toUpperCase()}</small>
        </td>
        <td><span>NT$ ${(ship.totalCost || 0).toLocaleString()}</span></td>
        <td>${btns}</td>
      `;
      shipmentsTableBody.appendChild(tr);
    });
  }

  // --- 表單監聽器 ---
  if (imagesInput)
    imagesInput.addEventListener("change", function () {
      fileCountDisplay.textContent =
        this.files.length > 0 ? `已選 ${this.files.length} 張` : "";
      fileCountDisplay.style.display =
        this.files.length > 0 ? "inline-block" : "none";
    });
  if (shipProofInput)
    shipProofInput.addEventListener("change", function () {
      shipProofDisplay.textContent =
        this.files.length > 0 ? `已選 ${this.files.length} 張` : "";
    });

  forecastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = forecastForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "提交中...";
    const fd = new FormData();
    fd.append(
      "trackingNumber",
      document.getElementById("trackingNumber").value
    );
    fd.append("productName", document.getElementById("productName").value);
    fd.append("quantity", document.getElementById("quantity").value);
    fd.append("note", document.getElementById("note").value);
    for (let f of imagesInput.files) fd.append("images", f);

    try {
      const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error();
      forecastForm.reset();
      fileCountDisplay.style.display = "none";
      loadMyPackages();
      showMessage("預報成功", "success");
      checkForecastDraftQueue(true);
    } catch (e) {
      showMessage("提交失敗", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
    }
  });

  btnCreateShipment.addEventListener("click", () => {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) return;
    const ids = Array.from(checked).map((box) => box.dataset.id);

    let html = "";
    ids.forEach((id) => {
      const p = allPackagesData.find((pkg) => pkg.id === id);
      if (p)
        html += `<div style="border-bottom:1px dashed #eee; padding:5px 0; display:flex; justify-content:space-between;"><span>${
          p.productName
        }</span><span>$${(
          p.totalCalculatedFee || 0
        ).toLocaleString()}</span></div>`;
    });
    shipmentPackageList.innerHTML = html;
    createShipmentForm.dataset.ids = JSON.stringify(ids);
    document.getElementById("ship-name").value = currentUser.name || "";
    document.getElementById("ship-phone").value = currentUser.phone || "";
    document.getElementById("ship-street-address").value =
      currentUser.defaultAddress || "";
    shipDeliveryLocation.value = "";
    shipRemoteAreaInfo.style.display = "none";
    shipmentFeeContainer.innerHTML =
      "<div style='text-align:center; color:#999'>請選擇地區以計算</div>";
    createShipmentModal.style.display = "flex";
  });

  shipDeliveryLocation.addEventListener("change", () => {
    shipRemoteAreaInfo.style.display = "block";
    shipSelectedAreaName.textContent =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex].text;
    recalculateShipmentTotal();
  });

  async function recalculateShipmentTotal() {
    const ids = JSON.parse(createShipmentForm.dataset.ids);
    const loc = shipDeliveryLocation.value;
    if (!loc) return;
    shipmentFeeContainer.innerHTML = "計算中...";
    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds: ids,
          deliveryLocationRate: parseFloat(loc),
        }),
      });
      const d = await res.json();
      if (d.success) {
        const p = d.preview;
        shipmentFeeContainer.innerHTML = `
          <div class="fee-breakdown-row"><span>基本運費</span><span>$${
            p.baseCost
          }</span></div>
          ${
            p.remoteFee > 0
              ? `<div class="fee-breakdown-row"><span>偏遠費</span><span>+$${p.remoteFee}</span></div>`
              : ""
          }
          <div class="fee-breakdown-row total"><span>總運費</span><span>NT$ ${
            p.totalCost
          }</span></div>
        `;
      }
    } catch (e) {
      shipmentFeeContainer.innerHTML = "計算錯誤";
    }
  }

  if (shipAreaSearch) {
    shipAreaSearch.addEventListener("input", (e) => {
      const val = e.target.value.trim().toLowerCase();
      shipSearchResults.innerHTML = "";
      if (!val) {
        shipSearchResults.style.display = "none";
        return;
      }
      if (window.REMOTE_AREAS) {
        Object.entries(window.REMOTE_AREAS).forEach(([fee, areas]) => {
          areas.forEach((area) => {
            if (area.toLowerCase().includes(val)) {
              shipSearchResults.innerHTML += `<div class="search-result-item" onclick="selectArea('${area}', ${fee})">${area} (+$${fee})</div>`;
            }
          });
        });
        shipSearchResults.style.display = "block";
      }
    });
  }

  window.selectArea = function (name, fee) {
    for (let i = 0; i < shipDeliveryLocation.options.length; i++) {
      if (
        shipDeliveryLocation.options[i].value == fee &&
        shipDeliveryLocation.options[i].text.includes(name)
      ) {
        shipDeliveryLocation.selectedIndex = i;
        shipDeliveryLocation.dispatchEvent(new Event("change"));
        shipAreaSearch.value = name;
        shipSearchResults.style.display = "none";
        break;
      }
    }
  };

  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!shipDeliveryLocation.value) return alert("請選擇地區");
    const ids = JSON.parse(createShipmentForm.dataset.ids);
    const street = document.getElementById("ship-street-address").value.trim();
    const areaName = shipDeliveryLocation.options[
      shipDeliveryLocation.selectedIndex
    ].text
      .split("-")[0]
      .replace(/[✅📍]/g, "")
      .trim();
    const fullAddr = (areaName === "一般地區" ? "" : areaName + " ") + street;

    const fd = new FormData();
    fd.append("packageIds", JSON.stringify(ids));
    fd.append("recipientName", document.getElementById("ship-name").value);
    fd.append("phone", document.getElementById("ship-phone").value);
    fd.append("shippingAddress", fullAddr);
    fd.append("deliveryLocationRate", shipDeliveryLocation.value);
    fd.append("idNumber", document.getElementById("ship-idNumber").value);
    fd.append("taxId", document.getElementById("ship-taxId").value);
    fd.append(
      "invoiceTitle",
      document.getElementById("ship-invoiceTitle").value
    );
    fd.append("note", document.getElementById("ship-note").value);
    fd.append("productUrl", document.getElementById("ship-product-url").value);
    for (let f of document.getElementById("ship-product-images").files)
      fd.append("shipmentImages", f);

    const btn = createShipmentForm.querySelector(".btn-place-order");
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        createShipmentModal.style.display = "none";
        bankInfoModal.style.display = "flex";
        loadMyPackages();
        loadMyShipments();
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    } finally {
      btn.disabled = false;
    }
  });

  // --- Other Events ---
  if (btnCopyBankInfo)
    btnCopyBankInfo.addEventListener("click", () => {
      const txt = `銀行：${
        document.getElementById("bank-name").innerText
      }\n帳號：${document.getElementById("bank-account").innerText}\n戶名：${
        document.getElementById("bank-holder").innerText
      }`;
      navigator.clipboard.writeText(txt).then(() => alert("已複製"));
    });

  uploadProofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("upload-proof-id").value;
    const fd = new FormData();
    fd.append("paymentProof", document.getElementById("proof-file").files[0]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        uploadProofModal.style.display = "none";
        loadMyShipments();
        alert("上傳成功");
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  // Edit Profile
  btnEditProfile.addEventListener("click", () => {
    document.getElementById("edit-name").value = currentUser.name || "";
    document.getElementById("edit-phone").value = currentUser.phone || "";
    document.getElementById("edit-address").value =
      currentUser.defaultAddress || "";
    editProfileModal.style.display = "flex";
  });
  editProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = {
      name: document.getElementById("edit-name").value,
      phone: document.getElementById("edit-phone").value,
      defaultAddress: document.getElementById("edit-address").value,
    };
    await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(d),
    });
    editProfileModal.style.display = "none";
    loadUserProfile();
  });

  // Edit Package
  window.openEditPackageModal = function (pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    currentEditPackageImages = pkg.productImages || [];
    renderEditImages();
    editPackageModal.style.display = "flex";
  };
  function renderEditImages() {
    const c = document.getElementById("edit-package-images-container");
    c.innerHTML = "";
    currentEditPackageImages.forEach((url, i) => {
      c.innerHTML += `<div style="position:relative; margin:5px;"><img src="${API_BASE_URL}${url}" style="width:50px;height:50px;object-fit:cover;"><span onclick="removeEditImg(${i})" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border-radius:50%;cursor:pointer;width:15px;height:15px;text-align:center;line-height:15px;font-size:10px;">x</span></div>`;
    });
  }
  window.removeEditImg = (i) => {
    currentEditPackageImages.splice(i, 1);
    renderEditImages();
  };

  editPackageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-package-id").value;
    const fd = new FormData();
    fd.append(
      "trackingNumber",
      document.getElementById("edit-trackingNumber").value
    );
    fd.append("productName", document.getElementById("edit-productName").value);
    fd.append("quantity", document.getElementById("edit-quantity").value);
    fd.append("note", document.getElementById("edit-note").value);
    fd.append("existingImages", JSON.stringify(currentEditPackageImages));
    for (let f of document.getElementById("edit-package-new-images").files)
      fd.append("images", f);
    try {
      const res = await fetch(`${API_BASE_URL}/api/packages/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        editPackageModal.style.display = "none";
        loadMyPackages();
        showMessage("更新成功", "success");
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  function checkForecastDraftQueue(isAfter) {
    const list = JSON.parse(
      localStorage.getItem("forecast_draft_list") || "[]"
    );
    if (list.length === 0) {
      document.getElementById("draft-queue-container").style.display = "none";
      return;
    }
    document.getElementById("draft-queue-container").style.display = "block";
    document.getElementById("draft-queue-list").innerHTML = list
      .map((i) => `<li>${i.name}</li>`)
      .join("");
    const next = list.shift();
    document.getElementById("productName").value = next.name || "";
    document.getElementById("quantity").value = next.quantity || 1;
    document.getElementById("note").value = "來自試算";
    localStorage.setItem("forecast_draft_list", JSON.stringify(list));
    if (isAfter) showMessage("自動帶入下一筆", "success");
  }

  tabPackages.addEventListener("click", () => {
    tabPackages.classList.add("active");
    tabShipments.classList.remove("active");
    packagesSection.style.display = "block";
    shipmentsSection.style.display = "none";
  });
  tabShipments.addEventListener("click", () => {
    tabPackages.classList.remove("active");
    tabShipments.classList.add("active");
    packagesSection.style.display = "none";
    shipmentsSection.style.display = "block";
  });

  document.querySelectorAll(".modal-overlay").forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    })
  );
  document
    .querySelectorAll(".modal-close, .modal-close-btn")
    .forEach((b) =>
      b.addEventListener(
        "click",
        () => (b.closest(".modal-overlay").style.display = "none")
      )
    );

  loadSystemSettings();
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();
  checkForecastDraftQueue(false);
});
