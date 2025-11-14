// 這是 frontend/js/admin-parcels.js (最終完整版：含 AJAX 即時更新)

// --- 1. 定義費率常數 ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317;

document.addEventListener("DOMContentLoaded", () => {
  // --- 2. 獲取 DOM 元素 ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");
  const parcelsTableBody = document.getElementById("parcelsTableBody");
  const statsTotal = document.getElementById("stats-total");
  const statsPending = document.getElementById("stats-pending");
  const statsArrived = document.getElementById("stats-arrived");
  const statsCompleted = document.getElementById("stats-completed");
  const modal = document.getElementById("parcel-detail-modal");
  const closeModalBtn = modal.querySelector(".modal-close-btn");
  const updateForm = document.getElementById("update-package-form");

  // 計算相關輸入框元素
  const elType = document.getElementById("modal-furnitureType");
  const elWeight = document.getElementById("modal-actualWeight");
  const elL = document.getElementById("modal-actualLength");
  const elW = document.getElementById("modal-actualWidth");
  const elH = document.getElementById("modal-actualHeight");
  const elFeeDisplay = document.getElementById("modal-shippingFee");
  const elDetails = document.getElementById("calc-details");
  const elSplitGroup = document.getElementById("split-package-group");
  const elSplitQty = document.getElementById("split-quantity");
  const elWarehouseRemark = document.getElementById("modal-warehouseRemark");

  // --- 3. 狀態變數 ---
  let allParcelsData = [];
  const adminToken = localStorage.getItem("admin_token");
  let currentExistingImages = [];

  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // --- 4. 初始化檢查 ---
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return;
  }
  const adminName = localStorage.getItem("admin_name");
  if (adminName) {
    adminWelcome.textContent = `你好, ${adminName}`;
  }

  // --- 5. 核心功能函式 ---

  // (A) 載入所有包裹
  async function loadAllParcels() {
    parcelsTableBody.innerHTML =
      '<tr><td colspan="9" style="text-align: center;">載入中...</td></tr>';
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/packages/all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert("登入已過期，請重新登入");
          window.location.href = "admin-login.html";
        }
        throw new Error("載入包裹失敗");
      }
      const data = await response.json();
      allParcelsData = data.packages || [];
      renderParcels(allParcelsData);
      updateStats(allParcelsData);
    } catch (error) {
      console.error("載入失敗:", error);
      parcelsTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">載入失敗: ${error.message}</td></tr>`;
    }
  }

  // (B) 渲染包裹列表
  function renderParcels(parcels) {
    parcelsTableBody.innerHTML = "";
    const status = filterStatus.value;
    const search = searchInput.value.toLowerCase();

    const filteredParcels = parcels.filter((pkg) => {
      const statusMatch = !status || pkg.status === status;
      const searchMatch =
        !search ||
        (pkg.trackingNumber &&
          pkg.trackingNumber.toLowerCase().includes(search)) ||
        (pkg.productName && pkg.productName.toLowerCase().includes(search)) ||
        (pkg.user && pkg.user.email.toLowerCase().includes(search));
      return statusMatch && searchMatch;
    });

    if (filteredParcels.length === 0) {
      parcelsTableBody.innerHTML =
        '<tr><td colspan="9" style="text-align: center;">找不到符合條件的包裹</td></tr>';
      return;
    }

    filteredParcels.forEach((pkg) => {
      const statusText = packageStatusMap[pkg.status] || pkg.status;
      const dimensions = pkg.actualLength
        ? `${pkg.actualLength}x${pkg.actualWidth}x${pkg.actualHeight}`
        : "-";
      const weight = pkg.actualWeight ? `${pkg.actualWeight}` : "-";

      const tr = document.createElement("tr");

      // [修改] 賦予 tr 一個唯一的 DOM ID
      tr.id = `parcel-row-${pkg.id}`;

      tr.innerHTML = `
        <td><button class="btn btn-secondary btn-sm btn-view-details">查看/編輯</button></td>
        <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
        <td>${pkg.user.email}</td>
        <td>${pkg.trackingNumber}</td>
        <td>${pkg.productName}</td>
        <td><span class="status-badge status-${
          pkg.status
        }">${statusText}</span></td>
        <td>${weight}</td>
        <td>${dimensions}</td>
        <td>${pkg.warehouseImages.length} 張</td>
      `;
      tr.querySelector(".btn-view-details").addEventListener("click", () => {
        openPackageModal(pkg);
      });
      parcelsTableBody.appendChild(tr);
    });
  }

  // [新增] (AJAX 優化) 只更新列表中的單一一列
  function updateParcelInList(pkg) {
    // 1. 更新 master data
    const index = allParcelsData.findIndex((p) => p.id === pkg.id);
    if (index !== -1) {
      // 合併資料 (因為 API 回傳的 pkg 沒有 user 物件，要保留舊的)
      allParcelsData[index] = { ...allParcelsData[index], ...pkg };
    }

    // 2. 更新 DOM
    const tr = document.getElementById(`parcel-row-${pkg.id}`);
    if (!tr) return; // 如果該列不在畫面上 (可能被篩選掉了)

    // 3. 重新產生儲存格內容
    const statusText = packageStatusMap[pkg.status] || pkg.status;
    const dimensions = pkg.actualLength
      ? `${pkg.actualLength}x${pkg.actualWidth}x${pkg.actualHeight}`
      : "-";
    const weight = pkg.actualWeight ? `${pkg.actualWeight}` : "-";

    // 注意：API 回傳的 warehouseImages 是 JSON 字串，需要解析
    const warehouseImages = JSON.parse(pkg.warehouseImages || "[]");

    tr.cells[4].textContent = pkg.productName;
    tr.cells[5].innerHTML = `<span class="status-badge status-${pkg.status}">${statusText}</span>`;
    tr.cells[6].textContent = weight;
    tr.cells[7].textContent = dimensions;
    tr.cells[8].textContent = `${warehouseImages.length} 張`;

    // 4. 更新統計
    updateStats(allParcelsData);
  }

  function updateStats(parcels) {
    statsTotal.textContent = parcels.length;
    statsPending.textContent = parcels.filter(
      (p) => p.status === "PENDING"
    ).length;
    statsArrived.textContent = parcels.filter(
      (p) => p.status === "ARRIVED"
    ).length;
    statsCompleted.textContent = parcels.filter(
      (p) => p.status === "IN_SHIPMENT"
    ).length;
  }

  // (C) 即時運費試算
  function updateLiveCalculation() {
    if (!elType || !elWeight || !elL || !elW || !elH || !elFeeDisplay) return;
    const typeKey = elType.value;
    const w = parseFloat(elWeight.value);
    const l = parseFloat(elL.value);
    const w_dim = parseFloat(elW.value);
    const h = parseFloat(elH.value);
    if (
      !typeKey ||
      !RATES[typeKey] ||
      isNaN(w) ||
      isNaN(l) ||
      isNaN(w_dim) ||
      isNaN(h) ||
      l <= 0 ||
      w_dim <= 0 ||
      h <= 0
    ) {
      elFeeDisplay.value = "資料不全，無法計算";
      if (elDetails) elDetails.style.display = "none";
      return;
    }
    const rate = RATES[typeKey];
    const cai = Math.ceil((l * w_dim * h) / VOLUME_DIVISOR);
    const volCost = cai * rate.volumeRate;
    const finalWeight = Math.ceil(w * 10) / 10;
    const weightCost = finalWeight * rate.weightRate;
    const finalFee = Math.max(volCost, weightCost);
    elFeeDisplay.value = `$ ${finalFee.toLocaleString()}`;
    if (elDetails) {
      elDetails.style.display = "block";
      elDetails.innerHTML = `
          <strong>${rate.name}費率：</strong><br>
          📦 <strong>材積費：</strong> ${l}x${w_dim}x${h} ÷ 28317 = ${(
        (l * w_dim * h) /
        28317
      ).toFixed(2)} ➜ <strong>${cai} 材</strong><br>
          &nbsp;&nbsp;&nbsp;&nbsp;${cai} 材 × $${
        rate.volumeRate
      } = <span style="color:#d63031">$${volCost}</span><br>
          ⚖️ <strong>重量費：</strong> 實重 ${w} kg ➜ <strong>${finalWeight} kg</strong><br>
          &nbsp;&nbsp;&nbsp;&nbsp;${finalWeight} kg × $${
        rate.weightRate
      } = <span style="color:#d63031">$${Math.round(weightCost)}</span><br>
          👉 <strong>最終運費：</strong> <span style="color:#d63031; font-weight:bold; font-size:1.2em;">$${finalFee}</span>
        `;
    }
  }

  if (elType) elType.addEventListener("change", updateLiveCalculation);
  [elWeight, elL, elW, elH].forEach((el) => {
    if (el) el.addEventListener("input", updateLiveCalculation);
  });

  // (D) 打開編輯彈窗
  function openPackageModal(pkg) {
    document.getElementById("modal-pkg-id").value = pkg.id;
    document.getElementById("modal-user-email").textContent = pkg.user.email;
    document.getElementById("modal-user-name").textContent =
      pkg.user.name || "-";
    document.getElementById("modal-trackingNumber").textContent =
      pkg.trackingNumber;
    document.getElementById("modal-productName").textContent = pkg.productName;
    document.getElementById("modal-quantity").textContent = pkg.quantity;
    document.getElementById("modal-note").textContent = pkg.note || "-";

    const customerImagesContainer = document.getElementById(
      "modal-customer-images"
    );
    customerImagesContainer.innerHTML = "<h4>會員上傳的圖片：</h4>";
    if (pkg.productImages.length > 0) {
      pkg.productImages.forEach((imgUrl) => {
        customerImagesContainer.innerHTML += `<img src="${API_BASE_URL}${imgUrl}" onclick="window.open('${API_BASE_URL}${imgUrl}', '_blank')">`;
      });
    } else {
      customerImagesContainer.innerHTML += "<p>會員未上傳圖片</p>";
    }

    document.getElementById("modal-status").value = pkg.status;
    if (elType) elType.value = pkg.furnitureType || "";
    if (elWeight) elWeight.value = pkg.actualWeight || "";
    if (elL) elL.value = pkg.actualLength || "";
    if (elW) elW.value = pkg.actualWidth || "";
    if (elH) elH.value = pkg.actualHeight || "";
    if (elWarehouseRemark) elWarehouseRemark.value = pkg.warehouseRemark || "";

    if (pkg.status === "PENDING") {
      elSplitGroup.style.display = "block";
      elSplitQty.value = 1;
    } else {
      elSplitGroup.style.display = "none";
      elSplitQty.value = 1;
    }

    updateLiveCalculation();

    currentExistingImages = [...pkg.warehouseImages];
    renderWarehouseImages();
    document.getElementById("modal-warehouseImages").value = null;
    modal.style.display = "flex";
  }

  // (E) 渲染倉庫照片
  function renderWarehouseImages() {
    const container = document.getElementById("modal-warehouse-images-preview");
    const fileInput = document.getElementById("modal-warehouseImages");
    container.innerHTML = "<h4>倉庫已拍照片：</h4>";
    if (currentExistingImages.length > 0) {
      currentExistingImages.forEach((imgUrl, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "img-wrapper";
        const img = document.createElement("img");
        img.src = `${API_BASE_URL}${imgUrl}`;
        img.onclick = () => window.open(img.src, "_blank");
        const deleteBtn = document.createElement("div");
        deleteBtn.className = "btn-delete-img";
        deleteBtn.innerHTML = "&times;";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          removeImage(index);
        };
        wrapper.appendChild(img);
        wrapper.appendChild(deleteBtn);
        container.appendChild(wrapper);
      });
    } else {
      container.innerHTML += "<p>目前無照片</p>";
    }
    if (currentExistingImages.length >= 3) {
      fileInput.disabled = true;
      fileInput.title = "已達上限 (3張)";
    } else {
      fileInput.disabled = false;
      fileInput.title = "";
    }
  }

  function removeImage(index) {
    if (confirm("確定要移除這張照片嗎？(需按「儲存更新」才會生效)")) {
      currentExistingImages.splice(index, 1);
      renderWarehouseImages();
    }
  }

  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // (F) 提交更新表單
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("modal-pkg-id").value;
    const submitButton = updateForm.querySelector('button[type="submit"]');
    const newFiles = document.getElementById("modal-warehouseImages").files;

    if (currentExistingImages.length + newFiles.length > 3) {
      alert("照片總數不能超過 3 張！");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    const formData = new FormData();
    formData.append("status", document.getElementById("modal-status").value);
    if (elType) formData.append("furnitureType", elType.value);
    if (elWeight) formData.append("actualWeight", elWeight.value);
    if (elL) formData.append("actualLength", elL.value);
    if (elW) formData.append("actualWidth", elW.value);
    if (elH) formData.append("actualHeight", elH.value);
    if (elSplitQty) formData.append("splitQuantity", elSplitQty.value);
    if (elWarehouseRemark)
      formData.append("warehouseRemark", elWarehouseRemark.value);

    formData.append(
      "existingImages",
      JSON.stringify(currentExistingImages || [])
    );
    for (let i = 0; i < newFiles.length; i++) {
      formData.append("warehouseImages", newFiles[i]);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/packages/${packageId}/details`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
          body: formData,
        }
      );

      const result = await response.json(); // [修改] 取得回傳的資料
      if (!response.ok) {
        throw new Error(result.message || "更新失敗");
      }

      modal.style.display = "none";
      alert("包裹更新成功！");

      // --- [AJAX 優化邏輯] ---
      const splitQty = parseInt(elSplitQty.value) || 1;
      if (splitQty > 1) {
        // 1. 如果有拆分包裹，必須重新載入才能看到新包裹
        loadAllParcels();
      } else {
        // 2. 否則，只更新這一列
        updateParcelInList(result.package);
      }
      // --- [優化結束] ---
    } catch (error) {
      console.error("更新失敗:", error);
      alert(`更新失敗: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "儲存更新";
    }
  });

  // (G) 登出與篩選
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  filterBtn.addEventListener("click", () => {
    renderParcels(allParcelsData);
  });

  // 初始載入
  loadAllParcels();
});
