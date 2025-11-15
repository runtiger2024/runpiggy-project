// 這是 frontend/js/admin-parcels.js (V4 流程優化版)
// (1) 修正了 V3 的 JSON.parse() Bug
// (2) 優化：開啟彈窗時，如果分箱為 0，自動新增一筆

// --- 1. 定義費率常數 (與 adminController.js 同步) ---
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

  // [*** 修正 ***] 獲取 V2 HTML 中的元素
  const elSubPackageList = document.getElementById("sub-package-list");
  const elBtnAddSubPackage = document.getElementById("btn-add-sub-package");
  const elFeeDisplay = document.getElementById("modal-shippingFee");

  // --- 3. 狀態變數 ---
  let allParcelsData = [];
  const adminToken = localStorage.getItem("admin_token");
  let currentExistingImages = []; // [新增] 用於儲存彈窗中的倉庫照片
  let currentSubPackages = []; // [新增] 用於儲存彈窗中的分箱資料

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

      // [*** 修正 ***] 從 V2 欄位計算
      // (controller 傳來 `arrivedBoxesJson` 欄位，但內容是已解析的陣列)
      const boxes = Array.isArray(pkg.arrivedBoxesJson)
        ? pkg.arrivedBoxesJson
        : [];
      const weight =
        boxes.length > 0
          ? boxes
              .reduce((sum, box) => sum + (parseFloat(box.weight) || 0), 0)
              .toFixed(1)
          : "-";
      const dimensions = boxes.length > 0 ? `${boxes.length} 箱` : "-";
      const totalFee = pkg.totalCalculatedFee
        ? `$${pkg.totalCalculatedFee.toLocaleString()}`
        : "-";

      const tr = document.createElement("tr");
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
        <td>${totalFee}</td>
      `;
      tr.querySelector(".btn-view-details").addEventListener("click", () => {
        openPackageModal(pkg);
      });
      parcelsTableBody.appendChild(tr);
    });
  }

  // (AJAX 優化) 只更新列表中的單一一列
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

    // [*** 關鍵修正 ***]
    // API (adminController) 回傳的 pkg 物件已包含 *解析後* 的陣列，
    // (arrivedBoxesJson 欄位在回傳時已被 controller 覆蓋為解析後的陣列，warehouseImages 也是)
    // 我們不再需要 JSON.parse()
    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
    const boxes = Array.isArray(pkg.arrivedBoxesJson) // controller 把陣列放在 arrivedBoxesJson 欄位
      ? pkg.arrivedBoxesJson
      : [];
    // [*** 修正結束 ***]

    const weight =
      boxes.length > 0
        ? boxes
            .reduce((sum, box) => sum + (parseFloat(box.weight) || 0), 0)
            .toFixed(1)
        : "-";
    const dimensions = boxes.length > 0 ? `${boxes.length} 箱` : "-";
    const totalFee = pkg.totalCalculatedFee
      ? `$${pkg.totalCalculatedFee.toLocaleString()}`
      : "-";

    tr.cells[5].innerHTML = `<span class="status-badge status-${pkg.status}">${statusText}</span>`;
    tr.cells[6].textContent = weight;
    tr.cells[7].textContent = dimensions;
    tr.cells[8].textContent = totalFee;

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
    // V2 狀態
    statsCompleted.textContent = parcels.filter(
      (p) => p.status === "IN_SHIPMENT" || p.status === "COMPLETED"
    ).length;
  }

  // --- [*** 新增 V2 運費計算邏輯 ***] ---

  // (C) 計算單一分箱的運費 (從 adminController.js 複製)
  function calculateSubPackageFee(box) {
    const weight = parseFloat(box.weight);
    const length = parseFloat(box.length);
    const width = parseFloat(box.width);
    const height = parseFloat(box.height);
    const typeKey = box.type;

    if (
      !isNaN(weight) &&
      weight > 0 &&
      !isNaN(length) &&
      length > 0 &&
      !isNaN(width) &&
      width > 0 &&
      !isNaN(height) &&
      height > 0 &&
      typeKey &&
      RATES[typeKey]
    ) {
      const rate = RATES[typeKey];
      const boxCai = Math.ceil((length * width * height) / VOLUME_DIVISOR);
      const volumeCost = boxCai * rate.volumeRate;
      const w = Math.ceil(weight * 10) / 10;
      const weightCost = w * rate.weightRate;
      return Math.max(volumeCost, weightCost);
    }
    return 0; // 資料不全
  }

  // (D) 更新總運費
  function updateTotalCalculation() {
    let calculatedTotalFee = 0;

    // [新增] 順便從 DOM 更新 currentSubPackages (這樣計算才是即時的)
    updateSubPackagesFromDOM();

    currentSubPackages.forEach((box) => {
      const fee = calculateSubPackageFee(box);
      box.fee = fee; // 把計算結果存回去
      calculatedTotalFee += fee;
    });

    // [*** 修正 ***]
    // 根據 adminController.js (line 155)，包裹層級的低消已移除
    elFeeDisplay.value = `$ ${calculatedTotalFee.toLocaleString()}`;

    // (可選) 更新 UI 上的分箱費用
    renderSubPackages();
  }

  // (E) 渲染分箱列表
  function renderSubPackages() {
    if (!elSubPackageList) return;
    elSubPackageList.innerHTML = "";
    if (currentSubPackages.length === 0) {
      elSubPackageList.innerHTML =
        '<p style="text-align: center; color: #888;">尚無分箱，請點擊下方按鈕新增。</p>';
      return;
    }

    currentSubPackages.forEach((box, index) => {
      const fee = box.fee ? box.fee : calculateSubPackageFee(box);
      const boxEl = document.createElement("div");
      boxEl.className = "sub-package-item";
      boxEl.setAttribute("data-index", index);
      boxEl.innerHTML = `
        <button type="button" class="btn-remove-sub-pkg" data-index="${index}">&times;</button>
        <div class="form-group">
          <label>分箱名稱</label>
          <input type="text" class="sub-pkg-name form-control" value="${
            box.name || ""
          }" placeholder="例: 分箱1">
        </div>
        <div class="form-group">
          <label>家具類型</label>
          <select class="sub-pkg-type form-control">
            <option value="">-- 請選擇 --</option>
            <option value="general" ${
              box.type === "general" ? "selected" : ""
            }>一般家具</option>
            <option value="special_a" ${
              box.type === "special_a" ? "selected" : ""
            }>特殊家具A</option>
            <option value="special_b" ${
              box.type === "special_b" ? "selected" : ""
            }>特殊家具B</option>
            <option value="special_c" ${
              box.type === "special_c" ? "selected" : ""
            }>特殊家具C</option>
          </select>
        </div>
        <div class="form-grid-responsive">
          <div class="form-group"><label>實重(kg)</label><input type="number" class="sub-pkg-weight form-control" value="${
            box.weight || ""
          }"></div>
          <div class="form-group"><label>長(cm)</label><input type="number" class="sub-pkg-length form-control" value="${
            box.length || ""
          }"></div>
          <div class="form-group"><label>寬(cm)</label><input type="number" class="sub-pkg-width form-control" value="${
            box.width || ""
          }"></div>
          <div class="form-group"><label>高(cm)</label><input type="number" class="sub-pkg-height form-control" value="${
            box.height || ""
          }"></div>
        </div>
        <div class="sub-pkg-fee-display">
          單箱運費: $ ${fee.toLocaleString()}
        </div>
      `;
      elSubPackageList.appendChild(boxEl);
    });
  }

  // (F) 從 DOM 讀取資料，更新 currentSubPackages 陣列
  function updateSubPackagesFromDOM() {
    const newPackages = [];
    if (!elSubPackageList) return; // 防呆
    const boxElements = elSubPackageList.querySelectorAll(".sub-package-item");
    boxElements.forEach((boxEl) => {
      newPackages.push({
        name: boxEl.querySelector(".sub-pkg-name").value,
        type: boxEl.querySelector(".sub-pkg-type").value,
        weight: parseFloat(boxEl.querySelector(".sub-pkg-weight").value) || 0,
        length: parseFloat(boxEl.querySelector(".sub-pkg-length").value) || 0,
        width: parseFloat(boxEl.querySelector(".sub-pkg-width").value) || 0,
        height: parseFloat(boxEl.querySelector(".sub-pkg-height").value) || 0,
      });
    });
    currentSubPackages = newPackages;
  }

  // (G) 綁定 V2 彈窗事件
  if (elBtnAddSubPackage) {
    elBtnAddSubPackage.addEventListener("click", () => {
      currentSubPackages.push({
        name: `分箱 ${currentSubPackages.length + 1}`,
        type: "general",
        weight: 0,
        length: 0,
        width: 0,
        height: 0,
      });
      renderSubPackages();
    });
  }
  if (elSubPackageList) {
    // 移除
    elSubPackageList.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-remove-sub-pkg")) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index)) {
          currentSubPackages.splice(index, 1);
          renderSubPackages();
          updateTotalCalculation();
        }
      }
    });
    //
    // 計算
    elSubPackageList.addEventListener("change", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
        // 使用 .closest 來確保我們是在 sub-package-list 內部觸發的
        if (e.target.closest("#sub-package-list")) {
          updateTotalCalculation();
        }
      }
    });
    // [新增] input 事件，讓輸入時更即時
    elSubPackageList.addEventListener("input", (e) => {
      if (e.target.tagName === "INPUT") {
        if (e.target.closest("#sub-package-list")) {
          updateTotalCalculation();
        }
      }
    });
  }

  // (H) 打開編輯彈窗 (V2 版)
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
    // pkg.productImages 在 controller 傳來時已是陣列
    if (pkg.productImages && pkg.productImages.length > 0) {
      pkg.productImages.forEach((imgUrl) => {
        customerImagesContainer.innerHTML += `<img src="${API_BASE_URL}${imgUrl}" onclick="window.open('${API_BASE_URL}${imgUrl}', '_blank')">`;
      });
    } else {
      customerImagesContainer.innerHTML += "<p>會員未上傳圖片</p>";
    }

    document.getElementById("modal-status").value = pkg.status;

    // [*** V4 優化：載入 V2 分箱資料，並預設一箱 ***]
    const arrivedBoxes = pkg.arrivedBoxesJson || [];
    currentSubPackages = JSON.parse(JSON.stringify(arrivedBoxes)); // 深拷貝

    // [*** 關鍵修正：如果沒有分箱，預設新增一筆 ***]
    if (currentSubPackages.length === 0) {
      currentSubPackages.push({
        name: "分箱 1", // 預設名稱
        type: "general", // 預設類型
        weight: 0,
        length: 0,
        width: 0,
        height: 0,
      });
    }
    // [*** 修正結束 ***]

    renderSubPackages();
    updateTotalCalculation();

    // [*** 修正 ***] 載入 V2 倉庫照片
    // (controller 傳來 `warehouseImages` 欄位，內容是已解析的陣列)
    currentExistingImages = pkg.warehouseImages ? [...pkg.warehouseImages] : [];
    renderWarehouseImages();

    document.getElementById("modal-warehouseImages").value = null;
    modal.style.display = "flex";
  }

  // (I) 渲染倉庫照片 (V2 版)
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

    // [*** 修正 ***] 配合 V2 controller (line 214)，改為 5 張
    // 同時也配合 V2 HTML (line 187)
    if (currentExistingImages.length >= 5) {
      fileInput.disabled = true;
      fileInput.title = "已達上限 (5張)";
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

  // (J) 提交更新表單 (V2 版)
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("modal-pkg-id").value;
    const submitButton = updateForm.querySelector('button[type="submit"]');
    const newFiles = document.getElementById("modal-warehouseImages").files;

    // [*** 修正 ***] 配合 V2 controller，改為 5 張
    if (currentExistingImages.length + newFiles.length > 5) {
      alert("照片總數不能超過 5 張！");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    // [*** 修正 ***] 建立 V2 FormData
    const formData = new FormData();
    formData.append("status", document.getElementById("modal-status").value);

    // [新增] 儲存前最後更新一次
    updateSubPackagesFromDOM();
    formData.append("boxesData", JSON.stringify(currentSubPackages));

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

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "更新失敗");
      }

      modal.style.display = "none";
      alert("包裹更新成功！");

      // [*** 修正 ***]
      // V2 (adminController) 只會更新一個包裹，
      // 所以我們總是使用 AJAX updateParcelInList 即可。
      // (API 會回傳更新後的 package 物件)
      updateParcelInList(result.package);
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
