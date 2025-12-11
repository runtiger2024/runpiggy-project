// frontend/js/admin-shipments.js
// V2025.Features.Enhanced - Impersonate & Notifications & Status Counts & Manual Price Adjustment

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
  const statusFilterSelect = document.getElementById("status-filter");

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
    const selectAll = document.getElementById("select-all");
    if (selectAll) {
      selectAll.addEventListener("change", (e) => {
        document.querySelectorAll(".ship-checkbox").forEach((cb) => {
          cb.checked = e.target.checked;
          toggleSelection(cb.value, e.target.checked);
        });
      });
    }

    // 批量按鈕
    const btnBulkProcess = document.getElementById("btn-bulk-process");
    if (btnBulkProcess) {
      btnBulkProcess.addEventListener("click", () =>
        performBulkAction("PROCESSING")
      );
    }

    const btnBulkDelete = document.getElementById("btn-bulk-delete");
    if (btnBulkDelete) {
      btnBulkDelete.addEventListener("click", performBulkDelete);
    }

    // 點擊 Modal 外部關閉
    window.onclick = function (event) {
      const priceModal = document.getElementById("adjust-price-modal");
      if (event.target === modal) {
        modal.style.display = "none";
      }
      if (event.target === priceModal) {
        priceModal.style.display = "none";
      }
    };

    loadShipments();
  }

  // --- [New] 更新下拉選單數字 ---
  function updateStatusCounts(counts) {
    if (!counts) return;
    const options = statusFilterSelect.options;
    const total = counts["ALL"] || 0;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const statusKey = opt.value;

      // 保存原始文字以便重複更新
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

  async function loadShipments() {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center p-3">載入中...</td></tr>';
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

      // [New] 更新狀態數量
      if (data.statusCounts) {
        updateStatusCounts(data.statusCounts);
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-3">錯誤: ${e.message}</td></tr>`;
    }
  }

  function renderTable(shipments) {
    tbody.innerHTML = "";
    if (shipments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center p-3">無資料</td></tr>';
      return;
    }

    // [Update] V2025.Color-Optimized: 更新為高對比色 Class
    const statusClasses = {
      PENDING_PAYMENT: "status-PENDING_PAYMENT", // 橘色 (催款)
      PENDING_REVIEW: "status-PENDING_REVIEW", // 紫色 (待審)
      PROCESSING: "status-PROCESSING", // 青色
      SHIPPED: "status-SHIPPED", // 藍色
      CUSTOMS_CHECK: "status-CUSTOMS_CHECK", // 黃色
      UNSTUFFING: "status-UNSTUFFING", // 湖水綠
      COMPLETED: "status-COMPLETED", // 墨綠
      RETURNED: "status-RETURNED", // 紅
      CANCELLED: "status-CANCELLED", // 紅
    };

    const statusMap = {
      PENDING_PAYMENT: "待付款",
      PENDING_REVIEW: "已付款(待審核)",
      PROCESSING: "已收款(處理中)",
      SHIPPED: "已裝櫃",
      CUSTOMS_CHECK: "海關查驗中",
      UNSTUFFING: "拆櫃派送中",
      COMPLETED: "已完成",
      RETURNED: "訂單退回",
      CANCELLED: "已取消",
    };

    shipments.forEach((s) => {
      const tr = document.createElement("tr");
      let displayStatus = statusMap[s.status] || s.status;
      let statusClass =
        statusClasses[s.status] || "status-secondary"; /* Fallback */

      // 特殊邏輯：若狀態是 待付款 但有上傳截圖，則顯示待審核 (黃->紫)
      if (s.status === "PENDING_PAYMENT" && s.paymentProof) {
        displayStatus = "待審核";
        statusClass = "status-PENDING_REVIEW"; // 覆寫為紫色
      }

      // --- 發票狀態欄位 ---
      let invHtml = `<span class="badge" style="background:#e0e0e0; color:#888; padding:2px 6px; font-size:12px; border-radius:4px;">未開立</span>`;

      if (s.paymentProof === "WALLET_PAY") {
        invHtml = `<span class="badge" style="background:#cce5ff; color:#004085; padding:2px 6px; font-size:12px; border-radius:4px;">
                      <i class="fas fa-wallet"></i> 儲值已開
                    </span>`;
      } else if (s.invoiceStatus === "ISSUED" && s.invoiceNumber) {
        invHtml = `<span class="badge" style="background:#d4edda; color:#155724; padding:2px 6px; font-size:12px; border-radius:4px;">
                      <i class="fas fa-check"></i> 已開立<br>${s.invoiceNumber}
                    </span>`;
      } else if (s.invoiceStatus === "VOID") {
        invHtml = `<span class="badge" style="background:#f8d7da; color:#721c24; padding:2px 6px; font-size:12px; border-radius:4px;">
                      <i class="fas fa-ban"></i> 已作廢
                    </span>`;
      }

      const sStr = encodeURIComponent(JSON.stringify(s));
      // [NEW] 模擬登入資訊準備
      const userName = s.user ? s.user.name || s.user.email : "未知";
      const userId = s.userId;

      // [New] 改價按鈕顯示邏輯 (已完成或已取消通常不改價)
      const canAdjustPrice =
        s.status !== "COMPLETED" && s.status !== "CANCELLED";
      const adjustPriceBtn = canAdjustPrice
        ? `<button class="btn btn-warning btn-sm" onclick="window.openAdjustPriceModal('${s.id}', ${s.totalCost})" title="修改金額"><i class="fas fa-dollar-sign"></i></button>`
        : "";

      tr.innerHTML = `
        <td><input type="checkbox" class="ship-checkbox" value="${s.id}"></td>
        <td data-label="訂單號"><strong>${s.id
          .slice(-8)
          .toUpperCase()}</strong></td>
        <td data-label="建立時間">${new Date(
          s.createdAt
        ).toLocaleDateString()}</td>
        <td data-label="會員/收件人">
          <div>${s.recipientName}</div>
          <small class="text-muted" style="cursor:pointer;" title="點擊模擬登入" onclick="window.impersonateUser('${userId}', '${userName}')">
            <i class="fas fa-user-circle"></i> ${s.user?.email}
          </small>
        </td>
        <td data-label="總金額"><span class="text-danger font-weight-bold">NT$ ${s.totalCost.toLocaleString()}</span></td>
        <td data-label="發票狀態">${invHtml}</td>
        <td data-label="訂單狀態"><span class="status-badge ${statusClass}">${displayStatus}</span></td>
        <td data-label="操作">
          <div style="display:flex; gap:5px; justify-content:flex-end;">
            ${adjustPriceBtn}
            <button class="btn btn-primary btn-sm" onclick="openModal('${sStr}')">管理</button>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.impersonateUser('${userId}', '${userName}')" title="模擬登入前台">
               <i class="fas fa-key"></i>
            </button>
          </div>
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

  // --- [New] 人工改價功能 ---
  window.openAdjustPriceModal = function (id, currentPrice) {
    document.getElementById("adjust-shipment-id").value = id;
    document.getElementById("adjust-original-price").value = currentPrice;
    document.getElementById("adjust-new-price").value = currentPrice; // 預設填入當前價格
    document.getElementById("adjust-reason").value = ""; // 清空原因
    document.getElementById("adjust-price-modal").style.display = "flex";
  };

  window.closeAdjustPriceModal = function () {
    document.getElementById("adjust-price-modal").style.display = "none";
  };

  window.confirmAdjustPrice = async function () {
    const id = document.getElementById("adjust-shipment-id").value;
    const newPrice = document.getElementById("adjust-new-price").value;
    const reason = document.getElementById("adjust-reason").value;

    if (!newPrice || newPrice < 0) {
      alert("請輸入有效的金額");
      return;
    }
    if (!reason || reason.trim() === "") {
      alert("請填寫調整原因");
      return;
    }

    if (
      !confirm(
        `確定要將金額從 $${
          document.getElementById("adjust-original-price").value
        } 調整為 $${newPrice} 嗎？\n此操作不可撤銷。`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/price`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newPrice: parseFloat(newPrice), reason }),
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        window.closeAdjustPriceModal();
        loadShipments();
      } else {
        alert(data.message || "調整失敗");
      }
    } catch (error) {
      console.error(error);
      alert("系統錯誤，調整失敗");
    }
  };

  // --- [New] 模擬登入功能 ---
  window.impersonateUser = async function (userId, name) {
    if (
      !confirm(
        `確定要模擬「${name}」登入前台嗎？\n(將開啟新視窗並以該會員身分操作)`
      )
    )
      return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();

      if (res.ok) {
        const win = window.open("index.html", "_blank");
        setTimeout(() => {
          if (win) {
            try {
              win.localStorage.setItem("token", data.token);
              win.localStorage.setItem(
                "userName",
                data.user.name || data.user.email
              );
              win.location.href = "dashboard.html";
            } catch (e) {
              console.warn("無法自動寫入 localStorage", e);
            }
          }
        }, 800);
      } else {
        alert("模擬失敗: " + (data.message || "權限不足"));
      }
    } catch (err) {
      alert("錯誤: " + err.message);
    }
  };

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

    // [Sync] 這裡會自動帶入後端傳來的 taxId 與 invoiceTitle
    document.getElementById("m-tax-id").value = s.taxId || "";
    document.getElementById("m-invoice-title").value = s.invoiceTitle || "";

    const dateInput = document.getElementById("m-loading-date");
    if (dateInput) {
      if (s.loadingDate) {
        dateInput.value = new Date(s.loadingDate).toISOString().split("T")[0];
      } else {
        dateInput.value = "";
      }
    }

    document.getElementById("m-packages").innerHTML = s.packages
      .map(
        (p) =>
          `<div style="font-size:0.9em;">📦 ${p.productName} (${p.trackingNumber})</div>`
      )
      .join("");

    document.getElementById("m-status").value = s.status;
    document.getElementById("m-cost").value = s.totalCost;
    document.getElementById("m-tracking-tw").value = s.trackingNumberTW || "";

    const costInput = document.getElementById("m-cost");
    if (
      s.invoiceStatus === "ISSUED" &&
      s.invoiceNumber &&
      s.invoiceStatus !== "VOID"
    ) {
      costInput.disabled = true;
      costInput.title = "發票已開立，禁止修改金額。請先作廢發票。";
      costInput.style.backgroundColor = "#e9ecef";
    } else {
      costInput.disabled = false;
      costInput.style.backgroundColor = "";
      costInput.title = "";
    }

    const proofDiv = document.getElementById("m-proof");
    if (s.paymentProof === "WALLET_PAY") {
      proofDiv.innerHTML = `<span class="badge" style="background:#cce5ff; color:#004085; font-size:14px; padding:10px; display:inline-block; border:1px solid #b8daff;">
        <i class="fas fa-wallet"></i> 使用錢包餘額扣款
      </span>`;
    } else if (s.paymentProof) {
      proofDiv.innerHTML = `<a href="${API_BASE_URL}${s.paymentProof}" target="_blank"><img src="${API_BASE_URL}${s.paymentProof}" style="height:100px; border:1px solid #ccc;"></a>`;
    } else {
      proofDiv.innerHTML = "尚未上傳";
    }

    const invSection = document.getElementById("invoice-management-section");
    invSection.innerHTML = "";
    invSection.style.cssText =
      "margin-top:15px; padding:15px; border:1px solid #bce8f1; background:#d9edf7; border-radius:5px;";

    let invContent = `<h5 style="margin-top:0; color:#31708f; font-size:1rem; margin-bottom:10px;"><i class="fas fa-file-invoice"></i> 電子發票管理</h5>`;

    if (s.invoiceStatus === "ISSUED" && s.invoiceNumber) {
      invContent += `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
              <span class="text-success font-weight-bold">✅ 已開立</span><br>
              號碼：<strong>${s.invoiceNumber}</strong><br>
              隨機碼：${s.invoiceRandomCode || "-"}
          </div>
          <button type="button" class="btn btn-danger btn-sm" onclick="handleVoidInvoice('${
            s.id
          }', '${s.invoiceNumber}')">
              <i class="fas fa-ban"></i> 作廢發票
          </button>
        </div>`;
    } else if (s.invoiceStatus === "VOID") {
      invContent += `
        <div class="text-danger font-weight-bold">
          <i class="fas fa-times-circle"></i> 此發票已作廢 (${s.invoiceNumber})
        </div>`;
    } else {
      if (s.paymentProof === "WALLET_PAY") {
        invContent += `
            <div style="background:#fff3cd; color:#856404; padding:10px; border-radius:5px; border:1px solid #ffeeba;">
                <i class="fas fa-wallet"></i> <strong>錢包支付訂單</strong><br>
                <span style="font-size:13px;">此訂單使用餘額扣款，發票已於會員儲值時開立。<br>無需在此重複開立。</span>
            </div>`;
      } else {
        invContent += `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="text-muted">尚未開立發票</span>
              <button type="button" class="btn btn-success btn-sm" onclick="handleIssueInvoice('${s.id}')">
                  <i class="fas fa-paper-plane"></i> 立即開立
              </button>
            </div>
            <small class="text-muted" style="display:block; margin-top:5px;">* 點擊後將立即串接 AMEGO 開立並更新狀態。</small>`;
      }
    }
    invSection.innerHTML = invContent;

    const btnReturn = document.getElementById("btn-return-shipment");
    if (btnReturn) {
      if (s.status !== "CANCELLED" && s.status !== "RETURNED") {
        btnReturn.style.display = "inline-block";
        btnReturn.onclick = () => handleReturnShipment(s.id);
      } else {
        btnReturn.style.display = "none";
      }
    }

    modal.style.display = "flex";
  };

  window.handleReturnShipment = async function (id) {
    const reason = prompt(
      "請輸入退回原因 (客戶可見)：\n例如：包裹違禁品、金額有誤、客戶要求...",
      "資料有誤，請修正後重新提交"
    );
    if (reason === null) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/reject`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
          },
          body: JSON.stringify({ returnReason: reason }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        document.getElementById("shipment-modal").style.display = "none";
        loadShipments();
      } else {
        alert("失敗: " + data.message);
      }
    } catch (e) {
      alert("網路錯誤");
    }
  };

  window.handleIssueInvoice = async function (id) {
    if (!confirm("確定要開立電子發票嗎？\n(將傳送資料至 AMEGO)")) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/invoice/issue`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(`成功！發票號碼：${data.invoiceNumber}`);
        modal.style.display = "none";
        loadShipments();
      } else {
        alert(`失敗：${data.message}`);
      }
    } catch (e) {
      alert("連線錯誤");
    }
  };

  window.handleVoidInvoice = async function (id, invNum) {
    const reason = prompt(
      `確定要作廢發票 ${invNum} 嗎？\n請輸入作廢原因：`,
      "訂單取消/金額異動"
    );
    if (!reason) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/invoice/void`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ reason }),
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert("發票已作廢，現在可以修改金額了。");
        modal.style.display = "none";
        loadShipments();
      } else {
        alert(`作廢失敗：${data.message}`);
      }
    } catch (e) {
      alert("連線錯誤");
    }
  };

  async function handleUpdate(e) {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const data = {
      status: document.getElementById("m-status").value,
      totalCost: document.getElementById("m-cost").value,
      trackingNumberTW: document.getElementById("m-tracking-tw").value,
      taxId: document.getElementById("m-tax-id").value.trim(),
      invoiceTitle: document.getElementById("m-invoice-title").value.trim(),
      loadingDate: document.getElementById("m-loading-date")
        ? document.getElementById("m-loading-date").value
        : undefined,
    };

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
      const resData = await res.json();

      if (res.ok) {
        alert("更新成功");
        modal.style.display = "none";
        loadShipments();
      } else {
        alert("更新失敗：" + resData.message);
      }
    } catch (e) {
      alert("錯誤：" + e.message);
    }
  }

  function toggleSelection(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkUI();
  }
  function updateBulkUI() {
    const count = selectedIds.size;
    const span = document.getElementById("selected-count");
    if (span) {
      span.textContent = `已選 ${count} 筆`;
      span.style.display = count > 0 ? "inline" : "none";
    }

    const btnProcess = document.getElementById("btn-bulk-process");
    if (btnProcess)
      btnProcess.style.display = count > 0 ? "inline-block" : "none";

    const btnDelete = document.getElementById("btn-bulk-delete");
    if (btnDelete)
      btnDelete.style.display = count > 0 ? "inline-block" : "none";
  }

  async function performBulkAction(status) {
    if (!confirm(`確定將 ${selectedIds.size} 筆訂單改為「${status}」?`)) return;
    if (
      status === "PROCESSING" &&
      !confirm(
        "注意：轉為已收款 (PROCESSING) 狀態將自動檢查並開立電子發票。\n確定繼續？"
      )
    )
      return;

    try {
      const btn = document.getElementById("btn-bulk-process");
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "處理中...";

      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/bulk-status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds), status }),
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        loadShipments();
      } else {
        alert(`失敗: ${data.message}`);
      }
      btn.disabled = false;
      btn.textContent = originalText;
    } catch (e) {
      alert("錯誤");
      const btn = document.getElementById("btn-bulk-process");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "批量確認收款";
      }
    }
  }

  async function performBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return alert("請先選擇要刪除的訂單");

    const confirmation = prompt(
      `【危險操作】\n您即將永久刪除 ${count} 筆集運單。\n注意：這將連帶刪除付款憑證與關聯的包裹紀錄(釋放)，且無法復原！\n\n請輸入 "DELETE" (大寫) 以確認刪除：`
    );

    if (confirmation !== "DELETE") {
      if (confirmation !== null) {
        alert("輸入內容不正確，已取消刪除操作。");
      }
      return;
    }

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
        alert(`已成功刪除 ${count} 筆訂單。`);
        loadShipments();
      } else {
        const data = await res.json();
        alert("刪除失敗: " + (data.message || "未知錯誤"));
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
