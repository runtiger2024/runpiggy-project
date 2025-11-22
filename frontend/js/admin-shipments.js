// 這是 frontend/js/admin-shipments.js (V8.2 完整版 - 含商品證明顯示與永久刪除)

document.addEventListener("DOMContentLoaded", () => {
  // 1. 權限檢查與初始化
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name");

  function checkAdminPermissions() {
    if (!adminPermissions.includes("CAN_MANAGE_USERS")) {
      const btnNavCreateStaff = document.getElementById("btn-nav-create-staff");
      const btnNavMembers = document.getElementById("btn-nav-members");
      const btnNavLogs = document.getElementById("btn-nav-logs");
      if (btnNavCreateStaff) btnNavCreateStaff.style.display = "none";
      if (btnNavMembers) btnNavMembers.style.display = "none";
      if (btnNavLogs) btnNavLogs.style.display = "none";

      const adminOnlyContent = document.getElementById("admin-only-content");
      if (adminOnlyContent) {
        adminOnlyContent.innerHTML =
          '<h2 style="color: red; text-align: center; padding: 40px;">權限不足</h2>';
      }
    }
  }

  if (!adminToken) {
    alert("未登入");
    window.location.href = "admin-login.html";
    return;
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminName) {
    let role = adminPermissions.includes("CAN_MANAGE_USERS")
      ? "ADMIN"
      : "OPERATOR";
    if (adminPermissions.length === 0) role = "USER";
    adminWelcome.textContent = `你好, ${adminName} (${role})`;
  }

  checkAdminPermissions();

  // --- 2. 獲取元素 ---
  const shipmentsTableBody = document.getElementById("shipmentsTableBody");
  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");
  const modal = document.getElementById("edit-shipment-modal");
  const closeModalBtn = modal.querySelector(".modal-close");
  const updateForm = document.getElementById("edit-shipment-form");
  const shipmentPackageList = document.getElementById("modal-package-list");
  const modalServices = document.getElementById("modal-services");
  const btnPrintShipment = document.getElementById("btn-print-shipment");
  const logoutBtn = document.getElementById("logoutBtn");

  let allShipmentsData = [];

  const shipmentStatusMap = {
    PENDING_PAYMENT: "待付款",
    PROCESSING: "已收款，安排裝櫃",
    SHIPPED: "已裝櫃",
    COMPLETED: "海關查驗",
    CANCELLEDD: "清關放行",
    CANCELL: "拆櫃派送",
    CANCEL: "已完成",
    CANCELLED: "已取消/退回",
  };

  // --- 3. 載入資料列表 ---
  async function loadAllShipments() {
    shipmentsTableBody.innerHTML =
      '<tr><td colspan="7" class="loading"><div class="spinner"></div><p>載入中...</p></td></tr>';
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/shipments/all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!response.ok) throw new Error("載入失敗");
      const data = await response.json();
      allShipmentsData = data.shipments || [];
      renderShipments();
    } catch (error) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:red;">載入失敗</td></tr>';
    }
  }

  function renderShipments() {
    shipmentsTableBody.innerHTML = "";
    const status = filterStatus.value;
    const search = searchInput.value.toLowerCase();

    const filtered = allShipmentsData.filter((ship) => {
      let statusMatch = false;
      if (!status) statusMatch = true;
      else if (status === "PENDING_REVIEW")
        statusMatch = ship.status === "PENDING_PAYMENT" && ship.paymentProof;
      else if (status === "PENDING_PAYMENT")
        statusMatch = ship.status === "PENDING_PAYMENT" && !ship.paymentProof;
      else statusMatch = ship.status === status;

      const searchMatch =
        !search ||
        ship.recipientName.toLowerCase().includes(search) ||
        ship.user.email.toLowerCase().includes(search) ||
        (ship.idNumber && ship.idNumber.toLowerCase().includes(search));

      return statusMatch && searchMatch;
    });

    if (filtered.length === 0) {
      shipmentsTableBody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;">無符合資料</td></tr>';
      return;
    }

    filtered.forEach((ship) => {
      let statusText = shipmentStatusMap[ship.status] || ship.status;
      let statusClass = ship.status;
      if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
        statusText = "已付款，待審核";
        statusClass = "PENDING_REVIEW";
      }

      const tr = document.createElement("tr");
      tr.id = `shipment-row-${ship.id}`;
      tr.innerHTML = `
        <td><button class="btn btn-secondary btn-sm btn-view-details">查看/編輯</button></td>
        <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
        <td>${ship.user.email}</td>
        <td>${ship.recipientName}</td>
        <td><span class="status-badge status-${statusClass}">${statusText}</span></td>
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

  // --- 4. 彈窗操作 (含商品證明邏輯) ---
  async function openShipmentModal(ship) {
    // 為了確保取得完整的 shipmentProductImages，建議重新 fetch 單一筆資料
    let fullShipment = ship;
    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/${ship.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        fullShipment = data.shipment;
      }
    } catch (e) {
      console.warn("Fetching full shipment details failed, using list data.");
    }

    // 填入基本資料
    document.getElementById("edit-shipment-id").value = fullShipment.id;
    document.getElementById("modal-user-email").textContent =
      fullShipment.user.email;
    document.getElementById("modal-recipient-name").textContent =
      fullShipment.recipientName;
    document.getElementById("modal-phone").textContent = fullShipment.phone;
    document.getElementById("modal-idNumber").textContent =
      fullShipment.idNumber;
    document.getElementById("modal-address").textContent =
      fullShipment.shippingAddress;

    const noteEl = document.getElementById("modal-note");
    if (noteEl) noteEl.textContent = fullShipment.note || "(無)";

    const proofEl = document.getElementById("modal-payment-proof");
    if (proofEl) {
      if (fullShipment.paymentProof) {
        proofEl.innerHTML = `<a href="${API_BASE_URL}${fullShipment.paymentProof}" target="_blank" style="color:#1a73e8;font-weight:bold;">查看憑證</a>`;
      } else {
        proofEl.textContent = "尚未上傳";
      }
    }

    // [新增] 顯示商品證明：連結
    const productUrlEl = document.getElementById("modal-product-url");
    if (productUrlEl) {
      if (fullShipment.productUrl) {
        productUrlEl.href = fullShipment.productUrl;
        productUrlEl.textContent = fullShipment.productUrl;
        productUrlEl.style.display = "inline";
      } else {
        productUrlEl.textContent = "(無連結)";
        productUrlEl.removeAttribute("href");
      }
    }

    // [新增] 顯示商品證明：圖片
    const productImagesContainer = document.getElementById(
      "modal-product-images-container"
    );
    if (productImagesContainer) {
      productImagesContainer.innerHTML = "";

      // shipmentProductImages 已經由後端解析為陣列
      const pImages = fullShipment.shipmentProductImages || [];
      if (pImages.length > 0) {
        pImages.forEach((imgUrl) => {
          const img = document.createElement("img");
          img.src = `${API_BASE_URL}${imgUrl}`;
          img.style.width = "80px";
          img.style.height = "80px";
          img.style.objectFit = "cover";
          img.style.marginRight = "5px";
          img.style.border = "1px solid #ccc";
          img.style.borderRadius = "4px";
          img.style.cursor = "pointer";
          img.onclick = () => window.open(img.src, "_blank");
          productImagesContainer.appendChild(img);
        });
      } else {
        productImagesContainer.innerHTML =
          "<small style='color:#999'>無上傳照片</small>";
      }
    }

    // 填入包裹列表
    shipmentPackageList.innerHTML = fullShipment.packages
      .map((p) => `<p>${p.productName} (<b>${p.trackingNumber}</b>)</p>`)
      .join("");
    modalServices.innerHTML = "<p>(無附加服務)</p>";

    // 填入狀態與金額
    document.getElementById("modal-status").value = fullShipment.status;
    document.getElementById("modal-totalCost").value =
      fullShipment.totalCost || "";
    document.getElementById("modal-trackingNumberTW").value =
      fullShipment.trackingNumberTW || "";

    if (btnPrintShipment) {
      btnPrintShipment.onclick = () =>
        window.open(`shipment-print.html?id=${fullShipment.id}`, "_blank");
    }

    // [V8] 檢查並插入「永久刪除」按鈕
    let delBtn = document.getElementById("btn-admin-delete-shipment");
    if (!delBtn) {
      delBtn = document.createElement("button");
      delBtn.id = "btn-admin-delete-shipment";
      delBtn.type = "button";
      delBtn.className = "btn btn-danger";
      delBtn.style.marginTop = "20px";
      delBtn.style.width = "100%";
      delBtn.textContent = "⚠️ 永久刪除此集運單 (危險)";

      // 插入到 form 的最後面
      updateForm.appendChild(delBtn);
    }

    // 重新綁定刪除事件 (使用 cloneNode 移除舊的 listener)
    const newDelBtn = delBtn.cloneNode(true);
    delBtn.parentNode.replaceChild(newDelBtn, delBtn);

    newDelBtn.addEventListener("click", async () => {
      if (
        !confirm(
          `【嚴重警告】\n\n確定要永久刪除此集運單嗎？\n這將會移除訂單紀錄，並將包含的包裹全數「釋放」回已入庫狀態。`
        )
      )
        return;

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
        const resData = await res.json();
        if (res.ok) {
          alert("集運單已刪除");
          modal.style.display = "none";
          loadAllShipments();
        } else {
          alert("刪除失敗: " + resData.message);
        }
      } catch (e) {
        alert("錯誤: " + e.message);
      } finally {
        newDelBtn.disabled = false;
        newDelBtn.textContent = "⚠️ 永久刪除此集運單 (危險)";
      }
    });

    modal.style.display = "flex";
  }

  // 關閉彈窗
  closeModalBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // 提交更新
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
        if (!confirm("確定要取消並釋放包裹？")) {
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

      if (!response.ok) throw new Error("更新失敗");

      modal.style.display = "none";
      alert("更新成功");
      loadAllShipments();
    } catch (error) {
      alert(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "儲存集運單變更";
    }
  });

  // 登出與篩選
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定登出？")) {
      localStorage.removeItem("admin_token");
      window.location.href = "admin-login.html";
    }
  });

  filterBtn.addEventListener("click", renderShipments);

  // 初始載入
  loadAllShipments();
});
