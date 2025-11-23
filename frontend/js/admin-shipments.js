// frontend/js/admin-shipments.js (V10.1 - 支援分頁、批量、匯出、發票顯示)

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

  // --- 2. 變數與元素 ---
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let selectedIds = new Set(); // 批量操作用

  const shipmentsTableBody = document.getElementById("shipmentsTableBody");
  const paginationContainer = document.getElementById("pagination");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");
  const selectAllCheckbox = document.getElementById("select-all");
  const bulkActionBar = document.getElementById("bulk-action-bar");
  const selectedCountSpan = document.getElementById("selected-count");
  const logoutBtn = document.getElementById("logoutBtn");

  // 編輯彈窗相關
  const modal = document.getElementById("edit-shipment-modal");
  const closeModalBtn = modal.querySelector(".modal-close");
  const updateForm = document.getElementById("edit-shipment-form");
  const shipmentPackageList = document.getElementById("modal-package-list");
  const modalServices = document.getElementById("modal-services");
  const btnPrintShipment = document.getElementById("btn-print-shipment");

  // --- 3. 初始化邏輯 ---
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

    loadShipments();
  }

  // --- 4. 資料載入 (分頁) ---
  async function loadShipments() {
    shipmentsTableBody.innerHTML =
      '<tr><td colspan="9" style="text-align: center;">載入中...</td></tr>';
    selectedIds.clear();
    updateBulkActionBar();

    try {
      let url = `${API_BASE_URL}/api/admin/shipments/all?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      renderTable(data.shipments || []);
      renderPagination(data.pagination);
      updateUrlParams();
    } catch (e) {
      console.error(e);
      shipmentsTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  // --- 5. 渲染邏輯 ---
  function renderTable(shipments) {
    shipmentsTableBody.innerHTML = "";
    if (shipments.length === 0) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="9" style="text-align: center;">無符合資料</td></tr>';
      return;
    }

    // 取得全域狀態設定
    const statusMap = window.SHIPMENT_STATUS_MAP || {};
    const statusClasses = window.STATUS_CLASSES || {};

    shipments.forEach((ship) => {
      const tr = document.createElement("tr");
      const isChecked = selectedIds.has(ship.id);

      // 狀態文字處理
      let statusText = statusMap[ship.status] || ship.status;
      let statusClass = statusClasses[ship.status] || "";

      if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
        statusText = "已付款，待審核";
        statusClass =
          statusClasses["PENDING_REVIEW"] || "status-PENDING_REVIEW";
      }

      // 發票顯示邏輯
      let invoiceDisplay =
        '<span style="color: #ccc; font-size: 12px;">未開立</span>';
      if (ship.invoiceNumber) {
        invoiceDisplay = `
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="color: #28a745; font-size: 1.2em;">🧾</span>
            <div>
                <strong style="color: #2e7d32; font-size: 13px;">${
                  ship.invoiceNumber
                }</strong>
                <div style="font-size: 10px; color: #666;">${new Date(
                  ship.invoiceDate || Date.now()
                ).toLocaleDateString()}</div>
            </div>
          </div>`;
      } else if (ship.invoiceStatus === "FAILED") {
        invoiceDisplay = `<span style="color: #dc3545; font-weight: bold;">⚠️ 開立失敗</span>`;
      }

      tr.innerHTML = `
        <td class="checkbox-col">
          <input type="checkbox" class="ship-checkbox" value="${ship.id}" ${
        isChecked ? "checked" : ""
      }>
        </td>
        <td><button class="btn btn-secondary btn-sm btn-view-details">查看/編輯</button></td>
        <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
        <td>${ship.user ? ship.user.email : "未知"}</td>
        <td>${ship.recipientName}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${
          ship.totalCost ? `NT$ ${ship.totalCost.toLocaleString()}` : "(待報價)"
        }</td>
        <td>${invoiceDisplay}</td>
        <td>${ship.trackingNumberTW || "-"}</td>
      `;

      tr.querySelector(".ship-checkbox").addEventListener("change", (e) => {
        toggleSelection(ship.id, e.target.checked);
      });
      tr.querySelector(".btn-view-details").addEventListener("click", () => {
        openShipmentModal(ship);
      });

      shipmentsTableBody.appendChild(tr);
    });

    // 更新全選框
    selectAllCheckbox.checked =
      shipments.length > 0 &&
      Array.from(shipments).every((s) => selectedIds.has(s.id));
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
          loadShipments();
        });
      }
      return btn;
    };

    paginationContainer.appendChild(
      createBtn("<", currentPage - 1, false, currentPage === 1)
    );

    for (let i = 1; i <= pg.totalPages; i++) {
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
    const checkboxes = document.querySelectorAll(".ship-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = e.target.checked;
      toggleSelection(cb.value, e.target.checked);
    });
  });

  function updateBulkActionBar() {
    selectedCountSpan.textContent = selectedIds.size;
    if (selectedIds.size > 0) bulkActionBar.style.display = "flex";
    else bulkActionBar.style.display = "none";
  }

  window.performBulkAction = async function (status) {
    if (selectedIds.size === 0) return;
    if (
      !confirm(`確定要將選取的 ${selectedIds.size} 筆訂單狀態改為 ${status}?`)
    )
      return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/bulk-status`,
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
        loadShipments();
      } else {
        alert("失敗: " + data.message);
      }
    } catch (e) {
      alert("錯誤");
    }
  };

  window.performBulkDelete = async function () {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `【嚴重警告】確定要永久刪除選取的 ${selectedIds.size} 筆訂單嗎？\n這將會釋放所有關聯包裹回已入庫狀態。`
      )
    )
      return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/bulk-delete`,
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
        loadShipments();
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
      let url = `${API_BASE_URL}/api/admin/shipments/export?`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.message);

      if (json.data.length === 0) {
        alert("無資料可匯出");
        return;
      }
      const fields = Object.keys(json.data[0]);
      const csvContent = [
        "\uFEFF" + fields.join(","),
        ...json.data.map((row) =>
          fields
            .map((f) => `"${String(row[f] || "").replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `shipments_export_${
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
    loadShipments();
  });

  // --- 9. 編輯彈窗操作 ---
  async function openShipmentModal(ship) {
    // 為了取得完整圖片與詳細資料，重新 fetch 單筆
    let fullShipment = ship;
    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/${ship.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        fullShipment = data.shipment;
      }
    } catch (e) {}

    document.getElementById("edit-shipment-id").value = fullShipment.id;
    document.getElementById("modal-user-email").textContent =
      fullShipment.user?.email || "-";
    document.getElementById("modal-recipient-name").textContent =
      fullShipment.recipientName;
    document.getElementById("modal-phone").textContent = fullShipment.phone;
    document.getElementById("modal-idNumber").textContent =
      fullShipment.idNumber;
    document.getElementById("modal-address").textContent =
      fullShipment.shippingAddress;
    document.getElementById("modal-note").textContent =
      fullShipment.note || "(無)";

    // 付款憑證
    const proofEl = document.getElementById("modal-payment-proof");
    if (fullShipment.paymentProof) {
      proofEl.innerHTML = `<a href="${API_BASE_URL}${fullShipment.paymentProof}" target="_blank" style="color:#1a73e8;font-weight:bold;">查看憑證</a>`;
    } else {
      proofEl.textContent = "尚未上傳";
    }

    // 發票資訊顯示
    let invoiceInfoBox = document.getElementById("modal-invoice-info-box");
    if (!invoiceInfoBox) {
      invoiceInfoBox = document.createElement("div");
      invoiceInfoBox.id = "modal-invoice-info-box";
      invoiceInfoBox.style.marginTop = "15px";
      invoiceInfoBox.style.padding = "10px";
      invoiceInfoBox.style.backgroundColor = "#f1f8e9";
      invoiceInfoBox.style.borderRadius = "5px";
      invoiceInfoBox.style.border = "1px solid #c5e1a5";
      proofEl.parentNode.insertBefore(invoiceInfoBox, proofEl.nextSibling);
    }

    if (fullShipment.invoiceNumber) {
      invoiceInfoBox.style.display = "block";
      invoiceInfoBox.style.backgroundColor = "#f1f8e9";
      invoiceInfoBox.style.border = "1px solid #c5e1a5";
      invoiceInfoBox.innerHTML = `
            <p style="margin:0; font-weight:bold; color:#33691e;">🧾 電子發票已開立</p>
            <ul style="margin:5px 0 0 20px; font-size:14px; color:#558b2f;">
                <li>號碼: <strong>${fullShipment.invoiceNumber}</strong></li>
                <li>日期: ${new Date(
                  fullShipment.invoiceDate
                ).toLocaleString()}</li>
                <li>隨機碼: ${fullShipment.invoiceRandomCode || "-"}</li>
                <li>抬頭: ${fullShipment.invoiceTitle || "(個人)"}</li>
                <li>統編: ${fullShipment.taxId || "(無)"}</li>
            </ul>
        `;
    } else {
      if (
        fullShipment.status === "PROCESSING" ||
        fullShipment.status === "SHIPPED" ||
        fullShipment.status === "COMPLETED"
      ) {
        invoiceInfoBox.style.display = "block";
        invoiceInfoBox.style.backgroundColor = "#fff3e0";
        invoiceInfoBox.style.border = "1px solid #ffe0b2";
        invoiceInfoBox.innerHTML = `<p style="margin:0; color:#e65100;">⚠️ 此訂單尚未開立發票 (或開立失敗)</p>`;
      } else {
        invoiceInfoBox.style.display = "none";
      }
    }

    // [修改] 商品證明 (連結) - 支援多行連結顯示
    const productUrlEl = document.getElementById("modal-product-url");
    const rawUrl = fullShipment.productUrl || "";

    if (rawUrl.trim()) {
      // 將內容依換行符號切割
      const urls = rawUrl.split(/\r?\n/).filter((u) => u.trim() !== "");

      // 清空原本的內容
      productUrlEl.innerHTML = "";
      productUrlEl.style.display = "block";

      // 生成多個連結
      urls.forEach((url, index) => {
        const link = document.createElement("a");
        link.href = url.trim();
        link.target = "_blank";
        link.style.cssText =
          "display: block; color: #1a73e8; word-break: break-all; margin-bottom: 4px;";
        link.textContent = `[連結 ${index + 1}] ${url.substring(0, 40)}...`; // 縮短顯示以免太長
        productUrlEl.appendChild(link);
      });
    } else {
      productUrlEl.innerHTML = "(無連結)";
      productUrlEl.style.display = "inline";
    }

    // [修改] 商品證明 (圖片) - 增加 flex-wrap
    const prodImgContainer = document.getElementById(
      "modal-product-images-container"
    );
    prodImgContainer.innerHTML = "";
    prodImgContainer.style.cssText =
      "display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;"; // 新增樣式

    const pImages = fullShipment.shipmentProductImages || [];
    if (pImages.length > 0) {
      pImages.forEach((url) => {
        prodImgContainer.innerHTML += `<img src="${API_BASE_URL}${url}" onclick="window.open('${API_BASE_URL}${url}')" style="width: 80px; height: 80px; object-fit: cover; border: 1px solid #ccc; border-radius: 4px; cursor: zoom-in;">`;
      });
    } else {
      prodImgContainer.innerHTML = "<small style='color:#999'>無照片</small>";
    }

    // 包裹列表
    shipmentPackageList.innerHTML = (fullShipment.packages || [])
      .map((p) => `<p>${p.productName} (<b>${p.trackingNumber}</b>)</p>`)
      .join("");
    modalServices.innerHTML = "<p>(無附加服務)</p>";

    document.getElementById("modal-status").value = fullShipment.status;
    document.getElementById("modal-totalCost").value =
      fullShipment.totalCost || "";
    document.getElementById("modal-trackingNumberTW").value =
      fullShipment.trackingNumberTW || "";

    if (btnPrintShipment) {
      btnPrintShipment.onclick = () =>
        window.open(`shipment-print.html?id=${fullShipment.id}`, "_blank");
    }

    // 永久刪除按鈕邏輯
    let delBtn = document.getElementById("btn-admin-delete-shipment");
    if (!delBtn) {
      delBtn = document.createElement("button");
      delBtn.id = "btn-admin-delete-shipment";
      delBtn.type = "button";
      delBtn.className = "btn btn-danger";
      delBtn.style.marginTop = "20px";
      delBtn.style.width = "100%";
      delBtn.textContent = "⚠️ 永久刪除此集運單 (危險)";
      updateForm.appendChild(delBtn);
    }
    // 重新綁定事件 (cloneNode 移除舊 listener)
    const newDelBtn = delBtn.cloneNode(true);
    delBtn.parentNode.replaceChild(newDelBtn, delBtn);

    newDelBtn.addEventListener("click", async () => {
      if (!confirm(`【嚴重警告】確定要永久刪除此集運單嗎？`)) return;
      try {
        newDelBtn.disabled = true;
        newDelBtn.textContent = "刪除中...";
        const res = await fetch(
          `${API_BASE_URL}/api/admin/shipments/${fullShipment.id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        );
        const d = await res.json();
        if (res.ok) {
          alert("已刪除");
          modal.style.display = "none";
          loadShipments();
        } else {
          alert("失敗: " + d.message);
        }
      } catch (e) {
        alert("錯誤");
      } finally {
        newDelBtn.disabled = false;
        newDelBtn.textContent = "⚠️ 永久刪除此集運單 (危險)";
      }
    });

    modal.style.display = "flex";
  }

  closeModalBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const status = document.getElementById("modal-status").value;
    const btn = updateForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "處理中...";

    try {
      if (status === "CANCELLED") {
        if (!confirm("確定要退回並釋放包裹？")) {
          btn.disabled = false;
          btn.textContent = "儲存變更";
          return;
        }
        await fetch(`${API_BASE_URL}/api/admin/shipments/${id}/reject`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } else {
        const data = {
          status,
          totalCost: document.getElementById("modal-totalCost").value,
          trackingNumberTW: document.getElementById("modal-trackingNumberTW")
            .value,
        };
        await fetch(`${API_BASE_URL}/api/admin/shipments/${id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
      }
      modal.style.display = "none";
      alert("更新成功");
      loadShipments();
    } catch (e) {
      alert("錯誤");
    } finally {
      btn.disabled = false;
      btn.textContent = "儲存變更";
    }
  });

  // --- 10. 啟動 ---
  logoutBtn.addEventListener("click", () => {
    if (confirm("登出?")) {
      localStorage.removeItem("admin_token");
      window.location.href = "admin-login.html";
    }
  });

  init();
});
