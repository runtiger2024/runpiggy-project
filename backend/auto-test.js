/**
 * auto-test.js (V3.0 Pro - Enhanced Logging & Validation)
 * 小跑豬 (RunPiggy) 全自動系統健檢腳本
 *
 * 功能特色：
 * 1. 支援 Local / Prod 環境切換
 * 2. 具備詳細的時間戳記日誌 (Timestamp Logs)
 * 3. 失敗時自動輸出完整 API 回應 (Debug Info)
 * 4. 驗證錢包餘額變動 (Balance Check)
 * 5. 驗證運費試算邏輯 (Cost Check)
 *
 * 使用方式:
 * node auto-test.js        (測試本機)
 * node auto-test.js prod   (測試 Render 正式機)
 */

const fs = require("fs");
const args = process.argv.slice(2);
const isProd = args.includes("prod");

// ==========================================
// 1. 設定區 (Configuration)
// ==========================================
const CONFIG = {
  apiUrl: isProd
    ? "https://runpiggy-api.onrender.com"
    : "http://localhost:3000",
  admin: {
    email: "randyhuang1007@gmail.com", // 您的管理員帳號
    password: "randy1007", // 您的管理員密碼
  },
  testUser: {
    email: `auto_tester_${Date.now()}@test.com`,
    password: "password123",
    name: "自動化測試員",
  },
  // 測試參數
  depositAmount: 5000, // 儲值金額
  packageWeight: 10, // 包裹重量 (kg)
  packageSize: 50, // 包裹尺寸 (cm)
};

// ==========================================
// 2. 日誌與工具 (Logger & Utils)
// ==========================================
const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function timestamp() {
  return new Date().toISOString().split("T")[1].slice(0, -1);
}

const Logger = {
  info: (msg) =>
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ℹ️  ${msg}`),
  pass: (msg) =>
    console.log(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}✅ PASS:${
        COLORS.reset
      } ${msg}`
    ),
  fail: (msg, detail) => {
    console.log(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}❌ FAIL:${
        COLORS.reset
      } ${msg}`
    );
    if (detail) {
      console.log(
        `${COLORS.red}   >>> 錯誤詳情: ${
          typeof detail === "object" ? JSON.stringify(detail, null, 2) : detail
        }${COLORS.reset}`
      );
    }
  },
  header: (title) => {
    console.log(`\n${COLORS.cyan}=== ${title} ===${COLORS.reset}`);
  },
  warn: (msg) =>
    console.log(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}⚠️  WARN:${
        COLORS.reset
      } ${msg}`
    ),
};

// API 請求封裝
async function apiCall(method, endpoint, body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${CONFIG.apiUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    let data;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = { text: await res.text() };
    }

    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return {
      status: 0,
      ok: false,
      data: { message: `連線失敗: ${e.message}` },
    };
  }
}

