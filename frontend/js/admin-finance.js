// frontend/js/admin-finance.js
// V1.3 - Fix Image Path for Cloudinary & Optimize UI

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  let currentPage = 1;
  const limit = 20;
  let currentProofTxId = null; // 當前正在審核的 ID

  // 初始化
  init();

  function init() {
    // 載入列表
    loadTransactions();

    // 綁定篩選器
    const btnSearch = document.getElementById("btn-search");
    if (btnSearch) {
      btnSearch.addEventListener("click", () => {
        currentPage = 1;
        loadTransactions();
      });
    }

    // 綁定 Modal 關閉
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const proofModal = document.getElementById("proof-modal");
        const adjustModal = document.getElementById("adjust-modal");
        if (proofModal) proofModal.style.display = "none";
        if (adjustModal) adjustModal.style.display = "none";
      });
    });

    // 綁定審核按鈕
    const btnApprove = document.getElementById("btn-approve");
    const btnReject = document.getElementById("btn-reject");
    if (btnApprove)
      btnApprove.addEventListener("click", () => submitReview("APPROVE"));
    if (btnReject)
      btnReject.addEventListener("click", () => submitReview("REJECT"));

    // 綁定手動調整按鈕
    const btnManualAdjust = document.getElementById("btn-manual-adjust");
    if (btnManualAdjust) {
      btnManualAdjust.addEventListener("click", () => {
        document.getElementById("adjust-form").reset();
        document.getElementById("adjust-user-id").value = "";
        document.getElementById("adjust-modal").style.display = "flex";
      });
    }

    // 綁定會員搜尋 (手動調整用)
    const searchInput = document.getElementById("adjust-search-user");
    const resultsDiv = document.getElementById("user-search-results");

    if (searchInput) {
      searchInput.addEventListener("input", async (e) => {
        const val = e.target.value.trim();
        if (val.length < 2) {
          resultsDiv.style.display = "none";
          return;
        }
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/admin/users/list?search=${val}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const data = await res.json();
          if (data.users && data.users.length > 0) {
            resultsDiv.innerHTML = data.users
              .map(
                (u) =>
                  `<div class="p-2 border-bottom" style="cursor:pointer; hover:background:#f0f0f0;" onclick="selectUser('${u.id}', '${u.email}', '${u.name}')">
                            ${u.name} (${u.email})
                        </div>`
              )
              .join("");
            resultsDiv.style.display = "block";
          } else {
            resultsDiv.style.display = "none";
          }
        } catch (e) {
          console.error("Search users error:", e);
        }
      });
    }

    // 綁定手動調整送出
    const adjustForm = document.getElementById("adjust-form");
    if (adjustForm) {
      adjustForm.addEventListener("submit", handleManualAdjust);
    }
  }

  // 全域函式：選擇會員
  window.selectUser = function (id, email, name) {
    document.getElementById("adjust-user-id").value = id;
    document.getElementById("adjust-search-user").value = `${name} (${email})`;
    document.getElementById("user-search-results").style.display = "none";
  };

  async function loadTransactions() {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center p-3">載入中...</td></tr>';

    const statusEl = document.getElementById("status-filter");
    const typeEl = document.getElementById("type-filter");
    const searchEl = document.getElementById("search-input");

    const status = statusEl ? statusEl.value : "";
    const type = typeEl ? typeEl.value : "";
    const search = searchEl ? searchEl.value : "";

    try {
      let url = `${API_BASE_URL}/api/admin/finance/transactions?page=${currentPage}&limit=${limit}`;
      if (status) url += `&status=${status}`;
      if (type) url += `&type=${type}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        renderTable(data.transactions || []);
        renderPagination(data.pagination);
      } else {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">錯誤: ${data.message}</td></tr>`;
      }
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">連線錯誤</td></tr>`;
    }
  }

  function renderTable(list) {
    const tbody = document.getElementById("transaction-list");
    tbody.innerHTML = "";

    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center p-3 text-secondary">無資料</td></tr>';
      return;
    }

    list.forEach((tx) => {
      const tr = document.createElement("tr");

      // 金額顏色
      const amtClass = tx.amount > 0 ? "text-success" : "text-danger";
      const amtSign = tx.amount > 0 ? "+" : "";

      // 交易狀態標籤
      let statusBadge = `<span class="badge" style="background:#e0e0e0;">${tx.status}</span>`;
      if (tx.status === "PENDING")
        statusBadge = `<span class="badge bg-warning text-dark">待審核</span>`;
      if (tx.status === "COMPLETED")
        statusBadge = `<span class="badge bg-success text-white">已完成</span>`;
      if (tx.status === "REJECTED")
        statusBadge = `<span class="badge bg-danger text-white">已駁回</span>`;

      // 發票狀態顯示邏輯
      let invoiceHtml = '<span style="color:#ccc;">-</span>';
      if (tx.type === "DEPOSIT" && tx.status === "COMPLETED") {
        if (tx.invoiceStatus === "ISSUED" && tx.invoiceNumber) {
          invoiceHtml = `<span class="text-success" style="font-size:12px; font-weight:bold;">
                          <i class="fas fa-check-circle"></i> ${tx.invoiceNumber}
                         </span>`;
        } else {
          // 如果失敗或未開立，顯示補開按鈕
          invoiceHtml = `<button class="btn btn-sm btn-outline-secondary" style="font-size:11px; padding:2px 6px;" onclick="issueInvoice('${tx.id}')">
                          <i class="fas fa-plus"></i> 補開
                         </button>`;
          if (tx.invoiceStatus === "FAILED") {
            invoiceHtml += `<br><span style="color:red; font-size:10px;">(上次失敗)</span>`;
          }
        }
      }

      // 憑證按鈕 (安全處理)
      let proofHtml = tx.description || "-";
      if (tx.proofImage) {
        // 簡單處理可能的單引號問題
        const safeProofImg = tx.proofImage.replace(/'/g, "\\'");
        proofHtml += `<br><button class="btn btn-sm btn-outline-info mt-1" onclick="viewProof('${tx.id}', '${safeProofImg}', '${tx.status}')"><i class="fas fa-image"></i> 查看憑證</button>`;
      }

      // 操作按鈕
      let actionHtml = "-";
      if (tx.status === "PENDING") {
        const safeProofImg = tx.proofImage
          ? tx.proofImage.replace(/'/g, "\\'")
          : "";
        actionHtml = `<button class="btn btn-sm btn-primary" onclick="viewProof('${tx.id}', '${safeProofImg}', '${tx.status}')">審核</button>`;
      }

      tr.innerHTML = `
                <td>${new Date(
                  tx.createdAt
                ).toLocaleDateString()} <br><small>${new Date(
        tx.createdAt
      ).toLocaleTimeString()}</small></td>
                <td>
                    <strong>${tx.user.name || "-"}</strong><br>
                    <small class="text-muted">${tx.user.email}</small>
                </td>
                <td>${tx.type}</td>
                <td class="${amtClass}" style="font-weight:bold; font-family:monospace; font-size:1.1em;">${amtSign}${tx.amount.toLocaleString()}</td>
                <td>${invoiceHtml}</td>
                <td>${proofHtml}</td>
                <td>${statusBadge}</td>
                <td>${actionHtml}</td>
            `;
      tbody.appendChild(tr);
    });
  }

  // 檢視憑證與審核 (修復版：支援 Cloudinary 完整網址)
  window.viewProof = function (id, imgUrl, status) {
    currentProofTxId = id;
    const modal = document.getElementById("proof-modal");
    const img = document.getElementById("proof-img-display");
    const actions = document.getElementById("review-actions");

    if (imgUrl) {
      // 判斷是否為完整網址 (Cloudinary) 或 本地路徑
      if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
        img.src = imgUrl;
      } else {
        // 確保沒有雙重斜線 (可選)
        const cleanPath = imgUrl.startsWith("/") ? imgUrl : `/${imgUrl}`;
        img.src = `${API_BASE_URL}${cleanPath}`;
      }
      img.style.display = "block";
    } else {
      img.style.display = "none";
      img.src = ""; // 清空避免顯示上一張圖
    }

    // 只有 PENDING 狀態才顯示審核按鈕
    if (status === "PENDING") {
      actions.style.display = "flex";
    } else {
      actions.style.display = "none";
    }

    modal.style.display = "flex";
  };

  async function submitReview(action) {
    if (!currentProofTxId) return;

    let rejectReason = "";
    if (action === "REJECT") {
      rejectReason = prompt("請輸入駁回原因：");
      if (rejectReason === null) return; // 取消
    } else {
      if (!confirm("確定通過此筆儲值申請？\n系統將自動增加會員錢包餘額。"))
        return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${currentProofTxId}/review`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, rejectReason }),
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        document.getElementById("proof-modal").style.display = "none";
        loadTransactions();
      } else {
        alert("操作失敗: " + data.message);
      }
    } catch (e) {
      alert("錯誤");
      console.error(e);
    }
  }

  // 手動補開功能
  window.issueInvoice = async function (id) {
    if (
      !confirm("確定要手動補開這筆儲值的電子發票嗎？\n(系統將發送資料至 AMEGO)")
    )
      return;

    const btn = event.currentTarget; // 抓取當前按鈕
    const originalContent = btn.innerHTML;

    try {
      // 顯示 Loading
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${id}/invoice`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(`成功！發票號碼：${data.invoiceNumber}`);
        // 重新載入列表
        loadTransactions();
      } else {
        alert(`失敗：${data.message}`);
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    } catch (e) {
      alert("連線錯誤");
      console.error(e);
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  };

  async function handleManualAdjust(e) {
    e.preventDefault();
    const userId = document.getElementById("adjust-user-id").value;
    const amount = document.getElementById("adjust-amount").value;
    const note = document.getElementById("adjust-note").value;

    if (!userId) return alert("請先搜尋並點選會員");
    if (!confirm(`確定要調整餘額 $${amount} 嗎？\n(正數為加錢，負數為扣錢)`))
      return;

    const btn = e.target.querySelector("button[type='submit']");
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/finance/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, amount, note }),
      });
      const data = await res.json();

      if (res.ok) {
        alert("調整成功");
        document.getElementById("adjust-modal").style.display = "none";
        loadTransactions();
      } else {
        alert("失敗: " + data.message);
      }
    } catch (err) {
      alert("網路錯誤");
    } finally {
      btn.disabled = false;
    }
  }

  function renderPagination(pg) {
    const div = document.getElementById("pagination");
    if (!div) return;

    div.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const prev = document.createElement("button");
    prev.className = "btn btn-sm btn-light";
    prev.innerText = "上一頁";
    prev.disabled = currentPage <= 1;
    prev.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        loadTransactions();
      }
    };

    const next = document.createElement("button");
    next.className = "btn btn-sm btn-light";
    next.innerText = "下一頁";
    next.disabled = currentPage >= pg.totalPages;
    next.onclick = () => {
      if (currentPage < pg.totalPages) {
        currentPage++;
        loadTransactions();
      }
    };

    const info = document.createElement("span");
    info.className = "btn btn-sm disabled";
    info.style.border = "none";
    info.innerText = `${currentPage} / ${pg.totalPages}`;

    div.appendChild(prev);
    div.appendChild(info);
    div.appendChild(next);
  }
});
