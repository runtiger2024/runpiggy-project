// frontend/js/dashboard.js (V21.0 - Mobile Card View Optimized)
// 功能：會員中心邏輯、後端試算整合、圖片補傳、訂單詳情、響應式列表渲染

// --- 全域變數 ---
let currentEditPackageImages = []; // 編輯包裹時暫存的舊圖片路徑
let currentUser = null; // 當前使用者資料
let allPackagesData = []; // 我的包裹列表快取

// --- [全域函式] 供 HTML onclick 直接呼叫 ---

// 1. 開啟圖片瀏覽大圖彈窗
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

// 2. 開啟包裹入庫詳情彈窗 (查看分箱與倉庫照)
window.openPackageDetails = function (pkgDataStr) {
  try {
    const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
    const modal = document.getElementById("package-details-modal");
    const boxesListContainer = document.getElementById("details-boxes-list");
    const imagesGallery = document.getElementById("details-images-gallery");

    // 顯示分箱明細
    const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
      ? pkg.arrivedBoxes
      : [];
    let boxesHtml = "";

    if (arrivedBoxes.length > 0) {
      boxesHtml += `
        <div class="table-responsive" style="box-shadow:none; background:transparent;">
          <table class="detail-sub-package-table" style="width:100%; font-size:14px; border-collapse:collapse;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px; text-align:left;">箱號</th>
                <th style="padding:8px; text-align:left;">規格 (cm)</th>
                <th style="padding:8px; text-align:left;">材/重</th>
                <th style="padding:8px; text-align:right;">費用</th>
              </tr>
            </thead>
            <tbody>`;

      arrivedBoxes.forEach((box, idx) => {
        const rate =
          window.RATES && window.RATES[box.type] ? window.RATES[box.type] : {};
        const l = parseFloat(box.length) || 0;
        const w_dim = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const w = parseFloat(box.weight) || 0;
        // 材積計算 (無條件進位)
        const volumeDivisor = window.CONSTANTS
          ? window.CONSTANTS.VOLUME_DIVISOR
          : 28317;
        const cai = Math.ceil((l * w_dim * h) / volumeDivisor);
        const finalFee = box.fee || 0;

        boxesHtml += `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px;">#${
              idx + 1
            } <br><small style="color:#888">${
          rate.name || box.type || "未知"
        }</small></td>
            <td style="padding:8px;">${l}x${w_dim}x${h}</td>
            <td style="padding:8px;">${cai}材<br>${w}kg</td>
            <td style="padding:8px; text-align:right; color: #d32f2f; font-weight:bold;">$${finalFee.toLocaleString()}</td>
          </tr>
        `;
      });
      boxesHtml += `</tbody></table></div>`;
      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888; padding:10px;">📦 暫無分箱測量數據</p>';
    }

    // 顯示匯總數據
    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);
    document.getElementById("details-total-fee").textContent = `NT$ ${(
      pkg.totalCalculatedFee || 0
    ).toLocaleString()}`;

    // 顯示倉庫照片
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
    console.error("詳情解析失敗", e);
    alert("無法載入包裹詳情，請稍後再試。");
  }
};

// 3. 上傳憑證彈窗
window.openUploadProof = function (shipmentId) {
  document.getElementById("upload-proof-id").value = shipmentId;
  // 清空上次選擇的檔案
  document.getElementById("proof-file").value = null;
  document.getElementById("upload-proof-modal").style.display = "flex";
};

// 4. 查看憑證
window.viewProof = function (imgUrl) {
  window.open(`${API_BASE_URL}${imgUrl}`, "_blank");
};

// 5. 取消集運單 (釋放包裹)
window.handleCancelShipment = async function (id) {
  if (
    !confirm(
      "確定要取消此集運單嗎？\n\n注意：取消後，包裹將會釋放回「我的包裹」列表，您可以重新打包。"
    )
  )
    return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (res.ok) {
      alert("訂單已成功取消！包裹已釋放回列表。");
      window.location.reload();
    } else {
      const err = await res.json();
      alert("取消失敗: " + (err.message || "未知錯誤"));
    }
  } catch (e) {
    alert("網路連線錯誤，請檢查您的網路狀態。");
  }
};