// ==========================================
// 3. 測試流程 (Test Flow)
// ==========================================
async function startTesting() {
  console.log(
    `${COLORS.cyan}🚀 啟動小跑豬系統自動檢測 (V3.0 Pro)${COLORS.reset}`
  );
  console.log(
    `🎯 目標環境: ${isProd ? "☁️  Render 正式機" : "💻  Local 本機"}`
  );
  console.log(`🌐 API 網址: ${CONFIG.apiUrl}`);
  console.log(`👤 測試帳號: ${CONFIG.testUser.email}\n`);

  let adminToken = null;
  let clientToken = null;
  let clientUserId = null;
  let packageId = null;
  let shipmentId = null;
  let initialBalance = 0;
  let finalBalance = 0;
  let estimatedCost = 0;

  // --- STEP 1: 系統檢查 ---
  Logger.header("1. 系統連線與管理員權限");

  // 1-1 檢查 Config
  const resConfig = await apiCall("GET", "/api/calculator/config");
  if (resConfig.ok) Logger.pass("取得系統設定 (API 連線正常)");
  else {
    Logger.fail("無法連線至系統", resConfig.data);
    return; // 系統連不上，直接結束
  }

  // 1-2 管理員登入
  const resAdminLogin = await apiCall("POST", "/api/auth/login", CONFIG.admin);
  if (resAdminLogin.ok) {
    adminToken = resAdminLogin.data.token;
    Logger.pass("管理員登入成功");
  } else {
    Logger.fail("管理員登入失敗", resAdminLogin.data);
    return; // 無法登入，結束
  }

  // --- STEP 2: 用戶生命週期 ---
  Logger.header("2. 客戶端流程模擬 (註冊 & 錢包)");

  // 2-1 註冊
  const resReg = await apiCall("POST", "/api/auth/register", CONFIG.testUser);
  if (resReg.ok) {
    clientToken = resReg.data.token;
    clientUserId = resReg.data.user.id;
    Logger.pass(`註冊測試用戶成功 (ID: ${clientUserId})`);
  } else {
    Logger.fail("用戶註冊失敗", resReg.data);
    return;
  }

  // 2-2 檢查初始餘額
  const resWallet1 = await apiCall("GET", "/api/wallet/my", null, clientToken);
  initialBalance = resWallet1.data.wallet ? resWallet1.data.wallet.balance : 0;
  Logger.info(`初始錢包餘額: $${initialBalance}`);

  // 2-3 管理員發錢 (模擬儲值)
  const resAdjust = await apiCall(
    "POST",
    "/api/admin/finance/adjust",
    {
      userId: clientUserId,
      amount: CONFIG.depositAmount,
      note: "Auto Test Deposit",
    },
    adminToken
  );

  if (resAdjust.ok) {
    Logger.pass(`管理員已手動儲值 $${CONFIG.depositAmount}`);
  } else {
    Logger.fail("錢包儲值失敗", resAdjust.data);
    return;
  }

  // 2-4 驗證餘額是否增加
  const resWallet2 = await apiCall("GET", "/api/wallet/my", null, clientToken);
  const newBalance = resWallet2.data.wallet.balance;
  if (newBalance === initialBalance + CONFIG.depositAmount) {
    Logger.pass(`餘額驗證成功 (目前: $${newBalance})`);
  } else {
    Logger.fail(
      `餘額驗證失敗! 預期: ${
        initialBalance + CONFIG.depositAmount
      }, 實際: ${newBalance}`
    );
  }

  // --- STEP 3: 物流流程 ---
  Logger.header("3. 物流流程 (預報 -> 入庫 -> 下單)");

  // 3-1 客戶預報包裹 (Client Forecast)
  // 這裡使用 multipart/form-data 比較麻煩，我們改用 JSON 介面 (若後端有支援)
  // 或者直接使用管理員建立 (模擬代客預報) 來簡化腳本依賴
  const resPkgCreate = await apiCall(
    "POST",
    "/api/admin/packages/create",
    {
      userId: clientUserId,
      trackingNumber: `PKG${Date.now()}`,
      productName: "自動測試商品",
      quantity: 1,
      note: "Auto Test",
    },
    adminToken
  );

  if (resPkgCreate.ok) {
    packageId = resPkgCreate.data.package.id;
    Logger.pass(
      `包裹建立成功 (單號: ${resPkgCreate.data.package.trackingNumber})`
    );
  } else {
    Logger.fail("包裹建立失敗", resPkgCreate.data);
    return;
  }

  // 3-2 管理員入庫測量 (Warehouse Measure)
  const resMeasure = await apiCall(
    "PUT",
    `/api/admin/packages/${packageId}/details`,
    {
      status: "ARRIVED",
      boxesData: JSON.stringify([
        {
          type: "general",
          weight: CONFIG.packageWeight,
          length: CONFIG.packageSize,
          width: CONFIG.packageSize,
          height: CONFIG.packageSize,
        },
      ]),
    },
    adminToken
  );

  if (resMeasure.ok) {
    Logger.pass("包裹已入庫並完成測量");
  } else {
    Logger.fail("包裹入庫失敗", resMeasure.data);
    return;
  }

  // 3-3 客戶運費試算 (Preview Cost)
  const resPreview = await apiCall(
    "POST",
    "/api/shipments/preview",
    {
      packageIds: [packageId], // 陣列
      deliveryLocationRate: 0,
    },
    clientToken
  );

  if (resPreview.ok && resPreview.data.preview) {
    estimatedCost = resPreview.data.preview.totalCost;
    Logger.pass(`運費試算成功: $${estimatedCost}`);
  } else {
    Logger.warn("運費試算失敗，將盲測下單", resPreview.data);
  }

  // 3-4 建立集運單 (Create Shipment & Pay)
  const resShip = await apiCall(
    "POST",
    "/api/shipments/create",
    {
      packageIds: JSON.stringify([packageId]),
      paymentMethod: "WALLET",
      recipientName: "測試收件人",
      phone: "0912345678",
      shippingAddress: "測試路1號",
      deliveryLocationRate: 0,
      idNumber: "A123456789",
      productUrl: "http://test.com",
    },
    clientToken
  );

  if (resShip.ok) {
    shipmentId = resShip.data.shipment.id;
    Logger.pass(`集運單建立成功 (ID: ${shipmentId})`);
  } else {
    Logger.fail("集運單建立失敗", resShip.data);
    return;
  }

  // 3-5 驗證扣款 (Validate Payment)
  const resWallet3 = await apiCall("GET", "/api/wallet/my", null, clientToken);
  finalBalance = resWallet3.data.wallet.balance;
  // 判斷餘額是否減少 (簡單判斷 < 儲值後金額)
  if (finalBalance < initialBalance + CONFIG.depositAmount) {
    Logger.pass(
      `錢包扣款驗證成功 (剩餘: $${finalBalance}, 扣除約: $${
        initialBalance + CONFIG.depositAmount - finalBalance
      })`
    );
  } else {
    Logger.fail("錢包扣款驗證失敗！餘額未減少");
  }

  // --- STEP 4: 發票與管理 ---
  Logger.header("4. 發票與後續管理");

  // 4-1 開立發票
  const resInvoice = await apiCall(
    "POST",
    `/api/admin/shipments/${shipmentId}/invoice/issue`,
    {},
    adminToken
  );
  if (resInvoice.ok) {
    Logger.pass(`發票開立成功 (號碼: ${resInvoice.data.invoiceNumber})`);
  } else {
    const msg = resInvoice.data.message || "";
    if (msg.includes("已關閉") || msg.includes("錢包支付")) {
      Logger.info(`跳過發票開立 (${msg})`);
    } else {
      Logger.warn(`發票開立未成功 (可能是 API Key 未設定): ${msg}`);
    }
  }

  // --- STEP 5: 清理 ---
  Logger.header("5. 數據清理 (Cleanup)");
  const resDel = await apiCall(
    "DELETE",
    `/api/admin/users/${clientUserId}`,
    null,
    adminToken
  );
  if (resDel.ok) {
    Logger.pass("測試帳號與關聯資料已刪除");
  } else {
    Logger.warn("測試帳號刪除失敗，請手動清理", resDel.data);
  }

  console.log(`\n${COLORS.green}🎉 所有測試項目執行完畢！${COLORS.reset}\n`);
}

// 執行
startTesting();
