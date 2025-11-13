// 這是 frontend/js/admin-shipments.js (最終完整版：含備註與憑證查看)

document.addEventListener("DOMContentLoaded", () => {
  const adminWelcome = document.getElementById("admin-welcome");
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

  let allShipmentsData = [];
  const adminToken = localStorage.getItem("admin_token");

  const shipmentStatusMap = {
    PENDING_PAYMENT: "等待付款",
    PROCESSING: "處理中",
    SHIPPED: "已出貨",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  if (!adminToken) {
    alert("請先登入管理員");
    window.location.href = "admin-login.html";
    return;
  }

  const adminName = localStorage.getItem("admin_name");
  if (adminName) adminWelcome.textContent = `你好, ${adminName}`;

  // --- (A) 載入集運單 ---
  async function loadAllShipments() {
    shipmentsTableBody.innerHTML =
      '<tr><td colspan="7" class="loading"><div class="spinner"></div><p>載入集運單資料中...</p></td></tr>';
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/shipments/all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401) window.location.href = "admin-login.html";
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

  // --- (B) 渲染列表 ---
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
      const statusText = shipmentStatusMap[ship.status] || ship.status;
      const tr = document.createElement("tr");

      // 判斷是否有憑證 (用於提示)
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

  // --- (C) 開啟彈窗 ---
  function openShipmentModal(ship) {
    document.getElementById("edit-shipment-id").value = ship.id;
    document.getElementById("modal-user-email").textContent = ship.user.email;
    document.getElementById("modal-recipient-name").textContent =
      ship.recipientName;
    document.getElementById("modal-phone").textContent = ship.phone;
    document.getElementById("modal-idNumber").textContent = ship.idNumber;
    document.getElementById("modal-address").textContent = ship.shippingAddress;

    // [新增] 顯示備註
    const noteEl = document.getElementById("modal-note");
    if (noteEl) noteEl.textContent = ship.note || "(無)";

    // [新增] 顯示付款憑證
    const proofEl = document.getElementById("modal-payment-proof");
    if (proofEl) {
      if (ship.paymentProof) {
        // 產生可點擊的連結
        proofEl.innerHTML = `<a href="${API_BASE_URL}${ship.paymentProof}" target="_blank" style="color: #1a73e8; font-weight: bold; text-decoration: underline;">點擊查看憑證圖片</a>`;
      } else {
        proofEl.textContent = "尚未上傳";
      }
    }

    // 顯示包裹列表
    shipmentPackageList.innerHTML = ship.packages
      .map((p) => `<p>${p.productName} (<b>${p.trackingNumber}</b>)</p>`)
      .join("");

    // 顯示附加服務 (固定為無)
    modalServices.innerHTML = "<p>(無附加服務)</p>";

    // 回填表單
    document.getElementById("modal-status").value = ship.status;
    document.getElementById("modal-totalCost").value = ship.totalCost || "";
    document.getElementById("modal-trackingNumberTW").value =
      ship.trackingNumberTW || "";

    modal.style.display = "flex";
  }

  // --- (D) 關閉彈窗 ---
  closeModalBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // --- (E) 提交更新 ---
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const status = document.getElementById("modal-status").value;
    const submitBtn = updateForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "處理中...";

    try {
      let response;

      // 如果是取消訂單，呼叫退回 API
      if (status === "CANCELLED") {
        if (
          !confirm(
            "確定要取消此集運單？\n\n這將會釋放所有包裹回到「已入庫」狀態，讓客戶可以重新申請。"
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
        // 一般更新
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

      if (!response.ok) throw new Error("更新失敗");

      modal.style.display = "none";
      alert("集運單更新成功");
      loadAllShipments();
    } catch (error) {
      alert(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "儲存集運單變更";
    }
  });

  // --- (F) 登出 ---
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定登出？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  // --- (G) 篩選 ---
  filterBtn.addEventListener("click", () => renderShipments());

  // 初始載入
  loadAllShipments();
});
