// frontend/js/admin-parcels.js (V25.0 - 運費公式透明化版)

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) return; // layout.js 會處理跳轉

  // 變數
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let selectedIds = new Set();
  let currentSubPackages = [];
  let currentExistingImages = [];
  let isCreateMode = false;

  // DOM
  const tableBody = document.getElementById("parcelsTableBody");
  const paginationDiv = document.getElementById("pagination");
  const modal = document.getElementById("parcel-modal");
  const form = document.getElementById("parcel-form");
  const selectAll = document.getElementById("select-all");
  const btnBulkDelete = document.getElementById("btn-bulk-delete");

  // 初始化
  init();

  function init() {
    // 綁定篩選事件
    document.getElementById("btn-search").addEventListener("click", () => {
      currentSearch = document.getElementById("search-input").value;
      currentStatus = document.getElementById("status-filter").value;
      currentPage = 1;
      loadParcels();
    });

    document
      .getElementById("btn-show-create-modal")
      .addEventListener("click", openCreateModal);

    // 綁定 Modal 關閉
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => (modal.style.display = "none"));
    });

    // 綁定全選
    selectAll.addEventListener("change", (e) => {
      document.querySelectorAll(".pkg-checkbox").forEach((cb) => {
        cb.checked = e.target.checked;
        toggleSelection(cb.value, e.target.checked);
      });
    });

    // 綁定批量刪除
    btnBulkDelete.addEventListener("click", performBulkDelete);

    // 綁定分箱新增
    document
      .getElementById("btn-add-sub-package")
      .addEventListener("click", () => {
        currentSubPackages.push({
          name: `分箱 ${currentSubPackages.length + 1}`,
          type: "general",
        });
        renderSubPackages();
        updateFeesOnInput();
      });

    // 綁定表單提交
    form.addEventListener("submit", handleFormSubmit);

    // 初始載入
    loadParcels();
  }

  async function loadParcels() {
    tableBody.innerHTML =
      '<tr><td colspan="8" class="text-center p-3">載入中...</td></tr>';
    selectedIds.clear();
    updateBulkUI();

    try {
      let url = `${API_BASE_URL}/api/admin/packages/all?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);
      renderTable(data.packages || []);
      renderPagination(data.pagination);
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-3">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  function renderTable(packages) {
    tableBody.innerHTML = "";
    if (packages.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="8" class="text-center p-3">無資料</td></tr>';
      return;
    }

    const statusClasses = {
      PENDING: "status-PENDING",
      ARRIVED: "status-ARRIVED",
      IN_SHIPMENT: "status-info",
      COMPLETED: "status-COMPLETED",
      CANCELLED: "status-CANCELLED",
    };
    const statusTextMap = window.PACKAGE_STATUS_MAP || {};

    packages.forEach((pkg) => {
      const tr = document.createElement("tr");
      const statusClass = statusClasses[pkg.status] || "status-secondary";
      const statusText = statusTextMap[pkg.status] || pkg.status;

      // 尺寸重量顯示
      let weightInfo = "-";
      if (pkg.arrivedBoxesJson && pkg.arrivedBoxesJson.length > 0) {
        const totalW = pkg.arrivedBoxesJson.reduce(
          (sum, b) => sum + (parseFloat(b.weight) || 0),
          0
        );
        weightInfo = `${totalW.toFixed(1)} kg / ${
          pkg.arrivedBoxesJson.length
        }箱`;
      }

      const pkgStr = encodeURIComponent(JSON.stringify(pkg));

      tr.innerHTML = `
        <td><input type="checkbox" class="pkg-checkbox" value="${pkg.id}"></td>
        <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
        <td>${
          pkg.user ? pkg.user.name : "-"
        } <br><small class="text-gray-500">${
        pkg.user ? pkg.user.email : ""
      }</small></td>
        <td><span style="font-family:monospace; font-weight:bold;">${
          pkg.trackingNumber
        }</span></td>
        <td>${pkg.productName}</td>
        <td>${weightInfo}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openEditModal('${pkgStr}')"><i class="fas fa-edit"></i></button>
        </td>
      `;

      tr.querySelector(".pkg-checkbox").addEventListener("change", (e) =>
        toggleSelection(pkg.id, e.target.checked)
      );
      tableBody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    paginationDiv.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const createBtn = (text, page, active = false, disabled = false) => {
      const btn = document.createElement("button");
      btn.className = `btn btn-sm ${active ? "btn-primary" : "btn-light"}`;
      btn.textContent = text;
      btn.disabled = disabled;
      if (!disabled)
        btn.onclick = () => {
          currentPage = page;
          loadParcels();
        };
      return btn;
    };

    paginationDiv.appendChild(
      createBtn("上一頁", currentPage - 1, false, currentPage === 1)
    );
    paginationDiv.appendChild(
      createBtn(`${currentPage} / ${pg.totalPages}`, currentPage, true, true)
    );
    paginationDiv.appendChild(
      createBtn("下一頁", currentPage + 1, false, currentPage === pg.totalPages)
    );
  }

  // --- Modal 操作 ---
  window.openEditModal = function (pkgStr) {
    isCreateMode = false;
    const pkg = JSON.parse(decodeURIComponent(pkgStr));

    document.getElementById("modal-title").textContent = "編輯包裹 / 入庫";
    document.getElementById("modal-pkg-id").value = pkg.id;

    document.getElementById("user-info-section").style.display = "block";
    document.getElementById("create-user-search").style.display = "none";
    document.getElementById("modal-user-display").innerHTML = `
        <strong>${pkg.user?.name}</strong> (${pkg.user?.email})
    `;

    document.getElementById("modal-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("modal-productName").value = pkg.productName;
    document.getElementById("modal-quantity").value = pkg.quantity;
    document.getElementById("modal-note").value = pkg.note || "";
    document.getElementById("modal-status").value = pkg.status;

    // 分箱資料
    document.getElementById("boxes-section").style.display = "block";
    currentSubPackages = pkg.arrivedBoxesJson || [];
    if (currentSubPackages.length === 0) {
      currentSubPackages.push({
        name: "分箱 1",
        type: "general",
        weight: "",
        length: "",
        width: "",
        height: "",
      });
    }
    renderSubPackages();
    updateFeesOnInput();

    currentExistingImages = pkg.warehouseImages || [];
    renderImages(currentExistingImages);

    modal.style.display = "flex";
  };

  function openCreateModal() {
    isCreateMode = true;
    document.getElementById("modal-title").textContent = "代客預報 (新增包裹)";
    form.reset();
    document.getElementById("modal-pkg-id").value = "";

    document.getElementById("user-info-section").style.display = "block";
    document.getElementById("modal-user-display").innerHTML = "";
    document.getElementById("create-user-search").style.display = "block";
    document.getElementById("admin-create-userId").value = "";

    document.getElementById("boxes-section").style.display = "none";
    document.getElementById("modal-status").value = "PENDING";

    modal.style.display = "flex";
  }

  // --- 分箱與公式顯示 ---
  function renderSubPackages() {
    const list = document.getElementById("sub-package-list");
    list.innerHTML = "";
    currentSubPackages.forEach((box, idx) => {
      const div = document.createElement("div");
      div.className = "card mb-2 p-2";
      div.style.backgroundColor = "#fff";
      div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>#${idx + 1}</strong>
                <button type="button" class="btn btn-sm btn-danger py-0" onclick="removeBox(${idx})">&times;</button>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                <input class="form-control sub-pkg-name" value="${
                  box.name || ""
                }" placeholder="名稱">
                <select class="form-control sub-pkg-type">
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
                <input type="number" class="form-control sub-pkg-weight" value="${
                  box.weight || ""
                }" placeholder="重kg">
                <div style="display:flex; gap:2px;">
                    <input type="number" class="form-control sub-pkg-l" value="${
                      box.length || ""
                    }" placeholder="L">
                    <input type="number" class="form-control sub-pkg-w" value="${
                      box.width || ""
                    }" placeholder="W">
                    <input type="number" class="form-control sub-pkg-h" value="${
                      box.height || ""
                    }" placeholder="H">
                </div>
            </div>
            <div class="calc-formula-box sub-pkg-fee-display">
               <span style="color:#999">請輸入數值以計算...</span>
            </div>
        `;
      div.addEventListener("input", updateFeesOnInput);
      list.appendChild(div);
    });
  }

  window.removeBox = function (idx) {
    currentSubPackages.splice(idx, 1);
    renderSubPackages();
    updateFeesOnInput();
  };

  // --- 即時算式邏輯 ---
  function updateFeesOnInput() {
    const rows = document.querySelectorAll("#sub-package-list > div");
    const RATES = window.RATES || {};
    const CONSTANTS = window.CONSTANTS || {
      VOLUME_DIVISOR: 28317,
      MINIMUM_CHARGE: 2000,
    };
    let total = 0;

    rows.forEach((row, idx) => {
      const typeSelect = row.querySelector(".sub-pkg-type");
      const type = typeSelect.value;
      const typeName = typeSelect.options[typeSelect.selectedIndex].text;

      const w = parseFloat(row.querySelector(".sub-pkg-weight").value) || 0;
      const l = parseFloat(row.querySelector(".sub-pkg-l").value) || 0;
      const wd = parseFloat(row.querySelector(".sub-pkg-w").value) || 0;
      const h = parseFloat(row.querySelector(".sub-pkg-h").value) || 0;
      const name = row.querySelector(".sub-pkg-name").value;

      currentSubPackages[idx] = {
        name,
        type,
        weight: w,
        length: l,
        width: wd,
        height: h,
      };

      const displayDiv = row.querySelector(".sub-pkg-fee-display");

      if (w > 0 && l > 0 && wd > 0 && h > 0) {
        const rate = RATES[type] || { weightRate: 0, volumeRate: 0 };

        // 材積公式：(L*W*H)/Divisor = 材 (進位)
        const rawCai = (l * wd * h) / CONSTANTS.VOLUME_DIVISOR;
        const cai = Math.ceil(rawCai);

        // 費用
        const volFee = Math.round(cai * rate.volumeRate);
        const wtFee = Math.round((Math.ceil(w * 10) / 10) * rate.weightRate); // 重量進位小數點後一位 (模擬後端)

        const isVolWin = volFee >= wtFee;
        const fee = Math.max(volFee, wtFee);
        total += fee;

        // 生成詳細 HTML
        let html = `
            <div class="calc-row ${!isVolWin ? "winner" : ""}">
                <span>重量重 (${w}kg)</span>
                <span>$${wtFee}</span>
            </div>
            <span class="calc-math">公式: ${w}kg x $${rate.weightRate}</span>
            
            <div style="border-top:1px dashed #eee; margin:4px 0;"></div>

            <div class="calc-row ${isVolWin ? "winner" : ""}">
                <span>材積重 (${cai}材)</span>
                <span>$${volFee}</span>
            </div>
            <span class="calc-math">公式: (${l}x${wd}x${h}) / ${
          CONSTANTS.VOLUME_DIVISOR
        } = ${rawCai.toFixed(2)}材</span>
            <span class="calc-math">計費: ${cai}材 x $${rate.volumeRate}</span>
        `;
        displayDiv.innerHTML = html;
      } else {
        displayDiv.innerHTML = `<span style="color:#ccc;">等待完整輸入...</span>`;
      }
    });

    // 總計
    const finalTotal = Math.max(total, CONSTANTS.MINIMUM_CHARGE || 0);
    const minChargeMsg =
      total > 0 && total < CONSTANTS.MINIMUM_CHARGE
        ? ` (未達低消 $${CONSTANTS.MINIMUM_CHARGE})`
        : "";

    document.getElementById("modal-shippingFee").value = finalTotal;
    document.getElementById("modal-fee-tips").textContent =
      total > 0 ? `原始加總: $${total}${minChargeMsg}` : "";
  }

  function renderImages(images) {
    const container = document.getElementById("modal-warehouse-images-preview");
    container.innerHTML = "";
    images.forEach((url, idx) => {
      container.innerHTML += `
            <div style="position:relative;">
                <img src="${API_BASE_URL}${url}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid #ddd;">
                <div onclick="deleteImage(${idx})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:18px; height:18px; text-align:center; line-height:18px; cursor:pointer; font-size:12px;">&times;</div>
            </div>
          `;
    });
  }

  window.deleteImage = function (idx) {
    currentExistingImages.splice(idx, 1);
    renderImages(currentExistingImages);
  };

  async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("modal-pkg-id").value;

    const fd = new FormData();
    fd.append(
      "trackingNumber",
      document.getElementById("modal-trackingNumber").value
    );
    fd.append(
      "productName",
      document.getElementById("modal-productName").value
    );
    fd.append("quantity", document.getElementById("modal-quantity").value);
    fd.append("note", document.getElementById("modal-note").value);

    const files = document.getElementById("modal-warehouseImages").files;
    for (let f of files)
      fd.append(isCreateMode ? "images" : "warehouseImages", f);

    try {
      let url, method;
      if (isCreateMode) {
        url = `${API_BASE_URL}/api/admin/packages/create`;
        method = "POST";
        fd.append(
          "userId",
          document.getElementById("admin-create-userId").value
        );
        if (!fd.get("userId")) return alert("請先搜尋並選擇會員");
      } else {
        url = `${API_BASE_URL}/api/admin/packages/${id}/details`;
        method = "PUT";
        fd.append("status", document.getElementById("modal-status").value);
        fd.append("boxesData", JSON.stringify(currentSubPackages));
        fd.append("existingImages", JSON.stringify(currentExistingImages));
      }

      const res = await fetch(url, {
        method: method,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: fd,
      });
      const d = await res.json();
      if (res.ok) {
        alert(isCreateMode ? "新增成功" : "更新成功");
        modal.style.display = "none";
        loadParcels();
      } else {
        alert(d.message);
      }
    } catch (e) {
      alert("錯誤");
    }
  }

  const searchInput = document.getElementById("admin-customer-search");
  const resultDiv = document.getElementById("admin-customer-search-results");

  searchInput.addEventListener("input", async (e) => {
    const val = e.target.value.trim();
    if (val.length < 2) {
      resultDiv.style.display = "none";
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/list?search=${val}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const d = await res.json();
      if (d.users && d.users.length > 0) {
        resultDiv.innerHTML = d.users
          .map(
            (u) => `
                  <div class="p-2 border-bottom" style="cursor:pointer;" onclick="selectUser('${u.id}', '${u.email}', '${u.name}')">
                      ${u.name} (${u.email})
                  </div>
              `
          )
          .join("");
        resultDiv.style.display = "block";
      } else {
        resultDiv.style.display = "none";
      }
    } catch (e) {}
  });

  window.selectUser = function (id, email, name) {
    document.getElementById("admin-create-userId").value = id;
    searchInput.value = `${name} (${email})`;
    resultDiv.style.display = "none";
  };

  function toggleSelection(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkUI();
  }
  function updateBulkUI() {
    btnBulkDelete.style.display =
      selectedIds.size > 0 ? "inline-block" : "none";
    btnBulkDelete.textContent = `批量刪除 (${selectedIds.size})`;
  }
  async function performBulkDelete() {
    if (!confirm(`確定刪除 ${selectedIds.size} 筆?`)) return;
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
      if (res.ok) {
        alert("刪除成功");
        loadParcels();
      }
    } catch (e) {
      alert("錯誤");
    }
  }
});
