// 這是 frontend/js/dashboard.js (V7.4 - 含列印功能完整版)
// (1) 修正 V3 佇列 Bug
// (2) 新增 V4 佇列 UI
// (3) 延長 showMessage
// (4) 新增「超重/超長/堆高機」警告
// (5) [V5 修正] 統一集運單狀態 (shipmentStatusMap)
// (6) [V6 新增] 優化：上傳憑證後，狀態顯示為「已付款，待審核」
// (7) [V7.3 修正] 將偏遠地區費併入基本運費小字中
// (8) [V7.4 新增] 加入「列印/匯出」按鈕

// --- [*** V5 修正：從 calculatorController.js 引入規則 ***] ---
const RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};
const VOLUME_DIVISOR = 28317;
const CBM_TO_CAI_FACTOR = 35.3;
const MINIMUM_CHARGE = 2000; // 集運低消常數
const OVERSIZED_LIMIT = 300;
const OVERSIZED_FEE = 800;
const OVERWEIGHT_LIMIT = 100;
const OVERWEIGHT_FEE = 800;
// --- [*** 修正結束 ***] ---

// --- [!!! V7 新增：偏遠地區資料庫 (從 index.html 複製) !!!] ---
const remoteAreas = {
  1800: [
    "東勢區",
    "新社區",
    "石岡區",
    "和平區",
    "大雪山",
    "穀關",
    "水里鄉",
    "伸港鄉",
    "線西鄉",
    "秀水鄉",
    "芬園鄉",
    "芳苑鄉",
    "大村鄉",
    "大城鄉",
    "竹塘鄉",
    "北斗鎮",
    "溪州鄉",
  ],
  2000: [
    "三芝",
    "石門",
    "烏來",
    "坪林",
    "石碇區",
    "深坑區",
    "萬里",
    "平溪",
    "雙溪",
    "福隆",
    "貢寮",
    "三峽區",
    "淡水竹圍",
    "復興鄉",
    "新埔鎮",
    "關西鎮",
    "橫山鄉",
    "北埔鄉",
    "尖石鄉",
    "五峰鄉",
    "寶山鎮",
    "香山區",
    "造橋鎮",
    "峨嵋鄉",
    "三灣鄉",
    "芎林鄉",
    "頭屋鄉",
    "銅鑼鄉",
    "三義鄉",
    "通霄鎮",
    "苑裡鎮",
    "大湖鄉",
    "卓蘭鎮",
    "泰安鄉",
    "公館鄉",
    "竹南鎮",
  ],
  2500: [
    "名間鄉",
    "四湖鄉",
    "東勢鄉",
    "台西鄉",
    "古坑鄉",
    "口湖鄉",
    "崙背鄉",
    "麥寮鄉",
    "東石鄉",
    "六腳鄉",
    "竹崎鄉",
    "白河區",
    "東山區",
    "大內區",
    "玉井區",
    "山上區",
    "龍崎區",
    "後壁區",
    "左鎮區",
    "燕巢",
    "內門區",
    "大樹",
    "茄萣",
    "林園",
    "旗津",
    "杉林",
    "美濃",
    "永安",
    "阿蓮",
    "田寮",
    "旗山",
  ],
  3000: ["布袋鎮", "北門區", "將軍區", "七股區", "楠西區", "南化區"],
  4000: [
    "南莊鄉",
    "獅潭鄉",
    "竹山鎮",
    "鹿谷鄉",
    "集集鎮",
    "中寮鄉",
    "國姓鄉",
    "仁愛鄉",
    "信義鄉",
    "梨山",
    "奧萬大",
    "埔里",
  ],
  4500: [
    "陽明山",
    "金山",
    "魚池鄉",
    "那瑪夏區",
    "桃源區",
    "茂林",
    "甲仙",
    "六龜",
    "屏東縣全區",
    "宜蘭其他地區",
    "花蓮全區",
    "台東全區",
  ],
  5000: ["阿里山", "梅山鄉", "番路", "中埔鄉", "大埔鄉"],
  7000: [
    "小琉球",
    "琉球鄉",
    "恆春",
    "墾丁",
    "鵝鑾鼻",
    "車城",
    "滿洲",
    "牡丹",
    "獅子",
    "枋山",
    "春日",
    "枋寮",
    "佳冬",
    "來義",
    "泰武",
    "瑪家",
    "霧臺",
    "三地門",
    "南澳",
    "釣魚臺",
  ],
};
// --- [!!! V7 新增結束 !!!] ---

// --- [全域函式] 開啟圖片彈窗 ---
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;
  gallery.innerHTML = "";
  if (images && images.length > 0) {
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.alt = "倉庫照片";
      img.onclick = () => window.open(img.src, "_blank");
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = "<p>沒有照片</p>";
  }
  modal.style.display = "flex";
};

