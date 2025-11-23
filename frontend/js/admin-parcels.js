// frontend/js/admin-parcels.js (V9.1 旗艦版 - 含動態圖片上傳)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 權限與初始化 ---
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  function checkAdminPermissions() {
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      const elements = [
        "btn-nav-create-staff",
        "btn-nav-members",
        "btn-nav-logs",
      ];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
    }
  }

  if (!adminToken) {
    window.location.href = "admin-login.html";
    return;
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminName && adminWelcome) {
    let role = "USER";
    if (adminPermissions.includes("CAN_MANAGE_USERS")) role = "ADMIN";
    else if (adminPermissions.length > 0) role = "OPERATOR";
    adminWelcome.textContent = `你好, ${adminName} (${role})`;
  }

  checkAdminPermissions();

  // --- [NEW] 定義動態圖片上傳器函式 ---
  // 由於後台沒有載入 dashboard-core.js，所以需要在此定義
  function initImageUploader(inputId, containerId, maxFiles = 5) {
    const mainInput = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (!mainInput || !container) return;

    const dataTransfer = new DataTransfer();

    function render() {
      container.innerHTML = "";
      Array.from(dataTransfer.files).forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "upload-item";
        item.innerHTML = `<img src="${URL.createObjectURL(file)}">`;

        const removeBtn = document.createElement("div");
        removeBtn.className = "remove-btn";
        removeBtn.innerHTML = "&times;";
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          dataTransfer.items.remove(index);
          mainInput.files = dataTransfer.files; // 同步回 hidden input
          render();
        };
        item.appendChild(removeBtn);
        container.appendChild(item);
      });

      // 如果未達上限，顯示 "+" 按鈕
      if (dataTransfer.files.length < maxFiles) {
        const addLabel = document.createElement("label");
        addLabel.className = "upload-add-btn";
        addLabel.innerHTML = `<i class="fas fa-plus"></i><span>${dataTransfer.files.length}/${maxFiles}</span>`;

        const tempInput = document.createElement("input");
        tempInput.type = "file";
        tempInput.accept = "image/*";
        tempInput.multiple = true;
        tempInput.style.display = "none";
        tempInput.onchange = (e) => {
          Array.from(e.target.files).forEach((f) => {
            if (dataTransfer.items.length < maxFiles) dataTransfer.items.add(f);
          });
          mainInput.files = dataTransfer.files; // 同步回 hidden input
          render();
        };
        addLabel.appendChild(tempInput);
        container.appendChild(addLabel);
      }
    }

    // 初次渲染
    render();

    // 綁定重置方法供外部呼叫
    mainInput.resetUploader = () => {
      dataTransfer.items.clear();
      mainInput.value = "";
      render();
    };
  }

  // --- [NEW] 啟動上傳器 ---
  // 1. 管理員新增包裹
  initImageUploader("admin-create-images", "admin-create-uploader", 5);
  // 2. 管理員編輯包裹 (倉庫照片)
  initImageUploader("modal-warehouseImages", "admin-warehouse-uploader", 5);

  // --- 2. 變數與元素 ---
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let allUsersData = []; // 快取客戶列表 (代客預報用)
  let selectedIds = new Set(); // 批量操作用

  // 編輯相關
  let currentExistingImages = [];
  let currentSubPackages = [];

  // DOM 元素
  const parcelsTableBody = document.getElementById("parcelsTableBody");
  const paginationContainer = document.getElementById("pagination");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const selectAllCheckbox = document.getElementById("select-all");
  const bulkActionBar = document.getElementById("bulk-action-bar");
  const selectedCountSpan = document.getElementById("selected-count");

  // --- 3. 初始化邏輯 (讀取 URL 參數) ---
  function init() {
    const params = new URLSearchParams(window.location.search);
    const pStatus = params.get("status");
    const pSearch = params.get("search");
    const pPage = params.get("page");

    if (pStatus) {
      currentStatus = pStatus;
      filterStatus.value = pStatus;
    }
    if (pSearch) {
      currentSearch = pSearch;
      searchInput.value = pSearch;
    }
    if (pPage) {
      currentPage = parseInt(pPage) || 1;
    }

    loadParcels();
    loadStats(); // 載入上方統計卡片
    loadAllUsers(); // 載入客戶列表供代客預報用
  }

  // --- 4. 資料載入 (分頁) ---
  async function loadParcels() {
    parcelsTableBody.innerHTML =
      '<tr><td colspan="10" style="text-align: center;">載入中...</td></tr>';
    selectedIds.clear(); // 換頁或重整時清空選擇
    updateBulkActionBar();

    try {
      let url = `${API_BASE_URL}/api/admin/packages/all?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      renderTable(data.packages || []);
      renderPagination(data.pagination);
      updateUrlParams();
    } catch (e) {
      console.error(e);
      parcelsTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: red;">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  // 載入統計 (使用 Dashboard API 以節省請求)
  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success && data.stats.packageStats) {
        const s = data.stats.packageStats;
        document.getElementById("stats-pending").textContent = s.PENDING || 0;
        document.getElementById("stats-arrived").textContent = s.ARRIVED || 0;
        document.getElementById("stats-completed").textContent =
          (s.IN_SHIPMENT || 0) + (s.COMPLETED || 0);
        document.getElementById("stats-total").textContent =
          (s.PENDING || 0) +
          (s.ARRIVED || 0) +
          (s.IN_SHIPMENT || 0) +
          (s.COMPLETED || 0) +
          (s.CANCELLED || 0);
      }
    } catch (e) {
      console.error("統計載入失敗", e);
    }
  }

  // --- 5. 渲染邏輯 ---
  function renderTable(packages) {
    parcelsTableBody.innerHTML = "";
    if (packages.length === 0) {
      parcelsTableBody.innerHTML =
        '<tr><td colspan="10" style="text-align: center;">無符合資料</td></tr>';
      return;
    }

    // 取得全域狀態設定 (from shippingData.js)
    const statusMap = window.PACKAGE_STATUS_MAP || {};
    const statusClasses = window.STATUS_CLASSES || {};

    packages.forEach((pkg) => {
      const tr = document.createElement("tr");
      const isChecked = selectedIds.has(pkg.id);

      // 計算重量體積
      const boxes = pkg.arrivedBoxesJson || [];
      const weight =
        boxes.length > 0
          ? boxes
              .reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0)
              .toFixed(1)
          : "-";
      const dims = boxes.length > 0 ? `${boxes.length} 箱` : "-";
      const fee = pkg.totalCalculatedFee
        ? `$${pkg.totalCalculatedFee.toLocaleString()}`
        : "-";

      const statusText = statusMap[pkg.status] || pkg.status;
      const statusClass = statusClasses[pkg.status] || "";

      // 安全跳脫 (防止 JSON.stringify 破壞 HTML)
      const safePkgStr = JSON.stringify(pkg).replace(/'/g, "&#39;");

      tr.innerHTML = `
        <td class="checkbox-col">
          <input type="checkbox" class="pkg-checkbox" value="${pkg.id}" ${
        isChecked ? "checked" : ""
      }>
        </td>
        <td><button class="btn btn-secondary btn-sm btn-edit" data-pkg='${safePkgStr}'>編輯</button></td>
        <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
        <td>${pkg.user ? pkg.user.email : "未知"}</td>
        <td>${pkg.trackingNumber}</td>
        <td>${pkg.productName}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${weight}</td>
        <td>${dims}</td>
        <td>${fee}</td>
      `;

      // 綁定單行操作
      tr.querySelector(".pkg-checkbox").addEventListener("change", (e) => {
        toggleSelection(pkg.id, e.target.checked);
      });
      tr.querySelector(".btn-edit").addEventListener("click", () => {
        openPackageModal(pkg);
      });

      parcelsTableBody.appendChild(tr);
    });

    // 更新全選框狀態
    selectAllCheckbox.checked =
      packages.length > 0 &&
      Array.from(packages).every((p) => selectedIds.has(p.id));
  }

  function renderPagination(pg) {
    paginationContainer.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const createBtn = (text, page, isActive = false, isDisabled = false) => {
      const btn = document.createElement("button");
      btn.className = `page-btn ${isActive ? "active" : ""}`;
      btn.textContent = text;
      btn.disabled = isDisabled;
      if (!isDisabled) {
        btn.addEventListener("click", () => {
          currentPage = page;
          loadParcels();
        });
      }
      return btn;
    };

    // 上一頁
    paginationContainer.appendChild(
      createBtn("<", currentPage - 1, false, currentPage === 1)
    );

    // 頁碼 (簡單版：顯示前後)
    for (let i = 1; i <= pg.totalPages; i++) {
      // 顯示 1, 尾頁, 以及目前頁面附近的頁碼
      if (
        i === 1 ||
        i === pg.totalPages ||
        (i >= currentPage - 2 && i <= currentPage + 2)
      ) {
        paginationContainer.appendChild(createBtn(i, i, i === currentPage));
      } else if (
        paginationContainer.lastChild.textContent !== "..." &&
        (i < currentPage - 2 || i > currentPage + 2)
      ) {
        const span = document.createElement("span");
        span.textContent = "...";
        span.style.margin = "0 5px";
        paginationContainer.appendChild(span);
      }
    }

    // 下一頁
    paginationContainer.appendChild(
      createBtn(">", currentPage + 1, false, currentPage === pg.totalPages)
    );
  }

  function updateUrlParams() {
    const url = new URL(window.location);
    if (currentStatus) url.searchParams.set("status", currentStatus);
    else url.searchParams.delete("status");

    if (currentSearch) url.searchParams.set("search", currentSearch);
    else url.searchParams.delete("search");

    url.searchParams.set("page", currentPage);
    window.history.pushState({}, "", url);
  }

  // --- 6. 批量操作邏輯 ---
  function toggleSelection(id, isSelected) {
    if (isSelected) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkActionBar();
  }

  selectAllCheckbox.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".pkg-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = e.target.checked;
      toggleSelection(cb.value, e.target.checked);
    });
  });

  function updateBulkActionBar() {
    selectedCountSpan.textContent = selectedIds.size;
    if (selectedIds.size > 0) {
      bulkActionBar.style.display = "flex";
    } else {
      bulkActionBar.style.display = "none";
    }
  }

  // 暴露給 HTML onclick 使用的函式 (需掛載到 window)
  window.performBulkAction = async function (status) {
    if (selectedIds.size === 0) return;
    if (
      !confirm(`確定要將選取的 ${selectedIds.size} 筆包裹狀態改為 ${status}?`)
    )
      return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/packages/bulk-status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: Array.from(selectedIds),
            status: status,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert("批量更新成功");
        loadParcels();
      } else {
        alert("失敗: " + data.message);
      }
    } catch (e) {
      alert("錯誤");
    }
  };

  window.performBulkDelete = async function () {
    if (selectedIds.size === 0) return;
    if (!confirm(`【警告】確定要永久刪除選取的 ${selectedIds.size} 筆包裹嗎？`))
      return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/packages/bulk-delete`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert("批量刪除成功");
        loadParcels();
      } else {
        alert("失敗: " + data.message);
      }
    } catch (e) {
      alert("錯誤");
    }
  };

  // --- 7. 匯出邏輯 ---
  document.getElementById("btn-export").addEventListener("click", async () => {
    const btn = document.getElementById("btn-export");
    btn.disabled = true;
    btn.textContent = "匯出中...";

    try {
      let url = `${API_BASE_URL}/api/admin/packages/export?`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.message);

      // JSON to CSV
      if (json.data.length === 0) {
        alert("無資料可匯出");
        return;
      }
      const fields = Object.keys(json.data[0]);
      const csvContent = [
        "\uFEFF" + fields.join(","), // BOM for Excel
        ...json.data.map((row) =>
          fields
            .map((f) => `"${String(row[f] || "").replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `parcels_export_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      link.click();
    } catch (e) {
      alert("匯出失敗: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "匯出 CSV";
    }
  });

  // --- 8. 篩選與搜尋 ---
  document.getElementById("filter-btn").addEventListener("click", () => {
    currentStatus = filterStatus.value;
    currentSearch = searchInput.value;
    currentPage = 1;
    loadParcels();
  });

  // --- 9. 編輯/新增 彈窗邏輯 ---

  // 9-A. 編輯彈窗
  const modal = document.getElementById("parcel-detail-modal");
  const updateForm = document.getElementById("update-package-form");
  const elSubPackageList = document.getElementById("sub-package-list");
  const elBtnAddSubPackage = document.getElementById("btn-add-sub-package");
  const elFeeDisplay = document.getElementById("modal-shippingFee");

  function openPackageModal(pkg) {
    // 填入資料
    document.getElementById("modal-pkg-id").value = pkg.id;
    document.getElementById("modal-user-email").textContent =
      pkg.user?.email || "-";
    document.getElementById("modal-user-name").textContent =
      pkg.user?.name || "-";
    document.getElementById("modal-trackingNumber").textContent =
      pkg.trackingNumber;
    document.getElementById("modal-productName").textContent = pkg.productName;
    document.getElementById("modal-quantity").textContent = pkg.quantity;
    document.getElementById("modal-note").textContent = pkg.note || "-";
    document.getElementById("modal-status").value = pkg.status;

    // 客戶圖片
    const custImgContainer = document.getElementById("modal-customer-images");
    custImgContainer.innerHTML = "<h4>會員圖片:</h4>";
    (pkg.productImages || []).forEach((url) => {
      custImgContainer.innerHTML += `<img src="${API_BASE_URL}${url}" onclick="window.open('${API_BASE_URL}${url}')">`;
    });

    // 分箱
    currentSubPackages = JSON.parse(JSON.stringify(pkg.arrivedBoxesJson || []));
    if (currentSubPackages.length === 0) {
      currentSubPackages.push({
        name: "分箱 1",
        type: "general",
        weight: null,
        length: null,
        width: null,
        height: null,
      });
    }
    renderSubPackages();
    updateFeesOnInput();

    // 倉庫圖片
    currentExistingImages = pkg.warehouseImages || [];
    renderWarehouseImages();

    // [Updated] 清空上傳元件
    const warehouseInput = document.getElementById("modal-warehouseImages");
    if (warehouseInput.resetUploader) warehouseInput.resetUploader();

    modal.style.display = "flex";
  }

  // 計算單箱運費
  function calculateFee(box) {
    const { weight, length, width, height, type } = box;
    const RATES = window.RATES || {}; // 使用 shippingData.js 的常數
    const DIVISOR = window.VOLUME_DIVISOR || 28317;

    if (weight > 0 && length > 0 && width > 0 && height > 0 && RATES[type]) {
      const cai = Math.ceil((length * width * height) / DIVISOR);
      const volCost = cai * RATES[type].volumeRate;
      const wtCost = (Math.ceil(weight * 10) / 10) * RATES[type].weightRate;
      return Math.max(volCost, wtCost);
    }
    return 0;
  }

  function updateFeesOnInput() {
    let total = 0;
    const rows = elSubPackageList.querySelectorAll(".sub-package-item");
    rows.forEach((row, idx) => {
      const box = {
        type: row.querySelector(".sub-pkg-type").value,
        weight: parseFloat(row.querySelector(".sub-pkg-weight").value) || 0,
        length: parseFloat(row.querySelector(".sub-pkg-length").value) || 0,
        width: parseFloat(row.querySelector(".sub-pkg-width").value) || 0,
        height: parseFloat(row.querySelector(".sub-pkg-height").value) || 0,
      };
      // Sync back to data
      if (currentSubPackages[idx]) {
        Object.assign(currentSubPackages[idx], box, {
          name: row.querySelector(".sub-pkg-name").value,
        });
      }
      const fee = calculateFee(box);
      row.querySelector(
        ".sub-pkg-fee-display"
      ).textContent = `運費: $${fee.toLocaleString()}`;
      total += fee;
    });
    elFeeDisplay.value = `$ ${total.toLocaleString()}`;
  }

  function renderSubPackages() {
    elSubPackageList.innerHTML = "";
    currentSubPackages.forEach((box, idx) => {
      const div = document.createElement("div");
      div.className = "sub-package-item";
      div.innerHTML = `
        <button type="button" class="btn-remove-sub-pkg" onclick="removeSubPackage(${idx})">&times;</button>
        <div class="form-group"><label>名稱</label><input class="sub-pkg-name form-control" value="${
          box.name || ""
        }"></div>
        <div class="form-group"><label>類型</label>
          <select class="sub-pkg-type form-control">
            <option value="general" ${
              box.type === "general" ? "selected" : ""
            }>一般家具</option>
            <option value="special_a" ${
              box.type === "special_a" ? "selected" : ""
            }>特殊A</option>
            <option value="special_b" ${
              box.type === "special_b" ? "selected" : ""
            }>特殊B</option>
            <option value="special_c" ${
              box.type === "special_c" ? "selected" : ""
            }>特殊C</option>
          </select>
        </div>
        <div class="form-grid-responsive">
          <div><label>重(kg)</label><input type="number" class="sub-pkg-weight form-control" value="${
            box.weight || ""
          }"></div>
          <div><label>長</label><input type="number" class="sub-pkg-length form-control" value="${
            box.length || ""
          }"></div>
          <div><label>寬</label><input type="number" class="sub-pkg-width form-control" value="${
            box.width || ""
          }"></div>
          <div><label>高</label><input type="number" class="sub-pkg-height form-control" value="${
            box.height || ""
          }"></div>
        </div>
        <div class="sub-pkg-fee-display"></div>
      `;
      div.addEventListener("input", updateFeesOnInput);
      elSubPackageList.appendChild(div);
    });
  }

  window.removeSubPackage = function (idx) {
    currentSubPackages.splice(idx, 1);
    renderSubPackages();
    updateFeesOnInput();
  };

  elBtnAddSubPackage.addEventListener("click", () => {
    currentSubPackages.push({
      name: `分箱 ${currentSubPackages.length + 1}`,
      type: "general",
    });
    renderSubPackages();
  });

  // 倉庫圖片渲染與刪除
  function renderWarehouseImages() {
    const div = document.getElementById("modal-warehouse-images-preview");
    div.innerHTML = "";
    currentExistingImages.forEach((url, idx) => {
      div.innerHTML += `
        <div class="img-wrapper">
          <img src="${API_BASE_URL}${url}">
          <div class="btn-delete-img" onclick="deleteWhImage(${idx})">&times;</div>
        </div>
      `;
    });
  }
  window.deleteWhImage = function (idx) {
    if (confirm("確定刪除? (需按儲存才生效)")) {
      currentExistingImages.splice(idx, 1);
      renderWarehouseImages();
    }
  };

  // 提交更新
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("modal-pkg-id").value;
    const btn = updateForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "儲存中...";

    updateFeesOnInput(); // 確保數值最新

    const fd = new FormData();
    fd.append("status", document.getElementById("modal-status").value);
    fd.append("boxesData", JSON.stringify(currentSubPackages));
    fd.append("existingImages", JSON.stringify(currentExistingImages));
    const files = document.getElementById("modal-warehouseImages").files;
    for (let f of files) fd.append("warehouseImages", f);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/packages/${id}/details`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
          body: fd,
        }
      );
      if (res.ok) {
        modal.style.display = "none";
        alert("更新成功");
        loadParcels(); // 重新整理當前分頁
      } else {
        alert("失敗");
      }
    } catch (e) {
      alert("錯誤");
    } finally {
      btn.disabled = false;
      btn.textContent = "儲存更新";
    }
  });

  // 9-B. 新增包裹彈窗 (代客預報)
  async function loadAllUsers() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/list`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const d = await res.json();
      if (d.success) allUsersData = d.users;
    } catch (e) {}
  }

  const createModal = document.getElementById("admin-create-package-modal");
  document
    .getElementById("btn-show-create-modal")
    .addEventListener("click", () => {
      createModal.style.display = "flex";
    });

  // 綁定搜尋
  document
    .getElementById("admin-customer-search")
    .addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      const resDiv = document.getElementById("admin-customer-search-results");
      resDiv.innerHTML = "";
      if (!val) {
        resDiv.style.display = "none";
        return;
      }
      const matches = allUsersData.filter(
        (u) =>
          u.email.toLowerCase().includes(val) ||
          (u.name && u.name.toLowerCase().includes(val))
      );
      if (matches.length > 0) {
        resDiv.style.display = "block";
        matches.slice(0, 10).forEach((u) => {
          const div = document.createElement("div");
          div.textContent = `${u.name} (${u.email})`;
          div.style.padding = "5px";
          div.style.cursor = "pointer";
          div.onmouseover = () => (div.style.background = "#eee");
          div.onmouseout = () => (div.style.background = "white");
          div.onclick = () => {
            document.getElementById("admin-create-userId").value = u.id;
            document.getElementById(
              "admin-create-email-display"
            ).value = `${u.name} (${u.email})`;
            resDiv.style.display = "none";
          };
          resDiv.appendChild(div);
        });
      } else {
        resDiv.style.display = "none";
      }
    });

  document
    .getElementById("admin-create-package-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const uid = document.getElementById("admin-create-userId").value;
      if (!uid) return alert("請選擇客戶");

      const fd = new FormData();
      fd.append("userId", uid);
      fd.append(
        "trackingNumber",
        document.getElementById("admin-create-tracking").value
      );
      fd.append(
        "productName",
        document.getElementById("admin-create-product").value
      );
      fd.append(
        "quantity",
        document.getElementById("admin-create-quantity").value
      );
      fd.append("note", document.getElementById("admin-create-note").value);
      const files = document.getElementById("admin-create-images").files;
      for (let f of files) fd.append("images", f);

      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/packages/create`, {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
          body: fd,
        });
        if (res.ok) {
          createModal.style.display = "none";
          alert("新增成功");
          // [Updated] 重置上傳元件
          const createInput = document.getElementById("admin-create-images");
          if (createInput.resetUploader) createInput.resetUploader();

          loadParcels();
        } else alert("失敗");
      } catch (e) {
        alert("錯誤");
      }
    });

  // 關閉彈窗通用
  document.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      modal.style.display = "none";
      createModal.style.display = "none";
    });
  });

  // --- 10. 啟動 ---
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("登出?")) {
      localStorage.removeItem("admin_token");
      window.location.href = "admin-login.html";
    }
  });

  init();
});
