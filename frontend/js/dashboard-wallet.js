// frontend/js/dashboard-wallet.js
// 負責錢包餘額、交易紀錄與儲值功能
// V26.0 - Transaction UI Colors & Deposit Tax ID

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

// [UI 優化] 交易列表渲染 (新增顏色與圖示)
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

  // 定義不同類型的視覺樣式
  const typeConfig = {
    DEPOSIT: {
      label: "儲值",
      icon: "fa-arrow-up",
      color: "#28a745",
      bg: "#e6f9ec",
    }, // 綠色
    PAYMENT: {
      label: "支付",
      icon: "fa-shopping-cart",
      color: "#d32f2f",
      bg: "#ffebee",
    }, // 紅色
    REFUND: { label: "退款", icon: "fa-undo", color: "#17a2b8", bg: "#e0f7fa" }, // 藍色
    ADJUST: { label: "調整", icon: "fa-cog", color: "#6c757d", bg: "#f8f9fa" }, // 灰色
  };

  let html = "";
  txs.forEach((tx) => {
    const statusObj = statusMap[tx.status] || { text: tx.status, class: "" };

    // 設定類型樣式，若無對應則使用預設
    const typeInfo = typeConfig[tx.type] || {
      label: tx.type,
      icon: "fa-circle",
      color: "#333",
      bg: "#fff",
    };

    const isNegative = tx.amount < 0;
    const amountClass = isNegative ? "text-danger" : "text-success";
    const amountSign = isNegative ? "" : "+";

    // 若有發票號碼，顯示小圖示
    let invHtml = "";
    if (tx.invoiceNumber) {
      invHtml = `<br><span style="font-size:11px; color:#28a745;"><i class="fas fa-file-invoice"></i> 發票已開</span>`;
    }

    // 統編顯示 (如果有)
    let taxHtml = "";
    if (tx.taxId) {
      taxHtml = `<span style="font-size:11px; color:#666; display:block;">統編: ${tx.taxId}</span>`;
    }

    html += `
            <tr style="border-left: 3px solid ${typeInfo.color};">
                <td>
                    ${new Date(tx.createdAt).toLocaleDateString()} 
                    <small style="color:#999;">${new Date(
                      tx.createdAt
                    ).toLocaleTimeString()}</small>
                </td>
                <td>
                    <span style="color:${
                      typeInfo.color
                    }; font-weight:bold; display:flex; align-items:center; gap:5px;">
                        <i class="fas ${typeInfo.icon}"></i> ${typeInfo.label}
                    </span>
                </td>
                <td>
                    ${tx.description || "-"}
                    ${taxHtml}
                    ${invHtml}
                </td>
                <td class="${amountClass}" style="font-weight:bold; font-family:monospace; font-size:1.1em; text-align:right;">
                    ${amountSign}${tx.amount.toLocaleString()}
                </td>
                <td style="text-align:center;"><span class="status-badge ${
                  statusObj.class
                }">${statusObj.text}</span></td>
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

  // 自動插入統編輸入欄位 (如果 HTML 尚未包含)
  // 檢查是否已存在 ID 為 dep-taxId 的元素，若無則動態插入
  const existingTaxInput = document.getElementById("dep-taxId");
  if (!existingTaxInput && form) {
    const amountGroup = form.querySelector(".form-group"); // 插在金額欄位後
    if (amountGroup) {
      const taxDiv = document.createElement("div");
      taxDiv.className = "form-group";
      taxDiv.style.background = "#f0f7ff";
      taxDiv.style.padding = "10px";
      taxDiv.style.borderRadius = "5px";
      taxDiv.style.border = "1px solid #cce5ff";
      taxDiv.innerHTML = `
            <label style="color:#0056b3; font-weight:bold; font-size:13px;">發票資訊 (B2B 請填寫)</label>
            <div style="display: flex; gap: 10px; margin-top:5px;">
                <input type="text" id="dep-taxId" class="form-control" placeholder="統一編號 (8碼)" style="font-size:13px;">
                <input type="text" id="dep-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
            </div>
          `;
      amountGroup.insertAdjacentElement("afterend", taxDiv);
    }
  }

  if (form) form.reset();
  if (modal) modal.style.display = "flex";
};

// 3. 處理儲值提交 (含統編)
async function handleDepositSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const amount = document.getElementById("dep-amount").value;
  const desc = document.getElementById("dep-note").value;
  const file = document.getElementById("dep-proof").files[0];

  // [NEW] 取得統編欄位
  const taxId = document.getElementById("dep-taxId")
    ? document.getElementById("dep-taxId").value
    : "";
  const invoiceTitle = document.getElementById("dep-invoiceTitle")
    ? document.getElementById("dep-invoiceTitle").value
    : "";

  const fd = new FormData();
  fd.append("amount", amount);
  fd.append("description", desc);
  if (taxId) fd.append("taxId", taxId);
  if (invoiceTitle) fd.append("invoiceTitle", invoiceTitle);
  if (file) fd.append("proof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/deposit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      alert(
        "儲值申請已提交，請等待管理員審核。\n若有填寫統編，發票將依此開立。"
      );
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