// 6. 查看訂單詳情 (呼叫後端 API 獲取完整資料)
window.openShipmentDetails = async function (id) {
  try {
    const modal = document.getElementById("shipment-details-modal");
    // 顯示載入中
    document.getElementById("sd-id").textContent = "載入中...";
    modal.style.display = "flex";

    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.message);

    const ship = data.shipment;

    // 填充基本資料
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

    // 填充收件人
    document.getElementById("sd-name").textContent = ship.recipientName;
    document.getElementById("sd-phone").textContent = ship.phone;
    document.getElementById("sd-address").textContent = ship.shippingAddress;

    // 填充費用明細
    const breakdownContainer = document.getElementById("sd-fee-breakdown");
    breakdownContainer.innerHTML = `
      <div class="fee-breakdown-row total">
        <span>總金額</span>
        <span>NT$ ${(ship.totalCost || 0).toLocaleString()}</span>
      </div>
      <small style="color:#666; display:block; margin-top:5px;">配送費率: $${
        ship.deliveryLocationRate
      }/方</small>
      <div style="margin-top:5px; font-size:12px; color:#888;">備註: ${
        ship.note || "無"
      }</div>
    `;

    // 填充購買證明圖
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
    } else {
      // 如果有連結則顯示連結
      if (ship.productUrl) {
        proofContainer.innerHTML = `<a href="${ship.productUrl}" target="_blank" style="word-break:break-all; color:#1a73e8;">${ship.productUrl}</a>`;
      } else {
        proofContainer.innerHTML =
          "<p style='color:#999; font-size:14px;'>無上傳證明</p>";
      }
    }
  } catch (e) {
    alert("無法載入詳情: " + e.message);
    document.getElementById("shipment-details-modal").style.display = "none";
  }
};

