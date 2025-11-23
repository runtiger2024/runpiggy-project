// frontend/js/dashboard.js (V12 - 電商風格與動態渲染優化版)
// 相依檔案: apiConfig.js, shippingData.js

// --- 全域變數 ---
let currentEditPackageImages = []; // 編輯時暫存舊圖
let currentUser = null;
let allPackagesData = [];

// --- [全域函式] 供 HTML onclick 使用 ---

// 1. 開啟圖片瀏覽彈窗
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;

  gallery.innerHTML = "";
  if (images && images.length > 0) {
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.onclick = () => window.open(img.src, "_blank");
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = "<p>沒有照片</p>";
  }
  modal.style.display = "flex";
};

// 2. 開啟包裹入庫詳情彈窗
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
      boxesHtml += `<div class="table-responsive"><table class="detail-sub-package-table">
        <thead><tr><th>箱號</th><th>規格 (長x寬x高)</th><th>材積</th><th>重量</th><th>費用</th></tr></thead><tbody>`;

      arrivedBoxes.forEach((box, idx) => {
        const rate = window.RATES[box.type] || {};
        const l = parseFloat(box.length) || 0;
        const w_dim = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const w = parseFloat(box.weight) || 0;
        const cai = Math.ceil(
          (l * w_dim * h) / window.CONSTANTS.VOLUME_DIVISOR
        );
        const finalFee = box.fee || 0;

        boxesHtml += `
          <tr>
            <td>#${idx + 1} (${rate.name || box.type})</td>
            <td>${l} x ${w_dim} x ${h}</td>
            <td>${cai} 材</td>
            <td>${w} kg</td>
            <td style="color: #d32f2f; font-weight:bold;">$${finalFee.toLocaleString()}</td>
          </tr>
        `;
      });
      boxesHtml += `</tbody></table></div>`;
      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888;">暫無分箱資料</p>';
    }

    // 匯總數據
    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);
    document.getElementById("details-total-fee").textContent = `NT$ ${(
      pkg.totalCalculatedFee || 0
    ).toLocaleString()}`;

    // 倉庫照片
    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
    imagesGallery.innerHTML = "";
    if (warehouseImages.length > 0) {
      warehouseImages.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = `${API_BASE_URL}${imgUrl}`;
        img.loading = "lazy";
        img.onclick = () => window.open(img.src, "_blank");
        imagesGallery.appendChild(img);
      });
    } else {
      imagesGallery.innerHTML =
        "<p style='grid-column:1/-1; text-align:center; color:#999'>無照片</p>";
    }
    modal.style.display = "flex";
  } catch (e) {
    console.error(e);
    alert("載入詳情失敗");
  }
};

// 3. 上傳憑證與取消訂單
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
      "確定要取消此集運單嗎？\n\n取消後，包裹將會釋放回「我的包裹」列表，您可以重新打包。"
    )
  )
    return;

  const btn = document.querySelector(
    `button[onclick="handleCancelShipment('${id}')"]`
  );
  if (btn) {
    btn.disabled = true;
    btn.textContent = "處理中...";
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (res.ok) {
      alert("訂單已成功取消！包裹已釋放。");
      window.location.reload();
    } else {
      const err = await res.json();
      alert("取消失敗: " + (err.message || "未知錯誤"));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "取消訂單";
      }
    }
  } catch (e) {
    alert("網路錯誤");
    if (btn) btn.disabled = false;
  }
};

