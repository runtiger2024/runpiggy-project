// frontend/js/admin-shipments.js (V2025)

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) return;

  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let selectedIds = new Set();

  const tbody = document.getElementById("shipment-list");
  const paginationDiv = document.getElementById("pagination");
  const modal = document.getElementById("shipment-modal");

  init();

  function init() {
    document.getElementById("btn-search").addEventListener("click", () => {
      currentStatus = document.getElementById("status-filter").value;
      currentSearch = document.getElementById("search-input").value;
      currentPage = 1;
      loadShipments();
    });

    document
      .querySelectorAll(".modal-close-btn")
      .forEach((b) =>
        b.addEventListener("click", () => (modal.style.display = "none"))
      );
    document
      .getElementById("edit-shipment-form")
      .addEventListener("submit", handleUpdate);

    // 全選
    document.getElementById("select-all").addEventListener("change", (e) => {
      document.querySelectorAll(".ship-checkbox").forEach((cb) => {
        cb.checked = e.target.checked;
        toggleSelection(cb.value, e.target.checked);
      });
    });

    // 批量按鈕
    document
      .getElementById("btn-bulk-process")
      .addEventListener("click", () => performBulkAction("PROCESSING"));
    document
      .getElementById("btn-bulk-delete")
      .addEventListener("click", performBulkDelete);

    loadShipments();
  }

  async function loadShipments() {
    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center p-3">載入中...</td></tr>';
    selectedIds.clear();
    updateBulkUI();

    try {
      let url = `${API_BASE_URL}/api/admin/shipments/all?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      renderTable(data.shipments || []);
      renderPagination(data.pagination);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-3">錯誤: ${e.message}</td></tr>`;
    }
  }

  function renderTable(shipments) {
    tbody.innerHTML = "";
    if (shipments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="text-center p-3">無資料</td></tr>';
      return;
    }

    const statusClasses = {
      PENDING_PAYMENT: "status-PENDING",
      PENDING_REVIEW: "status-PENDING", // 黃色，待審
      PROCESSING: "status-info",
      SHIPPED: "status-info",
      COMPLETED: "status-COMPLETED",
      CANCELLED: "status-CANCELLED",
    };

    shipments.forEach((s) => {
      const tr = document.createElement("tr");
      // 判斷是否為「已付款待審核」
      let displayStatus = s.status;
      let statusClass = statusClasses[s.status] || "status-secondary";
      if (s.status === "PENDING_PAYMENT" && s.paymentProof) {
        displayStatus = "待審核";
        statusClass = "status-PENDING"; // 保持黃色但文字不同
      }

      // 發票狀態
      let inv = '<span class="text-gray-400">-</span>';
      if (s.invoiceNumber)
        inv = `<span class="text-success"><i class="fas fa-file-invoice"></i> ${s.invoiceNumber}</span>`;

      // 序列化物件
      const sStr = encodeURIComponent(JSON.stringify(s));

      tr.innerHTML = `
        <td><input type="checkbox" class="ship-checkbox" value="${s.id}"></td>
        <td><strong>${s.id.slice(-8).toUpperCase()}</strong></td>
        <td>${new Date(s.createdAt).toLocaleDateString()}</td>
        <td>${s.user?.email}</td>
        <td>${s.recipientName}</td>
        <td><span class="text-danger font-weight-bold">NT$ ${s.totalCost.toLocaleString()}</span></td>
        <td>${inv}</td>
        <td><span class="status-badge ${statusClass}">${displayStatus}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openModal('${sStr}')">詳情</button>
        </td>
      `;
      tr.querySelector(".ship-checkbox").addEventListener("change", (e) =>
        toggleSelection(s.id, e.target.checked)
      );
      tbody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    paginationDiv.innerHTML = "";
    if (pg.totalPages <= 1) return;
    const btn = (t, p) => {
      const b = document.createElement("button");
      b.className = "btn btn-sm btn-light";
      b.textContent = t;
      b.onclick = () => {
        currentPage = p;
        loadShipments();
      };
      return b;
    };
    if (currentPage > 1) paginationDiv.appendChild(btn("<", currentPage - 1));
    const span = document.createElement("span");
    span.className = "btn btn-sm btn-primary";
    span.textContent = `${currentPage} / ${pg.totalPages}`;
    paginationDiv.appendChild(span);
    if (currentPage < pg.totalPages)
      paginationDiv.appendChild(btn(">", currentPage + 1));
  }

  // --- Modal 操作 ---
  window.openModal = function (str) {
    const s = JSON.parse(decodeURIComponent(str));
    document.getElementById("edit-shipment-id").value = s.id;
    document.getElementById("m-recipient").textContent = s.recipientName;
    document.getElementById("m-phone").textContent = s.phone;
    document.getElementById("m-address").textContent = s.shippingAddress;
    document.getElementById("m-id").textContent = s.idNumber;
    document.getElementById("m-user").textContent =
      s.user?.name || s.user?.email;

    document.getElementById("m-packages").innerHTML = s.packages
      .map(
        (p) =>
          `<div style="font-size:0.9em;">📦 ${p.productName} (${p.trackingNumber})</div>`
      )
      .join("");

    document.getElementById("m-status").value = s.status;
    document.getElementById("m-cost").value = s.totalCost;
    document.getElementById("m-tracking-tw").value = s.trackingNumberTW || "";

    const proofDiv = document.getElementById("m-proof");
    if (s.paymentProof) {
      proofDiv.innerHTML = `<a href="${API_BASE_URL}${s.paymentProof}" target="_blank"><img src="${API_BASE_URL}${s.paymentProof}" style="height:100px; border:1px solid #ccc;"></a>`;
    } else {
      proofDiv.innerHTML = "尚未上傳";
    }

    modal.style.display = "flex";
  };

  async function handleUpdate(e) {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const data = {
      status: document.getElementById("m-status").value,
      totalCost: document.getElementById("m-cost").value,
      trackingNumberTW: document.getElementById("m-tracking-tw").value,
    };

    // 特殊邏輯：如果是 Cancelled，需要 confirm
    if (
      data.status === "CANCELLED" &&
      !confirm("確定取消訂單？包裹將釋放回入庫狀態。")
    )
      return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/shipments/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        alert("更新成功");
        modal.style.display = "none";
        loadShipments();
      } else {
        alert("失敗");
      }
    } catch (e) {
      alert("錯誤");
    }
  }

  // --- 批量邏輯 ---
  function toggleSelection(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkUI();
  }
  function updateBulkUI() {
    const count = selectedIds.size;
    const span = document.getElementById("selected-count");
    span.textContent = `已選 ${count} 筆`;
    span.style.display = count > 0 ? "inline" : "none";
    document.getElementById("btn-bulk-process").style.display =
      count > 0 ? "inline-block" : "none";
    document.getElementById("btn-bulk-delete").style.display =
      count > 0 ? "inline-block" : "none";
  }

  async function performBulkAction(status) {
    if (!confirm(`確定將 ${selectedIds.size} 筆訂單改為 ${status}?`)) return;
    // 呼叫後端 API (略，需後端支援)
    alert("功能尚未連接後端");
  }

  async function performBulkDelete() {
    if (!confirm(`確定刪除 ${selectedIds.size} 筆?`)) return;
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
      if (res.ok) {
        alert("刪除成功");
        loadShipments();
      }
    } catch (e) {
      alert("錯誤");
    }
  }

  window.printShipment = function () {
    const id = document.getElementById("edit-shipment-id").value;
    window.open(`shipment-print.html?id=${id}`, "_blank");
  };
});
