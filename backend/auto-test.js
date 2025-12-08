// auto-test.js
// 小跑豬 (RunPiggy) 系統自動檢測腳本
// 支援一鍵切換 Local (本機) 與 Prod (正式機) 環境
//
// 使用方式:
//   1. 測試本機: node auto-test.js
//   2. 測試正式: node auto-test.js prod

// --- 1. 環境配置 ---
const args = process.argv.slice(2);
const isProd = args.includes("prod");

// 定義 API 網址
const PROD_URL = "https://runpiggy-api.onrender.com";
const LOCAL_URL = "http://localhost:3000";

const API_URL = isProd ? PROD_URL : LOCAL_URL;

// --- 2. 管理員帳號設定 (請確保與目標資料庫一致) ---
// 注意：正式機 (Render) 與本機 (Local) 的資料庫可能不同
// 請確認此帳號在目標環境中已存在且具備管理員權限
const ADMIN_CREDENTIALS = {
  email: "randyhuang1007@gmail.com", // 請修改為您的管理員 Email
  password: "randy1007", // 請修改為您的管理員密碼
};

// --- 3. 測試主程式 ---
async function runTests() {
  console.log("==================================================");
  console.log(`🚀 開始執行小跑豬 (RunPiggy) 系統自動檢測`);
  console.log(
    `cj 目標環境: ${isProd ? "☁️  正式機 (Render)" : "💻  本機 (Localhost)"}`
  );
  console.log(`🌐 API 網址: ${API_URL}`);
  console.log("==================================================\n");

  let token = "";
  let userId = "";

  // 通用請求函式
  const request = async (
    endpoint,
    method = "GET",
    body = null,
    authToken = null
  ) => {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      // 嘗試解析 JSON，若失敗則回傳純文字錯誤
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      } else {
        const text = await res.text();
        return {
          error: `非 JSON 回應 (${res.status}): ${text.substring(0, 100)}...`,
        };
      }

      return { status: res.status, data };
    } catch (e) {
      return { error: `連線失敗: ${e.message}` };
    }
  };

  // --- 步驟 1: 檢查系統公開設定 ---
  process.stdout.write("1. [公開API] 取得系統設定 (Calculator Config)... ");
  const step1 = await request("/api/calculator/config");
  if (step1.status === 200 && step1.data.success) {
    console.log("✅ 通過");
  } else {
    console.log("❌ 失敗");
    console.error("   錯誤詳情:", step1.error || step1.data);
    if (!step1.status) console.log("   提示: 請確認伺服器是否已啟動？");
    return; // 連線失敗則中止
  }

  // --- 步驟 2: 管理員登入 ---
  process.stdout.write("2. [認證] 管理員登入取得 Token... ");
  const step2 = await request("/api/auth/login", "POST", ADMIN_CREDENTIALS);
  if (step2.status === 200 && step2.data.success) {
    token = step2.data.token;
    userId = step2.data.user.id;
    console.log(`✅ 通過 (User ID: ${userId})`);
  } else {
    console.log("❌ 失敗");
    console.error("   錯誤詳情:", step2.data || step2.error);
    console.log("   提示: 請檢查腳本中的 ADMIN_CREDENTIALS 帳號密碼是否正確。");
    return; // 無法登入則中止
  }

  // --- 步驟 3: 驗證 Token 有效性 ---
  process.stdout.write("3. [權限] 使用 Token 取得個人資料 (Get Me)... ");
  const step3 = await request("/api/auth/me", "GET", null, token);
  if (
    step3.status === 200 &&
    step3.data.user.email.toLowerCase() ===
      ADMIN_CREDENTIALS.email.toLowerCase()
  ) {
    console.log("✅ 通過");
  } else {
    console.log("❌ 失敗", step3.data || step3.error);
  }

  // --- 步驟 4: 核心業務 - 運費試算 ---
  process.stdout.write("4. [核心業務] 執行海運運費試算... ");
  const mockCalcData = {
    deliveryLocationRate: 0, // 0 = 一般地區
    items: [
      {
        name: "自動測試商品",
        weight: 10,
        length: 50,
        width: 50,
        height: 50,
        quantity: 1,
        type: "general",
        calcMethod: "dimensions",
      },
    ],
  };
  const step4 = await request("/api/calculator/sea", "POST", mockCalcData);
  if (step4.status === 200 && step4.data.success) {
    const result = step4.data.calculationResult;
    if (result && result.finalTotal > 0) {
      console.log(`✅ 通過 (試算總額: $${result.finalTotal})`);
    } else {
      console.log("⚠️ 警告: 試算成功但金額為 0，請檢查費率設定");
    }
  } else {
    console.log("❌ 失敗", step4.data || step4.error);
  }

  // --- 步驟 5: 後台管理權限測試 ---
  process.stdout.write("5. [後台管理] 讀取所有會員列表 (Admin Only)... ");
  const step5 = await request("/api/admin/users", "GET", null, token);
  if (step5.status === 200 && step5.data.success) {
    console.log(`✅ 通過 (系統會員數: ${step5.data.pagination.total})`);
  } else {
    console.log(
      "❌ 失敗 (可能是權限不足或 API 路徑錯誤)",
      step5.data || step5.error
    );
  }

  // --- 總結 ---
  console.log("\n--------------------------------------------------");
  console.log("🎉 測試結束！請查看上方是否有 ❌ 失敗項目。");
}

// 執行
runTests();
