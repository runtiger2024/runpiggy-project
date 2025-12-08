// frontend/js/dashboard-packages.js
// V26.0 - Fix Forecast Draft Queue & Enhanced Proof Upload

let currentEditPackageImages = [];

document.addEventListener("DOMContentLoaded", () => {
  // 綁定「認領包裹」按鈕
  const btnClaim = document.getElementById("btn-claim-package");
  if (btnClaim) {
    btnClaim.addEventListener("click", () => {
      const modal = document.getElementById("claim-package-modal");
      const form = document.getElementById("claim-package-form");
      if (form) form.reset();
      if (modal) modal.style.display = "flex";
    });
  }

  // 綁定「批量預報」按鈕
  const btnBulk = document.getElementById("btn-bulk-forecast");
  if (btnBulk) {
    btnBulk.addEventListener("click", () => {
      const modal = document.getElementById("bulk-forecast-modal");
      if (modal) modal.style.display = "flex";
    });
  }

  // 綁定認領表單提交
  const claimForm = document.getElementById("claim-package-form");
  if (claimForm) {
    claimForm.addEventListener("submit", handleClaimSubmit);
  }

  // 綁定 Excel 檔案選擇 (批量預報)
  const excelInput = document.getElementById("bulk-excel-file");
  if (excelInput) {
    excelInput.addEventListener("change", handleExcelUpload);
  }

  // 綁定批量預報確認按鈕
  const btnConfirmBulk = document.getElementById("btn-confirm-bulk");
  if (btnConfirmBulk) {
    btnConfirmBulk.addEventListener("click", submitBulkForecast);
  }
});

// --- [關鍵修復] 新增預報提交處理函式 ---
window.handleForecastSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const fd = new FormData();
  fd.append("trackingNumber", document.getElementById("trackingNumber").value);
  fd.append("productName", document.getElementById("productName").value);
  fd.append("quantity", document.getElementById("quantity").value);
  fd.append("note", document.getElementById("note").value);
  // [New] 取得商品連結
  fd.append("productUrl", document.getElementById("productUrl").value);

  // 處理圖片 (從 input 或自訂上傳器)
  const files = document.getElementById("images").files;
  for (let i = 0; i < files.length; i++) {
    fd.append("images", files[i]);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      window.showMessage("預報成功！", "success");
      e.target.reset();

      // 重置圖片上傳器 UI
      const imgInput = document.getElementById("images");
      if (imgInput && imgInput.resetUploader) imgInput.resetUploader();

      window.loadMyPackages();

      // 如果是從試算帶入的，更新佇列
      if (window.checkForecastDraftQueue) {
        window.checkForecastDraftQueue(true);
      }
    } else {
      window.showMessage(data.message || "預報失敗", "error");
    }
  } catch (err) {
    console.error(err);
    window.showMessage("網路錯誤", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
  }
};

