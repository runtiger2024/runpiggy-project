// 這是 frontend/js/dashboard.js (已修復 API_BASE_URL)
// (最終完整版：支援合併集運費用試算、備註欄位、照片查看、運費詳情、付款憑證上傳)

// --- 定義費率 (前端顯示用) ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317;

// --- [全域函式] 開啟圖片彈窗 ---
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;
  gallery.innerHTML = "";
  if (images && images.length > 0) {
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.alt = "倉庫照片";
      img.onclick = () => window.open(img.src, "_blank");
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = "<p>沒有照片</p>";
  }
  modal.style.display = "flex";
};

// --- [全域函式] 開啟費用詳情 ---
window.openFeeDetails = function (pkgDataStr) {
  const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
  const modal = document.getElementById("fee-details-modal");
  const content = document.getElementById("fee-details-content");

  if (!pkg.furnitureType || !RATES[pkg.furnitureType]) {
    alert("資料不完整，無法顯示詳情");
    return;
  }
  const rate = RATES[pkg.furnitureType];
  const cai = Math.ceil(
    (pkg.actualLength * pkg.actualWidth * pkg.actualHeight) / VOLUME_DIVISOR
  );
  const volCost = cai * rate.volumeRate;
  const w = Math.ceil(pkg.actualWeight * 10) / 10;
  const weightCost = w * rate.weightRate;

  content.innerHTML = `
    <p><strong>商品名稱：</strong>${pkg.productName}</p>
    <p><strong>家具類型：</strong>${rate.name}</p>
    <hr style="margin: 10px 0; border-top: 1px dashed #ccc;">
    <p>📦 <strong>材積計算：</strong><br>
       尺寸：${pkg.actualLength}x${pkg.actualWidth}x${pkg.actualHeight} cm<br>
       材數：${(
         (pkg.actualLength * pkg.actualWidth * pkg.actualHeight) /
         VOLUME_DIVISOR
       ).toFixed(2)} ➜ <strong>${cai} 材</strong><br>
       費用：${cai} × $${
    rate.volumeRate
  } = <span style="color:#d63031">$${volCost.toLocaleString()}</span>
    </p>
    <p>⚖️ <strong>重量計算：</strong><br>
       實重：${pkg.actualWeight} kg ➜ <strong>${w} kg</strong><br>
       費用：${w} × $${
    rate.weightRate
  } = <span style="color:#d63031">$${Math.round(
    weightCost
  ).toLocaleString()}</span>
    </p>
    <hr style="margin: 10px 0; border-top: 2px solid #eee;">
    <p style="text-align:right; font-size:1.2em;">
      最終運費：<strong style="color:#d63031">$${pkg.shippingFee.toLocaleString()}</strong>
    </p>
  `;
  modal.style.display = "flex";
};

// --- [全域函式] 開啟上傳憑證彈窗 ---
window.openUploadProof = function (shipmentId) {
  document.getElementById("upload-proof-id").value = shipmentId;
  document.getElementById("proof-file").value = null;
  document.getElementById("upload-proof-modal").style.display = "flex";
};

// --- [全域函式] 查看憑證 ---
window.viewProof = function (imgUrl) {
  window.open(`${API_BASE_URL}${imgUrl}`, "_blank");
};

