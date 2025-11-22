// 這是 frontend/js/dashboard.js (V8.1 優化版 - 資料與邏輯分離)
// 相依檔案: apiConfig.js, shippingData.js

// --- 全域變數 ---
let currentEditPackageImages = []; // 用於儲存編輯中的舊圖片列表

// --- [全域函式] ---
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
      arrivedBoxes.forEach((box) => {
        const rate = RATES[box.type]; // 使用 shippingData.js 的 RATES
        if (!rate) {
          boxesHtml += `<div class="calc-box"><strong>${
            box.name || "分箱"
          }:</strong> <span style="color: red;">(類型錯誤)</span></div>`;
          return;
        }
        const l = parseFloat(box.length) || 0;
        const w_dim = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const w = parseFloat(box.weight) || 0;
        const cai = Math.ceil((l * w_dim * h) / VOLUME_DIVISOR); // 使用 shippingData.js 的常數
        const volCost = cai * rate.volumeRate;
        const finalWeight = Math.ceil(w * 10) / 10;
        const weightCost = finalWeight * rate.weightRate;
        const finalFee = box.fee || 0;

        boxesHtml += `
          <div class="calc-box" style="background: #fdfdfd; border: 1px solid #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
            <strong>${box.name || "分箱"} (${rate.name}):</strong>
            <div class="calc-line">
              📦 材積: (${l}x${w_dim}x${h}/${VOLUME_DIVISOR} ➜ <strong>${cai} 材</strong>) × $${
          rate.volumeRate
        } = $${volCost.toLocaleString()}
            </div>
            <div class="calc-line">
              ⚖️ 重量: (<strong>${finalWeight} kg</strong>) × $${
          rate.weightRate
        } = $${Math.round(weightCost).toLocaleString()}
            </div>
            <div class="calc-line final">→ 運費: <strong>$${finalFee.toLocaleString()}</strong></div>
          </div>
        `;
      });
      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888;">暫無分箱資料</p>';
    }

    // 匯總
    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-boxes").textContent =
      arrivedBoxes.length;
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
        img.onclick = () => window.open(img.src, "_blank");
        imagesGallery.appendChild(img);
      });
    } else {
      imagesGallery.innerHTML = "<p>沒有照片</p>";
    }
    modal.style.display = "flex";
  } catch (e) {
    console.error(e);
    alert("載入失敗");
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

// 取消集運單函式
window.handleCancelShipment = async function (id) {
  if (
    !confirm(
      "確定要取消此集運單嗎？\n\n注意：取消後，包裹將會釋放回「我的包裹」列表（狀態變回已入庫），您可以重新打包。"
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
    alert("網路錯誤，請稍後再試");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "取消訂單";
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // --- 元素獲取 ---
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
  const trackingNumber = document.getElementById("trackingNumber");
  const productName = document.getElementById("productName");
  const quantity = document.getElementById("quantity");
  const note = document.getElementById("note");
  const imagesInput = document.getElementById("images");

  const packagesTableBody = document.getElementById("packages-table-body");
  const shipmentsTableBody = document.getElementById("shipments-table-body");

  const editProfileModal = document.getElementById("edit-profile-modal");
  const editProfileForm = document.getElementById("edit-profile-form");
  const btnEditProfile = document.getElementById("btn-edit-profile");

  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const btnCreateShipment = document.getElementById("btn-create-shipment");
  const shipmentPackageList = document.getElementById("shipment-package-list");
  const shipmentTotalCost = document.getElementById("shipment-total-cost");

  const bankInfoModal = document.getElementById("bank-info-modal");
  const uploadProofModal = document.getElementById("upload-proof-modal");
  const uploadProofForm = document.getElementById("upload-proof-form");

  const draftQueueContainer = document.getElementById("draft-queue-container");
  const draftQueueList = document.getElementById("draft-queue-list");
  const shipmentWarnings = document.getElementById("shipment-warnings");
  const shipmentFeeNotice = document.getElementById("shipment-fee-notice");

  // 集運單地區相關
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
  const shipStreetAddress = document.getElementById("ship-street-address");

  // 編輯包裹相關
  const editPackageModal = document.getElementById("edit-package-modal");
  const editPackageForm = document.getElementById("edit-package-form");

  // --- 變數 ---
  let currentUser = null;
  const token = localStorage.getItem("token");
  let allPackagesData = [];

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    const duration =
      message.includes("佇列") || message.includes("帶入") ? 12000 : 5000;
    setTimeout(() => {
      messageBox.style.display = "none";
    }, duration);
  }

  // --- (A) 載入資料 ---
  async function loadUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        localStorage.removeItem("token");
        window.location.href = "login.html";
        return;
      }
      const data = await response.json();
      currentUser = data.user;
      welcomeMessage.textContent = `歡迎回來，${
        currentUser.name || currentUser.email
      }！`;
      userEmail.textContent = currentUser.email;
      userPhone.textContent = currentUser.phone || "(尚未提供)";
      userAddress.textContent = currentUser.defaultAddress || "(尚未提供)";
    } catch (error) {
      console.error("載入失敗");
    }
  }

  // --- (B) 載入包裹 ---
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      allPackagesData = data.packages;
      packagesTableBody.innerHTML = "";

      if (allPackagesData.length === 0) {
        packagesTableBody.innerHTML =
          '<tr><td colspan="9" style="text-align: center;">尚無包裹</td></tr>';
        return;
      }

      allPackagesData.forEach((pkg) => {
        const statusText = PACKAGE_STATUS_MAP[pkg.status] || pkg.status; // 使用 shippingData.js
        const isArrived = pkg.status === "ARRIVED";
        const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
          ? pkg.arrivedBoxes
          : [];
        const piecesCount =
          arrivedBoxes.length > 0 ? `${arrivedBoxes.length} 箱` : "-";
        const totalWeight =
          arrivedBoxes.length > 0
            ? `${arrivedBoxes
                .reduce((sum, box) => sum + (parseFloat(box.weight) || 0), 0)
                .toFixed(1)} kg`
            : "-";

        let feeDisplay = '<span style="color: #999;">-</span>';
        if (pkg.totalCalculatedFee != null) {
          feeDisplay = `<span style="color: #d32f2f; font-weight: bold;">$${pkg.totalCalculatedFee.toLocaleString()}</span>`;
        }

        const pkgStr = encodeURIComponent(JSON.stringify(pkg));
        const detailsBtn = `<button class="btn btn-view-img btn-sm" onclick='window.openPackageDetails("${pkgStr}")'>查看</button>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><input type="checkbox" class="package-checkbox" data-id="${
            pkg.id
          }" ${isArrived ? "" : "disabled"}></td>
          <td><span class="status-badge status-${
            pkg.status
          }">${statusText}</span></td>
          <td>${pkg.trackingNumber}</td>
          <td>${pkg.productName}</td>
          <td>${piecesCount}</td>
          <td>${totalWeight}</td>
          <td>${feeDisplay}</td>
          <td>${detailsBtn}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-edit" ${
              pkg.status !== "PENDING" ? "disabled" : ""
            }>修改</button>
            <button class="btn btn-danger btn-sm btn-delete" ${
              pkg.status !== "PENDING" ? "disabled" : ""
            }>刪除</button>
          </td>
        `;
        tr.querySelector(".btn-edit").addEventListener("click", () =>
          openEditPackageModal(pkg)
        );
        tr.querySelector(".btn-delete").addEventListener("click", () =>
          handleDeletePackage(pkg)
        );
        packagesTableBody.appendChild(tr);
      });
    } catch (e) {
      packagesTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">載入失敗: ${e.message}</td></tr>`;
    }
  }

  async function handleDeletePackage(pkg) {
    if (confirm("確定刪除此包裹預報?")) {
      await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadMyPackages();
    }
  }

  // --- (C) 載入集運單 ---
  async function loadMyShipments() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.shipments.length === 0) {
        shipmentsTableBody.innerHTML =
          '<tr><td colspan="7" style="text-align: center;">尚無集運單</td></tr>';
        return;
      }
      shipmentsTableBody.innerHTML = data.shipments
        .map((ship) => {
          let statusText = SHIPMENT_STATUS_MAP[ship.status] || ship.status; // 使用 shippingData.js
          let statusClass = ship.status;

          if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
            statusText = "已付款，待審核";
            statusClass = "PENDING_REVIEW";
          }

          let proofBtn = "";
          if (ship.paymentProof) {
            proofBtn = `<button class="btn btn-secondary btn-sm" onclick="window.viewProof('${ship.paymentProof}')" style="background-color:#27ae60;">已上傳(查看)</button>`;
          } else {
            proofBtn = `<button class="btn btn-primary btn-sm" onclick="window.openUploadProof('${ship.id}')">上傳憑證</button>`;
          }

          let cancelBtn = "";
          if (ship.status === "PENDING_PAYMENT") {
            cancelBtn = `<button class="btn btn-danger btn-sm" style="margin-top:5px; display:block; width:100%;" onclick="handleCancelShipment('${ship.id}')">取消訂單</button>`;
          }

          const printBtn = `<button class="btn btn-secondary btn-sm" style="margin-top:5px; background-color: #607d8b;" onclick="window.open('shipment-print.html?id=${ship.id}', '_blank')">列印/匯出</button>`;

          return `
          <tr>
            <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
            <td><span class="status-badge status-${statusClass}">${statusText}</span></td>
            <td>${ship.recipientName}</td>
            <td>${ship.idNumber}</td>
            <td>${ship.packages.length} 件</td>
            <td>${
              ship.totalCost != null
                ? `NT$ ${ship.totalCost.toLocaleString()}`
                : "(待報價)"
            }</td>
            <td>
                ${proofBtn}
                ${printBtn}
                ${cancelBtn}
            </td>
          </tr>`;
        })
        .join("");
    } catch (e) {}
  }

  // --- (D) 提交預報 ---
  forecastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitButton = forecastForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "提交中...";

    const formData = new FormData();
    formData.append("trackingNumber", trackingNumber.value);
    formData.append("productName", productName.value);
    formData.append("quantity", quantity.value ? parseInt(quantity.value) : 1);
    formData.append("note", note.value);

    const files = imagesInput.files;
    if (files.length > 5) {
      showMessage("照片最多只能上傳 5 張", "error");
      submitButton.disabled = false;
      return;
    }
    for (let i = 0; i < files.length; i++) {
      formData.append("images", files[i]);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/packages/forecast/images`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "提交失敗");
      }

      forecastForm.reset();
      loadMyPackages();
      checkForecastDraftQueue(true);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "提交預報";
    }
  });

  // --- (E) 編輯包裹 (含圖片) ---
  function renderEditImages() {
    const container = document.getElementById("edit-package-images-container");
    if (!container) {
      const form = document.getElementById("edit-package-form");
      const div = document.createElement("div");
      div.id = "edit-package-images-container";
      div.style.marginBottom = "15px";
      form.insertBefore(div, form.lastElementChild);

      if (!document.getElementById("edit-package-new-images")) {
        const group = document.createElement("div");
        group.className = "form-group";
        group.innerHTML =
          '<label>加傳圖片 (最多補至5張)</label><input type="file" id="edit-package-new-images" multiple accept="image/*">';
        form.insertBefore(group, form.lastElementChild);
      }
      return renderEditImages();
    }

    container.innerHTML =
      '<label style="display:block;margin-bottom:5px;">已上傳圖片 (點擊 X 移除):</label>';
    if (currentEditPackageImages.length === 0) {
      container.innerHTML +=
        '<span style="color:#999; font-size:0.9em;">無圖片</span>';
      return;
    }

    currentEditPackageImages.forEach((imgUrl, idx) => {
      const wrapper = document.createElement("div");
      wrapper.style.display = "inline-block";
      wrapper.style.position = "relative";
      wrapper.style.marginRight = "10px";
      wrapper.style.marginBottom = "10px";

      wrapper.innerHTML = `
            <img src="${API_BASE_URL}${imgUrl}" style="width:60px; height:60px; object-fit:cover; border:1px solid #ddd; border-radius:4px;">
            <button type="button" class="btn-remove-img" data-idx="${idx}" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:12px; cursor:pointer;">&times;</button>
        `;
      container.appendChild(wrapper);
    });

    container.querySelectorAll(".btn-remove-img").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.target.getAttribute("data-idx"));
        removeEditImage(idx);
      });
    });
  }

  function removeEditImage(idx) {
    currentEditPackageImages.splice(idx, 1);
    renderEditImages();
  }

  function openEditPackageModal(pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";

    currentEditPackageImages = pkg.productImages || [];
    renderEditImages();

    const newImgInput = document.getElementById("edit-package-new-images");
    if (newImgInput) newImgInput.value = null;

    editPackageModal.style.display = "flex";
  }

  editPackageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-package-id").value;
    const submitBtn = editPackageForm.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "儲存中...";

    const formData = new FormData();
    formData.append(
      "trackingNumber",
      document.getElementById("edit-trackingNumber").value
    );
    formData.append(
      "productName",
      document.getElementById("edit-productName").value
    );
    formData.append(
      "quantity",
      parseInt(document.getElementById("edit-quantity").value)
    );
    formData.append("note", document.getElementById("edit-note").value);
    formData.append("existingImages", JSON.stringify(currentEditPackageImages));

    const newFilesInput = document.getElementById("edit-package-new-images");
    if (newFilesInput && newFilesInput.files.length > 0) {
      const totalImages =
        currentEditPackageImages.length + newFilesInput.files.length;
      if (totalImages > 5) {
        alert("圖片總數不能超過 5 張");
        submitBtn.disabled = false;
        return;
      }
      for (let i = 0; i < newFilesInput.files.length; i++) {
        formData.append("images", newFilesInput.files[i]);
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/packages/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("更新失敗");

      editPackageModal.style.display = "none";
      loadMyPackages();
      alert("包裹更新成功");
    } catch (err) {
      alert("更新失敗: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "儲存包裹變更";
    }
  });

  const btnClosePackageModal = document.querySelector(
    "#edit-package-modal .modal-close"
  );
  if (btnClosePackageModal) {
    btnClosePackageModal.addEventListener(
      "click",
      () => (editPackageModal.style.display = "none")
    );
  }

  // --- (F) 綁定所有彈窗關閉 ---
  const allModals = document.querySelectorAll(".modal-overlay");
  allModals.forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
    const closeBtns = m.querySelectorAll(".modal-close, .modal-close-btn");
    closeBtns.forEach((btn) =>
      btn.addEventListener("click", () => (m.style.display = "none"))
    );
  });

  // --- (G) 佇列與計算邏輯 ---
  function checkForecastDraftQueue(isAfterSubmit = false) {
    const draftListJSON = localStorage.getItem("forecast_draft_list");
    let draftList = [];
    if (draftListJSON) {
      try {
        draftList = JSON.parse(draftListJSON);
      } catch (e) {
        localStorage.removeItem("forecast_draft_list");
        return;
      }
    }

    if (draftList.length === 0) {
      draftQueueContainer.style.display = "none";
      localStorage.removeItem("forecast_draft_list");
      return;
    }

    draftQueueContainer.style.display = "block";
    draftQueueList.innerHTML = "";
    draftList.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.name} (數量: ${item.quantity || 1})`;
      draftQueueList.appendChild(li);
    });

    const nextItem = draftList.shift();
    productName.value = nextItem.name || "";
    quantity.value = nextItem.quantity || 1;
    note.value = "來自運費試算";
    trackingNumber.value = "";
    imagesInput.value = null;

    let message = isAfterSubmit
      ? `預報成功！已自動帶入下一筆 (${nextItem.name})。`
      : `已自動帶入第 1 筆 (${nextItem.name})。`;
    message +=
      draftList.length > 0
        ? ` 還有 ${draftList.length} 筆在佇列中。`
        : " 這是最後一筆了。";
    showMessage(message, "success");

    localStorage.setItem("forecast_draft_list", JSON.stringify(draftList));
    if (!isAfterSubmit) forecastForm.scrollIntoView({ behavior: "smooth" });
    trackingNumber.focus();
  }

  // --- (H) 集運單建立相關 ---
  btnCreateShipment.addEventListener("click", async () => {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) {
      showMessage("請至少選擇一個包裹", "error");
      return;
    }

    btnCreateShipment.disabled = true;
    btnCreateShipment.textContent = "讀取中...";

    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      allPackagesData = data.packages;

      let html = "";
      let ids = [];
      let validCheckedCount = 0;

      checked.forEach((box) => {
        const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);
        if (p && p.status === "ARRIVED") {
          validCheckedCount++;
          ids.push(p.id);
          html += `<div class="shipment-pkg-detail-item"><h4>${p.productName} (${p.trackingNumber})</h4>`;

          const arrivedBoxes = Array.isArray(p.arrivedBoxes)
            ? p.arrivedBoxes
            : [];
          if (arrivedBoxes.length > 0) {
            arrivedBoxes.forEach((b) => {
              const rate = RATES[b.type] || {}; // 使用 shippingData.js
              html += `<div class="calc-box"><small>${b.name}: ${b.weight}kg, ${b.length}x${b.width}x${b.height} => $${b.fee}</small></div>`;
            });
          } else {
            html += `<small style="color:#999">無詳細分箱資料</small>`;
          }
          html += `<div class="pkg-subtotal">小計: <strong>$${(
            p.totalCalculatedFee || 0
          ).toLocaleString()}</strong></div></div>`;
        }
      });

      if (validCheckedCount === 0) {
        showMessage("包裹狀態已變更，請重整", "error");
        loadMyPackages();
        return;
      }

      shipmentPackageList.innerHTML = html;
      createShipmentForm.dataset.ids = JSON.stringify(ids);
      document.getElementById("ship-name").value = currentUser.name || "";
      document.getElementById("ship-phone").value = currentUser.phone || "";

      shipDeliveryLocation.value = "";
      shipStreetAddress.value = "";
      shipRemoteAreaInfo.style.display = "none";

      recalculateShipmentTotal();
      createShipmentModal.style.display = "flex";
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      btnCreateShipment.disabled = false;
      btnCreateShipment.textContent = "合併打包 (建立集運單)";
    }
  });

  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = JSON.parse(createShipmentForm.dataset.ids);
    const deliveryRate = parseFloat(shipDeliveryLocation.value);
    const streetAddress = shipStreetAddress.value.trim();

    if (isNaN(deliveryRate)) {
      showMessage("請選擇配送地區", "error");
      return;
    }
    if (!streetAddress) {
      showMessage("請填寫詳細地址", "error");
      return;
    }

    // [新增] 商品證明驗證
    const productUrl = document.getElementById("ship-product-url").value.trim();
    const productImagesInput = document.getElementById("ship-product-images");
    const productImages = productImagesInput.files;

    if (!productUrl && productImages.length === 0) {
      showMessage(
        "請提供「商品購買連結」或上傳「商品照片」才能提交訂單",
        "error"
      );
      return;
    }

    const selectedOption =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex];
    const areaName = selectedOption.text.replace(/[✅📍⛰️🏝️🏖️⚠️]/g, "").trim();
    const fullAddress =
      (areaName === "一般地區" ? "" : areaName + " ") + streetAddress;

    // [修改] 改用 FormData 傳送資料
    const formData = new FormData();
    formData.append("packageIds", JSON.stringify(ids)); // 陣列轉字串
    formData.append(
      "recipientName",
      document.getElementById("ship-name").value.trim()
    );
    formData.append(
      "phone",
      document.getElementById("ship-phone").value.trim()
    );
    formData.append("shippingAddress", fullAddress);
    formData.append("deliveryLocationRate", deliveryRate);
    formData.append(
      "idNumber",
      document.getElementById("ship-idNumber").value.trim()
    );
    formData.append(
      "taxId",
      document.getElementById("ship-taxId").value.trim()
    );
    formData.append("note", document.getElementById("ship-note").value.trim());

    // 加入新欄位
    formData.append("productUrl", productUrl);
    for (let i = 0; i < productImages.length; i++) {
      formData.append("shipmentImages", productImages[i]);
    }

    const submitBtn = createShipmentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";

    try {
      // [修改] 移除 "Content-Type": "application/json"，瀏覽器會自動設定 multipart/form-data
      const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // 注意：不要手動設定 Content-Type，fetch 會自己處理 boundary
        },
        body: formData,
      });

      if (res.ok) {
        createShipmentModal.style.display = "none";
        createShipmentForm.reset();
        bankInfoModal.style.display = "flex";
        loadMyPackages();
        loadMyShipments();
      } else {
        const err = await res.json();
        throw new Error(err.message);
      }
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "確認送出集運單";
    }
  });

  function recalculateShipmentTotal() {
    const ids = JSON.parse(createShipmentForm.dataset.ids || "[]");
    let totalFee = 0;
    let totalShipmentVolume = 0;
    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;

    const checked = document.querySelectorAll(".package-checkbox:checked");
    checked.forEach((box) => {
      const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);
      if (p && p.status === "ARRIVED") {
        totalFee += p.totalCalculatedFee || 0;
        const arrivedBoxes = Array.isArray(p.arrivedBoxes)
          ? p.arrivedBoxes
          : [];
        arrivedBoxes.forEach((b) => {
          if (
            parseFloat(b.length) > OVERSIZED_LIMIT ||
            parseFloat(b.width) > OVERSIZED_LIMIT ||
            parseFloat(b.height) > OVERSIZED_LIMIT
          )
            hasAnyOversizedItem = true;
          if (parseFloat(b.weight) > OVERWEIGHT_LIMIT)
            hasAnyOverweightItem = true;
          const l = parseFloat(b.length) || 0;
          const w = parseFloat(b.width) || 0;
          const h = parseFloat(b.height) || 0;
          if (l > 0 && w > 0 && h > 0)
            totalShipmentVolume += Math.ceil((l * w * h) / VOLUME_DIVISOR);
        });
      }
    });

    const totalOverweightFee = hasAnyOverweightItem ? OVERWEIGHT_FEE : 0;
    const totalOversizedFee = hasAnyOversizedItem ? OVERSIZED_FEE : 0;
    const deliveryRate = parseFloat(shipDeliveryLocation.value) || 0;
    const totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
    const remoteFee = Math.round(totalCbm * deliveryRate);

    let finalBaseCost = totalFee;
    let noticeHtml = "";

    if (totalFee > 0 && totalFee < MINIMUM_CHARGE) {
      finalBaseCost = MINIMUM_CHARGE;
      noticeHtml = `<span style="color: #e74c3c; font-weight: bold;">(基本運費 $${totalFee.toLocaleString()}，已套用低消 $${MINIMUM_CHARGE.toLocaleString()}`;
    } else {
      noticeHtml = `(基本運費 $${finalBaseCost.toLocaleString()}`;
    }

    if (remoteFee > 0) noticeHtml += ` + 偏遠費 $${remoteFee.toLocaleString()}`;
    noticeHtml += `)`;

    const finalTotalCost =
      finalBaseCost + totalOverweightFee + totalOversizedFee + remoteFee;

    let warningHtml = "";
    if (remoteFee > 0)
      warningHtml += `<div>🚚 偏遠地區費: $${remoteFee.toLocaleString()}</div>`;
    if (hasAnyOversizedItem)
      warningHtml += `<div>⚠️ 超長費: $${OVERSIZED_FEE.toLocaleString()}</div>`;
    if (hasAnyOverweightItem)
      warningHtml += `<div>⚠️ 超重費: $${OVERWEIGHT_FEE.toLocaleString()}</div>`;

    shipmentTotalCost.textContent = finalTotalCost.toLocaleString();
    shipmentFeeNotice.innerHTML = noticeHtml;
    shipmentWarnings.innerHTML = warningHtml;
  }

  shipDeliveryLocation.addEventListener("change", () => {
    const fee = shipDeliveryLocation.value;
    if (fee && fee !== "0") {
      shipRemoteAreaInfo.style.display = "block";
      shipSelectedAreaFee.textContent = `$${parseInt(
        fee
      ).toLocaleString()}/方起`;
    } else {
      shipRemoteAreaInfo.style.display = "none";
    }
    recalculateShipmentTotal();
  });

  // 搜尋地區邏輯 (使用 REMOTE_AREAS)
  shipAreaSearch.addEventListener("input", function (e) {
    const searchTerm = e.target.value.trim().toLowerCase();
    if (searchTerm.length < 1) {
      shipSearchResults.style.display = "none";
      return;
    }

    let results = [];
    for (const [fee, areas] of Object.entries(REMOTE_AREAS)) {
      // 使用 shippingData.js 的 REMOTE_AREAS
      areas.forEach((area) => {
        if (area.toLowerCase().includes(searchTerm)) {
          results.push({ area: area, fee: parseInt(fee) });
        }
      });
    }

    if (results.length > 0) {
      shipSearchResults.style.display = "block";
      shipSearchResults.innerHTML = results
        .map(
          (r) => `
        <div class="search-result-item" onclick="selectShipRemoteArea('${
          r.area
        }', ${r.fee})">
          📍 ${
            r.area
          } <span style="color: #e74c3c; font-weight: bold; float: right;">NT$ ${r.fee.toLocaleString()}/方起</span>
        </div>
      `
        )
        .join("");
    } else {
      shipSearchResults.style.display = "block";
      shipSearchResults.innerHTML = `<div style="padding: 10px; color: #666; background: #f8f9fa;">✅ 找不到 "${searchTerm}"，可能屬於一般地區。</div>`;
    }
  });

  window.selectShipRemoteArea = function (areaName, fee) {
    for (let i = 0; i < shipDeliveryLocation.options.length; i++) {
      const option = shipDeliveryLocation.options[i];
      if (option.value === fee.toString()) {
        const optionText = option.textContent.replace(/[⛰️🏝️🏖️⚠️]/g, "").trim();
        if (optionText.includes(areaName)) {
          shipDeliveryLocation.selectedIndex = i;
          shipDeliveryLocation.dispatchEvent(new Event("change"));
          shipAreaSearch.value = areaName;
          shipSearchResults.style.display = "none";
          break;
        }
      }
    }
  };

  // --- 上傳憑證 ---
  uploadProofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("upload-proof-id").value;
    const file = document.getElementById("proof-file").files[0];
    if (!file) return;
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

  // --- Tab 切換 ---
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

  // --- 編輯個人資料 ---
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
  });

  // 初始載入
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();
  checkForecastDraftQueue(false);
});
