// frontend/js/dashboard-packages.js
// V25.0 (透明化版) - 在詳情中顯示運費計算公式 + 強化警示

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

  const statusMap = window.PACKAGE_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};

  window.allPackagesData.forEach((pkg) => {
    const statusText = statusMap[pkg.status] || pkg.status;
    const statusClass = statusClasses[pkg.status] || "";
    const isArrived = pkg.status === "ARRIVED";

    let infoHtml = "<span>-</span>";
    let badgesHtml = "";

    const boxes = Array.isArray(pkg.arrivedBoxes) ? pkg.arrivedBoxes : [];

    if (boxes.length > 0) {
      const totalW = boxes.reduce(
        (sum, b) => sum + (parseFloat(b.weight) || 0),
        0
      );
      const displayFee = pkg.totalCalculatedFee || 0;

      // [強化] 警示標籤樣式
      if (pkg.isOversized)
        badgesHtml += `<span class="badge-alert small" style="background:#ffebee; color:#d32f2f; border:1px solid #d32f2f; font-weight:800; padding:2px 5px; border-radius:4px; margin-right:4px;">⚠️ 超長</span> `;
      if (pkg.isOverweight)
        badgesHtml += `<span class="badge-alert small" style="background:#ffebee; color:#d32f2f; border:1px solid #d32f2f; font-weight:800; padding:2px 5px; border-radius:4px;">⚠️ 超重</span>`;

      infoHtml = `
        <div class="pkg-meta-info">
          <span>${boxes.length}箱 / ${totalW.toFixed(1)}kg</span>
          ${
            displayFee > 0
              ? `<span class="fee-highlight">基本運費 $${displayFee.toLocaleString()}</span>`
              : ""
          }
        </div>
        <div class="pkg-badges" style="margin-top:4px;">${badgesHtml}</div>
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

// --- 2. 包裹詳情彈窗 (顯示透明化算式) ---
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

    // 取得系統常數 (若無則使用預設)
    const DIVISOR =
      (window.CONSTANTS && window.CONSTANTS.VOLUME_DIVISOR) || 28317;

    if (arrivedBoxes.length > 0) {
      boxesHtml = `<div class="detail-scroll-container">`;

      arrivedBoxes.forEach((box, idx) => {
        const fee = box.calculatedFee || 0;
        const isVolWin = box.isVolWin;
        const rateName = box.rateName || "一般";

        // [New] 構建透明化算式
        const volFee = box.volFee || 0;
        const wtFee = box.wtFee || 0;
        const cai =
          box.cai || Math.ceil((box.length * box.width * box.height) / DIVISOR); // 簡單補算

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
                <div style="text-align:right; margin-top:8px; color:#999; font-size:12px;">
                    * 取兩者較高者為準
                </div>
            </div>

            ${
              box.isOversized
                ? '<div style="color:red; font-weight:bold; font-size:13px; margin-top:5px; background:#ffebee; padding:2px 5px; display:inline-block; border-radius:4px;">⚠️ 此箱超長</div>'
                : ""
            }
            ${
              box.isOverweight
                ? '<div style="color:red; font-weight:bold; font-size:13px; margin-top:5px; background:#ffebee; padding:2px 5px; display:inline-block; border-radius:4px; margin-left:5px;">⚠️ 此箱超重</div>'
                : ""
            }
          </div>`;
      });
      boxesHtml += `</div>`;

      const totalBaseFee = pkg.totalCalculatedFee || 0;

      boxesHtml += `
        <div style="background:#f0f8ff; padding:15px; border-radius:8px; border:1px solid #b3d8ff; margin-top:15px;">
            <div style="display:flex; justify-content:space-between;">
                <strong>基本運費總計：</strong>
                <strong style="color:#d32f2f; font-size:1.2em;">$${totalBaseFee.toLocaleString()}</strong>
            </div>
            <small style="display:block; margin-top:5px; color:#666;">* 此金額僅包含該包裹的基本海運費，尚未包含可能產生的低消補足、偏遠費或特殊附加費 (將在合併訂單時計算)。</small>
        </div>
      `;

      boxesListContainer.innerHTML = boxesHtml;
    } else {
      const baseFee = pkg.totalCalculatedFee || 0;
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888; padding:20px; background:#f9f9f9; border-radius:8px;">📦 倉庫尚未測量數據</p>';
      document.getElementById(
        "details-total-fee"
      ).textContent = `NT$ ${baseFee.toLocaleString()} (概估)`;
    }

    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);

    if (arrivedBoxes.length > 0) {
      document.getElementById("details-total-fee").textContent = `NT$ ${(
        pkg.totalCalculatedFee || 0
      ).toLocaleString()} (基本)`;
    }

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
      const input = document.getElementById("images");
      if (input && input.resetUploader) input.resetUploader();

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
