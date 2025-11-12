// 這是 frontend/js/dashboard.js (已修復 API_BASE_URL)
// (最終完整版，支援「合併集運」)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const messageBox = document.getElementById("message-box");
  const welcomeMessage = document.getElementById("welcome-message");
  const userEmail = document.getElementById("user-email");
  const userPhone = document.getElementById("user-phone");
  const userAddress = document.getElementById("user-address");

  const tabPackages = document.getElementById("tab-packages");
  const tabShipments = document.getElementById("tab-shipments");
  const packagesSection = document.getElementById("packages-section");
  const shipmentsSection = document.getElementById("shipments-section");

  const forecastForm = document.getElementById("forecast-form");
  const trackingNumber = document.getElementById("trackingNumber");
  const productName = document.getElementById("productName");
  const quantity = document.getElementById("quantity");
  const note = document.getElementById("note");

  const packagesTableBody = document.getElementById("packages-table-body");
  const shipmentsTableBody = document.getElementById("shipments-table-body");

  const editProfileModal = document.getElementById("edit-profile-modal");
  const editProfileForm = document.getElementById("edit-profile-form");
  const btnEditProfile = document.getElementById("btn-edit-profile");
  const btnCloseProfileModal = editProfileModal.querySelector(".modal-close");

  const editPackageModal = document.getElementById("edit-package-modal");
  const editPackageForm = document.getElementById("edit-package-form");
  const btnClosePackageModal = editPackageModal.querySelector(".modal-close");

  // (新) 獲取 "合併集運" 相關元素
  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const btnCreateShipment = document.getElementById("btn-create-shipment");
  const btnCloseShipmentModal =
    createShipmentModal.querySelector(".modal-close");
  const shipmentPackageList = document.getElementById("shipment-package-list");

  // --- 2. 狀態變數 ---
  let currentUser = null;
  const token = localStorage.getItem("token");
  let allPackagesData = []; // (新) 用來儲存所有包裹的完整資料

  // 中文翻譯字典
  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };
  const shipmentStatusMap = {
    PENDING_PAYMENT: "等待付款",
    PROCESSING: "處理中",
    SHIPPED: "已出貨",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // --- 3. 初始化 (檢查登入) ---
  if (!token) {
    alert("請先登入會員");
    window.location.href = "login.html";
    return;
  }

  // --- 4. 函式定義 ---

  // 顯示訊息
  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";
    setTimeout(() => {
      messageBox.style.display = "none";
    }, 5000);
  }

  // (A) 載入會員資料
  async function loadUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        alert("您的登入已過期，請重新登入");
        window.location.href = "login.html";
        return;
      }
      const data = await response.json();
      currentUser = data.user;
      welcomeMessage.textContent = `歡迎回來，${
        currentUser.name || currentUser.email
      }！`;
      userEmail.textContent = currentUser.email;
      userPhone.textContent = currentUser.phone || "(尚未提供)";
      userAddress.textContent = currentUser.defaultAddress || "(尚未提供)";
    } catch (error) {
      console.error("載入會員資料失敗:", error);
      showMessage("載入會員資料失敗，請重新登入", "error");
    }
  }

  // (B) 載入我的包裹 (*** 重大修改 ***)
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "載入包裹失敗");

      allPackagesData = data.packages; // (新) 儲存完整資料
      packagesTableBody.innerHTML = "";

      if (allPackagesData.length === 0) {
        packagesTableBody.innerHTML =
          '<tr><td colspan="7" style="text-align: center;">您尚未預報任何包裹</td></tr>';
        return;
      }

      allPackagesData.forEach((pkg) => {
        const statusText = packageStatusMap[pkg.status] || pkg.status;
        let images = [];
        try {
          if (pkg.productImages && typeof pkg.productImages === "string") {
            images = JSON.parse(pkg.productImages);
          } else if (Array.isArray(pkg.productImages)) {
            images = pkg.productImages;
          }
        } catch (e) {
          console.warn(`包裹 ${pkg.id} 的 productImages 格式錯誤`);
        }

        // (新) 檢查是否為 "已入庫"
        const isArrived = pkg.status === "ARRIVED";

        const tr = document.createElement("tr");

        // (新) 顯示尺寸和重量，如果管理員還沒填，就顯示 "-"
        const dimensions =
          pkg.actualLength && pkg.actualWidth && pkg.actualHeight
            ? `${pkg.actualLength} x ${pkg.actualWidth} x ${pkg.actualHeight}`
            : "-";
        const weight = pkg.actualWeight ? `${pkg.actualWeight} kg` : "-";

        tr.innerHTML = `
          <td>
            <input type="checkbox" class="package-checkbox" 
                   data-id="${pkg.id}" 
                   ${isArrived ? "" : "disabled"}>
          </td>
          <td><span class="status-badge status-${
            pkg.status
          }">${statusText}</span></td>
          <td>${pkg.trackingNumber}</td>
          <td>${pkg.productName}</td>
          <td>${dimensions}</td>
          <td>${weight}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-edit" ${
              pkg.status !== "PENDING" ? "disabled" : ""
            }>修改</button>
            <button class="btn btn-danger btn-sm btn-delete" ${
              pkg.status !== "PENDING" ? "disabled" : ""
            }>刪除</button>
          </td>
        `;

        // 綁定事件
        const editBtn = tr.querySelector(".btn-edit");
        if (editBtn) {
          editBtn.addEventListener("click", () => {
            openEditPackageModal(pkg);
          });
        }
        const deleteBtn = tr.querySelector(".btn-delete");
        if (deleteBtn) {
          deleteBtn.addEventListener("click", () => {
            handleDeletePackage(pkg);
          });
        }

        packagesTableBody.appendChild(tr);
      });
    } catch (error) {
      console.error("載入包裹時發生錯誤:", error.message);
      showMessage(`載入包裹失敗: ${error.message}`, "error");
    }
  }

  // (C) 載入我的集運單
  async function loadMyShipments() {
    // ( ... 此函式保持不變 ... )
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "載入集運單失敗");
      if (data.shipments.length === 0) {
        shipmentsTableBody.innerHTML =
          '<tr><td colspan="6" style="text-align: center;">您尚未建立任何集運單</td></tr>';
        return;
      }
      shipmentsTableBody.innerHTML = data.shipments
        .map((ship) => {
          const statusText = shipmentStatusMap[ship.status] || ship.status;
          return `
          <tr>
            <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
            <td><span class="status-badge status-${
              ship.status
            }">${statusText}</span></td>
            <td>${ship.recipientName}</td>
            <td>${ship.idNumber}</td>
            <td>${ship.packages.length} 件</td>
            <td>${
              ship.totalCost
                ? `NT$ ${ship.totalCost.toLocaleString()}`
                : "(待報價)"
            }</td>
          </tr>
        `;
        })
        .join("");
    } catch (error) {
      console.error("載入集運單時發生錯誤:", error.message);
      showMessage(`載入集運單失敗: ${error.message}`, "error");
    }
  }

  // (D) 提交包裹預報表單
  forecastForm.addEventListener("submit", async (e) => {
    // ( ... 此函式保持不變 ... )
    e.preventDefault();
    const requestData = {
      trackingNumber: trackingNumber.value,
      productName: productName.value,
      quantity: quantity.value ? parseInt(quantity.value) : 1,
      note: note.value,
    };
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/packages/forecast/json`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestData),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "預報失敗");
      showMessage("包裹預報成功！", "success");
      forecastForm.reset();
      loadMyPackages();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (F) 頁籤切換
  tabPackages.addEventListener("click", () => {
    tabPackages.classList.add("active");
    tabShipments.classList.remove("active");
    packagesSection.style.display = "block";
    shipmentsSection.style.display = "none";
  });
  tabShipments.addEventListener("click", () => {
    tabPackages.classList.remove("active");
    tabShipments.classList.add("active");
    packagesSection.style.display = "none";
    shipmentsSection.style.display = "block";
  });

  // (G/H) 編輯個人資料 (彈窗 + 提交)
  btnEditProfile.addEventListener("click", () => {
    document.getElementById("edit-name").value = currentUser.name || "";
    document.getElementById("edit-phone").value = currentUser.phone || "";
    document.getElementById("edit-address").value =
      currentUser.defaultAddress || "";
    editProfileModal.style.display = "flex";
  });
  btnCloseProfileModal.addEventListener("click", () => {
    editProfileModal.style.display = "none";
  });
  editProfileModal.addEventListener("click", (e) => {
    if (e.target === editProfileModal) {
      editProfileModal.style.display = "none";
    }
  });
  editProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("edit-name").value,
      phone: document.getElementById("edit-phone").value,
      defaultAddress: document.getElementById("edit-address").value,
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "更新失敗");
      }
      currentUser = result.user;
      welcomeMessage.textContent = `歡迎回來，${
        currentUser.name || currentUser.email
      }！`;
      userEmail.textContent = currentUser.email;
      userPhone.textContent = currentUser.phone || "(尚未提供)";
      userAddress.textContent = currentUser.defaultAddress || "(尚未提供)";
      editProfileModal.style.display = "none";
      showMessage("個人資料更新成功！", "success");
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (I) 編輯包裹 (彈窗 + 提交)
  function openEditPackageModal(pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    editPackageModal.style.display = "flex";
  }
  btnClosePackageModal.addEventListener("click", () => {
    editPackageModal.style.display = "none";
  });
  editPackageModal.addEventListener("click", (e) => {
    if (e.target === editPackageModal) {
      editPackageModal.style.display = "none";
    }
  });
  editPackageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const packageId = document.getElementById("edit-package-id").value;
    const data = {
      trackingNumber: document.getElementById("edit-trackingNumber").value,
      productName: document.getElementById("edit-productName").value,
      quantity: parseInt(document.getElementById("edit-quantity").value),
      note: document.getElementById("edit-note").value,
    };
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/packages/${packageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "更新失敗");
      }
      editPackageModal.style.display = "none";
      showMessage("包裹資料更新成功！", "success");
      loadMyPackages();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (J) 刪除包裹
  async function handleDeletePackage(pkg) {
    if (
      !confirm(
        `確定要刪除包裹 "${pkg.productName}" (${pkg.trackingNumber}) 嗎？`
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "刪除失敗");
      }
      showMessage("包裹刪除成功！", "success");
      loadMyPackages();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  // --- (K) (新) 合併集運的函式 ---

  // (K-1) 綁定 "合併打包" 按鈕
  btnCreateShipment.addEventListener("click", () => {
    // 1. 找出所有被勾選的 checkbox
    const checkedBoxes = document.querySelectorAll(".package-checkbox:checked");
    if (checkedBoxes.length === 0) {
      showMessage('請至少勾選一個 "已入庫" 的包裹來合併', "error");
      return;
    }

    // 2. 準備要顯示在彈窗中的資料
    let packageListHtml = "";
    let selectedPackageIds = [];

    checkedBoxes.forEach((box) => {
      const pkgId = box.dataset.id;
      selectedPackageIds.push(pkgId);

      // 從我們儲存的 allPackagesData 中找出完整資料
      const pkg = allPackagesData.find((p) => p.id === pkgId);
      if (pkg) {
        packageListHtml += `
          <div class="shipment-package-item">
            <span>${pkg.productName} (${pkg.trackingNumber})</span>
            <small>${pkg.actualWeight || "?"} kg</small>
          </div>
        `;
      }
    });

    // 3. 填入彈窗
    shipmentPackageList.innerHTML = packageListHtml;
    // (新) 把 ID 存到表單的 "data-ids" 屬性中，方便提交時抓取
    createShipmentForm.dataset.ids = JSON.stringify(selectedPackageIds);

    // 4. (新) 自動填入會員預設資料
    document.getElementById("ship-name").value = currentUser.name || "";
    document.getElementById("ship-phone").value = currentUser.phone || "";
    document.getElementById("ship-address").value =
      currentUser.defaultAddress || "";
    // (我們不清空身分證和統編，讓會員自己填)

    // 5. 顯示彈窗
    createShipmentModal.style.display = "flex";
  });

  // (K-2) 綁定 "建立集運單" 彈窗的關閉按鈕
  btnCloseShipmentModal.addEventListener("click", () => {
    createShipmentModal.style.display = "none";
  });
  createShipmentModal.addEventListener("click", (e) => {
    if (e.target === createShipmentModal) {
      createShipmentModal.style.display = "none";
    }
  });

  // (K-3) 提交 "建立集運單" 表單 (呼叫 POST /api/shipments/create)
  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. 取得勾選的包裹 IDs
    const packageIds = JSON.parse(createShipmentForm.dataset.ids || "[]");
    if (packageIds.length === 0) {
      showMessage("發生錯誤：找不到要集運的包裹", "error");
      return;
    }

    // 2. 取得附加服務
    const services = {};
    document
      .querySelectorAll('#create-shipment-form input[name="services"]:checked')
      .forEach((input) => {
        services[input.value] = true;
      });

    // 3. 組合所有資料
    const requestData = {
      packageIds: packageIds,
      additionalServices: services,
      recipientName: document.getElementById("ship-name").value,
      phone: document.getElementById("ship-phone").value,
      shippingAddress: document.getElementById("ship-address").value,
      idNumber: document.getElementById("ship-idNumber").value,
      taxId: document.getElementById("ship-taxId").value || null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "建立失敗");
      }

      createShipmentModal.style.display = "none"; // 關閉彈窗
      createShipmentForm.reset(); // 清空表單
      showMessage("集運單建立成功！", "success");

      // (重要) 重新載入包裹和集運單列表
      loadMyPackages();
      loadMyShipments();
    } catch (error) {
      // (新) 在彈窗內顯示錯誤
      showMessage(error.message, "error");
    }
  });

  // --- 5. 初始載入資料 ---
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();

  // (K) 檢查是否有來自試算器的草稿
  function checkForecastDraft() {
    const draftJSON = localStorage.getItem("forecast_draft");
    if (draftJSON) {
      try {
        const draft = JSON.parse(draftJSON);
        if (draft.productName) {
          productName.value = draft.productName;
        }
        if (draft.quantity) {
          quantity.value = draft.quantity;
        }
        showMessage("您的試算資料已帶入，請填寫物流單號後提交。", "success");
        localStorage.removeItem("forecast_draft");
        forecastForm.scrollIntoView({ behavior: "smooth" });
      } catch (e) {
        console.error("解析預報草稿失敗:", e);
        localStorage.removeItem("forecast_draft");
      }
    }
  }
  checkForecastDraft();
}); // DOMContentLoaded 結束
