// 這是 frontend/js/admin-parcels.js (V7.1 - 代客預報 + 客戶搜尋 + V3 權限版)
// (1) 修正 V6 的 '0' bug
// (2) 新增「代客預報」彈窗 (modal) 的所有 JS 邏輯
// (3) 新增「客戶搜尋」功能
// (4) 整合 V3 權限檢查

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

  // [*** V3 權限檢查：讀取權限 ***]
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  // [*** V3 權限檢查：檢查函式 ***]
  function checkAdminPermissions() {
    // 檢查是否 "沒有" 管理會員的權限 (即 OPERATOR)
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      // 1. 隱藏導覽列的 Admin 按鈕
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");

      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";

      // 2. (特殊) 如果目前頁面是 "僅限 Admin" 頁面，隱藏主要内容
      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足 (Access Denied)</h2>' +
          '<p style="text-align: center;">此頁面僅限「系統管理員 (ADMIN)」使用。</p>';
      }
    }
  }

  // (A) 檢查登入
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return; // 停止執行
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminName) {
    // [V3 修正] 解析權限，顯示 ADMIN 或 OPERATOR
    let role = "USER";
    if (adminPermissions.includes("CAN_MANAGE_USERS")) {
      role = "ADMIN";
    } else if (adminPermissions.length > 0) {
      role = "OPERATOR";
    }
    adminWelcome.textContent = `你好, ${adminName} (${role})`; // 顯示角色
  }

  // (B) [*** V3 權限檢查：立刻執行 ***]
  checkAdminPermissions();
  // [*** 權限檢查結束 ***]

  const logoutBtn = document.getElementById("logoutBtn");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");
  const parcelsTableBody = document.getElementById("parcelsTableBody");
  const statsTotal = document.getElementById("stats-total");
  const statsPending = document.getElementById("stats-pending");
  const statsArrived = document.getElementById("stats-arrived");
  const statsCompleted = document.getElementById("stats-completed");

  // (編輯彈窗)
  const modal = document.getElementById("parcel-detail-modal");
  const closeModalBtn = modal.querySelector(".modal-close-btn");
  const updateForm = document.getElementById("update-package-form");
  const elSubPackageList = document.getElementById("sub-package-list");
  const elBtnAddSubPackage = document.getElementById("btn-add-sub-package");
  const elFeeDisplay = document.getElementById("modal-shippingFee");

  // [*** V7.1 新增：獲取「新增包裹」彈窗元素 ***]
  const btnShowCreateModal = document.getElementById("btn-show-create-modal");
  const createModal = document.getElementById("admin-create-package-modal");
  const createModalCloseBtn = createModal.querySelector(".modal-close-btn");
  const createForm = document.getElementById("admin-create-package-form");
  const createMessageBox = document.getElementById("admin-create-message-box");
  const customerSearchInput = document.getElementById("admin-customer-search");
  const customerSearchResults = document.getElementById(
    "admin-customer-search-results"
  );
  const createUserIdInput = document.getElementById("admin-create-userId");
  const createEmailDisplay = document.getElementById(
    "admin-create-email-display"
  );
  // [*** 新增結束 ***]

  // --- 3. 狀態變數 ---
  let allParcelsData = [];
  let allUsersData = []; // [*** V7.1 新增：快取客戶列表 ***]
  let currentExistingImages = [];
  let currentSubPackages = []; // 儲存分箱資料的 "資料來源 (Source of Truth)"

  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

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

  // (A.1) [*** V7.1 新增：載入所有客戶 ***]
  async function loadAllUsers() {
    try {
      // 呼叫我們在 adminController 新增的 API
      const response = await fetch(`${API_BASE_URL}/api/admin/users/list`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!response.ok) {
        throw new Error("載入客戶列表失敗");
      }
      const data = await response.json();
      allUsersData = data.users || [];
    } catch (error) {
      console.error(error.message);
      // 即使失敗，也不中斷主流程
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

  // (C) AJAX 優化 - 只更新列表中的單一一列
  function updateParcelInList(pkg) {
    // 1. 更新 master data
    const index = allParcelsData.findIndex((p) => p.id === pkg.id);
    if (index !== -1) {
      allParcelsData[index] = { ...allParcelsData[index], ...pkg };
    }

    // 2. 更新 DOM
    const tr = document.getElementById(`parcel-row-${pkg.id}`);
    if (!tr) return;

    // 3. 重新產生儲存格內容
    const statusText = packageStatusMap[pkg.status] || pkg.status;

    // 後端 API 回傳的 pkg 物件已包含 *解析後* 的陣列
    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
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

    tr.cells[5].innerHTML = `<span class="status-badge status-${pkg.status}">${statusText}</span>`;
    tr.cells[6].textContent = weight;
    tr.cells[7].textContent = dimensions;
    tr.cells[8].textContent = totalFee;

    // 4. 更新統計
    updateStats(allParcelsData);
  }

  // (D) 更新統計數字
  function updateStats(parcels) {
    statsTotal.textContent = parcels.length;
    statsPending.textContent = parcels.filter(
      (p) => p.status === "PENDING"
    ).length;
    statsArrived.textContent = parcels.filter(
      (p) => p.status === "ARRIVED"
    ).length;
    statsCompleted.textContent = parcels.filter(
      (p) => p.status === "IN_SHIPMENT" || p.status === "COMPLETED"
    ).length;
  }

  // --- [*** V5 運費計算邏輯 (已分離) ***] ---

  // (E) 計算單一分箱的運費
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

  // (F) [*** V5 修正 ***]
  // 輕量級更新：只更新 "費用顯示"，不重-建 DOM
  function updateFeesOnInput() {
    // 1. 從 DOM 讀取所有分箱的 "當前" 值
    const boxElements = elSubPackageList.querySelectorAll(".sub-package-item");
    if (!boxElements.length) {
      elFeeDisplay.value = "$ 0";
      return;
    }

    let calculatedTotalFee = 0;

    boxElements.forEach((boxEl, index) => {
      // 從 DOM 讀取值
      const boxData = {
        name: boxEl.querySelector(".sub-pkg-name").value,
        type: boxEl.querySelector(".sub-pkg-type").value,
        weight: parseFloat(boxEl.querySelector(".sub-pkg-weight").value) || 0,
        length: parseFloat(boxEl.querySelector(".sub-pkg-length").value) || 0,
        width: parseFloat(boxEl.querySelector(".sub-pkg-width").value) || 0,
        height: parseFloat(boxEl.querySelector(".sub-pkg-height").value) || 0,
      };

      // 2. 計算費用
      const fee = calculateSubPackageFee(boxData);
      calculatedTotalFee += fee;

      // 3. *只* 更新 "該分箱" 的費用顯示
      const feeDisplay = boxEl.querySelector(".sub-pkg-fee-display");
      if (feeDisplay) {
        feeDisplay.textContent = `單箱運費: $ ${fee.toLocaleString()}`;
      }

      // 4. (重要) 同時更新 "資料來源" 陣列，但 *不* 重-繪
      if (currentSubPackages[index]) {
        currentSubPackages[index] = boxData;
        currentSubPackages[index].fee = fee; // 把算好的 fee 存進去
      }
    });

    // 5. 更新總金額
    elFeeDisplay.value = `$ ${calculatedTotalFee.toLocaleString()}`;
  }

  // (G) 渲染分箱列表 (重-建 DOM)
  function renderSubPackages() {
    if (!elSubPackageList) return;
    elSubPackageList.innerHTML = ""; // 清空

    if (currentSubPackages.length === 0) {
      elSubPackageList.innerHTML =
        '<p style="text-align: center; color: #888;">尚無分箱，請點擊下方按鈕新增。</p>';
      return;
    }

    currentSubPackages.forEach((box, index) => {
      // 直接從 "資料來源" 讀取費用 (如果已計算)
      const fee = box.fee ? box.fee : calculateSubPackageFee(box);

      const boxEl = document.createElement("div");
      boxEl.className = "sub-package-item";
      boxEl.setAttribute("data-index", index);

      // [*** V6 關鍵修正：修復 0 || "" 的 Bug ***]
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
              box.weight !== null && box.weight !== undefined ? box.weight : ""
            }"></div>
            <div class="form-group"><label>長(cm)</label><input type="number" class="sub-pkg-length form-control" value="${
              box.length !== null && box.length !== undefined ? box.length : ""
            }"></div>
            <div class="form-group"><label>寬(cm)</label><input type="number" class="sub-pkg-width form-control" value="${
              box.width !== null && box.width !== undefined ? box.width : ""
            }"></div>
            <div class="form-group"><label>高(cm)</label><input type="number" class="sub-pkg-height form-control" value="${
              box.height !== null && box.height !== undefined ? box.height : ""
            }"></div>
            </div>
            <div class="sub-pkg-fee-display">
            單箱運費: $ ${fee.toLocaleString()}
            </div>
        `;
      // [*** V6 修正結束 ***]

      elSubPackageList.appendChild(boxEl);
    });
  }

  // (H) [*** V5 修正 ***]
  // 綁定彈窗事件 (ADD, REMOVE, INPUT, CHANGE)
  if (elBtnAddSubPackage) {
    elBtnAddSubPackage.addEventListener("click", () => {
      // 1. 更新 "資料來源"
      currentSubPackages.push({
        name: `分箱 ${currentSubPackages.length + 1}`,
        type: "general",
        weight: 0,
        length: 0,
        width: 0,
        height: 0,
      });
      // 2. 重量級更新 (重-建 DOM)
      renderSubPackages();
    });
  }
  if (elSubPackageList) {
    // 移除 (重量級)
    elSubPackageList.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-remove-sub-pkg")) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index)) {
          // 1. 更新 "資料來源"
          currentSubPackages.splice(index, 1);
          // 2. 重量級更新 (重-建 DOM)
          renderSubPackages();
          // 3. 輕量級更新 (只算總錢)
          updateFeesOnInput();
        }
      }
    });

    // 'change' 事件 (下拉選單觸發)
    elSubPackageList.addEventListener("change", (e) => {
      if (e.target.tagName === "SELECT") {
        if (e.target.closest("#sub-package-list")) {
          // 輕量級更新 (只算錢)
          updateFeesOnInput();
        }
      }
    });

    // 'input' 事件 (打字時觸發)
    elSubPackageList.addEventListener("input", (e) => {
      if (e.target.tagName === "INPUT") {
        if (e.target.closest("#sub-package-list")) {
          // 輕量級更新 (只算錢)
          updateFeesOnInput();
        }
      }
    });
  }

  // (I) 打開「編輯」彈窗 (V4 版)
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

    // [ V4 優化：載入 V2 分箱資料，並預設一箱 ]
    const arrivedBoxes = pkg.arrivedBoxesJson || [];
    currentSubPackages = JSON.parse(JSON.stringify(arrivedBoxes)); // 深拷貝

    // [ 關鍵修正：如果沒有分箱，預設新增一筆 ]
    if (currentSubPackages.length === 0) {
      currentSubPackages.push({
        name: "分箱 1", // 預設名稱
        type: "general", // 預設類型
        weight: null, // [V6 修正] 預設為 null，才能顯示為空白
        length: null,
        width: null,
        height: null,
      });
    }

    // [*** V5 修正 ***]
    // 1. 先重-建 DOM
    renderSubPackages();
    // 2. 再計算一次總價 (因為 renderSubPackages 只算了單箱)
    updateFeesOnInput();
    // [*** 修正結束 ***]

    // 載入 V2 倉庫照片
    currentExistingImages = pkg.warehouseImages ? [...pkg.warehouseImages] : [];
    renderWarehouseImages();

    document.getElementById("modal-warehouseImages").value = null;
    modal.style.display = "flex";
  }

  // (J) 渲染倉庫照片 (V2 版)
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

    // 配合 V2 controller (line 214)，改為 5 張
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

  // (K) 提交「編輯」更新表單 (V2 版)
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("modal-pkg-id").value;
    const submitButton = updateForm.querySelector('button[type="submit"]');
    const newFiles = document.getElementById("modal-warehouseImages").files;

    if (currentExistingImages.length + newFiles.length > 5) {
      alert("照片總數不能超過 5 張！");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    // [*** V5 修正 ***]
    // 在提交前，最後一次輕量更新
    // 這能確保 currentSubPackages 陣列是 "最新" 的
    updateFeesOnInput();
    // [*** 修正結束 ***]

    const formData = new FormData();
    formData.append("status", document.getElementById("modal-status").value);

    // 傳送 "資料來源"
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

      // AJAX updateParcelInList 即可
      updateParcelInList(result.package);
    } catch (error) {
      console.error("更新失敗:", error);
      alert(`更新失敗: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "儲存更新";
    }
  });

  // (L) [*** V7.1 新增：「新增包裹」彈窗邏輯 ***]

  // 簡易訊息顯示 (用於新彈窗)
  function showCreateMessage(message, type) {
    createMessageBox.textContent = message;
    createMessageBox.className = `alert alert-${type}`;
    createMessageBox.style.display = "block";
  }

  // 顯示 "新增" 彈窗
  btnShowCreateModal.addEventListener("click", () => {
    createForm.reset();
    createUserIdInput.value = "";
    createEmailDisplay.value = "";
    customerSearchInput.value = "";
    createEmailDisplay.placeholder = "請從上方搜尋並選取客戶";
    customerSearchResults.style.display = "none";
    createMessageBox.style.display = "none";
    createModal.style.display = "flex";
  });

  // 關閉 "新增" 彈窗
  createModalCloseBtn.addEventListener("click", () => {
    createModal.style.display = "none";
  });
  createModal.addEventListener("click", (e) => {
    if (e.target === createModal) createModal.style.display = "none";
  });

  // 客戶搜尋
  customerSearchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // 清除已選取的 ID
    createUserIdInput.value = "";
    createEmailDisplay.value = "";
    createEmailDisplay.placeholder = "請從上方搜尋並選取客戶";

    if (!searchTerm) {
      customerSearchResults.style.display = "none";
      return;
    }

    // 使用快取的 allUsersData 進行前端搜尋
    const filteredUsers = allUsersData.filter(
      (user) =>
        user.email.toLowerCase().includes(searchTerm) ||
        (user.name && user.name.toLowerCase().includes(searchTerm))
    );

    customerSearchResults.innerHTML = "";
    if (filteredUsers.length > 0) {
      filteredUsers.slice(0, 10).forEach((user) => {
        // 最多顯示 10 筆
        const item = document.createElement("div");
        item.className = "search-result-item";
        item.textContent = `${user.name || "N/A"} (${user.email})`;
        item.setAttribute("data-id", user.id);
        item.setAttribute("data-email", user.email);
        item.setAttribute("data-name", user.name || "");

        item.addEventListener("click", () => {
          // 選中客戶
          const selName = item.getAttribute("data-name");
          const selEmail = item.getAttribute("data-email");

          customerSearchInput.value = `${selName} (${selEmail})`;
          createUserIdInput.value = item.getAttribute("data-id"); // 儲存 ID
          createEmailDisplay.value = selEmail; // 顯示 Email
          customerSearchResults.style.display = "none";
        });
        customerSearchResults.appendChild(item);
      });
      customerSearchResults.style.display = "block";
    } else {
      customerSearchResults.innerHTML = `<div class"search-result-item" style="color: #888;">找不到客戶</div>`;
    }
  });

  // 提交 "新增" 表單
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitButton = createForm.querySelector('button[type="submit"]');

    // 驗證
    const userId = createUserIdInput.value;
    if (!userId) {
      showCreateMessage("請先從搜尋列表中選取一位客戶", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "新增中...";
    showCreateMessage("", "clear");

    // 1. 建立 FormData
    const formData = new FormData();
    formData.append("userId", userId); // [*** V4.1 修正 ***]
    formData.append(
      "trackingNumber",
      document.getElementById("admin-create-tracking").value
    );
    formData.append(
      "productName",
      document.getElementById("admin-create-product").value
    );
    formData.append(
      "quantity",
      document.getElementById("admin-create-quantity").value
    );
    formData.append("note", document.getElementById("admin-create-note").value);

    const files = document.getElementById("admin-create-images").files;
    if (files.length > 5) {
      showCreateMessage("照片最多 5 張", "error");
      submitButton.disabled = false;
      submitButton.textContent = "確認新增";
      return;
    }
    for (let i = 0; i < files.length; i++) {
      formData.append("images", files[i]);
    }

    try {
      // 2. 呼叫新 API
      const response = await fetch(
        `${API_BASE_URL}/api/admin/packages/create`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
          body: formData,
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "新增失敗");
      }

      // 3. 成功
      createModal.style.display = "none";
      alert(`成功為 ${createEmailDisplay.value} 新增包裹！`);
      loadAllParcels(); // 重新載入列表
    } catch (error) {
      console.error("新增失敗:", error);
      showCreateMessage(error.message, "error"); // 在彈窗內顯示錯誤
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "確認新增";
    }
  });
  // [*** V7.1 新增結束 ***]

  // (M) 登出與篩選
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      localStorage.removeItem("admin_permissions"); // [*** V3 修正 ***]
      window.location.href = "admin-login.html";
    }
  });

  filterBtn.addEventListener("click", () => {
    renderParcels(allParcelsData);
  });

  // 初始載入
  loadAllParcels();
  loadAllUsers(); // [*** V7.1 新增 ***]
});
