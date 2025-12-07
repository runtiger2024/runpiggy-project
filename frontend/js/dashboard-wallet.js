// frontend/js/dashboard-wallet.js
// 負責錢包餘額、交易紀錄與儲值功能
// V25.8 - Added Global Balance Sync

// --- 函式定義 ---

// [NEW] 獨立更新全域餘額顯示 (Header / Profile)
window.updateGlobalWalletDisplay = async function () {
  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.wallet) {
      const balance = data.wallet.balance;
      const formatted = `$${balance.toLocaleString()}`;

      // 更新 Profile Card 上的餘額
      const headerEl = document.getElementById("header-wallet-balance");
      if (headerEl) {
        headerEl.textContent = formatted;
        headerEl.style.color = balance < 0 ? "#d32f2f" : "#28a745";
      }

      // 順便更新錢包分頁內的餘額 (如果存在)
      const tabBalanceEl = document.getElementById("wallet-balance");
      if (tabBalanceEl) {
        tabBalanceEl.textContent = formatted;
        tabBalanceEl.style.color = balance < 0 ? "#d32f2f" : "#28a745";
      }
    }
  } catch (e) {
    console.warn("餘額更新失敗", e);
  }
};

// 1. 載入錢包資料 (含交易紀錄)
window.loadWalletData = async function () {
  const listEl = document.getElementById("transaction-list");
  const loadingEl = document.getElementById("wallet-loading");

  if (loadingEl) loadingEl.style.display = "block";
  if (listEl) listEl.innerHTML = "";

  // 同步更新上方餘額
  await window.updateGlobalWalletDisplay();

  try {
    // 再次呼叫是為了拿交易紀錄 (其實可以用同一個 API，但分開比較單純)
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.wallet) {
      renderTransactions(data.wallet.transactions || []);
    }
  } catch (e) {
    console.error("錢包載入失敗", e);
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

      if (typeof window.loadWalletData === "function") {
        window.loadWalletData();
      }
    });
  }

  const btnDeposit = document.getElementById("btn-deposit");
  if (btnDeposit) {
    btnDeposit.addEventListener("click", () => window.openDepositModal());
  }

  const form = document.getElementById("deposit-form");
  if (form) {
    form.addEventListener("submit", handleDepositSubmit);
  }
});
