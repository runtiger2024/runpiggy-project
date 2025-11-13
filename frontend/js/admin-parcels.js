// 這是 frontend/js/admin-parcels.js (已修復 API_BASE_URL)
// (最終完整版：整合照片管理、家具類型選擇、運費自動計算顯示)

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

  // [核心變數] 用來暫存目前這個包裹的「舊照片列表」 (用於刪除/保留邏輯)
  let currentExistingImages = [];

  // 中文翻譯字典
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

  // 顯示歡迎訊息
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

    // 篩選邏輯
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

  // (D) 打開包裹彈窗 (Modal) - [資料回填核心]
  function openPackageModal(pkg) {
    // 1. 填入基本資料 (唯讀區)
    document.getElementById("modal-pkg-id").value = pkg.id;
    document.getElementById("modal-user-email").textContent = pkg.user.email;
    document.getElementById("modal-user-name").textContent =
      pkg.user.name || "-";
    document.getElementById("modal-trackingNumber").textContent =
      pkg.trackingNumber;
    document.getElementById("modal-productName").textContent = pkg.productName;
    document.getElementById("modal-quantity").textContent = pkg.quantity;
    document.getElementById("modal-note").textContent = pkg.note || "-";

    // 2. 顯示會員上傳的圖片
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

    // 3. 填入 "倉庫回填區" 表單 (可編輯區)
    document.getElementById("modal-status").value = pkg.status;

    // [新增] 回填家具類型與運費顯示
    const furnitureTypeSelect = document.getElementById("modal-furnitureType");
    if (furnitureTypeSelect) {
      furnitureTypeSelect.value = pkg.furnitureType || "";
    }
    const shippingFeeInput = document.getElementById("modal-shippingFee");
    if (shippingFeeInput) {
      shippingFeeInput.value = pkg.shippingFee
        ? `$ ${pkg.shippingFee.toLocaleString()}`
        : "尚未計算 (儲存後自動更新)";
    }

    // 回填尺寸重量
    document.getElementById("modal-actualWeight").value =
      pkg.actualWeight || "";
    document.getElementById("modal-actualLength").value =
      pkg.actualLength || "";
    document.getElementById("modal-actualWidth").value = pkg.actualWidth || "";
    document.getElementById("modal-actualHeight").value =
      pkg.actualHeight || "";

    // 4. [照片管理] 初始化並顯示倉庫照片 (支援刪除與上限判斷)
    currentExistingImages = [...pkg.warehouseImages]; // 複製一份陣列，避免直接修改原資料
    renderWarehouseImages();

    // 清空檔案上傳欄位
    document.getElementById("modal-warehouseImages").value = null;

    // 5. 顯示彈窗
    modal.style.display = "flex";
  }

  // --- (E) 渲染倉庫照片與刪除按鈕 ---
  function renderWarehouseImages() {
    const warehouseImagesContainer = document.getElementById(
      "modal-warehouse-images-preview"
    );
    const fileInput = document.getElementById("modal-warehouseImages");

    warehouseImagesContainer.innerHTML = "<h4>倉庫已拍照片：</h4>";

    if (currentExistingImages.length > 0) {
      currentExistingImages.forEach((imgUrl, index) => {
        // 建立包裝容器
        const wrapper = document.createElement("div");
        wrapper.className = "img-wrapper"; // 需配合 CSS 設定樣式

        // 圖片
        const img = document.createElement("img");
        img.src = `${API_BASE_URL}${imgUrl}`;
        img.alt = "倉庫照片";
        img.onclick = () => window.open(img.src, "_blank"); // 點擊看大圖

        // 刪除按鈕 (紅色 X)
        const deleteBtn = document.createElement("div");
        deleteBtn.className = "btn-delete-img"; // 需配合 CSS 設定樣式
        deleteBtn.innerHTML = "&times;";
        deleteBtn.onclick = (e) => {
          e.stopPropagation(); // 防止觸發圖片點擊
          removeImage(index); // 呼叫刪除函式
        };

        wrapper.appendChild(img);
        wrapper.appendChild(deleteBtn);
        warehouseImagesContainer.appendChild(wrapper);
      });
    } else {
      warehouseImagesContainer.innerHTML += "<p>目前無照片</p>";
    }

    // [限制] 如果總數已達 3 張，禁用上傳欄位
    if (currentExistingImages.length >= 3) {
      fileInput.disabled = true;
      fileInput.title = "已達 3 張照片上限，請先刪除舊照片";
    } else {
      fileInput.disabled = false;
      fileInput.title = "可選擇新照片";
    }
  }

  // --- (F) 移除照片函式 (前端暫時移除) ---
  function removeImage(index) {
    if (confirm("確定要移除這張照片嗎？(需按「儲存更新」才會真正生效)")) {
      currentExistingImages.splice(index, 1); // 從陣列移除
      renderWarehouseImages(); // 重新渲染畫面
    }
  }

  // (G) 關閉彈窗
  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // (H) [修改重點] 提交 "更新" 表單 (含照片處理與新欄位)
  updateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("modal-pkg-id").value;
    const submitButton = updateForm.querySelector('button[type="submit"]');

    // 1. 檢查：舊圖 + 新圖 是否超過 3 張
    const newFiles = document.getElementById("modal-warehouseImages").files;
    if (currentExistingImages.length + newFiles.length > 3) {
      alert(
        `照片總數不能超過 3 張！\n目前舊圖：${currentExistingImages.length} 張\n新上傳：${newFiles.length} 張`
      );
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";

    // 2. 建立 FormData
    const formData = new FormData();
    formData.append("status", document.getElementById("modal-status").value);

    // [新增] 傳送家具類型 (用於後端計算運費)
    const furnitureType = document.getElementById("modal-furnitureType");
    if (furnitureType) {
      formData.append("furnitureType", furnitureType.value);
    }

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

    // [重要] 傳送剩餘的舊照片列表 (轉成 JSON 字串)
    formData.append("existingImages", JSON.stringify(currentExistingImages));

    // 3. 傳送新照片檔案
    for (let i = 0; i < newFiles.length; i++) {
      formData.append("warehouseImages", newFiles[i]);
    }

    try {
      // 4. 呼叫 API (PUT /api/admin/packages/:id/details)
      const response = await fetch(
        `${API_BASE_URL}/api/admin/packages/${packageId}/details`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            // 注意：使用 FormData 時，不要手動設定 Content-Type
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "更新失敗");
      }

      modal.style.display = "none"; // 關閉彈窗
      alert("包裹更新成功！運費已自動計算。");
      loadAllParcels(); // 重新載入列表
    } catch (error) {
      console.error("更新包裹失敗:", error);
      alert(`更新失敗: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "儲存更新";
    }
  });

  // (I) 登出
  logoutBtn.addEventListener("click", () => {
    if (confirm("確定要登出管理後台吗？")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_name");
      window.location.href = "admin-login.html";
    }
  });

  // (J) 篩選按鈕
  filterBtn.addEventListener("click", () => {
    renderParcels(allParcelsData);
  });

  // --- 5. 初始載入資料 ---
  loadAllParcels();
});
