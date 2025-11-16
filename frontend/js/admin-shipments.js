// 這是 frontend/js/admin-shipments.js (V5 狀態標籤 + V3 權限 統一版)

document.addEventListener("DOMContentLoaded", () => {
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

  // --- 1. 獲取元素 ---
  const logoutBtn = document.getElementById("logoutBtn");
  const shipmentsTableBody = document.getElementById("shipmentsTableBody");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");
  const modal = document.getElementById("edit-shipment-modal");
  const closeModalBtn = modal.querySelector(".modal-close");
  const updateForm = document.getElementById("edit-shipment-form");
  const shipmentPackageList = document.getElementById("modal-package-list");
  const modalServices = document.getElementById("modal-services");

  // --- 2. 狀態變數 ---
  let allShipmentsData = [];

  // [*** V5 關鍵修正：統一狀態 ***]
  // (此定義基於 admin-shipments.html 的下拉選單)
  const shipmentStatusMap = {
    PENDING_PAYMENT: "待付款",
    PROCESSING: "已收款，安排裝櫃",
    SHIPPED: "已裝櫃",
    COMPLETED: "海關查驗",
    CANCELLEDD: "清關放行", // (保留錯字鍵名)
    CANCELL: "拆櫃派送", // (保留錯字鍵名)
    CANCEL: "已完成", // (保留錯字鍵名)
    CANCELLED: "已取消/退回", // (這是"取消"的狀態)
  };
  // [*** 修正結束 ***]

  // --- 4. 函式定義 ---

  // (A) 載入集運單
  async function loadAllShipments() {
    shipmentsTableBody.innerHTML =
      '<tr><td colspan="7" class="loading"><div class="spinner"></div><p>載入集運單資料中...</p></td></tr>';
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/shipments/all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert("登入已過期或權限不足");
          window.location.href = "admin-login.html";
        }
        throw new Error("載入失敗");
      }
      const data = await response.json();
      allShipmentsData = data.shipments || [];
      renderShipments();
    } catch (error) {
      console.error(error);
      shipmentsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">載入失敗</td></tr>`;
    }
  }

  // (B) 渲染列表
  function renderShipments() {
    shipmentsTableBody.innerHTML = "";
    const status = filterStatus.value;
    const search = searchInput.value.toLowerCase();

    const filtered = allShipmentsData.filter((ship) => {
      const statusMatch = !status || ship.status === status;
      const searchMatch =
        !search ||
        ship.recipientName.toLowerCase().includes(search) ||
        ship.user.email.toLowerCase().includes(search) ||
        (ship.idNumber && ship.idNumber.toLowerCase().includes(search));
      return statusMatch && searchMatch;
    });

    if (filtered.length === 0) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align: center;">無符合資料</td></tr>';
      return;
    }

    filtered.forEach((ship) => {
      // [*** V5 修正 ***] 使用統一的 map
      const statusText = shipmentStatusMap[ship.status] || ship.status;
      const tr = document.createElement("tr");

      // [修改] 賦予 tr 一個唯一的 DOM ID
      tr.id = `shipment-row-${ship.id}`;

      // 判斷是否有憑證
      const hasProof = ship.paymentProof ? " (有憑證)" : "";

      tr.innerHTML = `
        <td><button class="btn btn-secondary btn-sm btn-view-details">查看/編輯</button></td>
        <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
        <td>${ship.user.email}</td>
        <td>${ship.recipientName}</td>
        <td><span class="status-badge status-${
          ship.status
        }">${statusText}${hasProof}</span></td>
        <td>${
          ship.totalCost ? `NT$ ${ship.totalCost.toLocaleString()}` : "(待報價)"
        }</td>
        <td>${ship.trackingNumberTW || "-"}</td>
      `;
      tr.querySelector(".btn-view-details").addEventListener("click", () =>
        openShipmentModal(ship)
      );
      shipmentsTableBody.appendChild(tr);
    });
  }

  // (AJAX 優化) 只更新列表中的單一一列
  function updateShipmentInList(ship) {
    // 1. 更新 master data
    const index = allShipmentsData.findIndex((s) => s.id === ship.id);
    if (index !== -1) {
      // 合併資料 (保留 user 和 packages)
      allShipmentsData[index] = { ...allShipmentsData[index], ...ship };
    }

    // 2. 更新 DOM
    const tr = document.getElementById(`shipment-row-${ship.id}`);
    if (!tr) return;

    // 3. 重新產生儲存格內容
    // [*** V5 修正 ***] 使用統一的 map
    const statusText = shipmentStatusMap[ship.status] || ship.status;
    const hasProof = ship.paymentProof ? " (有憑證)" : "";

    tr.cells[4].innerHTML = `<span class="status-badge status-${ship.status}">${statusText}${hasProof}</span>`;
    tr.cells[5].textContent = ship.totalCost
      ? `NT$ ${ship.totalCost.toLocaleString()}`
      : "(待報價)";
    tr.cells[6].textContent = ship.trackingNumberTW || "-";
  }

  // (C) 開啟彈窗
  function openShipmentModal(ship) {
    document.getElementById("edit-shipment-id").value = ship.id;
    document.getElementById("modal-user-email").textContent = ship.user.email;
    document.getElementById("modal-recipient-name").textContent =
      ship.recipientName;
    document.getElementById("modal-phone").textContent = ship.phone;
    document.getElementById("modal-idNumber").textContent = ship.idNumber;
    document.getElementById("modal-address").textContent = ship.shippingAddress;

    const noteEl = document.getElementById("modal-note");
    if (noteEl) noteEl.textContent = ship.note || "(無)";

    const proofEl = document.getElementById("modal-payment-proof");
    if (proofEl) {
      if (ship.paymentProof) {
        proofEl.innerHTML = `<a href="${API_BASE_URL}${ship.paymentProof}" target="_blank" style="color: #1a73e8; font-weight: bold; text-decoration: underline;">點擊查看憑證圖片</a>`;
      } else {
        proofEl.textContent = "尚未上傳";
      }
    }

    shipmentPackageList.innerHTML = ship.packages
      .map((p) => `<p>${p.productName} (<b>${p.trackingNumber}</b>)</p>`)
      .join("");
    modalServices.innerHTML = "<p>(無附加服務)</p>";

    document.getElementById("modal-status").value = ship.status;
    document.getElementById("modal-totalCost").value = ship.totalCost || "";
    document.getElementById("modal-trackingNumberTW").value =
      ship.trackingNumberTW || "";

    modal.style.display = "flex";
  }

  // (D) 關閉彈窗
  closeModalBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // (E) 提交更新
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const status = document.getElementById("modal-status").value;
    const submitBtn = updateForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "處理中...";

    try {
      let response;

      if (status === "CANCELLED") {
        if (
          !confirm(
            "確定要取消此集運單？\n\n這將會釋放所有包裹回到「已入庫」狀態。"
          )
        ) {
          submitBtn.disabled = false;
          submitBtn.textContent = "儲存集運單變更";
          return;
        }
        response = await fetch(
          `${API_BASE_URL}/api/admin/shipments/${id}/reject`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        );
      } else {
        const data = {
          status: status,
          totalCost: document.getElementById("modal-totalCost").value,
          trackingNumberTW: document.getElementById("modal-trackingNumberTW")
            .value,
        };
        response = await fetch(`${API_BASE_URL}/api/admin/shipments/${id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
      }

      const result = await response.json(); // [修改] 取得回傳資料
      if (!response.ok) throw new Error(result.message || "更新失敗");

      modal.style.display = "none";
      alert("集運單更新成功");

      // --- [AJAX 優化邏輯] ---
      if (status === "CANCELLED") {
        // 1. 取消訂單會影響包裹狀態，最好是重新載入
        loadAllShipments();
      } else {
        // 2. 否則，只更新這一列
        updateShipmentInList(result.shipment);
      }
      // --- [優化結束] ---
    } catch (error) {
      alert(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "儲存集運單變更";
    }
  });

  // (F) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定登出？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      localStorage.removeItem("admin_permissions"); // [*** V3 修正 ***]
      window.location.href = "admin-login.html";
    }
  });

  // (G) 篩選
  filterBtn.addEventListener("click", () => renderShipments());

  // 初始載入
  loadAllShipments();
});
