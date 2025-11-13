// 這是 frontend/js/dashboard.js (已修復 API_BASE_URL)
// (最終完整版：支援合併集運費用試算、備註欄位、照片查看、運費詳情)

// --- 定義費率 (前端顯示用，需與後端一致) ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317;

// --- [全域函式] 開啟圖片彈窗 (掛載到 window 以便 HTML onclick 呼叫) ---
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");

  if (!gallery || !modal) return;

  gallery.innerHTML = ""; // 清空舊內容

  if (images && images.length > 0) {
    images.forEach((imgUrl) => {
      // 建立圖片元素
      const img = document.createElement("img");
      // 確保網址正確 (加上 API_BASE_URL)
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.alt = "倉庫照片";
      img.title = "點擊查看大圖";

      // 點擊圖片可開新視窗看大圖
      img.onclick = () => window.open(img.src, "_blank");

      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = "<p>沒有照片</p>";
  }

  modal.style.display = "flex";
};

// --- [全域函式] 開啟費用詳情 (掛載到 window) ---
window.openFeeDetails = function (pkgDataStr) {
  // 解碼並解析包裹資料
  const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
  const modal = document.getElementById("fee-details-modal");
  const content = document.getElementById("fee-details-content");

  if (!pkg.furnitureType || !RATES[pkg.furnitureType]) {
    alert("資料不完整 (未填寫家具類型)，無法顯示詳情");
    return;
  }

  const rate = RATES[pkg.furnitureType];

  // 前端再次計算以顯示公式 (需與後端邏輯一致)
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
      最終運費 (取高者)：<strong style="color:#d63031">$${pkg.shippingFee.toLocaleString()}</strong>
    </p>
  `;

  modal.style.display = "flex";
};

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取 DOM 元素 ---
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
  const btnCloseProfileModal = editProfileModal.querySelector(".modal-close");

  const editPackageModal = document.getElementById("edit-package-modal");
  const editPackageForm = document.getElementById("edit-package-form");
  const btnClosePackageModal = editPackageModal.querySelector(".modal-close");

  // 合併集運相關
  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const btnCreateShipment = document.getElementById("btn-create-shipment");
  const btnCloseShipmentModal =
    createShipmentModal.querySelector(".modal-close");
  const shipmentPackageList = document.getElementById("shipment-package-list");
  const shipmentTotalCost = document.getElementById("shipment-total-cost"); // [新增] 總金額顯示

  // 彈窗相關
  const viewImagesModal = document.getElementById("view-images-modal");
  const feeDetailsModal = document.getElementById("fee-details-modal");

  // --- 2. 狀態變數 ---
  let currentUser = null;
  const token = localStorage.getItem("token");
  let allPackagesData = []; // 用來儲存所有包裹的完整資料

  // 中文翻譯字典
  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };
  const shipmentStatusMap = {
    PENDING_PAYMENT: "等待付款",
    PROCESSING: "處理中",
    SHIPPED: "已出貨",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // --- 3. 初始化檢查 ---
  if (!token) {
    alert("請先登入會員");
    window.location.href = "login.html";
    return;
  }

  // --- 4. 函式定義 ---

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    setTimeout(() => {
      messageBox.style.display = "none";
    }, 5000);
  }

  // (A) 載入會員資料
  async function loadUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        alert("您的登入已過期，請重新登入");
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
      console.error("載入會員資料失敗:", error);
      showMessage("載入會員資料失敗，請重新登入", "error");
    }
  }

  // (B) 載入我的包裹
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "載入包裹失敗");

      allPackagesData = data.packages;
      packagesTableBody.innerHTML = "";

      if (allPackagesData.length === 0) {
        packagesTableBody.innerHTML =
          '<tr><td colspan="9" style="text-align: center;">您尚未預報任何包裹</td></tr>';
        return;
      }

      allPackagesData.forEach((pkg) => {
        const statusText = packageStatusMap[pkg.status] || pkg.status;
        const isArrived = pkg.status === "ARRIVED";
        const tr = document.createElement("tr");

        const dimensions =
          pkg.actualLength && pkg.actualWidth && pkg.actualHeight
            ? `${pkg.actualLength} x ${pkg.actualWidth} x ${pkg.actualHeight}`
            : "-";
        const weight = pkg.actualWeight ? `${pkg.actualWeight} kg` : "-";

        // [運費顯示邏輯]
        let feeDisplay = '<span style="color: #999;">-</span>';
        if (pkg.shippingFee) {
          const pkgStr = encodeURIComponent(JSON.stringify(pkg));
          feeDisplay = `<a href="javascript:void(0)" onclick="window.openFeeDetails('${pkgStr}')" style="color: #d32f2f; font-weight: bold; text-decoration: underline;">$${pkg.shippingFee.toLocaleString()}</a>`;
        }

        // [照片按鈕邏輯]
        const hasPhotos = pkg.warehouseImages && pkg.warehouseImages.length > 0;
        const photosBtn = hasPhotos
          ? `<button class="btn btn-view-img btn-sm" onclick='window.openImages(${JSON.stringify(
              pkg.warehouseImages
            )})'>
               查看 (${pkg.warehouseImages.length})
             </button>`
          : '<span style="color:#999; font-size:12px;">無</span>';

        tr.innerHTML = `
          <td>
            <input type="checkbox" class="package-checkbox" 
                   data-id="${pkg.id}" 
                   ${isArrived ? "" : "disabled"}>
          </td>
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

        // 綁定按鈕事件
        const editBtn = tr.querySelector(".btn-edit");
        if (editBtn) {
          editBtn.addEventListener("click", () => openEditPackageModal(pkg));
        }
        const deleteBtn = tr.querySelector(".btn-delete");
        if (deleteBtn) {
          deleteBtn.addEventListener("click", () => handleDeletePackage(pkg));
        }

        packagesTableBody.appendChild(tr);
      });
    } catch (error) {
      console.error("載入包裹時發生錯誤:", error.message);
      showMessage(`載入包裹失敗: ${error.message}`, "error");
    }
  }

  // (C) 載入我的集運單
  async function loadMyShipments() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "載入集運單失敗");

      if (data.shipments.length === 0) {
        shipmentsTableBody.innerHTML =
          '<tr><td colspan="6" style="text-align: center;">您尚未建立任何集運單</td></tr>';
        return;
      }

      shipmentsTableBody.innerHTML = data.shipments
        .map((ship) => {
          const statusText = shipmentStatusMap[ship.status] || ship.status;
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
          </tr>
        `;
        })
        .join("");
    } catch (error) {
      console.error("載入集運單時發生錯誤:", error.message);
      showMessage(`載入集運單失敗: ${error.message}`, "error");
    }
  }

  // (D) 提交包裹預報
  forecastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const requestData = {
      trackingNumber: trackingNumber.value,
      productName: productName.value,
      quantity: quantity.value ? parseInt(quantity.value) : 1,
      note: note.value,
    };
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/packages/forecast/json`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestData),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "預報失敗");
      showMessage("包裹預報成功！", "success");
      forecastForm.reset();
      loadMyPackages();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (E) Tab 切換
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

  // (F) 編輯個人資料
  btnEditProfile.addEventListener("click", () => {
    document.getElementById("edit-name").value = currentUser.name || "";
    document.getElementById("edit-phone").value = currentUser.phone || "";
    document.getElementById("edit-address").value =
      currentUser.defaultAddress || "";
    editProfileModal.style.display = "flex";
  });
  btnCloseProfileModal.addEventListener(
    "click",
    () => (editProfileModal.style.display = "none")
  );
  editProfileModal.addEventListener("click", (e) => {
    if (e.target === editProfileModal) editProfileModal.style.display = "none";
  });
  editProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("edit-name").value,
      phone: document.getElementById("edit-phone").value,
      defaultAddress: document.getElementById("edit-address").value,
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "更新失敗");

      currentUser = result.user;
      welcomeMessage.textContent = `歡迎回來，${
        currentUser.name || currentUser.email
      }！`;
      userEmail.textContent = currentUser.email;
      userPhone.textContent = currentUser.phone || "(尚未提供)";
      userAddress.textContent = currentUser.defaultAddress || "(尚未提供)";

      editProfileModal.style.display = "none";
      showMessage("個人資料更新成功！", "success");
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (G) 編輯包裹
  function openEditPackageModal(pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    editPackageModal.style.display = "flex";
  }
  btnClosePackageModal.addEventListener(
    "click",
    () => (editPackageModal.style.display = "none")
  );
  editPackageModal.addEventListener("click", (e) => {
    if (e.target === editPackageModal) editPackageModal.style.display = "none";
  });
  editPackageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("edit-package-id").value;
    const data = {
      trackingNumber: document.getElementById("edit-trackingNumber").value,
      productName: document.getElementById("edit-productName").value,
      quantity: parseInt(document.getElementById("edit-quantity").value),
      note: document.getElementById("edit-note").value,
    };
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/packages/${packageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "更新失敗");

      editPackageModal.style.display = "none";
      showMessage("包裹資料更新成功！", "success");
      loadMyPackages();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (H) 刪除包裹
  async function handleDeletePackage(pkg) {
    if (!confirm(`確定要刪除包裹 "${pkg.productName}" 嗎？`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "刪除失敗");

      showMessage("包裹刪除成功！", "success");
      loadMyPackages();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  // (I) 合併集運 (核心功能)

  // 1. 開啟彈窗與試算金額
  btnCreateShipment.addEventListener("click", () => {
    const checkedBoxes = document.querySelectorAll(".package-checkbox:checked");
    if (checkedBoxes.length === 0) {
      showMessage('請至少勾選一個 "已入庫" 的包裹來合併', "error");
      return;
    }

    let packageListHtml = "";
    let selectedPackageIds = [];
    let totalFee = 0; // 總金額

    checkedBoxes.forEach((box) => {
      const pkgId = box.dataset.id;
      selectedPackageIds.push(pkgId);

      const pkg = allPackagesData.find((p) => p.id === pkgId);
      if (pkg) {
        const fee = pkg.shippingFee || 0;
        totalFee += fee;

        packageListHtml += `
          <div class="shipment-package-item">
            <span>${pkg.productName} (${pkg.trackingNumber})</span>
            <small>運費: $${fee.toLocaleString()}</small>
          </div>
        `;
      }
    });

    shipmentPackageList.innerHTML = packageListHtml;

    if (shipmentTotalCost) {
      shipmentTotalCost.textContent = totalFee.toLocaleString();
    }

    createShipmentForm.dataset.ids = JSON.stringify(selectedPackageIds);

    document.getElementById("ship-name").value = currentUser.name || "";
    document.getElementById("ship-phone").value = currentUser.phone || "";
    document.getElementById("ship-address").value =
      currentUser.defaultAddress || "";
    document.getElementById("ship-note").value = "";

    createShipmentModal.style.display = "flex";
  });

  // 2. 關閉彈窗
  btnCloseShipmentModal.addEventListener(
    "click",
    () => (createShipmentModal.style.display = "none")
  );
  createShipmentModal.addEventListener("click", (e) => {
    if (e.target === createShipmentModal)
      createShipmentModal.style.display = "none";
  });

  // 3. 提交建立集運單
  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const packageIds = JSON.parse(createShipmentForm.dataset.ids || "[]");
    if (packageIds.length === 0) {
      showMessage("發生錯誤：找不到要集運的包裹", "error");
      return;
    }

    // 移除了 additionalServices，新增 note
    const requestData = {
      packageIds: packageIds,
      recipientName: document.getElementById("ship-name").value,
      phone: document.getElementById("ship-phone").value,
      shippingAddress: document.getElementById("ship-address").value,
      idNumber: document.getElementById("ship-idNumber").value,
      taxId: document.getElementById("ship-taxId").value || null,
      note: document.getElementById("ship-note").value, // [新增] 傳送備註
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "建立失敗");

      createShipmentModal.style.display = "none";
      createShipmentForm.reset();
      showMessage("集運單建立成功！", "success");

      loadMyPackages();
      loadMyShipments();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (J) 綁定所有彈窗的關閉事件
  [viewImagesModal, feeDetailsModal].forEach((m) => {
    if (m) {
      const closeBtn = m.querySelector(".modal-close");
      const closeBtn2 = m.querySelector(".modal-close-btn");

      if (closeBtn)
        closeBtn.addEventListener("click", () => (m.style.display = "none"));
      if (closeBtn2)
        closeBtn2.addEventListener("click", () => (m.style.display = "none"));

      m.addEventListener("click", (e) => {
        if (e.target === m) m.style.display = "none";
      });
    }
  });

  // --- 5. 初始載入資料 ---
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();

  // (K) 檢查試算草稿
  function checkForecastDraft() {
    const draftJSON = localStorage.getItem("forecast_draft");
    if (draftJSON) {
      try {
        const draft = JSON.parse(draftJSON);
        if (draft.productName) {
          productName.value = draft.productName;
        }
        if (draft.quantity) {
          quantity.value = draft.quantity;
        }
        showMessage("您的試算資料已帶入，請填寫物流單號後提交。", "success");
        localStorage.removeItem("forecast_draft");
        forecastForm.scrollIntoView({ behavior: "smooth" });
      } catch (e) {
        console.error("解析預報草稿失敗:", e);
        localStorage.removeItem("forecast_draft");
      }
    }
  }
  checkForecastDraft();
}); // DOMContentLoaded 結束