// --- [全域函式] 開啟「包裹詳情」彈窗 (含公式) ---
window.openPackageDetails = function (pkgDataStr) {
  try {
    const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
    const modal = document.getElementById("package-details-modal");
    if (!modal) return;

    const boxesListContainer = document.getElementById("details-boxes-list");
    const imagesGallery = document.getElementById("details-images-gallery");

    const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
      ? pkg.arrivedBoxes
      : [];

    let boxesHtml = ""; // 準備存放 HTML

    // 1. 填充分箱明細 (改為產生公式)
    if (arrivedBoxes.length > 0) {
      arrivedBoxes.forEach((box) => {
        const rate = RATES[box.type];
        if (!rate) {
          boxesHtml += `<div class="calc-box"><strong>${
            box.name || "分箱"
          }:</strong> <span style="color: red;">(類型錯誤，無法計算)</span></div>`;
          return; // 跳過這個分箱
        }

        const l = parseFloat(box.length) || 0;
        const w_dim = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const w = parseFloat(box.weight) || 0;

        const cai = Math.ceil((l * w_dim * h) / VOLUME_DIVISOR);
        const volCost = cai * rate.volumeRate;
        const finalWeight = Math.ceil(w * 10) / 10;
        const weightCost = finalWeight * rate.weightRate;
        const finalFee = box.fee || 0;

        boxesHtml += `
          <div class="calc-box" style="background: #fdfdfd; border: 1px solid #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
            <strong>${box.name || "分箱"} (${rate.name}):</strong>
            <div class="calc-line">
              📦 <strong>材積費:</strong> (${l}x${w_dim}x${h} / ${VOLUME_DIVISOR} ➜ <strong>${cai} 材</strong>) × $${
          rate.volumeRate
        } = <span class="cost">$${volCost.toLocaleString()}</span>
            </div>
            <div class="calc-line">
              ⚖️ <strong>重量費:</strong> (<strong>${finalWeight} kg</strong>) × $${
          rate.weightRate
        } = <span class="cost">$${Math.round(
          weightCost
        ).toLocaleString()}</span>
            </div>
            <div class="calc-line final">
              → 單箱運費 (取高): <strong>$${finalFee.toLocaleString()}</strong>
            </div>
          </div>
        `;
      });
      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<p style="text-align: center; color: #888;">暫無分箱資料</p>';
    }

    // 2. 填充匯總
    const totalBoxes = arrivedBoxes.length;
    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );

    document.getElementById("details-total-boxes").textContent = totalBoxes;
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);
    document.getElementById("details-total-fee").textContent = `NT$ ${(
      pkg.totalCalculatedFee || 0
    ).toLocaleString()}`;

    // 3. 填充倉庫照片
    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
    if (warehouseImages.length > 0) {
      imagesGallery.innerHTML = ""; // 清空
      warehouseImages.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = `${API_BASE_URL}${imgUrl}`;
        img.alt = "倉庫照片";
        img.onclick = () => window.open(img.src, "_blank");
        imagesGallery.appendChild(img);
      });
    } else {
      imagesGallery.innerHTML = "<p>沒有照片</p>";
    }

    // 4. 顯示彈窗
    modal.style.display = "flex";
  } catch (e) {
    console.error("開啟詳情彈窗失敗:", e);
    alert("載入包裹詳情失敗。");
  }
};

// --- [全域函式] 開啟費用詳情 (舊版，保留但不使用) ---
window.openFeeDetails = function (pkgDataStr) {
  // ... 內容不變 ...
};

// --- [全域函式] 開啟上傳憑證彈窗 ---
window.openUploadProof = function (shipmentId) {
  document.getElementById("upload-proof-id").value = shipmentId;
  document.getElementById("proof-file").value = null;
  document.getElementById("upload-proof-modal").style.display = "flex";
};

// --- [全域函式] 查看憑證 ---
window.viewProof = function (imgUrl) {
  window.open(`${API_BASE_URL}${imgUrl}`, "_blank");
};

