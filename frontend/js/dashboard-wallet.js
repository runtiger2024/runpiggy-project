// frontend/js/dashboard-wallet.js
// 負責錢包餘額、交易紀錄與儲值功能
// V25.6 - Fixed: Hoisting issues with custom loader

// --- 函式定義 (移至上方) ---

// 1. 載入錢包資料
window.loadWalletData = async function () {
  const balanceEl = document.getElementById("wallet-balance");
  const listEl = document.getElementById("transaction-list");
  const loadingEl = document.getElementById("wallet-loading");

  if (loadingEl) loadingEl.style.display = "block";
  if (listEl) listEl.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.wallet) {
      if (balanceEl) {
        balanceEl.textContent = `$${data.wallet.balance.toLocaleString()}`;
        if (data.wallet.balance < 0) balanceEl.style.color = "#d32f2f";
        else balanceEl.style.color = "#28a745";
      }
      renderTransactions(data.wallet.transactions || []);
    }
  } catch (e) {
    console.error("錢包載入失敗", e);
    if (balanceEl) balanceEl.textContent = "Error";
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
};

function renderTransactions(txs) {
  const listEl = document.getElementById("transaction-list");
  if (!listEl) return;

  if (txs.length === 0) {
    listEl.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:20px; color:#999;">尚無交易紀錄</td></tr>`;
    return;
  }

  const statusMap = {
    PENDING: { text: "審核中", class: "status-PENDING" },
    COMPLETED: { text: "成功", class: "status-COMPLETED" },
    FAILED: { text: "失敗", class: "status-CANCELLED" },
    REJECTED: { text: "已駁回", class: "status-CANCELLED" },
  };

  const typeMap = {
    DEPOSIT: "儲值",
    PAYMENT: "支付運費",
    REFUND: "退款",
    ADJUST: "系統調整",
  };

  let html = "";
  txs.forEach((tx) => {
    const statusObj = statusMap[tx.status] || { text: tx.status, class: "" };
    const typeText = typeMap[tx.type] || tx.type;
    const isNegative = tx.amount < 0;
    const amountClass = isNegative ? "text-danger" : "text-success";
    const amountSign = isNegative ? "" : "+";

    html += `
            <tr>
                <td>${new Date(
                  tx.createdAt
                ).toLocaleDateString()} <small style="color:#999;">${new Date(
      tx.createdAt
    ).toLocaleTimeString()}</small></td>
                <td>${typeText}</td>
                <td>${tx.description || "-"}</td>
                <td class="${amountClass}" style="font-weight:bold; font-family:monospace; font-size:1.1em;">
                    ${amountSign}${tx.amount.toLocaleString()}
                </td>
                <td><span class="status-badge ${statusObj.class}">${
      statusObj.text
    }</span></td>
            </tr>
        `;
  });

  listEl.innerHTML = html;
}

// 2. 儲值 Modal
window.openDepositModal = function () {
  const modal = document.getElementById("deposit-modal");
  const form = document.getElementById("deposit-form");

  const bankInfoEl = document.getElementById("deposit-bank-info");
  if (bankInfoEl && window.BANK_INFO_CACHE) {
    bankInfoEl.innerHTML = `
            <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:15px; font-size:14px;">
                <p style="margin:0 0 5px 0;"><strong>請轉帳至：</strong></p>
                <div>銀行：${window.BANK_INFO_CACHE.bankName}</div>
                <div>帳號：<span style="color:#d32f2f; font-weight:bold; font-family:monospace;">${window.BANK_INFO_CACHE.account}</span></div>
                <div>戶名：${window.BANK_INFO_CACHE.holder}</div>
            </div>
        `;
  }

  if (form) form.reset();
  if (modal) modal.style.display = "flex";
};

// 3. 處理儲值提交
async function handleDepositSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const amount = document.getElementById("dep-amount").value;
  const desc = document.getElementById("dep-note").value;
  const file = document.getElementById("dep-proof").files[0];

  const fd = new FormData();
  fd.append("amount", amount);
  fd.append("description", desc);
  if (file) fd.append("proof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/deposit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      alert("儲值申請已提交，請等待管理員審核。");
      document.getElementById("deposit-modal").style.display = "none";
      window.loadWalletData();
    } else {
      alert(data.message || "提交失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "提交申請";
  }
}

// --- 初始化 (移至下方) ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. 綁定 Tab 切換 (錢包)
  const tabWallet = document.getElementById("tab-wallet");
  if (tabWallet) {
    tabWallet.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));

      tabWallet.classList.add("active");
      document.getElementById("wallet-section").style.display = "block";

      // 修正：使用 window.loadWalletData 確保函式已定義
      if (typeof window.loadWalletData === "function") {
        window.loadWalletData();
      }
    });
  }

  // 2. 綁定「申請儲值」按鈕
  const btnDeposit = document.getElementById("btn-deposit");
  if (btnDeposit) {
    // 修正：使用 Arrow function
    btnDeposit.addEventListener("click", () => window.openDepositModal());
  }

  // 3. 綁定儲值表單提交
  const form = document.getElementById("deposit-form");
  if (form) {
    // 注意：handleDepositSubmit 已在上方定義，但建議使用區域變數參考或 window 屬性
    form.addEventListener("submit", handleDepositSubmit);
  }
});