// --- 1. 載入包裹列表 ---
window.loadMyPackages = async function () {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  tableBody.innerHTML =
    '<tr><td colspan="5" class="text-center" style="padding:20px;">載入中...</td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    window.allPackagesData = data.packages || [];
    renderPackagesTable();
  } catch (e) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">載入失敗: ${e.message}</td></tr>`;
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

  const statusMap = window.PACKAGE_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};

  window.allPackagesData.forEach((pkg) => {
    const statusText = statusMap[pkg.status] || pkg.status;
    const statusClass = statusClasses[pkg.status] || "";
    // 只有已入庫 (ARRIVED) 且無異常的包裹才能打包
    const isReady = pkg.status === "ARRIVED" && !pkg.exceptionStatus;

    let infoHtml = "<span>-</span>";
    let badgesHtml = "";

    const boxes = Array.isArray(pkg.arrivedBoxes) ? pkg.arrivedBoxes : [];

    // --- 異常狀態處理 ---
    if (pkg.exceptionStatus) {
      const exText = pkg.exceptionStatus === "DAMAGED" ? "破損" : "違禁品/異常";
      badgesHtml += `<span class="badge-alert" style="background:#ffebee; color:#d32f2f; border:1px solid red; cursor:pointer;" onclick="resolveException('${pkg.id}')">⚠️ ${exText} (點擊處理)</span> `;
    }

    if (boxes.length > 0) {
      const totalW = boxes.reduce(
        (sum, b) => sum + (parseFloat(b.weight) || 0),
        0
      );
      const displayFee = pkg.totalCalculatedFee || 0;

      if (pkg.isOversized)
        badgesHtml += `<span class="badge-alert small" style="background:#fff3e0; color:#e65100; border:1px solid #ff9800;">📏 超長</span> `;
      if (pkg.isOverweight)
        badgesHtml += `<span class="badge-alert small" style="background:#fff3e0; color:#e65100; border:1px solid #ff9800;">⚖️ 超重</span>`;

      infoHtml = `
        <div class="pkg-meta-info">
          <span>${boxes.length}箱 / ${totalW.toFixed(1)}kg</span>
          ${
            displayFee > 0
              ? `<span class="fee-highlight">估運費 $${displayFee.toLocaleString()}</span>`
              : ""
          }
        </div>
        <div class="pkg-badges" style="margin-top:4px;">${badgesHtml}</div>
      `;
    } else {
      // 如果有異常但沒箱子數據
      if (badgesHtml) infoHtml = `<div class="pkg-badges">${badgesHtml}</div>`;
    }

    const pkgStr = encodeURIComponent(JSON.stringify(pkg));
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><input type="checkbox" class="package-checkbox" data-id="${pkg.id}" ${
      !isReady ? "disabled" : ""
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
            ? `<button class="btn btn-sm btn-secondary btn-edit" style="margin-left:5px;">修改</button><button class="btn btn-sm btn-danger btn-delete" style="margin-left:5px;">刪除</button>`
            : ""
        }
      </td>
    `;

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

// --- 2. 認領包裹邏輯 ---
async function handleClaimSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const trackingNumber = document.getElementById("claim-tracking").value.trim();
  const file = document.getElementById("claim-proof").files[0];

  const fd = new FormData();
  fd.append("trackingNumber", trackingNumber);
  if (file) fd.append("proof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      alert("認領成功！包裹已歸戶。");
      document.getElementById("claim-package-modal").style.display = "none";
      window.loadMyPackages();
    } else {
      alert(data.message || "認領失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認認領";
  }
}

// --- 3. 批量預報邏輯 (Excel) ---
let bulkData = [];

function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (typeof XLSX === "undefined") {
    alert("Excel 解析元件尚未載入，請重新整理頁面或聯繫管理員。");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    // 假設 Excel 欄位: 單號, 商品名稱, 數量, 備註
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
      header: ["trackingNumber", "productName", "quantity", "note"],
      range: 1,
    }); // range:1 跳過標題列

    bulkData = jsonData.filter((row) => row.trackingNumber && row.productName);

    // 預覽
    const previewEl = document.getElementById("bulk-preview-area");
    if (previewEl) {
      previewEl.innerHTML = `
                <p>已讀取 <strong>${bulkData.length}</strong> 筆資料：</p>
                <ul style="max-height:150px; overflow-y:auto; font-size:12px; padding-left:20px;">
                    ${bulkData
                      .map(
                        (d) => `<li>${d.trackingNumber} - ${d.productName}</li>`
                      )
                      .join("")}
                </ul>
            `;
      previewEl.style.display = "block";
    }

    document.getElementById("btn-confirm-bulk").disabled =
      bulkData.length === 0;
  };
  reader.readAsArrayBuffer(file);
}

async function submitBulkForecast() {
  if (bulkData.length === 0) return;
  const btn = document.getElementById("btn-confirm-bulk");
  btn.disabled = true;
  btn.textContent = "匯入中...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/bulk-forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({ packages: bulkData }),
    });
    const data = await res.json();

    if (res.ok) {
      alert(data.message); // 成功幾筆失敗幾筆
      document.getElementById("bulk-forecast-modal").style.display = "none";
      window.loadMyPackages();

      // 如果有失敗的，可以顯示
      if (data.errors && data.errors.length > 0) {
        alert("部分失敗：\n" + data.errors.join("\n"));
      }
    } else {
      alert(data.message || "匯入失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認匯入";
    bulkData = [];
    document.getElementById("bulk-excel-file").value = "";
    document.getElementById("bulk-preview-area").style.display = "none";
  }
}

// --- 4. 異常處理 (Exception) ---
window.resolveException = function (pkgId) {
  const action = prompt(
    "請輸入處理方式代碼：\n1. 棄置 (DISCARD)\n2. 退回賣家 (RETURN)\n3. 確認無誤請發貨 (SHIP_ANYWAY)\n\n請輸入 1, 2 或 3："
  );

  let actionCode = "";
  if (action === "1") actionCode = "DISCARD";
  else if (action === "2") actionCode = "RETURN";
  else if (action === "3") actionCode = "SHIP_ANYWAY";
  else return;

  const note = prompt("備註說明 (例如：退回地址、或確認內容物)：");

  fetch(`${API_BASE_URL}/api/packages/${pkgId}/exception`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${window.dashboardToken}`,
    },
    body: JSON.stringify({ action: actionCode, note: note }),
  })
    .then((res) => res.json())
    .then((data) => {
      alert(data.message);
      window.loadMyPackages();
    })
    .catch(() => alert("操作失敗"));
};

