// frontend/js/admin-parcels.js
// V2025.Fixed - Solved Broken Claim Proof Image & Cloudinary Path Issues

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) return;

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
  const statusFilterSelect = document.getElementById("status-filter");

  // 初始化
  init();

  function init() {
    // 列表搜尋
    document.getElementById("btn-search").addEventListener("click", () => {
      currentSearch = document.getElementById("search-input").value;
      currentStatus = document.getElementById("status-filter").value;
      currentPage = 1;
      loadParcels();
    });

    // 打開新增視窗
    document
      .getElementById("btn-show-create-modal")
      .addEventListener("click", openCreateModal);

    document
      .getElementById("btn-export")
      .addEventListener("click", exportPackages);

    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => (modal.style.display = "none"));
    });

    if (selectAll) {
      selectAll.addEventListener("change", (e) => {
        document.querySelectorAll(".pkg-checkbox").forEach((cb) => {
          cb.checked = e.target.checked;
          toggleSelection(cb.value, e.target.checked);
        });
      });
    }

    if (btnBulkDelete) {
      btnBulkDelete.addEventListener("click", performBulkDelete);
    }

    // 分箱功能
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

    form.addEventListener("submit", handleFormSubmit);

    // 綁定「設為無主件」按鈕
    const btnSetUnclaimed = document.getElementById("btn-set-unclaimed");
    if (btnSetUnclaimed) {
      btnSetUnclaimed.addEventListener("click", setAsUnclaimedUser);
    }

    loadParcels();
  }

  // --- 更新下拉選單數字 ---
  function updateStatusCounts(counts) {
    if (!counts) return;
    const options = statusFilterSelect.options;
    const total = counts["ALL"] || 0;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const statusKey = opt.value;

      if (!opt.hasAttribute("data-original-text")) {
        opt.setAttribute("data-original-text", opt.innerText);
      }
      const originalText = opt.getAttribute("data-original-text");

      if (statusKey === "") {
        opt.innerText = `${originalText} (${total})`;
      } else {
        const count = counts[statusKey] || 0;
        opt.innerText = `${originalText} (${count})`;
      }
    }
  }

  // --- 快速設定為無主件 ---
  async function setAsUnclaimedUser() {
    const searchInput = document.getElementById("admin-customer-search");
    const resultDiv = document.getElementById("admin-customer-search-results");

    const btn = document.getElementById("btn-set-unclaimed");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 搜尋中...';

    try {
      const keyword = "unclaimed@runpiggy.com";
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/list?search=${encodeURIComponent(
          keyword
        )}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const data = await res.json();

      if (data.users && data.users.length > 0) {
        const user = data.users[0];
        selectUser(user.id, user.email, user.name);
        searchInput.style.backgroundColor = "#fff3cd";
        setTimeout(() => (searchInput.style.backgroundColor = ""), 1000);
      } else {
        alert(
          "找不到官方無主帳號 (unclaimed@runpiggy.com)。\n請確認系統是否已執行 Seed 初始化。"
        );
      }
    } catch (e) {
      console.error(e);
      alert("連線錯誤，無法設定無主件");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
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

      if (data.statusCounts) {
        updateStatusCounts(data.statusCounts);
      }
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-3">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  async function exportPackages() {
    const btn = document.getElementById("btn-export");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 匯出中...';

    try {
      let url = `${API_BASE_URL}/api/admin/packages/export?`;
      if (currentStatus) url += `status=${currentStatus}&`;
      if (currentSearch)
        url += `search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = await res.json();

      if (!json.success || !json.data) throw new Error("匯出失敗");

      const items = json.data;
      if (items.length === 0) {
        alert("無資料可匯出");
        return;
      }

      const replacer = (key, value) => (value === null ? "" : value);
      const header = Object.keys(items[0]);
      const csv = [
        header.join(","),
        ...items.map((row) =>
          header
            .map((fieldName) => JSON.stringify(row[fieldName], replacer))
            .join(",")
        ),
      ].join("\r\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const urlBlob = URL.createObjectURL(blob);
      link.setAttribute("href", urlBlob);
      link.setAttribute(
        "download",
        `packages_export_${new Date().toISOString().slice(0, 10)}.csv`
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert("匯出錯誤: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-file-export"></i> 匯出 CSV';
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
      IN_SHIPMENT: "status-IN_SHIPMENT",
      COMPLETED: "status-COMPLETED",
      CANCELLED: "status-CANCELLED",
    };
    const statusTextMap = window.PACKAGE_STATUS_MAP || {};

    const LIMITS = {
      OVERSIZED: window.CONSTANTS?.OVERSIZED_LIMIT || 300,
      OVERWEIGHT: window.CONSTANTS?.OVERWEIGHT_LIMIT || 100,
    };

    packages.forEach((pkg) => {
      const tr = document.createElement("tr");
      const statusClass = statusClasses[pkg.status] || "status-PENDING";
      const statusText = statusTextMap[pkg.status] || pkg.status;

      let weightInfo = "-";
      let alertBadges = "";

      if (pkg.claimProof) {
        alertBadges += `<span class="badge" style="background-color:#6610f2; color:white; font-size:11px; padding:2px 6px; margin-right:2px; border-radius:4px;">🙋‍♂️ 已認領</span> `;
      }

      if (
        pkg.user &&
        (pkg.user.email === "unclaimed@runpiggy.com" ||
          pkg.user.email === "admin@runpiggy.com")
      ) {
        alertBadges += `<span class="badge" style="background-color:#6c757d; color:white; font-size:11px; padding:2px 6px; margin-right:2px; border-radius:4px;">❓ 無主</span> `;
      }

      if (pkg.arrivedBoxesJson && pkg.arrivedBoxesJson.length > 0) {
        let isOversized = false;
        let isOverweight = false;

        const totalW = pkg.arrivedBoxesJson.reduce((sum, b) => {
          const l = parseFloat(b.length) || 0;
          const w = parseFloat(b.width) || 0;
          const h = parseFloat(b.height) || 0;
          const weight = parseFloat(b.weight) || 0;

          if (
            l >= LIMITS.OVERSIZED ||
            w >= LIMITS.OVERSIZED ||
            h >= LIMITS.OVERSIZED
          ) {
            isOversized = true;
          }
          if (weight >= LIMITS.OVERWEIGHT) {
            isOverweight = true;
          }

          return sum + weight;
        }, 0);

        weightInfo = `${totalW.toFixed(1)} kg / ${
          pkg.arrivedBoxesJson.length
        }箱`;

        if (isOversized) {
          alertBadges += `<span class="badge" style="background-color:#dc3545; color:white; font-size:11px; padding:2px 6px; margin-left:2px; border-radius:4px;">⚠️ 超長</span> `;
        }
        if (isOverweight) {
          alertBadges += `<span class="badge" style="background-color:#dc3545; color:white; font-size:11px; padding:2px 6px; margin-left:2px; border-radius:4px;">⚠️ 超重</span>`;
        }
      }

      const pkgStr = encodeURIComponent(JSON.stringify(pkg));

      tr.innerHTML = `
        <td><input type="checkbox" class="pkg-checkbox" value="${pkg.id}"></td>
        <td data-label="預報時間">${new Date(
          pkg.createdAt
        ).toLocaleDateString()}</td>
        <td data-label="會員">${
          pkg.user ? pkg.user.name : "-"
        } <br><small class="text-gray-500">${
        pkg.user ? pkg.user.email : ""
      }</small></td>
        <td data-label="物流單號"><span style="font-family:monospace; font-weight:bold;">${
          pkg.trackingNumber
        }</span></td>
        <td data-label="商品名稱">${pkg.productName}</td>
        <td data-label="重量/尺寸">
            ${weightInfo}
            <div style="margin-top:2px;">${alertBadges}</div>
        </td>
        <td data-label="狀態"><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td data-label="操作">
          <button class="btn btn-primary btn-sm" onclick="openEditModal('${pkgStr}')"><i class="fas fa-edit"></i> 編輯</button>
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

  function openEditModal(pkgStr) {
    isCreateMode = false;
    const pkg = JSON.parse(decodeURIComponent(pkgStr));

    document.getElementById("modal-title").textContent = "編輯包裹 / 入庫";
    document.getElementById("modal-pkg-id").value = pkg.id;

    document.getElementById("user-info-section").style.display = "block";
    document.getElementById("create-user-search").style.display = "none";

    let claimHtml = "";
    if (pkg.claimProof) {
      // [FIX] 判斷認領圖片是否為完整 URL (Cloudinary)
      const proofUrl =
        pkg.claimProof.startsWith("http") || pkg.claimProof.startsWith("https")
          ? pkg.claimProof
          : `${API_BASE_URL}${pkg.claimProof}`;

      claimHtml = `
            <div style="margin-top:5px; padding:5px; background:#e6f7ff; border:1px solid #1890ff; border-radius:4px;">
                <strong style="color:#1890ff;">🙋‍♂️ 此包裹已被認領</strong><br>
                <a href="${proofUrl}" target="_blank" style="font-size:12px; text-decoration:underline; display:flex; align-items:center; gap:5px;">
                    <i class="fas fa-image"></i> 查看購物證明截圖
                </a>
            </div>
        `;
    }

    document.getElementById("modal-user-display").innerHTML = `
        <strong>${pkg.user?.name}</strong> (${pkg.user?.email})
        ${claimHtml}
    `;

    document.getElementById("modal-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("modal-productName").value = pkg.productName;
    document.getElementById("modal-quantity").value = pkg.quantity;
    document.getElementById("modal-note").value = pkg.note || "";
    document.getElementById("modal-status").value = pkg.status;

    // 顯示商品購買連結
    const urlDisplay = document.getElementById("modal-productUrl-display");
    if (pkg.productUrl) {
      urlDisplay.innerHTML = `<a href="${
        pkg.productUrl
      }" target="_blank" class="text-primary" style="text-decoration: underline;"><i class="fas fa-external-link-alt"></i> 點擊開啟：${
        pkg.productUrl.length > 50
          ? pkg.productUrl.substring(0, 50) + "..."
          : pkg.productUrl
      }</a>`;
    } else {
      urlDisplay.innerHTML = `<span class="text-muted"><i class="fas fa-ban"></i> 客戶未提供連結</span>`;
    }

    // 顯示客戶上傳照片
    const clientImgDiv = document.getElementById("modal-client-images-preview");
    const clientSection = document.getElementById("client-images-section");
    clientImgDiv.innerHTML = "";
    if (pkg.productImages && pkg.productImages.length > 0) {
      clientSection.style.display = "block";
      pkg.productImages.forEach((img) => {
        // [Fixed] 判斷是否為完整 URL
        const fullUrl =
          img.startsWith("http") || img.startsWith("https")
            ? img
            : `${API_BASE_URL}${img}`;
        clientImgDiv.innerHTML += `
            <a href="${fullUrl}" target="_blank" title="點擊放大">
                <img src="${fullUrl}" style="width:80px; height:80px; object-fit:cover; border:1px solid #ddd; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            </a>
        `;
      });
    } else {
      clientImgDiv.innerHTML = `<span class="text-muted small">客戶未上傳照片</span>`;
    }

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
  }
  window.openEditModal = openEditModal;

  function openCreateModal() {
    isCreateMode = true;
    document.getElementById("modal-title").textContent =
      "代客預報 (或新增無主件)";
    form.reset();
    document.getElementById("modal-pkg-id").value = "";

    document.getElementById("user-info-section").style.display = "block";
    document.getElementById("modal-user-display").innerHTML = "";
    document.getElementById("create-user-search").style.display = "block";
    document.getElementById("admin-create-userId").value = "";
    document.getElementById("admin-customer-search").value = "";
    document.getElementById("admin-customer-search-results").style.display =
      "none";

    document.getElementById("boxes-section").style.display = "none";
    document.getElementById("modal-status").value = "PENDING";

    document.getElementById("modal-productUrl-display").innerHTML = "";
    document.getElementById("modal-client-images-preview").innerHTML = "";
    document.getElementById("client-images-section").style.display = "none";

    modal.style.display = "flex";
  }
  window.openCreateModal = openCreateModal;

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

  function updateFeesOnInput() {
    const rows = document.querySelectorAll("#sub-package-list > div");
    const RATES = window.RATES || {};
    const CONSTANTS = window.CONSTANTS || {
      VOLUME_DIVISOR: 28317,
      MINIMUM_CHARGE: 2000,
      OVERSIZED_LIMIT: 300,
      OVERWEIGHT_LIMIT: 100,
    };
    let total = 0;
    let hasValidBox = false;

    rows.forEach((row, idx) => {
      const typeSelect = row.querySelector(".sub-pkg-type");
      const type = typeSelect.value;

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

      let warningHtml = "";
      let hasOversized = false;
      let hasOverweight = false;

      if (
        l >= CONSTANTS.OVERSIZED_LIMIT ||
        wd >= CONSTANTS.OVERSIZED_LIMIT ||
        h >= CONSTANTS.OVERSIZED_LIMIT
      ) {
        hasOversized = true;
        warningHtml += `<div style="color:red; font-weight:bold; font-size:12px; margin-bottom:4px;">⚠️ 偵測到超長 (>=${CONSTANTS.OVERSIZED_LIMIT}cm)</div>`;
      }

      if (w >= CONSTANTS.OVERWEIGHT_LIMIT) {
        hasOverweight = true;
        warningHtml += `<div style="color:red; font-weight:bold; font-size:12px; margin-bottom:4px;">⚠️ 偵測到超重 (>=${CONSTANTS.OVERWEIGHT_LIMIT}kg)</div>`;
      }

      const inputL = row.querySelector(".sub-pkg-l");
      const inputW = row.querySelector(".sub-pkg-w");
      const inputH = row.querySelector(".sub-pkg-h");
      const inputWt = row.querySelector(".sub-pkg-weight");

      inputL.style.borderColor =
        l >= CONSTANTS.OVERSIZED_LIMIT ? "red" : "#ccc";
      inputW.style.borderColor =
        wd >= CONSTANTS.OVERSIZED_LIMIT ? "red" : "#ccc";
      inputH.style.borderColor =
        h >= CONSTANTS.OVERSIZED_LIMIT ? "red" : "#ccc";
      inputWt.style.borderColor =
        w >= CONSTANTS.OVERWEIGHT_LIMIT ? "red" : "#ccc";

      if (hasOversized || hasOverweight) {
        displayDiv.style.backgroundColor = "#fff0f0";
        displayDiv.style.border = "1px dashed red";
      } else {
        displayDiv.style.backgroundColor = "";
        displayDiv.style.border = "";
      }

      if (w > 0 && l > 0 && wd > 0 && h > 0) {
        hasValidBox = true;
        const rate = RATES[type] || { weightRate: 0, volumeRate: 0 };
        const rawCai = (l * wd * h) / CONSTANTS.VOLUME_DIVISOR;
        const cai = Math.ceil(rawCai);
        const volFee = Math.round(cai * rate.volumeRate);
        const wtFee = Math.round((Math.ceil(w * 10) / 10) * rate.weightRate);
        const isVolWin = volFee >= wtFee;
        const fee = Math.max(volFee, wtFee);
        total += fee;

        let html = warningHtml;
        html += `
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
        displayDiv.innerHTML =
          warningHtml + `<span style="color:#ccc;">等待完整輸入...</span>`;
      }
    });

    const statusSelect = document.getElementById("modal-status");
    if (hasValidBox && statusSelect && statusSelect.value === "PENDING") {
      statusSelect.value = "ARRIVED";
      statusSelect.style.backgroundColor = "#d4edda";
      statusSelect.style.color = "#155724";
      statusSelect.style.fontWeight = "bold";
      setTimeout(() => {
        statusSelect.style.backgroundColor = "";
        statusSelect.style.color = "";
        statusSelect.style.fontWeight = "";
      }, 1000);
    }

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
      // [Fixed] 判斷是否為完整 URL
      const src =
        url.startsWith("http") || url.startsWith("https")
          ? url
          : `${API_BASE_URL}${url}`;
      container.innerHTML += `
            <div style="position:relative;">
                <img src="${src}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid #ddd;">
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
        alert("操作失敗: " + d.message);
      }
    } catch (e) {
      alert("錯誤: " + e.message);
    }
  }

  const searchInput = document.getElementById("admin-customer-search");
  const resultDiv = document.getElementById("admin-customer-search-results");

  if (searchInput && resultDiv) {
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
  }

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
    if (btnBulkDelete) {
      btnBulkDelete.style.display =
        selectedIds.size > 0 ? "inline-block" : "none";
      btnBulkDelete.textContent = `批量刪除 (${selectedIds.size})`;
    }
  }

  async function performBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return alert("請先選擇要刪除的包裹");

    const confirmation = prompt(
      `【危險操作】\n您即將永久刪除 ${count} 筆包裹資料。\n此操作無法復原，且會一並刪除相關圖片。\n\n請輸入 "DELETE" (大寫) 以確認刪除：`
    );

    if (confirmation !== "DELETE") {
      if (confirmation !== null) {
        alert("輸入內容不正確，已取消刪除操作。");
      }
      return;
    }

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
        alert(`已成功刪除 ${count} 筆包裹。`);
        loadParcels();
      } else {
        const data = await res.json();
        alert("刪除失敗: " + (data.message || "未知錯誤"));
      }
    } catch (e) {
      alert("網路錯誤");
    }
  }
});
