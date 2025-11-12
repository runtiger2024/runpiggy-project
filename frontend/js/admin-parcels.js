// 這是 frontend/js/admin-parcels.js (已修復 API_BASE_URL)
// 負責管理 admin-parcels.html 頁面

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const adminWelcome = document.getElementById("admin-welcome");
  const logoutBtn = document.getElementById("logoutBtn");

  const filterStatus = document.getElementById("filter-status");
  const searchInput = document.getElementById("search-input");
  const filterBtn = document.getElementById("filter-btn");

  const parcelsTableBody = document.getElementById("parcelsTableBody");

  // 統計卡片
  const statsTotal = document.getElementById("stats-total");
  const statsPending = document.getElementById("stats-pending");
  const statsArrived = document.getElementById("stats-arrived");
  const statsCompleted = document.getElementById("stats-completed");

  // 彈窗 (Modal)
  const modal = document.getElementById("parcel-detail-modal");
  const closeModalBtn = modal.querySelector(".modal-close-btn");
  const updateForm = document.getElementById("update-package-form");

  // --- 2. 狀態變數 ---
  let allParcelsData = []; // 儲存從 API 拿到的所有包裹
  const adminToken = localStorage.getItem("admin_token"); // 讀取 "admin_token"

  // (新) 中文翻譯字典
  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // --- 3. 初始化 (檢查登入) ---
  if (!adminToken) {
    alert("偵測到未登入，將跳轉至管理員登入頁面");
    window.location.href = "admin-login.html";
    return; // 停止執行
  }

  // (新) 顯示歡迎訊息
  const adminName = localStorage.getItem("admin_name");
  if (adminName) {
    adminWelcome.textContent = `你好, ${adminName}`;
  }

  // --- 4. 函式定義 ---

  // (A) 載入所有包裹 (呼叫 GET /api/admin/packages/all)
  async function loadAllParcels() {
    parcelsTableBody.innerHTML =
      '<tr><td colspan="9" style="text-align: center;">載入中...</td></tr>';

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/packages/all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert("登入已過期或權限不足，請重新登入");
          window.location.href = "admin-login.html";
        }
        throw new Error("載入包裹失敗");
      }

      const data = await response.json();
      allParcelsData = data.packages || [];

      renderParcels(allParcelsData); // 顯示所有包裹
      updateStats(allParcelsData); // 更新統計數字
    } catch (error) {
      console.error("載入包裹列表失敗:", error);
      parcelsTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">載入失敗: ${error.message}</td></tr>`;
    }
  }

  // (B) 渲染包裹列表
  function renderParcels(parcels) {
    parcelsTableBody.innerHTML = ""; // 清空

    // (新) 篩選
    const status = filterStatus.value;
    const search = searchInput.value.toLowerCase();

    const filteredParcels = parcels.filter((pkg) => {
      const statusMatch = !status || pkg.status === status;
      const searchMatch =
        !search ||
        pkg.trackingNumber.toLowerCase().includes(search) ||
        pkg.productName.toLowerCase().includes(search) ||
        pkg.user.email.toLowerCase().includes(search);
      return statusMatch && searchMatch;
    });

    if (filteredParcels.length === 0) {
      parcelsTableBody.innerHTML =
        '<tr><td colspan="9" style="text-align: center;">找不到符合條件的包裹</td></tr>';
      return;
    }

    filteredParcels.forEach((pkg) => {
      const statusText = packageStatusMap[pkg.status] || pkg.status;

      // 尺寸和重量
      const dimensions =
        pkg.actualLength && pkg.actualWidth && pkg.actualHeight
          ? `${pkg.actualLength}x${pkg.actualWidth}x${pkg.actualHeight}`
          : "-";
      const weight = pkg.actualWeight ? `${pkg.actualWeight}` : "-";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <button class="btn btn-secondary btn-sm btn-view-details">查看/編輯</button>
        </td>
        <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
        <td>${pkg.user.email}</td>
        <td>${pkg.trackingNumber}</td>
        <td>${pkg.productName}</td>
        <td><span class="status-badge status-${
          pkg.status
        }">${statusText}</span></td>
        <td>${weight}</td>
        <td>${dimensions}</td>
        <td>${pkg.warehouseImages.length} 張</td>
      `;

      // 幫 "查看/編輯" 按鈕綁定事件
      tr.querySelector(".btn-view-details").addEventListener("click", () => {
        openPackageModal(pkg);
      });

      parcelsTableBody.appendChild(tr);
    });
  }

  // (C) 更新統計卡片
  function updateStats(parcels) {
    statsTotal.textContent = parcels.length;
    statsPending.textContent = parcels.filter(
      (p) => p.status === "PENDING"
    ).length;
    statsArrived.textContent = parcels.filter(
      (p) => p.status === "ARRIVED"
    ).length;
    statsCompleted.textContent = parcels.filter(
      (p) => p.status === "IN_SHIPMENT"
    ).length;
  }

  // (D) 打開包裹彈窗 (Modal)
  function openPackageModal(pkg) {
    // 1. 填入資料
    document.getElementById("modal-pkg-id").value = pkg.id;
    document.getElementById("modal-user-email").textContent = pkg.user.email;
    document.getElementById("modal-user-name").textContent =
      pkg.user.name || "-";

    document.getElementById("modal-trackingNumber").textContent =
      pkg.trackingNumber;
    document.getElementById("modal-productName").textContent = pkg.productName;
    document.getElementById("modal-quantity").textContent = pkg.quantity;
    document.getElementById("modal-note").textContent = pkg.note || "-";

    // 顯示會員上傳的圖片
    const customerImagesContainer = document.getElementById(
      "modal-customer-images"
    );
    customerImagesContainer.innerHTML = "<h4>會員上傳的圖片：</h4>";
    if (pkg.productImages.length > 0) {
      pkg.productImages.forEach((imgUrl) => {
        customerImagesContainer.innerHTML += `<img src="${API_BASE_URL}${imgUrl}" alt="會員圖片" onclick="window.open('${API_BASE_URL}${imgUrl}', '_blank')">`;
      });
    } else {
      customerImagesContainer.innerHTML += "<p>會員未上傳圖片</p>";
    }

    // 填入 "倉庫回填區"
    document.getElementById("modal-status").value = pkg.status;
    document.getElementById("modal-actualWeight").value =
      pkg.actualWeight || "";
    document.getElementById("modal-actualLength").value =
      pkg.actualLength || "";
    document.getElementById("modal-actualWidth").value = pkg.actualWidth || "";
    document.getElementById("modal-actualHeight").value =
      pkg.actualHeight || "";

    // 顯示倉庫已上傳的圖片
    const warehouseImagesContainer = document.getElementById(
      "modal-warehouse-images-preview"
    );
    warehouseImagesContainer.innerHTML = "<h4>倉庫已拍照片：</h4>";
    if (pkg.warehouseImages.length > 0) {
      pkg.warehouseImages.forEach((imgUrl) => {
        warehouseImagesContainer.innerHTML += `<img src="${API_BASE_URL}${imgUrl}" alt="倉庫圖片" onclick="window.open('${API_BASE_URL}${imgUrl}', '_blank')">`;
      });
    } else {
      warehouseImagesContainer.innerHTML += "<p>倉庫尚未上傳照片</p>";
    }

    // (新) 清空檔案上傳欄位
    document.getElementById("modal-warehouseImages").value = null;

    // 2. 顯示彈窗
    modal.style.display = "flex";
  }

  // (E) 關閉彈窗
  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // (F) (關鍵!) 提交 "更新" 表單
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("modal-pkg-id").value;
    const submitButton = updateForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    // 1. 建立 FormData (因為有檔案)
    const formData = new FormData();
    formData.append("status", document.getElementById("modal-status").value);
    formData.append(
      "actualWeight",
      document.getElementById("modal-actualWeight").value
    );
    formData.append(
      "actualLength",
      document.getElementById("modal-actualLength").value
    );
    formData.append(
      "actualWidth",
      document.getElementById("modal-actualWidth").value
    );
    formData.append(
      "actualHeight",
      document.getElementById("modal-actualHeight").value
    );

    // 2. 取得圖片檔案
    const imageFiles = document.getElementById("modal-warehouseImages").files;
    for (let i = 0; i < imageFiles.length; i++) {
      formData.append("warehouseImages", imageFiles[i]);
    }

    try {
      // 3. 呼叫我們新的 API (PUT /api/admin/packages/:id/details)
      const response = await fetch(
        `${API_BASE_URL}/api/admin/packages/${packageId}/details`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            // (注意：FormData "不要" 設定 Content-Type)
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "更新失敗");
      }

      modal.style.display = "none"; // 關閉彈窗
      alert("包裹更新成功！");
      loadAllParcels(); // 重新載入列表
    } catch (error) {
      console.error("更新包裹失敗:", error);
      alert(`更新失敗: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "儲存更新";
    }
  });

  // (G) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  // (H) 篩選按鈕
  filterBtn.addEventListener("click", () => {
    renderParcels(allParcelsData);
  });

  // --- 5. 初始載入資料 ---
  loadAllParcels();
});