// --- 5. 既有詳情、編輯、刪除邏輯 (保持相容) ---
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
    const DIVISOR =
      (window.CONSTANTS && window.CONSTANTS.VOLUME_DIVISOR) || 28317;

    if (arrivedBoxes.length > 0) {
      boxesHtml = `<div class="detail-scroll-container">`;
      arrivedBoxes.forEach((box, idx) => {
        const fee = box.calculatedFee || 0;
        const isVolWin = box.isVolWin;
        const rateName = box.rateName || "一般";
        const volFee = box.volFee || 0;
        const wtFee = box.wtFee || 0;
        const cai =
          box.cai || Math.ceil((box.length * box.width * box.height) / DIVISOR);

        boxesHtml += `
          <div class="detail-box-card">
            <div class="box-header">
              <span class="box-title">📦 第 ${idx + 1} 箱 (${rateName})</span>
              <span class="box-fee">運費 $${fee.toLocaleString()}</span>
            </div>
            <div class="box-specs">
              <div class="spec-item"><span class="label">尺寸:</span> <span class="value">${
                box.length
              }x${box.width}x${box.height} cm</span></div>
              <div class="spec-item"><span class="label">重量:</span> <span class="value">${
                box.weight
              } kg</span></div>
            </div>
            <div class="detail-calc-box">
                <div class="calc-comparison-row ${
                  !isVolWin ? "is-winner" : ""
                }">
                    <span class="calc-label">重量計費</span>
                    <span class="calc-formula">${box.weight}kg x 費率</span>
                    <span class="calc-amount">$${wtFee.toLocaleString()}</span>
                </div>
                <div class="calc-comparison-row ${isVolWin ? "is-winner" : ""}">
                    <span class="calc-label">材積計費</span>
                    <span class="calc-formula">(${box.length}*${box.width}*${
          box.height
        })/${DIVISOR} = ${cai}材</span>
                    <span class="calc-amount">$${volFee.toLocaleString()}</span>
                </div>
            </div>
          </div>`;
      });
      boxesHtml += `</div>`;

      const totalBaseFee = pkg.totalCalculatedFee || 0;
      boxesHtml += `<div style="background:#f0f8ff; padding:15px; border-radius:8px; margin-top:15px; text-align:right;"><strong>基本運費總計：$${totalBaseFee.toLocaleString()}</strong></div>`;

      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888; padding:20px;">📦 倉庫尚未測量數據</p>';
    }

    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);
    document.getElementById("details-total-fee").textContent = `NT$ ${(
      pkg.totalCalculatedFee || 0
    ).toLocaleString()} (基本)`;

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

    // 顯示認領憑證 (如果有的話)
    if (pkg.claimProof) {
      imagesGallery.innerHTML += `<div style="grid-column:1/-1; margin-top:10px; border-top:1px dashed #ccc; padding-top:10px;">
            <p style="font-size:12px; color:#666;">認領憑證：</p>
            <img src="${API_BASE_URL}${pkg.claimProof}" style="max-height:100px; cursor:pointer;" onclick="window.open(this.src)">
        </div>`;
    }

    modal.style.display = "flex";
  } catch (e) {
    console.error(e);
    alert("無法載入詳情");
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
    window.showMessage("已刪除", "success");
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
  // [New] 填入商品連結
  document.getElementById("edit-productUrl").value = pkg.productUrl || "";

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
  // [New] 更新商品連結
  fd.append("productUrl", document.getElementById("edit-productUrl").value);

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
  window.showMessage("更新成功", "success");
};
