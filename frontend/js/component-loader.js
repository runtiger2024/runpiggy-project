/**
 * component-loader.js
 * 用於動態載入 HTML 片段，解決單一 HTML 檔案過大的問題。
 */

async function loadComponent(targetId, filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Failed to load ${filePath}`);
    const html = await response.text();
    const element = document.getElementById(targetId);
    if (element) {
      element.innerHTML = html;
    } else {
      console.warn(`Target element #${targetId} not found for ${filePath}`);
    }
  } catch (error) {
    console.error("Component Loader Error:", error);
  }
}

async function loadAllComponents() {
  // 定義所有需要注入的區塊與對應檔案
  // key: dashboard.html 中的容器 ID
  // value: components 資料夾下的檔案路徑
  const components = [
    // 主要分頁區塊 (Sections)
    {
      id: "packages-section-content",
      path: "components/sections/packages.html",
    },
    {
      id: "shipments-section-content",
      path: "components/sections/shipments.html",
    },
    {
      id: "recipient-section-content",
      path: "components/sections/recipients.html",
    },
    { id: "wallet-section-content", path: "components/sections/wallet.html" },

    // 彈窗 (Modals)
    {
      id: "modal-container-edit-profile",
      path: "components/modals/profile-edit.html",
    },
    {
      id: "modal-container-change-pw",
      path: "components/modals/password-change.html",
    },
    {
      id: "modal-container-create-shipment",
      path: "components/modals/shipment-create.html",
    },
    { id: "modal-container-deposit", path: "components/modals/deposit.html" },
    {
      id: "modal-container-bulk",
      path: "components/modals/bulk-forecast.html",
    },
    {
      id: "modal-container-claim",
      path: "components/modals/claim-package.html",
    },
    // ...其他彈窗依此類推
  ];

  // 平行載入所有組件 (加速)
  await Promise.all(components.map((c) => loadComponent(c.id, c.path)));

  console.log("✅ All components loaded.");
}

// 動態載入 Script 的輔助函式 (確保在 HTML 載入後執行)
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
