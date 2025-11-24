// frontend/js/dashboard-packages.js (V23.1 - 修復超規判斷 >= 版)
// 負責：包裹列表、預報、編輯、刪除、詳細算式彈窗

let currentEditPackageImages = [];

// --- 1. 載入包裹列表 ---
window.loadMyPackages = async function () {
  const tableBody = document.getElementById("packages-table-body");
  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    window.allPackagesData = data.packages || [];
    renderPackagesTable();
  } catch (e) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">載入失敗: ${e.message}</td></tr>`;
    }
  }
};

function renderPackagesTable() {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (window.allPackagesData.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">目前沒有包裹，請點擊上方「預報新包裹」</td></tr>';
    if (typeof window.updateCheckoutBar === "function")
      window.updateCheckoutBar();
    return;
  }

  // 取得全域費率設定
  const CONSTANTS = window.CONSTANTS || {
    VOLUME_DIVISOR: 28317,
    OVERSIZED_LIMIT: 300,
    OVERWEIGHT_LIMIT: 100,
  };
  const RATES = window.RATES || {};
  const statusMap = window.PACKAGE_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};

  window.allPackagesData.forEach((pkg) => {
    const statusText = statusMap[pkg.status] || pkg.status;
    const statusClass = statusClasses[pkg.status] || "";
    const isArrived = pkg.status === "ARRIVED";

    // 分析包裹內容 (總重、箱數、是否超規)
    let infoHtml = "<span>-</span>";
    let badgesHtml = "";

    const boxes = Array.isArray(pkg.arrivedBoxes) ? pkg.arrivedBoxes : [];

    if (boxes.length > 0) {
      let totalW = 0;
      let calculatedBaseTotal = 0; // 僅基本運費

      // 檢查超規變數
      let hasOversized = false;
      let hasOverweight = false;

      boxes.forEach((b) => {
        const w = parseFloat(b.weight) || 0;
        const l = parseFloat(b.length) || 0;
        const wd = parseFloat(b.width) || 0;
        const h = parseFloat(b.height) || 0;
        const type = b.type || "general";

        totalW += w;

        // 即時計算基本運費 (不含附加費)
        const rateInfo = RATES[type] || { weightRate: 0, volumeRate: 0 };
        const cai = Math.ceil((l * wd * h) / CONSTANTS.VOLUME_DIVISOR);
        const volFee = cai * rateInfo.volumeRate;
        const wtFee = (Math.ceil(w * 10) / 10) * rateInfo.weightRate;
        const boxFee = Math.max(volFee, wtFee);
        calculatedBaseTotal += boxFee;

        // [修正] 超規判斷 (改為 >=)
        if (
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          wd >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT
        ) {
          hasOversized = true;
        }
        if (w >= CONSTANTS.OVERWEIGHT_LIMIT) {
          hasOverweight = true;
        }
      });

      // 產生紅字警示標籤
      if (hasOversized)
        badgesHtml += `<span class="badge-alert small" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a;">⚠️ 超長</span> `;
      if (hasOverweight)
        badgesHtml += `<span class="badge-alert small" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a;">⚠️ 超重</span>`;

      // 顯示金額 (優先顯示即時計算值)
      const displayFee =
        calculatedBaseTotal > 0
          ? calculatedBaseTotal
          : pkg.totalCalculatedFee || 0;

      infoHtml = `
        <div class="pkg-meta-info">
          <span>${boxes.length}箱 / ${totalW.toFixed(1)}kg</span>
          ${
            displayFee > 0
              ? `<span class="fee-highlight">基本運費 $${displayFee.toLocaleString()}</span>`
              : ""
          }
        </div>
        <div class="pkg-badges">${badgesHtml}</div>
      `;
    }

    const pkgStr = encodeURIComponent(JSON.stringify(pkg));
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><input type="checkbox" class="package-checkbox" data-id="${pkg.id}" ${
      !isArrived ? "disabled" : ""
    }></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        <div style="font-weight:bold;">${pkg.productName}</div>
        <small style="color:#888; font-family:monospace;">${
          pkg.trackingNumber
        }</small>
      </td>
      <td>${infoHtml}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick='window.openPackageDetails("${pkgStr}")'>詳情</button>
        ${
          pkg.status === "PENDING"
            ? `<button class="btn btn-sm btn-secondary btn-edit">修改</button><button class="btn btn-sm btn-danger btn-delete">刪除</button>`
            : ""
        }
      </td>
    `;

    // 綁定事件
    tr.querySelector(".package-checkbox")?.addEventListener("change", () => {
      if (typeof window.updateCheckoutBar === "function")
        window.updateCheckoutBar();
    });
    tr.querySelector(".btn-edit")?.addEventListener("click", () =>
      openEditPackageModal(pkg)
    );
    tr.querySelector(".btn-delete")?.addEventListener("click", () =>
      handleDeletePackage(pkg)
    );

    tableBody.appendChild(tr);
  });

  if (typeof window.updateCheckoutBar === "function")
    window.updateCheckoutBar();
}

// --- 2. 包裹詳情彈窗 (含完整算式) ---
window.openPackageDetails = function (pkgDataStr) {
  try {
    const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
    const modal = document.getElementById("package-details-modal");
    const boxesListContainer = document.getElementById("details-boxes-list");
    const imagesGallery = document.getElementById("details-images-gallery");

    const CONSTANTS = window.CONSTANTS || {
      VOLUME_DIVISOR: 28317,
      OVERSIZED_LIMIT: 300,
      OVERWEIGHT_LIMIT: 100,
      OVERSIZED_FEE: 800,
      OVERWEIGHT_FEE: 800,
    };
    const RATES = window.RATES || {};

    const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
      ? pkg.arrivedBoxes
      : [];
    let boxesHtml = "";

    // 初始化累加變數
    let totalBaseFee = 0; // 基本運費
    let hasOversized = false;
    let hasOverweight = false;

    if (arrivedBoxes.length > 0) {
      boxesHtml = `<div class="detail-scroll-container">`;

      arrivedBoxes.forEach((box, idx) => {
        const typeKey = box.type || "general";
        const rateInfo = RATES[typeKey] || {
          name: "一般家具",
          weightRate: 0,
          volumeRate: 0,
        };

        const l = parseFloat(box.length) || 0;
        const w_dim = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;

        // 單箱基本運費計算
        const cai = Math.ceil((l * w_dim * h) / CONSTANTS.VOLUME_DIVISOR);
        const volFee = cai * rateInfo.volumeRate;
        const wtFee = (Math.ceil(weight * 10) / 10) * rateInfo.weightRate;
        const baseBoxFee = Math.max(volFee, wtFee);
        const isVolWin = volFee >= wtFee;

        totalBaseFee += baseBoxFee;

        // [修正] 超規判定 (改為 >=)
        const isItemOversized =
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          w_dim >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT;
        const isItemOverweight = weight >= CONSTANTS.OVERWEIGHT_LIMIT;

        if (isItemOversized) hasOversized = true;
        if (isItemOverweight) hasOverweight = true;

        boxesHtml += `
          <div class="detail-box-card">
            <div class="box-header">
              <span class="box-title">📦 第 ${idx + 1} 箱 (${
          rateInfo.name
        })</span>
              <span class="box-fee">基本運費: $${baseBoxFee.toLocaleString()}</span>
            </div>
            <div class="box-specs">
              <div class="spec-item"><span class="label">尺寸:</span> <span class="value">${l} x ${w_dim} x ${h} cm</span> ${
          isItemOversized
            ? '<span class="badge-alert" style="background:#ffebee; color:#c62828;">超長</span>'
            : ""
        }</div>
              <div class="spec-item"><span class="label">實重:</span> <span class="value">${weight} kg</span> ${
          isItemOverweight
            ? '<span class="badge-alert" style="background:#ffebee; color:#c62828;">超重</span>'
            : ""
        }</div>
            </div>
            <div class="calc-breakdown">
              <div class="formula-row ${isVolWin ? "winner" : ""}">
                <span class="method">材積計費</span>
                <span class="formula">(${l}x${w_dim}x${h}) ÷ ${
          CONSTANTS.VOLUME_DIVISOR
        } = <strong>${cai}材</strong></span>
                <span class="sub-total">${cai}材 x $${
          rateInfo.volumeRate
        } = $${volFee.toLocaleString()}</span>
              </div>
              <div class="formula-row ${!isVolWin ? "winner" : ""}">
                <span class="method">重量計費</span>
                <span class="formula">${weight}kg x $${
          rateInfo.weightRate
        }</span>
                <span class="sub-total">= $${Math.round(
                  wtFee
                ).toLocaleString()}</span>
              </div>
            </div>
          </div>`;
      });
      boxesHtml += `</div>`;

      // 總結算式顯示區塊
      const oversizedFee = hasOversized ? CONSTANTS.OVERSIZED_FEE : 0;
      const overweightFee = hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0;
      const estimatedTotal = totalBaseFee + oversizedFee + overweightFee;

      // [關鍵修改] 新增詳細算式區塊
      boxesHtml += `
        <div style="background:#f0f8ff; padding:15px; border-radius:8px; border:1px solid #b3d8ff; margin-top:15px;">
            <h4 style="margin:0 0 10px 0; color:#0056b3; border-bottom:1px dashed #9ec5fe; padding-bottom:5px;">💰 費用試算詳情</h4>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>基本運費總計：</span>
                <span>$${totalBaseFee.toLocaleString()}</span>
            </div>
            ${
              hasOversized
                ? `<div style="display:flex; justify-content:space-between; color:#c62828; margin-bottom:5px;">
                    <span>⚠️ 超長附加費：</span>
                    <span>+$${oversizedFee}</span>
                   </div>`
                : ""
            }
            ${
              hasOverweight
                ? `<div style="display:flex; justify-content:space-between; color:#c62828; margin-bottom:5px;">
                    <span>⚠️ 超重附加費：</span>
                    <span>+$${overweightFee}</span>
                   </div>`
                : ""
            }
            <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:5px; border-top:2px solid #0056b3; font-weight:bold; font-size:1.2em; color:#d32f2f;">
                <span>預估總計：</span>
                <span>$${estimatedTotal.toLocaleString()}</span>
            </div>
            <small style="display:block; margin-top:5px; color:#666;">* 此為單獨出貨預估費用，實際費用請以合併打包後的集運單為準 (含低消與偏遠費)。</small>
        </div>
      `;

      boxesListContainer.innerHTML = boxesHtml;
    } else {
      // 回退邏輯
      totalBaseFee = pkg.totalCalculatedFee || 0;
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888; padding:20px; background:#f9f9f9; border-radius:8px;">📦 倉庫尚未測量數據</p>';
    }

    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);

    // 更新上方總金額顯示 (只顯示基本運費，詳細看算式區)
    document.getElementById(
      "details-total-fee"
    ).textContent = `NT$ ${totalBaseFee.toLocaleString()} (基本)`;

    // 圖片處理
    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
    imagesGallery.innerHTML = "";
    if (warehouseImages.length > 0) {
      warehouseImages.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = `${API_BASE_URL}${imgUrl}`;
        img.className = "warehouse-thumb";
        img.onclick = () => window.open(img.src, "_blank");
        imagesGallery.appendChild(img);
      });
    } else {
      imagesGallery.innerHTML =
        "<p style='grid-column:1/-1; text-align:center; color:#999; font-size:13px;'>尚無照片</p>";
    }
    modal.style.display = "flex";
  } catch (e) {
    console.error("詳情解析失敗", e);
    if (window.showMessage) window.showMessage("無法載入詳情", "error");
  }
};

// --- 3. 預報與編輯功能 ---
window.handleForecastSubmit = async function (e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const fd = new FormData();
  fd.append("trackingNumber", document.getElementById("trackingNumber").value);
  fd.append("productName", document.getElementById("productName").value);
  fd.append("quantity", document.getElementById("quantity").value || 1);
  fd.append("note", document.getElementById("note").value);
  const files = document.getElementById("images").files;
  for (let f of files) fd.append("images", f);

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      if (window.showMessage) window.showMessage("預報成功", "success");
      form.reset();
      const countDisp = document.getElementById("file-count-display");
      if (countDisp) countDisp.style.display = "none";

      const previewContainer = document.getElementById(
        "forecast-preview-container"
      );
      if (previewContainer) previewContainer.innerHTML = "";

      window.loadMyPackages();
      if (window.checkForecastDraftQueue) window.checkForecastDraftQueue(true);
    } else {
      const d = await res.json();
      alert(d.message);
    }
  } catch (e) {
    alert("錯誤");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
  }
};

async function handleDeletePackage(pkg) {
  if (!confirm("確定刪除?")) return;
  try {
    await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    window.loadMyPackages();
    if (window.showMessage) window.showMessage("已刪除", "success");
  } catch (e) {
    alert("刪除失敗");
  }
}

window.openEditPackageModal = function (pkg) {
  document.getElementById("edit-package-id").value = pkg.id;
  document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
  document.getElementById("edit-productName").value = pkg.productName;
  document.getElementById("edit-quantity").value = pkg.quantity;
  document.getElementById("edit-note").value = pkg.note || "";
  currentEditPackageImages = pkg.productImages || [];

  renderEditImages();
  document.getElementById("edit-package-modal").style.display = "flex";
};

function renderEditImages() {
  const container = document.getElementById("edit-package-images-container");
  if (!container) return;
  container.innerHTML = "";
  currentEditPackageImages.forEach((url, idx) => {
    container.innerHTML += `<div style="position:relative; display:inline-block; margin:5px;"><img src="${API_BASE_URL}${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;"><span onclick="removeEditImg(${idx})" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border-radius:50%;width:20px;height:20px;text-align:center;cursor:pointer;">&times;</span></div>`;
  });
}

window.removeEditImg = function (idx) {
  currentEditPackageImages.splice(idx, 1);
  renderEditImages();
};

window.handleEditPackageSubmit = async function (e) {
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
  const files = document.getElementById("edit-package-new-images").files;
  for (let f of files) fd.append("images", f);

  await fetch(`${API_BASE_URL}/api/packages/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${window.dashboardToken}` },
    body: fd,
  });
  document.getElementById("edit-package-modal").style.display = "none";
  window.loadMyPackages();
  if (window.showMessage) window.showMessage("更新成功", "success");
};
