// 這是 frontend/js/admin-shipments.js (修復了 ID 錯誤)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 (*** 這是修復 ***) ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const shipmentsTableBody = document.getElementById("shipmentsTableBody");

  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");

  // 彈窗 (Modal)
  const modal = document.getElementById("edit-shipment-modal");
  const closeModalBtn = modal.querySelector(".modal-close"); // <-- (修復 1：從 modal 內部找)
  const updateForm = document.getElementById("edit-shipment-form");

  // 彈窗內部的元素
  const shipmentPackageList = document.getElementById("modal-package-list"); // <-- (修復 2：修正 ID)
  const modalServices = document.getElementById("modal-services"); // <-- (新) 取得服務元素

  // --- 2. 狀態變數 ---
  let allShipmentsData = []; // 儲存所有集運單
  const adminToken = localStorage.getItem("admin_token");

  const shipmentStatusMap = {
    PENDING_PAYMENT: "等待付款",
    PROCESSING: "處理中",
    SHIPPED: "已出貨",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // --- 3. 初始化 (檢查登入) ---
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return;
  }

  const adminName = localStorage.getItem("admin_name");
  if (adminName) {
    adminWelcome.textContent = `你好, ${adminName}`;
  }

  // --- 4. 函式定義 ---

  // (A) 載入所有集運單 (呼叫 GET /api/admin/shipments/all)
  async function loadAllShipments() {
    shipmentsTableBody.innerHTML =
      '<tr><td colspan="7" class="loading"><div class="spinner"></div><p>載入集運單資料中...</p></td></tr>';

    try {
      const response = await fetch(
        "http://localhost:3000/api/admin/shipments/all",
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "admin-login.html";
        }
        throw new Error("載入集運單失敗");
      }

      const data = await response.json();
      allShipmentsData = data.shipments || [];

      renderShipments(); // 顯示所有集運單
    } catch (error) {
      console.error("載入集運單列表失敗:", error);
      shipmentsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">載入失敗: ${error.message}</td></tr>`;
    }
  }

  // (B) 渲染集運單列表
  function renderShipments() {
    shipmentsTableBody.innerHTML = ""; // 清空

    const status = filterStatus.value;
    const search = searchInput.value.toLowerCase();

    const filteredShipments = allShipmentsData.filter((ship) => {
      const statusMatch = !status || ship.status === status;
      const searchMatch =
        !search ||
        ship.recipientName.toLowerCase().includes(search) ||
        ship.user.email.toLowerCase().includes(search) ||
        ship.idNumber.toLowerCase().includes(search);
      return statusMatch && searchMatch;
    });

    if (filteredShipments.length === 0) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align: center;">找不到符合條件的集運單</td></tr>';
      return;
    }

    filteredShipments.forEach((ship) => {
      const statusText = shipmentStatusMap[ship.status] || ship.status;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <button class="btn btn-secondary btn-sm btn-view-details">查看/編輯</button>
        </td>
        <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
        <td>${ship.user.email}</td>
        <td>${ship.recipientName}</td>
        <td><span class="status-badge status-${
          ship.status
        }">${statusText}</span></td>
        <td>${
          ship.totalCost ? `NT$ ${ship.totalCost.toLocaleString()}` : "(待報價)"
        }</td>
        <td>${ship.trackingNumberTW || "-"}</td>
      `;

      // 幫 "查看/編輯" 按鈕綁定事件
      tr.querySelector(".btn-view-details").addEventListener("click", () => {
        openShipmentModal(ship);
      });

      shipmentsTableBody.appendChild(tr);
    });
  }

  // (C) 打開集運單彈窗 (Modal)
  function openShipmentModal(ship) {
    // 1. 填入資料
    document.getElementById("edit-shipment-id").value = ship.id;

    // 唯讀資訊
    document.getElementById("modal-user-email").textContent = ship.user.email;
    document.getElementById("modal-recipient-name").textContent =
      ship.recipientName;
    document.getElementById("modal-phone").textContent = ship.phone;
    document.getElementById("modal-idNumber").textContent = ship.idNumber;
    document.getElementById("modal-address").textContent = ship.shippingAddress;

    // 包裹列表
    shipmentPackageList.innerHTML = ship.packages
      .map(
        (
          p // (*** 修復後的變數 ***)
        ) => `<p>${p.productName} (<b>${p.trackingNumber}</b>)</p>`
      )
      .join("");

    // 附加服務
    const services = Object.entries(ship.additionalServices);
    if (
      services.length > 0 &&
      services.some(([key, value]) => value === true)
    ) {
      modalServices.innerHTML = services
        .map(([key, value]) => {
          if (value === true) return `<p>✓ ${key}</p>`;
        })
        .join("");
    } else {
      modalServices.innerHTML = "<p>(無)</p>";
    }

    // 管理員可填寫欄位
    document.getElementById("modal-status").value = ship.status;
    document.getElementById("modal-totalCost").value = ship.totalCost || "";
    document.getElementById("modal-trackingNumberTW").value =
      ship.trackingNumberTW || "";

    // 2. 顯示彈窗
    modal.style.display = "flex";
  }

  // (D) 關閉彈窗
  closeModalBtn.addEventListener("click", () => {
    // (*** 修復後的變數 ***)
    modal.style.display = "none";
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // (E) (關鍵!) 提交 "更新集運單" 表單
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const shipmentId = document.getElementById("edit-shipment-id").value;
    const submitButton = updateForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    // 收集資料
    const data = {
      status: document.getElementById("modal-status").value,
      totalCost: document.getElementById("modal-totalCost").value || null,
      trackingNumberTW:
        document.getElementById("modal-trackingNumberTW").value || null,
    };

    try {
      // 呼叫 API (PUT /api/admin/shipments/:id)
      const response = await fetch(
        `http://localhost:3000/api/admin/shipments/${shipmentId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "更新失敗");
      }

      modal.style.display = "none"; // 關閉彈窗
      alert("集運單更新成功！");
      loadAllShipments(); // 重新載入列表
    } catch (error) {
      console.error("更新集運單失敗:", error);
      alert(`更新失敗: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "儲存集運單變更";
    }
  });

  // (F) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  // (G) 篩選按鈕
  filterBtn.addEventListener("click", () => {
    renderShipments();
  });

  // --- 5. 初始載入資料 ---
  loadAllShipments();
}); // DOMContentLoaded 結束
