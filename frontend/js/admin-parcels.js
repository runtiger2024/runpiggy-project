// 這是 frontend/js/admin-parcels.js (支援「儲存後不關閉」的修改版)

// --- 1. 定義費率常數 (需與後端保持一致) ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317;
const MINIMUM_CHARGE = 2000; // 包裹低消常數

document.addEventListener("DOMContentLoaded", () => {
  // --- 2. 獲取 DOM 元素 ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");
  const parcelsTableBody = document.getElementById("parcelsTableBody");

  // 統計
  const statsTotal = document.getElementById("stats-total");
  const statsPending = document.getElementById("stats-pending");
  const statsArrived = document.getElementById("stats-arrived");
  const statsCompleted = document.getElementById("stats-completed");

  // 彈窗
  const modal = document.getElementById("parcel-detail-modal");
  const closeModalBtn = modal.querySelector(".modal-close-btn");
  const updateForm = document.getElementById("update-package-form");

  // 分箱相關元素
  const subPackageListContainer = document.getElementById("sub-package-list");
  const btnAddSubPackage = document.getElementById("btn-add-sub-package");
  const elFeeDisplayTotal = document.getElementById("modal-shippingFee"); // 總運費

  // --- 3. 狀態變數 ---
  let allParcelsData = [];
  const adminToken = localStorage.getItem("admin_token");
  let currentExistingImages = []; // 暫存舊照片列表 (用於刪除邏輯)
  let currentSubPackages = []; // 暫存分箱資料
  let subPackageCounter = 0;

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
        pkg.trackingNumber.toLowerCase().includes(search) ||
        pkg.productName.toLowerCase().includes(search) ||
        pkg.user.email.toLowerCase().includes(search);
      return statusMatch && searchMatch;
    });

    if (filteredParcels.length === 0) {
      parcelsTableBody.innerHTML =
        '<tr><td colspan="9" style="text-align: center;">找不到符合條件的包裹</td></tr>';
      return;
    }

    filteredParcels.forEach((pkg) => {
      const statusText = packageStatusMap[pkg.status] || pkg.status;

      const arrivedBoxes = Array.isArray(pkg.arrivedBoxesJson)
        ? pkg.arrivedBoxesJson
        : [];

      const dimensions =
        arrivedBoxes.length > 0 ? `${arrivedBoxes.length} 箱` : "-";
      const weight =
        arrivedBoxes.length > 0
          ? `${arrivedBoxes
              .reduce((sum, box) => sum + (parseFloat(box.weight) || 0), 0)
              .toFixed(1)} kg (總)`
          : "-";
      const totalFee =
        pkg.totalCalculatedFee != null
          ? `NT$ ${pkg.totalCalculatedFee.toLocaleString()}`
          : "-";

      const tr = document.createElement("tr");
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
        <td><span style="color: #d32f2f; font-weight: bold;">${totalFee}</span></td>
      `;
      tr.querySelector(".btn-view-details").addEventListener("click", () => {
        openPackageModal(pkg);
      });
      parcelsTableBody.appendChild(tr);
    });
  }

  // (C) 更新統計
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

  // (D) 渲染「分箱」列表的 UI
  function renderSubPackageUI() {
    if (!subPackageListContainer) return;
    subPackageListContainer.innerHTML = "";

    currentSubPackages.forEach((box) => {
      const boxId = box.id;
      const div = document.createElement("div");
      div.className = "sub-package-item";
      div.setAttribute("data-box-id", boxId);

      div.innerHTML = `
        <button type="button" class="btn-remove-sub-pkg" data-id="${boxId}">&times;</button>
        <div class="form-group">
          <label for="box-name-${boxId}">分箱名稱</label>
          <input type="text" id="box-name-${boxId}" class="sub-pkg-input" data-field="name" value="${
        box.name || ""
      }" placeholder="例：分箱1 (桌腳)">
        </div>
        <div class="form-grid-responsive">
          <div class="form-group">
            <label>重量(kg)</label>
            <input type="number" id="box-weight-${boxId}" class="sub-pkg-input sub-pkg-calc" data-field="weight" value="${
        box.weight || ""
      }" step="0.1" placeholder="必填">
          </div>
          <div class="form-group">
            <label>長(cm)</label>
            <input type="number" id="box-length-${boxId}" class="sub-pkg-input sub-pkg-calc" data-field="length" value="${
        box.length || ""
      }" step="0.1" placeholder="必填">
          </div>
          <div class="form-group">
            <label>寬(cm)</label>
            <input type="number" id="box-width-${boxId}" class="sub-pkg-input sub-pkg-calc" data-field="width" value="${
        box.width || ""
      }" step="0.1" placeholder="必填">
          </div>
          <div class="form-group">
            <label>高(cm)</label>
            <input type="number" id="box-height-${boxId}" class="sub-pkg-input sub-pkg-calc" data-field="height" value="${
        box.height || ""
      }" step="0.1" placeholder="必填">
          </div>
        </div>
        <div class="form-group">
          <label>家具類型</label>
          <select id="box-type-${boxId}" class="sub-pkg-input sub-pkg-calc" data-field="type">
            <option value="">請選擇類型</option>
            <option value="general" ${
              box.type === "general" ? "selected" : ""
            }>一般家具</option>
            <option value="special_a" ${
              box.type === "special_a" ? "selected" : ""
            }>特殊家具A (大理石/馬桶...)</option>
            <option value="special_b" ${
              box.type === "special_b" ? "selected" : ""
            }>特殊家具B (玻璃/建材...)</option>
            <option value="special_c" ${
              box.type === "special_c" ? "selected" : ""
            }>特殊家具C (電器...)</option>
          </select>
        </div>
        <div class="sub-pkg-fee-display" id="box-fee-display-${boxId}">
          單箱運費: NT$ 0
        </div>
      `;
      subPackageListContainer.appendChild(div);
    });

    bindSubPackageEvents();
    updateLiveCalculation();
  }

  // (E) 綁定分箱上的事件
  function bindSubPackageEvents() {
    document.querySelectorAll(".btn-remove-sub-pkg").forEach((btn) => {
      btn.onclick = (e) => {
        const boxId = e.target.dataset.id;
        if (confirm("確定要刪除這個分箱嗎？")) {
          currentSubPackages = currentSubPackages.filter(
            (b) => b.id.toString() !== boxId.toString()
          );
          renderSubPackageUI();
        }
      };
    });

    document.querySelectorAll(".sub-pkg-input").forEach((input) => {
      const eventType = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventType, (e) => {
        const boxId = e.target.closest(".sub-package-item").dataset.boxId;
        const field = e.target.dataset.field;
        const value = e.target.value;

        const box = currentSubPackages.find(
          (b) => b.id.toString() === boxId.toString()
        );
        if (box) {
          box[field] = value;
        }

        if (e.target.classList.contains("sub-pkg-calc")) {
          updateLiveCalculation();
        }
      });
    });
  }

  // (F) 即時運費試算邏輯
  function updateLiveCalculation() {
    let totalFee = 0;

    currentSubPackages.forEach((box) => {
      const boxId = box.id;
      const displayEl = document.getElementById(`box-fee-display-${boxId}`);

      const w = parseFloat(box.weight);
      const l = parseFloat(box.length);
      const w_dim = parseFloat(box.width);
      const h = parseFloat(box.height);
      const typeKey = box.type;

      let boxFee = 0;

      if (
        typeKey &&
        RATES[typeKey] &&
        !isNaN(w) &&
        w > 0 &&
        !isNaN(l) &&
        l > 0 &&
        !isNaN(w_dim) &&
        w_dim > 0 &&
        !isNaN(h) &&
        h > 0
      ) {
        const rate = RATES[typeKey];
        const cai = Math.ceil((l * w_dim * h) / VOLUME_DIVISOR);
        const volCost = cai * rate.volumeRate;
        const finalWeight = Math.ceil(w * 10) / 10;
        const weightCost = finalWeight * rate.weightRate;
        boxFee = Math.max(volCost, weightCost);

        if (displayEl) {
          displayEl.textContent = `單箱運費: NT$ ${boxFee.toLocaleString()}`;
        }
      } else {
        if (displayEl) {
          displayEl.textContent = `單箱運費: NT$ 0 (資料不全)`;
        }
      }

      box.fee = boxFee;
      totalFee += boxFee;
    });

    // 套用低消邏輯
    let finalDisplayFee = totalFee;
    let notice = "";
    if (totalFee > 0 && totalFee < MINIMUM_CHARGE) {
      finalDisplayFee = MINIMUM_CHARGE;
      notice = ` (原始 $${totalFee.toLocaleString()}，已套用低消 $${MINIMUM_CHARGE})`;
    }

    if (elFeeDisplayTotal) {
      elFeeDisplayTotal.value = `NT$ ${finalDisplayFee.toLocaleString()}${notice}`;
    }
  }

  // (G) 「新增分箱」按鈕的點擊事件
  if (btnAddSubPackage) {
    btnAddSubPackage.addEventListener("click", () => {
      subPackageCounter++;
      currentSubPackages.push({
        id: `temp_${subPackageCounter}`,
        name: `分箱 ${subPackageCounter}`,
        weight: "",
        length: "",
        width: "",
        height: "",
        type: "",
      });
      renderSubPackageUI();
    });
  }

  // (H) 打開編輯彈窗
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
    if (pkg.productImages && pkg.productImages.length > 0) {
      pkg.productImages.forEach((imgUrl) => {
        customerImagesContainer.innerHTML += `<img src="${API_BASE_URL}${imgUrl}" onclick="window.open('${API_BASE_URL}${imgUrl}', '_blank')">`;
      });
    } else {
      customerImagesContainer.innerHTML += "<p>會員未上傳圖片</p>";
    }

    document.getElementById("modal-status").value = pkg.status;

    // 載入分箱資料
    currentSubPackages = [];
    subPackageCounter = 0;

    const boxes = Array.isArray(pkg.arrivedBoxesJson)
      ? pkg.arrivedBoxesJson
      : [];

    boxes.forEach((box, index) => {
      subPackageCounter++;
      currentSubPackages.push({
        ...box,
        id: `db_${subPackageCounter}`,
      });
    });

    if (currentSubPackages.length === 0) {
      subPackageCounter++;
      currentSubPackages.push({
        id: `temp_1`,
        name: "分箱 1",
        weight: "",
        length: "",
        width: "",
        height: "",
        type: "",
      });
    }

    renderSubPackageUI();

    // 載入現有照片
    currentExistingImages = Array.isArray(pkg.warehouseImages)
      ? [...pkg.warehouseImages]
      : [];
    renderWarehouseImages();
    document.getElementById("modal-warehouseImages").value = null;

    modal.style.display = "flex";
  }

  // (I) 渲染倉庫照片
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

  // (J) 移除照片
  function removeImage(index) {
    if (confirm("確定要移除這張照片嗎？(需按「儲存更新」才會生效)")) {
      currentExistingImages.splice(index, 1);
      renderWarehouseImages();
    }
  }

  // (K) 關閉彈窗
  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // (L) [*** 修改重點：提交更新表單 ***]
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

    // 傳送「分箱資料」
    const cleanBoxes = currentSubPackages.map((box) => {
      return {
        name: box.name,
        weight: box.weight,
        length: box.length,
        width: box.width,
        height: box.height,
        type: box.type,
      };
    });

    formData.append("boxesData", JSON.stringify(cleanBoxes || []));

    // 傳送「照片資料」
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

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "更新失敗");
      }

      // [*** 修改：儲存成功後的動作 ***]

      // 1. (移除) modal.style.display = "none";
      // 2. (移除) alert("包裹更新成功！...");

      // 3. 取得後端回傳的最新包裹資料
      const result = await response.json();
      const updatedPackage = result.package;

      // 4. 解析後端回傳的最新分箱資料 (後端傳回的是字串)
      let updatedBoxes = [];
      if (updatedPackage.arrivedBoxesJson) {
        try {
          updatedBoxes = JSON.parse(updatedPackage.arrivedBoxesJson || "[]");
        } catch (e) {
          console.error("解析後端回傳的 arrivedBoxesJson 失敗", e);
        }
      }

      // 5. 重新建立前端的 `currentSubPackages` 暫存
      currentSubPackages = [];
      subPackageCounter = 0; // 重置計數器
      updatedBoxes.forEach((box) => {
        subPackageCounter++;
        currentSubPackages.push({
          ...box,
          id: `db_${subPackageCounter}`, // 賦予新的 DB 來源 ID
        });
      });

      // 6. 重新渲染分箱 UI (這會自動觸發 updateLiveCalculation)
      renderSubPackageUI();

      // 7. 同時更新照片區 (後端回傳的也是字串)
      try {
        currentExistingImages = JSON.parse(
          updatedPackage.warehouseImages || "[]"
        );
      } catch (e) {
        currentExistingImages = [];
      }
      renderWarehouseImages();
      document.getElementById("modal-warehouseImages").value = null; // 清空檔案上傳欄位

      // 8. 重新載入背景的主列表 (這仍然需要)
      loadAllParcels();

      // 9. 提供暫時的按鈕反饋
      submitButton.textContent = "✓ 儲存成功！";
      submitButton.style.backgroundColor = "#27ae60"; // Green

      // [*** 修改結束 ***]
    } catch (error) {
      console.error("更新失敗:", error);
      alert(`更新失敗: ${error.message}`);
      // 失敗時也要恢復按鈕
      submitButton.textContent = "儲存更新";
      submitButton.style.backgroundColor = ""; // 恢復原色
    } finally {
      // 延遲 2 秒後恢復按鈕
      setTimeout(() => {
        submitButton.disabled = false;
        submitButton.textContent = "儲存更新";
        submitButton.style.backgroundColor = ""; // 恢復原色
      }, 2000);
    }
  });

  // (M) 登出與篩選
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  filterStatus.addEventListener("change", () => renderParcels(allParcelsData));
  searchInput.addEventListener("keyup", () => renderParcels(allParcelsData));
  filterBtn.addEventListener("click", () => renderParcels(allParcelsData));

  // 初始載入
  loadAllParcels();
});