document.addEventListener("DOMContentLoaded", () => {
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

  const viewImagesModal = document.getElementById("view-images-modal");
  const feeDetailsModal = document.getElementById("fee-details-modal");
  const bankInfoModal = document.getElementById("bank-info-modal");
  const uploadProofModal = document.getElementById("upload-proof-modal");
  const uploadProofForm = document.getElementById("upload-proof-form");

  let currentUser = null;
  const token = localStorage.getItem("token");
  let allPackagesData = [];

  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };
  const shipmentStatusMap = {
    PENDING_PAYMENT: "待付款",
    PROCESSING: "已收款，安排裝櫃",
    SHIPPED: "已裝櫃",
    COMPLETED: "海關查驗",
    CANCELLEDD: "清關放行",
    CANCELL: "拆櫃派送",
    CANCEL: "已完成",
  };

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    setTimeout(() => {
      messageBox.style.display = "none";
    }, 5000);
  }

  // (A) 載入資料
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

  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) return;
      allPackagesData = data.packages;
      packagesTableBody.innerHTML = "";
      if (allPackagesData.length === 0) {
        packagesTableBody.innerHTML =
          '<tr><td colspan="9" style="text-align: center;">尚無包裹</td></tr>';
        return;
      }
      allPackagesData.forEach((pkg) => {
        const statusText = packageStatusMap[pkg.status] || pkg.status;
        const isArrived = pkg.status === "ARRIVED";
        const dimensions = pkg.actualLength
          ? `${pkg.actualLength}x${pkg.actualWidth}x${pkg.actualHeight}`
          : "-";
        const weight = pkg.actualWeight ? `${pkg.actualWeight} kg` : "-";

        let feeDisplay = '<span style="color: #999;">-</span>';
        if (pkg.shippingFee) {
          const pkgStr = encodeURIComponent(JSON.stringify(pkg));
          feeDisplay = `<a href="javascript:void(0)" onclick="window.openFeeDetails('${pkgStr}')" style="color: #d32f2f; font-weight: bold; text-decoration: underline;">$${pkg.shippingFee.toLocaleString()}</a>`;
        }
        const photosBtn =
          pkg.warehouseImages && pkg.warehouseImages.length > 0
            ? `<button class="btn btn-view-img btn-sm" onclick='window.openImages(${JSON.stringify(
                pkg.warehouseImages
              )})'>查看</button>`
            : '<span style="color:#999; font-size:12px;">無</span>';

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
          <td>${dimensions}</td>
          <td>${weight}</td>
          <td>${feeDisplay}</td>
          <td>${photosBtn}</td>
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
    } catch (e) {}
  }

  async function handleDeletePackage(pkg) {
    if (confirm("確定刪除?")) {
      await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadMyPackages();
    }
  }

  // (C) 載入集運單 (含憑證按鈕)
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
          const statusText = shipmentStatusMap[ship.status] || ship.status;

          // [新增] 判斷是否已上傳憑證
          let proofBtn = "";
          if (ship.paymentProof) {
            proofBtn = `<button class="btn btn-secondary btn-sm" onclick="window.viewProof('${ship.paymentProof}')" style="background-color:#27ae60;">已上傳(查看)</button>`;
          } else {
            proofBtn = `<button class="btn btn-primary btn-sm" onclick="window.openUploadProof('${ship.id}')">上傳憑證</button>`;
          }

          return `
          <tr>
            <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
            <td><span class="status-badge status-${
              ship.status
            }">${statusText}</span></td>
            <td>${ship.recipientName}</td>
            <td>${ship.idNumber}</td>
            <td>${ship.packages.length} 件</td>
            <td>${
              ship.totalCost
                ? `NT$ ${ship.totalCost.toLocaleString()}`
                : "(待報價)"
            }</td>
            <td>${proofBtn}</td>
          </tr>`;
        })
        .join("");
    } catch (e) {}
  }

  // (D) 提交預報
  forecastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const requestData = {
      trackingNumber: trackingNumber.value,
      productName: productName.value,
      quantity: quantity.value ? parseInt(quantity.value) : 1,
      note: note.value,
    };
    try {
      await fetch(`${API_BASE_URL}/api/packages/forecast/json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      showMessage("預報成功", "success");
      forecastForm.reset();
      loadMyPackages();
    } catch (e) {
      showMessage(e.message, "error");
    }
  });

  // (E) 建立集運單
  btnCreateShipment.addEventListener("click", () => {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) {
      showMessage("請至少選擇一個包裹", "error");
      return;
    }
    let html = "";
    let ids = [];
    let totalFee = 0;
    checked.forEach((box) => {
      const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);
      if (p) {
        const fee = p.shippingFee || 0;
        totalFee += fee;
        html += `<div class="shipment-package-item"><span>${p.productName} (${
          p.trackingNumber
        })</span><span>$${fee.toLocaleString()}</span></div>`;
        ids.push(p.id);
      }
    });
    shipmentPackageList.innerHTML = html;
    if (shipmentTotalCost)
      shipmentTotalCost.textContent = totalFee.toLocaleString();
    createShipmentForm.dataset.ids = JSON.stringify(ids);
    document.getElementById("ship-name").value = currentUser.name || "";
    document.getElementById("ship-phone").value = currentUser.phone || "";
    document.getElementById("ship-address").value =
      currentUser.defaultAddress || "";
    document.getElementById("ship-note").value = ""; // 清空備註
    document.getElementById("create-shipment-modal").style.display = "flex";
  });

  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = JSON.parse(createShipmentForm.dataset.ids);
    const data = {
      packageIds: ids,
      recipientName: document.getElementById("ship-name").value,
      phone: document.getElementById("ship-phone").value,
      shippingAddress: document.getElementById("ship-address").value,
      idNumber: document.getElementById("ship-idNumber").value,
      taxId: document.getElementById("ship-taxId").value,
      note: document.getElementById("ship-note").value, // [新增] 傳送備註
    };
    const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      document.getElementById("create-shipment-modal").style.display = "none";
      createShipmentForm.reset();
      // [新增] 顯示匯款資訊
      bankInfoModal.style.display = "flex";
      loadMyPackages();
      loadMyShipments();
    } else {
      const err = await res.json();
      showMessage(err.message, "error");
    }
  });

  // [新增] 提交憑證上傳
  uploadProofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("upload-proof-id").value;
    const file = document.getElementById("proof-file").files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("paymentProof", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        uploadProofModal.style.display = "none";
        alert("上傳成功！我們將盡快為您確認。");
        loadMyShipments();
      } else {
        alert("上傳失敗，請稍後再試");
      }
    } catch (e) {
      alert("上傳發生錯誤");
    }
  });

  // Tab 與 編輯個資 (保留)
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
    document.getElementById("edit-profile-modal").style.display = "flex";
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
    document.getElementById("edit-profile-modal").style.display = "none";
    loadUserProfile();
  });

  // 編輯包裹
  function openEditPackageModal(pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    document.getElementById("edit-package-modal").style.display = "flex";
  }
  const btnClosePackageModal = document.querySelector(
    "#edit-package-modal .modal-close"
  );
  btnClosePackageModal.addEventListener(
    "click",
    () => (document.getElementById("edit-package-modal").style.display = "none")
  );

  const editPackageForm = document.getElementById("edit-package-form");
  editPackageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-package-id").value;
    const data = {
      trackingNumber: document.getElementById("edit-trackingNumber").value,
      productName: document.getElementById("edit-productName").value,
      quantity: parseInt(document.getElementById("edit-quantity").value),
      note: document.getElementById("edit-note").value,
    };
    await fetch(`${API_BASE_URL}/api/packages/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    document.getElementById("edit-package-modal").style.display = "none";
    loadMyPackages();
  });

  // 綁定所有彈窗關閉
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

  loadUserProfile();
  loadMyPackages();
  loadMyShipments();

  // 檢查草稿
  const draft = localStorage.getItem("forecast_draft");
  if (draft) {
    try {
      const d = JSON.parse(draft);
      productName.value = d.productName || "";
      quantity.value = d.quantity || 1;
      showMessage("已帶入試算資料", "success");
      localStorage.removeItem("forecast_draft");
      forecastForm.scrollIntoView({ behavior: "smooth" });
    } catch (e) {}
  }
});