// --- 主程式 DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. 檢查登入
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // --- DOM 元素獲取 ---
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

  // 建立集運單時的商品證明圖片監聽
  const shipProofInput = document.getElementById("ship-product-images");
  const shipProofDisplay = document.getElementById(
    "ship-product-files-display"
  );
  if (shipProofInput) {
    shipProofInput.addEventListener("change", function () {
      if (this.files && this.files.length > 0) {
        shipProofDisplay.textContent = `已選 ${this.files.length} 張圖`;
      } else {
        shipProofDisplay.textContent = "";
      }
    });
  }

  // 列表 Body
  const packagesTableBody = document.getElementById("packages-table-body");
  const shipmentsTableBody = document.getElementById("shipments-table-body");

  // 懸浮結算欄
  const selectedPkgCountSpan = document.getElementById("selected-pkg-count");
  const btnCreateShipment = document.getElementById("btn-create-shipment");

  // 集運單 Modal 相關
  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const shipmentPackageList = document.getElementById("shipment-package-list");
  const shipmentFeeContainer = document.getElementById("api-fee-breakdown");

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

  // 銀行 & 上傳 & 編輯彈窗
  const bankInfoModal = document.getElementById("bank-info-modal");
  const btnCopyBankInfo = document.getElementById("btn-copy-bank-info");
  const uploadProofModal = document.getElementById("upload-proof-modal");
  const uploadProofForm = document.getElementById("upload-proof-form");
  const editProfileModal = document.getElementById("edit-profile-modal");
  const editProfileForm = document.getElementById("edit-profile-form");
  const btnEditProfile = document.getElementById("btn-edit-profile");
  const editPackageModal = document.getElementById("edit-package-modal");
  const editPackageForm = document.getElementById("edit-package-form");

  // --- 工具函式 ---
  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    // 3秒後自動消失
    setTimeout(() => {
      messageBox.style.display = "none";
    }, 3000);
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
    // 載入後立刻渲染集運單的地區選項
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

  // 渲染配送地區下拉選單
  function renderShipmentRemoteAreaOptions() {
    if (!shipDeliveryLocation || !window.REMOTE_AREAS) return;
    shipDeliveryLocation.innerHTML = "";

    let html = `<option value="" selected disabled>--- 請選擇您的配送地區 ---</option>`;
    html += `<option value="0" style="font-weight: bold; color: #27ae60">✅ 一般地區 (無額外費用)</option>`;

    const sortedFees = Object.keys(window.REMOTE_AREAS).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );

    sortedFees.forEach((fee) => {
      // 排除 0 或無效 key
      if (fee === "0") return;
      const areas = window.REMOTE_AREAS[fee];
      const feeVal = parseInt(fee);
      let label = `📍 偏遠地區 - NT$${feeVal.toLocaleString()}/方起`;
      let style = "";
      if (feeVal >= 4500) style = "color: #e74c3c"; // 高額加價區標紅

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
      console.error("User profile error:", error);
      localStorage.removeItem("token");
      window.location.href = "login.html";
    }
  }

  // --- (B) 載入包裹列表 (Card View Optimized) ---
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      allPackagesData = data.packages || [];
      renderPackagesTable();
    } catch (e) {
      packagesTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">載入失敗: ${e.message}</td></tr>`;
    }
  }

  function renderPackagesTable() {
    packagesTableBody.innerHTML = "";

    if (allPackagesData.length === 0) {
      packagesTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">目前沒有包裹，請點擊上方「預報新包裹」</td></tr>';
      updateCheckoutBar();
      return;
    }

    const statusMap = window.PACKAGE_STATUS_MAP || {};
    const statusClasses = window.STATUS_CLASSES || {};

    allPackagesData.forEach((pkg) => {
      const statusText = statusMap[pkg.status] || pkg.status;
      const statusClass = statusClasses[pkg.status] || "";
      const isArrived = pkg.status === "ARRIVED";

      // 顯示重量與費用 (HTML 結構調整以適配 CSS 卡片)
      let infoText = "<span>-</span>";
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
      const checkboxDisabled = !isArrived ? "disabled" : "";

      const tr = document.createElement("tr");
      // [注意] 這裡的結構必須對應 client.css 的 nth-child 設定
      // 1: Checkbox
      // 2: Status
      // 3: Content
      // 4: Info
      // 5: Actions
      tr.innerHTML = `
        <td>
          <input type="checkbox" class="package-checkbox" data-id="${
            pkg.id
          }" ${checkboxDisabled}>
        </td>
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
              ? `<button class="btn btn-sm btn-secondary btn-edit">修改</button> 
             <button class="btn btn-sm btn-danger btn-delete">刪除</button>`
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
      btnCreateShipment.style.opacity = "1";
    } else {
      btnCreateShipment.disabled = true;
      btnCreateShipment.textContent = "請勾選包裹";
      btnCreateShipment.style.opacity = "0.6";
    }
  }

  async function handleDeletePackage(pkg) {
    if (confirm("確定要刪除此包裹預報嗎？")) {
      try {
        await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        loadMyPackages();
        showMessage("包裹已刪除", "success");
      } catch (e) {
        alert("刪除失敗");
      }
    }
  }

  // --- (C) 載入集運單 (Card View Optimized) ---
  async function loadMyShipments() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      renderShipmentsTable(data.shipments || []);
    } catch (e) {
      shipmentsTableBody.innerHTML = `<tr><td colspan="5" class="text-center error-text">載入失敗: ${e.message}</td></tr>`;
    }
  }

  function renderShipmentsTable(shipments) {
    shipmentsTableBody.innerHTML = "";
    if (shipments.length === 0) {
      shipmentsTableBody.innerHTML =
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

      let actionBtns = "";
      actionBtns += `<button class="btn btn-sm btn-primary" onclick="openShipmentDetails('${ship.id}')">詳情</button> `;

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
      // 對應 CSS nth-child
      // 1: 空 (佔位)
      // 2: Status
      // 3: Content
      // 4: Cost
      // 5: Actions
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
        <td>
          <span style="color:#d32f2f; font-weight:bold;">NT$ ${(
            ship.totalCost || 0
          ).toLocaleString()}</span>
        </td>
        <td>${actionBtns}</td>
      `;
      shipmentsTableBody.appendChild(tr);
    });
  }

  // --- (D) 提交預報 (新增) ---
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
      showMessage(e.message || "提交失敗", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
    }
  });

  // --- (E) 建立集運單 (結帳流程) ---

  // 1. 點擊「合併打包」
  btnCreateShipment.addEventListener("click", async () => {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) return;

    const ids = [];
    checked.forEach((box) => ids.push(box.dataset.id));

    let html = "";
    let valid = true;
    ids.forEach((id) => {
      const p = allPackagesData.find((pkg) => pkg.id === id);
      if (p) {
        html += `
            <div class="shipment-package-item" style="display:flex; justify-content:space-between; border-bottom:1px dashed #eee; padding:5px 0;">
              <div class="info">
                <span style="font-weight:bold;">${p.productName}</span>
                <small style="display:block; color:#888;">${
                  p.trackingNumber
                }</small>
              </div>
              <div class="cost" style="font-weight:bold;">$${(
                p.totalCalculatedFee || 0
              ).toLocaleString()}</div>
            </div>`;
      } else {
        valid = false;
      }
    });

    if (!valid) {
      alert("部分包裹資料異常，請重新整理頁面。");
      loadMyPackages();
      return;
    }

    shipmentPackageList.innerHTML = html;
    createShipmentForm.dataset.ids = JSON.stringify(ids);

    document.getElementById("ship-name").value = currentUser.name || "";
    document.getElementById("ship-phone").value = currentUser.phone || "";
    document.getElementById("ship-street-address").value =
      currentUser.defaultAddress || "";

    shipDeliveryLocation.value = "";
    shipRemoteAreaInfo.style.display = "none";
    shipmentFeeContainer.innerHTML = `<div style="text-align:center;color:#999; padding:10px;">請選擇配送地區以計算總運費</div>`;

    createShipmentModal.style.display = "flex";
  });

  // 2. 地區變更 -> 試算
  shipDeliveryLocation.addEventListener("change", () => {
    const text =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex].text;
    shipRemoteAreaInfo.style.display = "block";
    shipSelectedAreaName.textContent = text;
    recalculateShipmentTotal();
  });

  // 3. 試算邏輯
  async function recalculateShipmentTotal() {
    const ids = JSON.parse(createShipmentForm.dataset.ids || "[]");
    const locationRate = shipDeliveryLocation.value;

    if (!locationRate) return;

    shipmentFeeContainer.innerHTML = `<div style="text-align:center; padding:10px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;"></div> 正在精算運費...</div>`;

    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds: ids,
          deliveryLocationRate: parseFloat(locationRate),
        }),
      });
      const data = await res.json();

      if (data.success) {
        const p = data.preview;
        let html = `<div class="fee-breakdown-row"><span>基本運費</span> <span>$${p.baseCost.toLocaleString()}</span></div>`;

        if (p.isMinimumChargeApplied) {
          html += `<div class="fee-breakdown-row highlight" style="font-size:12px; color:#e67e22;">(已補足低消 $${
            window.CONSTANTS ? window.CONSTANTS.MINIMUM_CHARGE : 2000
          })</div>`;
        }
        if (p.remoteFee > 0) {
          html += `<div class="fee-breakdown-row"><span>偏遠地區費</span> <span>+$${p.remoteFee.toLocaleString()}</span></div>`;
        }
        if (p.overweightFee > 0) {
          html += `<div class="fee-breakdown-row highlight"><span>超重附加費</span> <span>+$${p.overweightFee.toLocaleString()}</span></div>`;
        }
        if (p.oversizedFee > 0) {
          html += `<div class="fee-breakdown-row highlight"><span>超長附加費</span> <span>+$${p.oversizedFee.toLocaleString()}</span></div>`;
        }

        html += `<div class="fee-breakdown-row total" style="border-top:1px solid #ddd; margin-top:5px; padding-top:5px; font-weight:bold; color:#d32f2f; font-size:18px;">
                    <span>總運費</span> <span>NT$ ${p.totalCost.toLocaleString()}</span>
                </div>`;
        shipmentFeeContainer.innerHTML = html;
      } else {
        shipmentFeeContainer.innerHTML = `<span style="color:red;">試算失敗: ${data.message}</span>`;
      }
    } catch (e) {
      shipmentFeeContainer.innerHTML = `<span style="color:red;">無法連線伺服器</span>`;
    }
  }

  // 4. 地區搜尋
  if (shipAreaSearch) {
    shipAreaSearch.addEventListener("input", (e) => {
      const term = e.target.value.trim().toLowerCase();
      if (!term) {
        shipSearchResults.style.display = "none";
        return;
      }
      let results = [];
      if (window.REMOTE_AREAS) {
        for (const [fee, areas] of Object.entries(window.REMOTE_AREAS)) {
          areas.forEach((area) => {
            if (area.toLowerCase().includes(term)) results.push({ area, fee });
          });
        }
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
  }

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

  // 5. 提交訂單
  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = JSON.parse(createShipmentForm.dataset.ids);

    if (!shipDeliveryLocation.value) {
      alert("請選擇配送地區");
      return;
    }

    const street = document.getElementById("ship-street-address").value.trim();
    const selectedOpt =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex];
    const areaName = selectedOpt.text
      .split("-")[0]
      .replace(/[✅📍]/g, "")
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
        alert("提交失敗: " + err.message);
      }
    } catch (e) {
      alert("網路錯誤，提交失敗");
    } finally {
      btn.disabled = false;
      btn.textContent = "提交訂單";
    }
  });

  // --- 其他功能 ---

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
        alert("上傳成功，請等待審核");
        loadMyShipments();
      } else alert("上傳失敗");
    } catch (e) {
      alert("錯誤");
    }
  });

  btnEditProfile.addEventListener("click", () => {
    document.getElementById("edit-name").value = currentUser.name || "";
    document.getElementById("edit-phone").value = currentUser.phone || "";
    document.getElementById("edit-address").value =
      currentUser.defaultAddress || "";
    editProfileModal.style.display = "flex";
  });

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
    showMessage("個人資料已更新", "success");
  });

  window.openEditPackageModal = function (pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    currentEditPackageImages = pkg.productImages || [];
    document.getElementById("edit-package-new-images").value = "";
    renderEditImages();
    editPackageModal.style.display = "flex";
  };

  function renderEditImages() {
    const div = document.getElementById("edit-package-images-container");
    div.innerHTML = "";
    currentEditPackageImages.forEach((url, idx) => {
      div.innerHTML += `
        <div style="display:inline-block; position:relative; margin:5px;">
          <img src="${API_BASE_URL}${url}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid #ddd;">
          <span onclick="removeEditImg(${idx})" style="position:absolute; top:-8px; right:-8px; background:#d32f2f; color:white; border-radius:50%; width:20px; height:20px; text-align:center; line-height:20px; cursor:pointer; font-size:12px;">&times;</span>
        </div>`;
    });
  }

  window.removeEditImg = function (idx) {
    currentEditPackageImages.splice(idx, 1);
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
    const newFiles = document.getElementById("edit-package-new-images").files;
    for (let f of newFiles) fd.append("images", f);

    try {
      const res = await fetch(`${API_BASE_URL}/api/packages/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        editPackageModal.style.display = "none";
        loadMyPackages();
        showMessage("包裹更新成功", "success");
      } else {
        alert("更新失敗");
      }
    } catch (e) {
      alert("錯誤");
    }
  });

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

    const next = list.shift();
    document.getElementById("productName").value = next.name || "";
    document.getElementById("quantity").value = next.quantity || 1;
    document.getElementById("note").value = "來自試算";
    localStorage.setItem("forecast_draft_list", JSON.stringify(list));

    if (isAfterSubmit)
      showMessage(`已預報！自動帶入下一筆: ${next.name}`, "success");
    else showMessage(`偵測到試算商品，已自動填入: ${next.name}`, "info");
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

  loadSystemSettings();
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();
  checkForecastDraftQueue(false);
});