document.addEventListener("DOMContentLoaded", () => {
  // --- (獲取 DOM 元素) ---
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
  const imagesInput = document.getElementById("images"); // [新增]
  const packagesTableBody = document.getElementById("packages-table-body");
  const shipmentsTableBody = document.getElementById("shipments-table-body");
  const editProfileModal = document.getElementById("edit-profile-modal");
  const editProfileForm = document.getElementById("edit-profile-form");
  const btnEditProfile = document.getElementById("btn-edit-profile");
  const createShipmentModal = document.getElementById("create-shipment-modal");
  const createShipmentForm = document.getElementById("create-shipment-form");
  const btnCreateShipment = document.getElementById("btn-create-shipment");
  const shipmentPackageList = document.getElementById("shipment-package-list");
  const shipmentTotalCost = document.getElementById("shipment-total-cost");
  const bankInfoModal = document.getElementById("bank-info-modal");
  const uploadProofModal = document.getElementById("upload-proof-modal");
  const uploadProofForm = document.getElementById("upload-proof-form");
  const shipmentFeeNotice = document.getElementById("shipment-fee-notice");

  // [*** V4 修正：獲取 V4 佇列 UI 元素 ***]
  const draftQueueContainer = document.getElementById("draft-queue-container");
  const draftQueueList = document.getElementById("draft-queue-list");
  // [*** V5 修正：獲取 V5 警告 UI 元素 ***]
  const shipmentWarnings = document.getElementById("shipment-warnings");
  // [*** 修正結束 ***]

  // --- [!!! V7 新增：獲取集運單彈窗中的地區選擇元素 !!!] ---
  const shipDeliveryLocation = document.getElementById(
    "ship-delivery-location"
  );
  const shipAreaSearch = document.getElementById("ship-area-search");
  const shipSearchResults = document.getElementById("ship-search-results");
  const shipRemoteAreaInfo = document.getElementById("ship-remote-area-info");
  const shipSelectedAreaName = document.getElementById(
    "ship-selected-area-name"
  );
  const shipSelectedAreaFee = document.getElementById("ship-selected-area-fee");
  const shipStreetAddress = document.getElementById("ship-street-address");
  // --- [!!! V7 新增結束 !!!] ---

  // --- (狀態變數) ---
  let currentUser = null;
  const token = localStorage.getItem("token");
  let allPackagesData = [];

  const packageStatusMap = {
    PENDING: "待確認",
    ARRIVED: "已入庫",
    IN_SHIPMENT: "集運中",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  // [*** V5 關鍵修正：統一狀態 ***]
  const shipmentStatusMap = {
    PENDING_PAYMENT: "待付款",
    PROCESSING: "已收款，安排裝櫃",
    SHIPPED: "已裝櫃",
    COMPLETED: "海關查驗",
    CANCELLEDD: "清關放行", // (保留錯字鍵名，因為後端/數據庫可能在用)
    CANCELL: "拆櫃派送", // (保留錯字鍵名)
    CANCEL: "已完成", // (保留錯字鍵名)
    CANCELLED: "已取消/退回", // (這是"取消"的狀態)
  };
  // [*** 修正結束 ***]

  // --- (初始化檢查) ---
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = "block";

    // [*** V4 修正：延長提示時間 ***]
    const duration =
      message.includes("佇列") || message.includes("帶入") ? 12000 : 5000;
    setTimeout(() => {
      messageBox.style.display = "none";
    }, duration);
  }

  // (A) 載入資料
  async function loadUserProfile() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        localStorage.removeItem("token");
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
      console.error("載入失敗");
    }
  }

  // (B) 載入我的包裹
  async function loadMyPackages() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "載入包裹失敗");

      allPackagesData = data.packages;
      packagesTableBody.innerHTML = "";

      if (allPackagesData.length === 0) {
        packagesTableBody.innerHTML =
          '<tr><td colspan="9" style="text-align: center;">尚無包裹</td></tr>';
        return;
      }

      allPackagesData.forEach((pkg) => {
        const statusText = packageStatusMap[pkg.status] || pkg.status;
        const isArrived = pkg.status === "ARRIVED";
        const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
          ? pkg.arrivedBoxes
          : [];
        const piecesCount =
          arrivedBoxes.length > 0 ? `${arrivedBoxes.length} 箱` : "-";
        const totalWeight =
          arrivedBoxes.length > 0
            ? `${arrivedBoxes
                .reduce((sum, box) => sum + (parseFloat(box.weight) || 0), 0)
                .toFixed(1)} kg`
            : "-";

        let feeDisplay = '<span style="color: #999;">-</span>';
        if (pkg.totalCalculatedFee != null) {
          feeDisplay = `<span style="color: #d32f2f; font-weight: bold;">$${pkg.totalCalculatedFee.toLocaleString()}</span>`;
        }

        const pkgStr = encodeURIComponent(JSON.stringify(pkg));
        const detailsBtn = `<button class="btn btn-view-img btn-sm" onclick='window.openPackageDetails("${pkgStr}")'>查看</button>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><input type="checkbox" class="package-checkbox" data-id="${
            pkg.id
          }" ${isArrived ? "" : "disabled"}></td>
          <td><span class="status-badge status-${
            pkg.status
          }">${statusText}</span></td>
          <td>${pkg.trackingNumber}</td>
          <td>${pkg.productName}</td>
          <td>${piecesCount}</td>
          <td>${totalWeight}</td>
          <td>${feeDisplay}</td>
          <td>${detailsBtn}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-edit" ${
              pkg.status !== "PENDING" ? "disabled" : ""
            }>修改</button>
            <button class="btn btn-danger btn-sm btn-delete" ${
              pkg.status !== "PENDING" ? "disabled" : ""
            }>刪除</button>
          </td>
        `;
        tr.querySelector(".btn-edit").addEventListener("click", () =>
          openEditPackageModal(pkg)
        );
        tr.querySelector(".btn-delete").addEventListener("click", () =>
          handleDeletePackage(pkg)
        );
        packagesTableBody.appendChild(tr);
      });
    } catch (e) {
      console.error("loadMyPackages 錯誤:", e);
      packagesTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">載入包裹失敗: ${e.message}</td></tr>`;
    }
  }

  // (C) 刪除包裹
  async function handleDeletePackage(pkg) {
    if (confirm("確定刪除?")) {
      await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadMyPackages();
    }
  }

  // (D) 載入集運單 (V7.4 - 新增列印按鈕)
  async function loadMyShipments() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shipments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.shipments.length === 0) {
        shipmentsTableBody.innerHTML =
          '<tr><td colspan="7" style="text-align: center;">尚無集運單</td></tr>';
        return;
      }
      shipmentsTableBody.innerHTML = data.shipments
        .map((ship) => {
          // [!! 程式夥伴修改 !!] - 將 const statusText 改為 let statusText
          let statusText = shipmentStatusMap[ship.status] || ship.status;
          let statusClass = ship.status; // 預設的 CSS class

          // [!! 程式夥伴新增 !!] 優化：上傳憑證後，狀態顯示為「已付款，待審核」
          if (ship.status === "PENDING_PAYMENT" && ship.paymentProof) {
            statusText = "已付款，待審核";
            statusClass = "PENDING_REVIEW";
          }

          let proofBtn = "";
          if (ship.paymentProof) {
            proofBtn = `<button class="btn btn-secondary btn-sm" onclick="window.viewProof('${ship.paymentProof}')" style="background-color:#27ae60;">已上傳(查看)</button>`;
          } else {
            proofBtn = `<button class="btn btn-primary btn-sm" onclick="window.openUploadProof('${ship.id}')">上傳憑證</button>`;
          }

          // [!!! V7.4 新增：列印/匯出按鈕 !!!]
          const printBtn = `<button class="btn btn-secondary btn-sm" style="margin-top:5px; background-color: #607d8b;" onclick="window.open('shipment-print.html?id=${ship.id}', '_blank')">列印/匯出</button>`;

          return `
          <tr>
            <td>${new Date(ship.createdAt).toLocaleDateString()}</td>
            
            <td><span class="status-badge status-${statusClass}">${statusText}</span></td>

            <td>${ship.recipientName}</td>
            <td>${ship.idNumber}</td>
            <td>${ship.packages.length} 件</td>
            <td>${
              ship.totalCost != null
                ? `NT$ ${ship.totalCost.toLocaleString()}`
                : "(待報價)"
            }</td>
            <td>
                ${proofBtn}
                ${printBtn}
            </td>
          </tr>`;
        })
        .join("");
    } catch (e) {}
  }

  // (E) 提交預報 (支援佇列)
  forecastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitButton = forecastForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "提交中...";

    // 1. 建立 FormData (邏輯不變)
    const formData = new FormData();
    formData.append("trackingNumber", trackingNumber.value);
    formData.append("productName", productName.value);
    formData.append("quantity", quantity.value ? parseInt(quantity.value) : 1);
    formData.append("note", note.value);

    const files = imagesInput.files;
    if (files.length > 5) {
      showMessage("照片最多只能上傳 5 張", "error");
      submitButton.disabled = false;
      submitButton.textContent = "提交預報";
      return;
    }
    for (let i = 0; i < files.length; i++) {
      formData.append("images", files[i]);
    }

    try {
      // 2. 呼叫 API (邏輯不變)
      const response = await fetch(
        `${API_BASE_URL}/api/packages/forecast/images`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "提交失敗");
      }

      // showMessage("預報成功", "success"); // [*** 修正 ***] 訊息改由佇列函式顯示
      forecastForm.reset(); // 清空剛剛提交的表單
      loadMyPackages(); // 重新載入包裹列表

      // [*** V4 關鍵修正 ***]
      // 3. 提交成功後，呼叫佇列檢查
      checkForecastDraftQueue(true); // 傳入 true，表示是「提交後」的檢查
      // [*** 修正結束 ***]
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "提交預報";
    }
  });

  // [!!! V7.2 修正：建立一個可重用的費用計算函式 !!!]
  function recalculateShipmentTotal() {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) {
      // 如果沒有勾選任何東西，就不用算了
      return;
    }

    // 1. 準備變數
    let totalFee = 0;
    let warningHtml = "";
    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;
    let totalShipmentVolume = 0;

    // 2. 處理勾選的包裹
    checked.forEach((box) => {
      // (重要) 這裡我們依賴 allPackagesData 是最新的
      const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);

      if (p && p.status === "ARRIVED") {
        totalFee += p.totalCalculatedFee || 0;

        const arrivedBoxes = Array.isArray(p.arrivedBoxes)
          ? p.arrivedBoxes
          : [];

        if (arrivedBoxes.length > 0) {
          arrivedBoxes.forEach((box) => {
            if (
              parseFloat(box.length) > OVERSIZED_LIMIT ||
              parseFloat(box.width) > OVERSIZED_LIMIT ||
              parseFloat(box.height) > OVERSIZED_LIMIT
            ) {
              hasAnyOversizedItem = true;
            }
            if (parseFloat(box.weight) > OVERWEIGHT_LIMIT) {
              hasAnyOverweightItem = true;
            }

            const length = parseFloat(box.length) || 0;
            const width = parseFloat(box.width) || 0;
            const height = parseFloat(box.height) || 0;
            if (length > 0 && width > 0 && height > 0) {
              const singleVolume = Math.ceil(
                (length * width * height) / VOLUME_DIVISOR
              );
              totalShipmentVolume += singleVolume;
            }
          });
        }
      }
    });

    // 3. 計算總費用
    const totalOverweightFee = hasAnyOversizedItem ? OVERWEIGHT_FEE : 0;
    const totalOversizedFee = hasAnyOversizedItem ? OVERSIZED_FEE : 0;

    // (關鍵) 從 DOM 讀取 *當前* 選中的地區費率
    const deliveryRate = parseFloat(shipDeliveryLocation.value) || 0;
    const totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
    const remoteFee = Math.round(totalCbm * deliveryRate);

    let finalBaseCost = totalFee;
    let noticeHtml = "";

    // 4. [!!! V7.3 關鍵修正：組合小字提示 !!!]
    if (totalFee > 0 && totalFee < MINIMUM_CHARGE) {
      finalBaseCost = MINIMUM_CHARGE;
      // 情況1：有低消
      noticeHtml = `<span style="color: #e74c3c; font-weight: bold;">(基本運費 $${totalFee.toLocaleString()}，已套用低消 $${MINIMUM_CHARGE.toLocaleString()}`;
    } else {
      // 情況2：無低消
      noticeHtml = `(基本運費 $${finalBaseCost.toLocaleString()}`;
    }

    // 判斷是否要加上偏遠費
    if (remoteFee > 0) {
      noticeHtml += ` + 偏遠費 $${remoteFee.toLocaleString()}`;
    }

    // 加上結尾括號
    if (totalFee > 0 && totalFee < MINIMUM_CHARGE) {
      noticeHtml += `)</span>`;
    } else {
      noticeHtml += `)`;
    }
    // [!!! V7.3 修正結束 !!!]

    const finalTotalCost =
      finalBaseCost + totalOverweightFee + totalOversizedFee + remoteFee;

    // 5. [!!! V7.2 關鍵修正：重新組合附加費與偏遠地區費公式 !!!]
    warningHtml = ""; // 清空

    // (A) 顯示偏遠地區費公式
    if (remoteFee > 0) {
      warningHtml += `<div>🚚 偏遠地區費: (總 ${totalShipmentVolume} 材 / ${CBM_TO_CAI_FACTOR.toFixed(
        1
      )} = ${totalCbm.toFixed(
        2
      )} CBM) × $${deliveryRate.toLocaleString()} = <strong>$${remoteFee.toLocaleString()}</strong></div>`;
    }

    // (B) 顯示超長費 (高亮)
    if (hasAnyOversizedItem) {
      warningHtml += `<div>⚠️ 偵測到超長件 (單邊 > ${OVERSIZED_LIMIT}cm)，已加收 <strong>$${OVERSIZED_FEE.toLocaleString()} 超長費</strong>。</div>`;
    }

    // (C) 顯示超重費 (高亮)
    if (hasAnyOverweightItem) {
      warningHtml += `<div>⚠️ 偵測到超重件 (單件 > ${OVERWEIGHT_LIMIT}kg)，已加收 <strong>$${OVERWEIGHT_FEE.toLocaleString()} 超重費</strong>。</div>`;
      warningHtml += `<div style="font-size: 0.9em; font-weight: normal;">(超重件台灣收件地，請務必自行安排堆高機下貨)</div>`;
    }
    // --- [!!! V7.2 修正結束 !!!] ---

    // 6. 填入 UI
    shipmentTotalCost.textContent = finalTotalCost.toLocaleString();
    shipmentFeeNotice.innerHTML = noticeHtml;
    shipmentWarnings.innerHTML = warningHtml;
  }
  // --- [!!! V7.1 修正結束 !!!] ---

  // (F) [*** V7.1 關鍵修正：重構「開啟集運單」彈窗 ***]
  btnCreateShipment.addEventListener("click", async () => {
    const checked = document.querySelectorAll(".package-checkbox:checked");
    if (checked.length === 0) {
      showMessage("請至少選擇一個包裹", "error");
      return;
    }

    btnCreateShipment.disabled = true;
    btnCreateShipment.textContent = "讀取包裹資料中...";

    try {
      // 1. 重新獲取最新包裹資料
      const response = await fetch(`${API_BASE_URL}/api/packages/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "載入包裹失敗");

      allPackagesData = data.packages;

      // 2. 準備變數 (簡化)
      let html = "";
      let ids = [];
      let validCheckedCount = 0;

      // 3. 處理勾選的包裹 (只產生 HTML 和 ID 列表)
      checked.forEach((box) => {
        const p = allPackagesData.find((pkg) => pkg.id === box.dataset.id);

        if (p && p.status === "ARRIVED") {
          validCheckedCount++;
          const packageFee = p.totalCalculatedFee || 0;
          ids.push(p.id);

          html += `<div class="shipment-pkg-detail-item">`;
          html += `<h4>${p.productName} (${p.trackingNumber})</h4>`;

          const arrivedBoxes = Array.isArray(p.arrivedBoxes)
            ? p.arrivedBoxes
            : [];

          if (arrivedBoxes.length > 0) {
            arrivedBoxes.forEach((box) => {
              const rate = RATES[box.type];
              if (!rate) {
                html += `<div class="calc-box"><strong>${
                  box.name || "分箱"
                }:</strong> <span style="color: red;">(類型錯誤，無法計算)</span></div>`;
                return;
              }

              const l = parseFloat(box.length) || 0;
              const w_dim = parseFloat(box.width) || 0;
              const h = parseFloat(box.height) || 0;
              const w = parseFloat(box.weight) || 0;

              const cai = Math.ceil((l * w_dim * h) / VOLUME_DIVISOR);
              const volCost = cai * rate.volumeRate;
              const finalWeight = Math.ceil(w * 10) / 10;
              const weightCost = finalWeight * rate.weightRate;
              const finalFee = box.fee || 0;

              html += `
                <div class="calc-box">
                  <strong>${box.name || "分箱"} (${rate.name}):</strong>
                  <div class="calc-line">
                    📦 <strong>材積費:</strong> (${l}x${w_dim}x${h} / ${VOLUME_DIVISOR} ➜ <strong>${cai} 材</strong>) × $${
                rate.volumeRate
              } = <span class="cost">$${volCost.toLocaleString()}</span>
                  </div>
                  <div class="calc-line">
                    ⚖️ <strong>重量費:</strong> (<strong>${finalWeight} kg</strong>) × $${
                rate.weightRate
              } = <span class="cost">$${Math.round(
                weightCost
              ).toLocaleString()}</span>
                  </div>
                  <div class="calc-line final">
                    → 單箱運費 (取高): <strong>$${finalFee.toLocaleString()}</strong>
                  </div>
                </div>
              `;
            });
          } else {
            html += `<p style="color: #888; font-style: italic;">此包裹尚未入庫（無分箱資料），運費暫計 $0</p>`;
          }

          html += `<div class="pkg-subtotal">包裹小計: <strong>$${packageFee.toLocaleString()}</strong></div>`;
          html += `</div>`;
        }
      });

      // 4. 檢查有效性
      if (validCheckedCount === 0) {
        showMessage(
          "您選擇的包裹狀態已變更（可能已被集運），請重新整理頁面。",
          "error"
        );
        loadMyPackages();
        return;
      } else if (validCheckedCount < checked.length) {
        showMessage("部分包裹狀態已更新，已自動為您移除無效包裹。", "success");
        loadMyPackages();
      }

      // 5. 填入 UI
      shipmentPackageList.innerHTML = html;

      // 6. 填入表單預設值
      createShipmentForm.dataset.ids = JSON.stringify(ids);
      document.getElementById("ship-name").value = currentUser.name || "";
      document.getElementById("ship-phone").value = currentUser.phone || "";

      // (清空地區)
      shipDeliveryLocation.value = "";
      shipStreetAddress.value = "";
      shipRemoteAreaInfo.style.display = "none";
      shipAreaSearch.value = "";
      shipSearchResults.style.display = "none";

      document.getElementById("ship-note").value = "";

      // 7. [!!! 關鍵 !!!] 在開啟彈窗前，呼叫一次計算函式 (使用預設的 "0" 費率)
      recalculateShipmentTotal();

      // 8. 開啟彈窗
      createShipmentModal.style.display = "flex";
    } catch (e) {
      console.error("btnCreateShipment 錯誤:", e);
      showMessage(`載入包裹資料失敗: ${e.message}`, "error");
    } finally {
      btnCreateShipment.disabled = false;
      btnCreateShipment.textContent = "合併打包 (建立集運單)";
    }
  });

  // (G) [*** V7 關鍵修正：提交「建立集運單」表單 ***]
  createShipmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = JSON.parse(createShipmentForm.dataset.ids);

    // [!!! V7 新增：獲取地區資料 !!!]
    const deliveryRate = parseFloat(shipDeliveryLocation.value);
    const streetAddress = shipStreetAddress.value.trim();

    if (isNaN(deliveryRate)) {
      showMessage("錯誤：請務必選擇「配送地區」。", "error");
      return;
    }

    if (!streetAddress) {
      showMessage("錯誤：請務必填寫「詳細地址」。", "error");
      return;
    }

    // 組合新地址
    const selectedOption =
      shipDeliveryLocation.options[shipDeliveryLocation.selectedIndex];
    const areaName = selectedOption.text.replace(/[✅📍⛰️🏖️🏝️⚠️]/g, "").trim(); // "一般地區" 或 "陽明山"
    const fullAddress =
      (areaName === "一般地區" ? "" : areaName + " ") + streetAddress; // [!!! 修正：增加空格 !!!]

    // [!!! V7 修正結束 !!!]

    const data = {
      packageIds: ids,
      recipientName: document.getElementById("ship-name").value.trim(),
      phone: document.getElementById("ship-phone").value.trim(),
      shippingAddress: fullAddress, // [!!! V7 修改 !!!]
      deliveryLocationRate: deliveryRate, // [!!! V7 新增 !!!]
      idNumber: document.getElementById("ship-idNumber").value.trim(),
      taxId: document.getElementById("ship-taxId").value.trim(),
      note: document.getElementById("ship-note").value.trim(),
    };

    // 驗證
    if (
      !data.recipientName ||
      !data.phone ||
      !data.shippingAddress ||
      !data.idNumber
    ) {
      showMessage(
        "錯誤：收件人姓名、電話、地址、身分證字號為必填欄位。",
        "error"
      );
      return; // 停止提交
    }
    if (!data.packageIds || data.packageIds.length === 0) {
      showMessage("錯誤：沒有選中任何包裹。", "error");
      return; // 停止提交
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        document.getElementById("create-shipment-modal").style.display = "none";
        createShipmentForm.reset();
        bankInfoModal.style.display = "flex";
        loadMyPackages();
        loadMyShipments();
      } else {
        const err = await res.json();
        throw new Error(err.message || "提交失敗，請檢查欄位");
      }
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  // (H) 提交憑證上傳
  uploadProofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("upload-proof-id").value;
    const file = document.getElementById("proof-file").files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("paymentProof", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        uploadProofModal.style.display = "none";
        alert("上傳成功！我們將盡快為您確認。");
        loadMyShipments();
      } else {
        alert("上傳失敗，請稍後再試");
      }
    } catch (e) {
      alert("上傳發生錯誤");
    }
  });

  // (I) Tab 與 編輯個資
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
  btnEditProfile.addEventListener("click", () => {
    document.getElementById("edit-name").value = currentUser.name || "";
    document.getElementById("edit-phone").value = currentUser.phone || "";
    document.getElementById("edit-address").value =
      currentUser.defaultAddress || "";
    document.getElementById("edit-profile-modal").style.display = "flex";
  });
  editProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("edit-name").value,
      phone: document.getElementById("edit-phone").value,
      defaultAddress: document.getElementById("edit-address").value,
    };
    await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    document.getElementById("edit-profile-modal").style.display = "none";
    loadUserProfile();
  });

  // (J) 編輯包裹 (預報)
  function openEditPackageModal(pkg) {
    document.getElementById("edit-package-id").value = pkg.id;
    document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
    document.getElementById("edit-productName").value = pkg.productName;
    document.getElementById("edit-quantity").value = pkg.quantity;
    document.getElementById("edit-note").value = pkg.note || "";
    document.getElementById("edit-package-modal").style.display = "flex";
  }
  const btnClosePackageModal = document.querySelector(
    "#edit-package-modal .modal-close"
  );
  btnClosePackageModal.addEventListener(
    "click",
    () => (document.getElementById("edit-package-modal").style.display = "none")
  );

  const editPackageForm = document.getElementById("edit-package-form");
  editPackageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-package-id").value;
    const data = {
      trackingNumber: document.getElementById("edit-trackingNumber").value,
      productName: document.getElementById("edit-productName").value,
      quantity: parseInt(document.getElementById("edit-quantity").value),
      note: document.getElementById("edit-note").value,
    };
    await fetch(`${API_BASE_URL}/api/packages/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    document.getElementById("edit-package-modal").style.display = "none";
    loadMyPackages();
  });

  // (K) 綁定所有彈窗關閉
  const allModals = document.querySelectorAll(".modal-overlay");
  allModals.forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
    const closeBtns = m.querySelectorAll(".modal-close, .modal-close-btn");
    closeBtns.forEach((btn) =>
      btn.addEventListener("click", () => (m.style.display = "none"))
    );
  });

  // (L) 綁定一鍵複製
  const btnCopyBankInfo = document.getElementById("btn-copy-bank-info");
  if (btnCopyBankInfo) {
    btnCopyBankInfo.addEventListener("click", () => {
      const bankName = document.getElementById("bank-name").textContent;
      const bankAccount = document.getElementById("bank-account").textContent;
      const bankHolder = document.getElementById("bank-holder").textContent;
      const copyText = `銀行：${bankName}\n帳號：${bankAccount}\n戶名：${bankHolder}`;

      navigator.clipboard
        .writeText(copyText)
        .then(() => {
          const originalText = btnCopyBankInfo.textContent;
          const originalColor = btnCopyBankInfo.style.backgroundColor;
          btnCopyBankInfo.textContent = "✓ 已複製成功！";
          btnCopyBankInfo.style.backgroundColor = "#27ae60";
          btnCopyBankInfo.disabled = true;
          setTimeout(() => {
            btnCopyBankInfo.textContent = originalText;
            btnCopyBankInfo.style.backgroundColor = originalColor;
            btnCopyBankInfo.disabled = false;
          }, 3000);
        })
        .catch((err) => {
          console.error("複製失敗:", err);
          alert("複製失敗，請手動複製");
        });
    });
  }

  // (M) [*** 關鍵修正 V4 ***] 檢查草稿佇列 (修正 Bug 並新增 UI)
  function checkForecastDraftQueue(isAfterSubmit = false) {
    // (A) 處理舊版 (V2) 的 "單筆" 草稿，將其轉換為 V3/V4 的 "佇列"
    const oldDraftJSON = localStorage.getItem("forecast_draft");
    if (oldDraftJSON) {
      try {
        const oldDraft = JSON.parse(oldDraftJSON);
        // 轉存為只有一筆的佇列
        localStorage.setItem("forecast_draft_list", JSON.stringify([oldDraft]));
        localStorage.removeItem("forecast_draft"); // 刪除舊版
        localStorage.removeItem("show_multi_item_warning"); // 刪除舊版
      } catch (e) {
        // 解析失敗，清除舊資料
        localStorage.removeItem("forecast_draft");
        localStorage.removeItem("show_multi_item_warning");
      }
    }

    // (B) 處理 V4 佇列
    const draftListJSON = localStorage.getItem("forecast_draft_list");
    let draftList = [];
    if (draftListJSON) {
      try {
        draftList = JSON.parse(draftListJSON);
      } catch (e) {
        localStorage.removeItem("forecast_draft_list");
        return; // 解析失敗，退出
      }
    }

    // (C) 檢查佇列是否為空
    if (draftList.length === 0) {
      draftQueueContainer.style.display = "none"; // 隱藏 "待處理" 區塊

      // [*** V4 Bug 修正 ***]
      // 只有在佇列為空時，才執行清除
      localStorage.removeItem("forecast_draft_list");
      // [*** 修正結束 ***]

      return; // 沒有佇列，結束
    }

    // (D) 佇列有東西，開始處理

    // 1. 更新 "待處理" 列表 UI
    draftQueueContainer.style.display = "block"; // 顯示區塊
    draftQueueList.innerHTML = ""; // 清空
    draftList.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.name} (數量: ${item.quantity || 1})`;
      draftQueueList.appendChild(li);
    });

    // 2. 取出第一筆 (下一個要處理的)
    const nextItem = draftList.shift(); // .shift() 會從陣列中 "取出" 第一筆

    // 3. 填入表單
    productName.value = nextItem.name || "";
    quantity.value = nextItem.quantity || 1;
    note.value = "來自運費試算";
    trackingNumber.value = ""; // 確保物流單號是清空的
    imagesInput.value = null; // 確保檔案是清空的

    // 4. 顯示提示訊息
    let message = "";
    if (isAfterSubmit) {
      message = `預報成功！已自動帶入下一筆 (${nextItem.name})。`;
    } else {
      message = `已自動帶入第 1 筆 (${nextItem.name})。`;
    }

    if (draftList.length > 0) {
      message += ` 還有 ${draftList.length} 筆在佇列中。`;
    } else {
      message += " 這是最後一筆了。";
    }
    showMessage(message, "success");

    // 5. 將 *剩下的* (已經 .shift() 過的) 存回去
    //    如果 draftList.length 現在是 0，這裡會存入 "[]"
    localStorage.setItem("forecast_draft_list", JSON.stringify(draftList));

    // 6. 捲動並 Focus
    if (!isAfterSubmit) {
      // 只有在頁面 "載入" 時才捲動，提交後不用
      forecastForm.scrollIntoView({ behavior: "smooth" });
    }
    trackingNumber.focus(); // 讓使用者可以直接輸入最重要的物流單號
  }

  // --- [!!! V7.1 修正：綁定集運單彈窗的地區搜尋邏輯 !!!] ---

  // (N.1) 選擇搜尋結果
  window.selectShipRemoteArea = function (areaName, fee) {
    for (let i = 0; i < shipDeliveryLocation.options.length; i++) {
      const option = shipDeliveryLocation.options[i];
      if (option.value === fee.toString()) {
        const optionText = option.textContent.replace(/[⛰️🏝️🏖️⚠️]/g, "").trim();
        if (optionText.includes(areaName)) {
          shipDeliveryLocation.selectedIndex = i;
          shipDeliveryLocation.dispatchEvent(new Event("change"));
          shipAreaSearch.value = areaName;
          shipSearchResults.style.display = "none";
          break;
        }
      }
    }
  };

  // (N.2) 監聽下拉選單變更
  shipDeliveryLocation.addEventListener("change", function () {
    const selectedOption = this.options[this.selectedIndex];
    const feeValue = this.value;

    if (feeValue === "0") {
      shipRemoteAreaInfo.style.display = "block";
      shipRemoteAreaInfo.style.backgroundColor = "#d4edda";
      shipRemoteAreaInfo.style.borderLeft = "4px solid #28a745";
      shipSelectedAreaName.textContent = "一般地區";
      shipSelectedAreaName.style.color = "#155724";
      shipSelectedAreaFee.textContent = "無額外費用";
      shipSelectedAreaFee.style.color = "#155724";
    } else if (feeValue) {
      shipRemoteAreaInfo.style.display = "block";
      const areaText = selectedOption.textContent
        .replace(/[⛰️🏝️🏖️⚠️✅]/g, "")
        .trim();
      shipSelectedAreaName.textContent = areaText;
      shipSelectedAreaFee.textContent = `NT$ ${parseInt(
        feeValue
      ).toLocaleString()} /方起`;

      if (areaText.includes("客服")) {
        shipRemoteAreaInfo.style.backgroundColor = "#fff3cd";
        shipRemoteAreaInfo.style.borderLeft = "4px solid #ff9800";
        shipSelectedAreaName.style.color = "#ff6b6b";
        shipSelectedAreaFee.innerHTML = `NT$ ${parseInt(
          feeValue
        ).toLocaleString()} /方起 <small style="color: #ff9800;">(詳情請詢問客服)</small>`;
        shipSelectedAreaFee.style.color = "#e74c3c";
      } else if (parseInt(feeValue) >= 5000) {
        shipRemoteAreaInfo.style.backgroundColor = "#f8d7da";
        shipRemoteAreaInfo.style.borderLeft = "4px solid #dc3545";
        shipSelectedAreaName.style.color = "#721c24";
        shipSelectedAreaFee.style.color = "#dc3545";
      } else {
        shipRemoteAreaInfo.style.backgroundColor = "#fff3cd";
        shipRemoteAreaInfo.style.borderLeft = "4px solid #ffc107";
        shipSelectedAreaName.style.color = "#856404";
        shipSelectedAreaFee.style.color = "#e74c3c";
      }
    } else {
      shipRemoteAreaInfo.style.display = "none";
    }

    // [!!! 關鍵修正 !!!]
    // 不再呼叫 btnCreateShipment.click()
    // 而是直接呼叫新的計算函式
    recalculateShipmentTotal();
  });

  // (N.3) 監聽搜尋框輸入
  shipAreaSearch.addEventListener("input", function (e) {
    const searchTerm = e.target.value.trim().toLowerCase();
    if (searchTerm.length < 1) {
      shipSearchResults.style.display = "none";
      return;
    }

    let results = [];
    for (const [fee, areas] of Object.entries(remoteAreas)) {
      areas.forEach((area) => {
        if (area.toLowerCase().includes(searchTerm)) {
          results.push({ area: area, fee: parseInt(fee) });
        }
      });
    }

    if (results.length > 0) {
      shipSearchResults.style.display = "block";
      shipSearchResults.innerHTML = results
        .map(
          (r) => `
      <div class="search-result-item" onclick="selectShipRemoteArea('${
        r.area
      }', ${r.fee})">
        📍 ${r.area} 
        <span style="color: #e74c3c; font-weight: bold; float: right;">
          NT$ ${r.fee.toLocaleString()}/方起
        </span>
      </div>
    `
        )
        .join("");
    } else {
      shipSearchResults.style.display = "block";
      shipSearchResults.innerHTML = `
      <div style="padding: 10px; color: #666; background: #f8f9fa;">
        ✅ 找不到 "${searchTerm}"，可能屬於一般地區。
      </div>
    `;
    }
  });
  // --- [!!! V7.1 修正結束 !!!] ---

  // --- (初始載入) ---
  loadUserProfile();
  loadMyPackages();
  loadMyShipments();
  checkForecastDraftQueue(false);
});