// --- 主程式 DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // --- 元素獲取 ---
  const messageBox = document.getElementById("message-box");
  const welcomeMessage = document.getElementById("welcome-message");
  const userEmail = document.getElementById("user-email");
  const userPhone = document.getElementById("user-phone");
  const userAddress = document.getElementById("user-address");

  // Tabs
  const tabPackages = document.getElementById("tab-packages");
  const tabShipments = document.getElementById("tab-shipments");
  const packagesSection = document.getElementById("packages-section");
  const shipmentsSection = document.getElementById("shipments-section");

  // 預報表單
  const forecastForm = document.getElementById("forecast-form");
  const imagesInput = document.getElementById("images");
  const fileCountDisplay = document.getElementById("file-count-display");

  // 圖片選擇監聽 (顯示張數)
  if (imagesInput) {
    imagesInput.addEventListener("change", function () {
      if (this.files && this.files.length > 0) {
        fileCountDisplay.textContent = `已選 ${this.files.length} 張`;
        fileCountDisplay.style.display = "inline-block";
      } else {
        fileCountDisplay.style.display = "none";
      }
    });
  }

  // 列表 Body
  const packagesTableBody = document.getElementById("packages-table-body");
  const shipmentsTableBody = document.getElementById("shipments-table-body");

  // 懸浮結算欄
  const selectedPkgCountSpan = document.getElementById("selected-pkg-count");
  const btnCreateShipment = document.getElementById("btn-create-shipment");

  // 集運單 Modal
  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const shipmentPackageList = document.getElementById("shipment-package-list");
  const shipmentTotalCost = document.getElementById("shipment-total-cost");
  const shipmentFeeNotice = document.getElementById("shipment-fee-notice");
  const shipmentWarnings = document.getElementById("shipment-warnings");

  // 地區相關
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

  // 銀行 & 上傳
  const bankInfoModal = document.getElementById("bank-info-modal");
  const btnCopyBankInfo = document.getElementById("btn-copy-bank-info");
  const uploadProofModal = document.getElementById("upload-proof-modal");
  const uploadProofForm = document.getElementById("upload-proof-form");

  // 編輯 Profile
  const editProfileModal = document.getElementById("edit-profile-modal");
  const editProfileForm = document.getElementById("edit-profile-form");
  const btnEditProfile = document.getElementById("btn-edit-profile");

  // 編輯包裹
  const editPackageModal = document.getElementById("edit-package-modal");
  const editPackageForm = document.getElementById("edit-package-form");

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    setTimeout(() => {
      messageBox.style.display = "none";
    }, 5000);
  }

  // --- (0) 載入系統設定 ---
  async function loadSystemSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.rates) {
            window.RATES = data.rates.categories || window.RATES;
            window.CONSTANTS = data.rates.constants || window.CONSTANTS;
          }
          if (data.remoteAreas) {
            window.REMOTE_AREAS = data.remoteAreas;
          }
          if (data.bankInfo) {
            updateBankInfoDOM(data.bankInfo);
          }
        }
      }
    } catch (e) {
      console.warn("Config load failed, using defaults.");
    }

    // [重要] 載入後渲染地區選項
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

  // 動態渲染地區選項 (取代 HTML 硬編碼)
  function renderShipmentRemoteAreaOptions() {
    if (!shipDeliveryLocation || !window.REMOTE_AREAS) return;

    // 清空並重建
    shipDeliveryLocation.innerHTML = "";

    let html = `<option value="" selected disabled>--- 請選擇您的配送地區 ---</option>`;
    html += `<option value="0" style="font-weight: bold; color: #27ae60">✅ 一般地區 (無額外費用)</option>`;

    const sortedFees = Object.keys(window.REMOTE_AREAS).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );

    sortedFees.forEach((fee) => {
      const areas = window.REMOTE_AREAS[fee];
      const feeVal = parseInt(fee);
      let label = `📍 偏遠地區 - NT$${feeVal.toLocaleString()}/方起`;
      let style = "";
      if (feeVal >= 4500) style = "color: #e74c3c";

      // 簡易分群標籤 (可選)
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
    shipDeliveryLocation.innerHTML = html;
  }

  // --- (A) 載入使用者資料 ---
  async function loadUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Auth failed");
      const data = await response.json();
      currentUser = data.user;

      welcomeMessage.textContent = `${currentUser.name || "親愛的會員"}，您好`;
      userEmail.textContent = currentUser.email;
      userPhone.textContent = currentUser.phone || "(未填寫)";
      userAddress.textContent = currentUser.defaultAddress || "(未填寫)";
    } catch (error) {
      localStorage.removeItem("token");
      window.location.href = "login.html";
    }
  }

  // --- (B) 載入包裹 (我的購物車) ---
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      allPackagesData = data.packages || [];
      renderPackagesTable();
    } catch (e) {
      packagesTableBody.innerHTML = `<tr><td colspan="5" class="text-center error-text">載入失敗: ${e.message}</td></tr>`;
    }
  }

  function renderPackagesTable() {
    packagesTableBody.innerHTML = "";
    if (allPackagesData.length === 0) {
      packagesTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center">目前沒有包裹</td></tr>';
      updateCheckoutBar();
      return;
    }

    allPackagesData.forEach((pkg) => {
      const statusText = window.PACKAGE_STATUS_MAP[pkg.status] || pkg.status;
      const statusClass = window.STATUS_CLASSES[pkg.status] || "";
      const isArrived = pkg.status === "ARRIVED";

      // 顯示費用與重量
      let infoText = "-";
      const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
        ? pkg.arrivedBoxes
        : [];
      if (arrivedBoxes.length > 0) {
        const totalW = arrivedBoxes.reduce(
          (sum, b) => sum + (parseFloat(b.weight) || 0),
          0
        );
        infoText = `${arrivedBoxes.length} 箱 / ${totalW.toFixed(1)} kg`;
        if (pkg.totalCalculatedFee) {
          infoText += `<br><span style="color:#d32f2f;font-weight:bold;">$${pkg.totalCalculatedFee.toLocaleString()}</span>`;
        }
      }

      const pkgStr = encodeURIComponent(JSON.stringify(pkg));
      const checkboxDisabled = !isArrived ? "disabled" : "";
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="text-center">
          <input type="checkbox" class="package-checkbox" data-id="${
            pkg.id
          }" ${checkboxDisabled}>
        </td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div style="font-weight:500; color:#333;">${pkg.productName}</div>
          <small style="color:#888;">${pkg.trackingNumber}</small>
        </td>
        <td>${infoText}</td>
        <td class="text-right">
          <button class="btn btn-outline-primary btn-sm" onclick='window.openPackageDetails("${pkgStr}")'>詳情</button>
          ${
            pkg.status === "PENDING"
              ? `<button class="btn btn-outline-secondary btn-sm btn-edit">修改</button>
             <button class="btn btn-outline-danger btn-sm btn-delete">刪除</button>`
              : ""
          }
        </td>
      `;

      // 綁定事件
      const checkbox = tr.querySelector(".package-checkbox");
      if (checkbox) checkbox.addEventListener("change", updateCheckoutBar);

      const btnEdit = tr.querySelector(".btn-edit");
      if (btnEdit)
        btnEdit.addEventListener("click", () => openEditPackageModal(pkg));

      const btnDelete = tr.querySelector(".btn-delete");
      if (btnDelete)
        btnDelete.addEventListener("click", () => handleDeletePackage(pkg));

      packagesTableBody.appendChild(tr);
    });
    updateCheckoutBar();
  }

  function updateCheckoutBar() {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    selectedPkgCountSpan.textContent = checked.length;

    if (checked.length > 0) {
      btnCreateShipment.disabled = false;
      btnCreateShipment.textContent = `合併打包 (${checked.length})`;
    } else {
      btnCreateShipment.disabled = true;
      btnCreateShipment.textContent = "請勾選包裹";
    }
  }

  async function handleDeletePackage(pkg) {
    if (confirm("確定要刪除此包裹預報嗎？")) {
      await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadMyPackages();
    }
  }

  // --- (C) 載入集運單 (訂單) ---
  async function loadMyShipments() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      renderShipmentsTable(data.shipments);
    } catch (e) {
      shipmentsTableBody.innerHTML = `<tr><td colspan="5" class="text-center error-text">載入失敗</td></tr>`;
    }
  }

  function renderShipmentsTable(shipments) {
    shipmentsTableBody.innerHTML = "";
    if (shipments.length === 0) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center">尚無集運單</td></tr>';
      return;
    }

    shipments.forEach((ship) => {
      let statusText = window.SHIPMENT_STATUS_MAP[ship.status] || ship.status;
      let statusClass = window.STATUS_CLASSES[ship.status] || "";

      if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
        statusText = "已付款 (待審核)";
        statusClass = "status-PENDING_REVIEW";
      }

      // 操作按鈕
      let actionBtns = "";
      if (ship.status === "PENDING_PAYMENT") {
        if (!ship.paymentProof) {
          actionBtns += `<button class="btn btn-primary btn-sm" onclick="window.openUploadProof('${ship.id}')">去付款 / 上傳</button>`;
        } else {
          actionBtns += `<button class="btn btn-success btn-sm" onclick="window.viewProof('${ship.paymentProof}')">查看憑證</button>`;
        }
        actionBtns += `<button class="btn btn-outline-danger btn-sm" style="margin-left:5px;" onclick="handleCancelShipment('${ship.id}')">取消</button>`;
      } else {
        actionBtns += `<button class="btn btn-outline-secondary btn-sm" onclick="window.open('shipment-print.html?id=${ship.id}', '_blank')">明細</button>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div>${new Date(ship.createdAt).toLocaleDateString()}</div>
          <small style="color:#999;">${ship.id.slice(-8).toUpperCase()}</small>
        </td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div>${ship.recipientName}</div>
          <small>${ship.shippingAddress.substring(0, 10)}...</small>
        </td>
        <td style="color:#d32f2f; font-weight:bold;">NT$ ${(
          ship.totalCost || 0
        ).toLocaleString()}</td>
        <td class="text-right">${actionBtns}</td>
      `;
      shipmentsTableBody.appendChild(tr);
    });
  }

  // --- (D) 提交預報 ---
  forecastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = forecastForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";

    const fd = new FormData();
    fd.append(
      "trackingNumber",
      document.getElementById("trackingNumber").value
    );
    fd.append("productName", document.getElementById("productName").value);
    fd.append("quantity", document.getElementById("quantity").value || 1);
    fd.append("note", document.getElementById("note").value);

    const files = imagesInput.files;
    for (let i = 0; i < files.length; i++) {
      fd.append("images", files[i]);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("提交失敗");

      forecastForm.reset();
      fileCountDisplay.style.display = "none";
      loadMyPackages();
      showMessage("預報成功！", "success");
      checkForecastDraftQueue(true);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
    }
  });

  // --- (E) 建立集運單 (結帳) ---
  btnCreateShipment.addEventListener("click", async () => {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) return;

    try {
      // 重新取得最新資料
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      allPackagesData = data.packages;

      let html = "";
      let ids = [];
      let totalFee = 0;
      let validCount = 0;

      checked.forEach((box) => {
        const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);
        if (p && p.status === "ARRIVED") {
          ids.push(p.id);
          totalFee += p.totalCalculatedFee || 0;
          validCount++;
          html += `
            <div class="shipment-package-item">
              <div class="info">
                <span>${p.productName}</span>
                <small style="display:block; color:#888;">${
                  p.trackingNumber
                }</small>
              </div>
              <div class="cost">$${(
                p.totalCalculatedFee || 0
              ).toLocaleString()}</div>
            </div>
          `;
        }
      });

      if (validCount === 0) {
        alert("所選包裹狀態已變更，請重新整理");
        loadMyPackages();
        return;
      }

      shipmentPackageList.innerHTML = html;
      createShipmentForm.dataset.ids = JSON.stringify(ids);

      // 預填資料
      document.getElementById("ship-name").value = currentUser.name || "";
      document.getElementById("ship-phone").value = currentUser.phone || "";
      document.getElementById("ship-street-address").value =
        currentUser.defaultAddress || "";
      shipDeliveryLocation.value = ""; // 重置
      shipRemoteAreaInfo.style.display = "none";

      // 重新計算一次費用 (Client Side Mock, 實際上應呼叫後端)
      recalculateShipmentTotal();
      createShipmentModal.style.display = "flex";
    } catch (e) {
      console.error(e);
      alert("載入失敗");
    }
  });

  // 前端簡易試算 (與後端邏輯保持一致)
  function recalculateShipmentTotal() {
    const ids = JSON.parse(createShipmentForm.dataset.ids || "[]");
    let totalFee = 0;
    let totalVol = 0;
    let hasOversized = false;
    let hasOverweight = false;

    const checked = document.querySelectorAll(".package-checkbox:checked");
    checked.forEach((box) => {
      const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);
      if (p && p.status === "ARRIVED") {
        totalFee += p.totalCalculatedFee || 0;
        const boxes = p.arrivedBoxes || [];
        boxes.forEach((b) => {
          const l = parseFloat(b.length) || 0;
          const w = parseFloat(b.width) || 0;
          const h = parseFloat(b.height) || 0;
          const wt = parseFloat(b.weight) || 0;

          if (
            l > window.CONSTANTS.OVERSIZED_LIMIT ||
            w > window.CONSTANTS.OVERSIZED_LIMIT ||
            h > window.CONSTANTS.OVERSIZED_LIMIT
          )
            hasOversized = true;
          if (wt > window.CONSTANTS.OVERWEIGHT_LIMIT) hasOverweight = true;

          totalVol += Math.ceil((l * w * h) / window.CONSTANTS.VOLUME_DIVISOR);
        });
      }
    });

    // 附加費
    const ovsFee = hasOversized ? window.CONSTANTS.OVERSIZED_FEE : 0;
    const ovwFee = hasOverweight ? window.CONSTANTS.OVERWEIGHT_FEE : 0;

    // 偏遠費
    const rate = parseFloat(shipDeliveryLocation.value) || 0;
    const cbm = totalVol / window.CONSTANTS.CBM_TO_CAI_FACTOR;
    const remoteFee = Math.round(cbm * rate);

    // 低消
    let finalBase = totalFee;
    if (finalBase > 0 && finalBase < window.CONSTANTS.MINIMUM_CHARGE) {
      finalBase = window.CONSTANTS.MINIMUM_CHARGE;
      shipmentFeeNotice.textContent = `(已套用低消 $${window.CONSTANTS.MINIMUM_CHARGE})`;
    } else {
      shipmentFeeNotice.textContent = "";
    }

    const finalTotal = finalBase + ovsFee + ovwFee + remoteFee;
    shipmentTotalCost.textContent = finalTotal.toLocaleString();

    // 警告顯示
    let warns = "";
    if (remoteFee > 0)
      warns += `<div style="color:#e67e22">🚚 偏遠地區加收: $${remoteFee}</div>`;
    if (hasOversized)
      warns += `<div style="color:#d32f2f">⚠️ 超長附加費: $${ovsFee}</div>`;
    if (hasOverweight)
      warns += `<div style="color:#d32f2f">⚠️ 超重附加費: $${ovwFee}</div>`;
    shipmentWarnings.innerHTML = warns;
  }

  // 監聽地區變更
  shipDeliveryLocation.addEventListener("change", () => {
    const fee = parseInt(shipDeliveryLocation.value);
    const text =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex].text;

    if (!isNaN(fee) && fee > 0) {
      shipRemoteAreaInfo.style.display = "block";
      shipSelectedAreaName.textContent = text.split("-")[0].trim();
      shipSelectedAreaFee.textContent = `+ $${fee}/方`;
    } else {
      shipRemoteAreaInfo.style.display = "none";
    }
    recalculateShipmentTotal();
  });

  // 地區搜尋
  shipAreaSearch.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
      shipSearchResults.style.display = "none";
      return;
    }

    let results = [];
    for (const [fee, areas] of Object.entries(window.REMOTE_AREAS)) {
      areas.forEach((area) => {
        if (area.toLowerCase().includes(term)) results.push({ area, fee });
      });
    }

    shipSearchResults.innerHTML =
      results.length > 0
        ? results
            .map(
              (r) =>
                `<div class="search-result-item" onclick="selectArea('${r.area}', ${r.fee})">${r.area} <span style="float:right">$${r.fee}</span></div>`
            )
            .join("")
        : `<div style="padding:10px; color:#999">無符合地區</div>`;
    shipSearchResults.style.display = "block";
  });

  // 供搜尋結果調用 (必須掛載到 window)
  window.selectArea = function (name, fee) {
    for (let i = 0; i < shipDeliveryLocation.options.length; i++) {
      const opt = shipDeliveryLocation.options[i];
      if (opt.value == fee && opt.text.includes(name)) {
        shipDeliveryLocation.selectedIndex = i;
        shipDeliveryLocation.dispatchEvent(new Event("change"));
        shipAreaSearch.value = name;
        shipSearchResults.style.display = "none";
        break;
      }
    }
  };

  // 提交訂單
  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = JSON.parse(createShipmentForm.dataset.ids);
    const street = document.getElementById("ship-street-address").value.trim();
    const selectedOpt =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex];
    const areaName = selectedOpt.text
      .replace(/[✅📍⛰️🏝️🏖️⚠️]/g, "")
      .split("-")[0]
      .trim();

    const fullAddress =
      (areaName === "一般地區" ? "" : areaName + " ") + street;

    const fd = new FormData();
    fd.append("packageIds", JSON.stringify(ids));
    fd.append("recipientName", document.getElementById("ship-name").value);
    fd.append("phone", document.getElementById("ship-phone").value);
    fd.append("shippingAddress", fullAddress);
    fd.append("deliveryLocationRate", shipDeliveryLocation.value);
    fd.append("idNumber", document.getElementById("ship-idNumber").value);
    fd.append("taxId", document.getElementById("ship-taxId").value);
    fd.append(
      "invoiceTitle",
      document.getElementById("ship-invoiceTitle").value
    );
    fd.append("note", document.getElementById("ship-note").value);
    fd.append("productUrl", document.getElementById("ship-product-url").value);

    const prodFiles = document.getElementById("ship-product-images").files;
    for (let i = 0; i < prodFiles.length; i++)
      fd.append("shipmentImages", prodFiles[i]);

    const btn = createShipmentForm.querySelector(".btn-place-order");
    btn.disabled = true;
    btn.textContent = "提交中...";

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
      } else {
        const err = await res.json();
        alert(err.message);
      }
    } catch (e) {
      alert("提交失敗");
    } finally {
      btn.disabled = false;
      btn.textContent = "提交訂單";
    }
  });

  // 複製匯款資訊
  if (btnCopyBankInfo) {
    btnCopyBankInfo.addEventListener("click", () => {
      const text = `銀行：${
        document.getElementById("bank-name").innerText
      }\n帳號：${document.getElementById("bank-account").innerText}\n戶名：${
        document.getElementById("bank-holder").innerText
      }`;
      navigator.clipboard.writeText(text).then(() => {
        btnCopyBankInfo.textContent = "已複製！";
        setTimeout(() => (btnCopyBankInfo.textContent = "複製資訊"), 2000);
      });
    });
  }

  // 上傳憑證提交
  uploadProofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("upload-proof-id").value;
    const file = document.getElementById("proof-file").files[0];
    const fd = new FormData();
    fd.append("paymentProof", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        uploadProofModal.style.display = "none";
        alert("上傳成功");
        loadMyShipments();
      } else alert("失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  // 編輯個資提交
  editProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
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
      body: JSON.stringify(data),
    });
    editProfileModal.style.display = "none";
    loadUserProfile();
  });

  // 編輯包裹提交
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

    // 這裡的圖片輸入欄位如果需要補圖，需在 HTML 加入對應 input
    // 目前範例僅支援修改文字與移除舊圖

    try {
      const res = await fetch(`${API_BASE_URL}/api/packages/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        editPackageModal.style.display = "none";
        loadMyPackages();
        alert("更新成功");
      } else alert("更新失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  // 編輯包裹彈窗 (填充資料)
  window.openEditPackageModal = function (pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    currentEditPackageImages = pkg.productImages || [];

    // 渲染舊圖片 (可移除)
    const div = document.getElementById("edit-package-images-container");
    div.innerHTML = "";
    currentEditPackageImages.forEach((url, idx) => {
      div.innerHTML += `<div style="display:inline-block; position:relative; margin:5px;">
        <img src="${API_BASE_URL}${url}" style="width:60px; height:60px; object-fit:cover; border-radius:4px;">
        <span onclick="removeEditImg(${idx})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; padding:2px 6px; cursor:pointer; font-size:10px;">x</span>
      </div>`;
    });
    editPackageModal.style.display = "flex";
  };

  window.removeEditImg = function (idx) {
    currentEditPackageImages.splice(idx, 1);
    // 重新渲染 (簡單遞迴呼叫或重寫 HTML 邏輯，這裡簡化處理)
    const div = document.getElementById("edit-package-images-container");
    div.innerHTML = "圖片已移除 (儲存後生效)";
  };

  // 佇列邏輯
  function checkForecastDraftQueue(isAfterSubmit) {
    const list = JSON.parse(
      localStorage.getItem("forecast_draft_list") || "[]"
    );
    const queueContainer = document.getElementById("draft-queue-container");
    const queueList = document.getElementById("draft-queue-list");

    if (list.length === 0) {
      queueContainer.style.display = "none";
      localStorage.removeItem("forecast_draft_list");
      return;
    }

    queueContainer.style.display = "flex";
    queueList.innerHTML = "";
    list.forEach((item) => {
      queueList.innerHTML += `<li>${item.name} (x${item.quantity})</li>`;
    });

    // 自動帶入第一筆
    const next = list.shift();
    document.getElementById("productName").value = next.name || "";
    document.getElementById("quantity").value = next.quantity || 1;
    document.getElementById("note").value = "來自試算";

    // 更新 Storage
    localStorage.setItem("forecast_draft_list", JSON.stringify(list));

    if (isAfterSubmit) {
      showMessage(`已預報！自動帶入下一筆: ${next.name}`, "success");
    } else {
      showMessage(`偵測到試算商品，已自動填入: ${next.name}`, "info");
    }
  }

  // Tab 切換事件
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

  btnEditProfile.addEventListener("click", () => {
    document.getElementById("edit-name").value = currentUser.name || "";
    document.getElementById("edit-phone").value = currentUser.phone || "";
    document.getElementById("edit-address").value =
      currentUser.defaultAddress || "";
    editProfileModal.style.display = "flex";
  });

  // 關閉彈窗通用
  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
  });
  document.querySelectorAll(".modal-close, .modal-close-btn").forEach((b) => {
    b.addEventListener("click", () => {
      b.closest(".modal-overlay").style.display = "none";
    });
  });

  // 啟動
  loadSystemSettings();
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();
  checkForecastDraftQueue(false);
});
