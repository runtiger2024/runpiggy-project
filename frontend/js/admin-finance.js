// frontend/js/admin-finance.js

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
    document.getElementById("btn-search").addEventListener("click", () => {
      currentPage = 1;
      loadTransactions();
    });

    // 綁定 Modal 關閉
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("proof-modal").style.display = "none";
        document.getElementById("adjust-modal").style.display = "none";
      });
    });

    // 綁定審核按鈕
    document
      .getElementById("btn-approve")
      .addEventListener("click", () => submitReview("APPROVE"));
    document
      .getElementById("btn-reject")
      .addEventListener("click", () => submitReview("REJECT"));

    // 綁定手動調整按鈕
    document
      .getElementById("btn-manual-adjust")
      .addEventListener("click", () => {
        document.getElementById("adjust-form").reset();
        document.getElementById("adjust-user-id").value = "";
        document.getElementById("adjust-modal").style.display = "flex";
      });

    // 綁定會員搜尋 (手動調整用)
    const searchInput = document.getElementById("adjust-search-user");
    const resultsDiv = document.getElementById("user-search-results");

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
      } catch (e) {}
    });

    // 綁定手動調整送出
    document
      .getElementById("adjust-form")
      .addEventListener("submit", handleManualAdjust);
  }

  // 全域函式：選擇會員
  window.selectUser = function (id, email, name) {
    document.getElementById("adjust-user-id").value = id;
    document.getElementById("adjust-search-user").value = `${name} (${email})`;
    document.getElementById("user-search-results").style.display = "none";
  };

  async function loadTransactions() {
    const tbody = document.getElementById("transaction-list");
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center p-3">載入中...</td></tr>';

    const status = document.getElementById("status-filter").value;
    const type = document.getElementById("type-filter").value;
    const search = document.getElementById("search-input").value;

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
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">錯誤: ${data.message}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">連線錯誤</td></tr>`;
    }
  }

  function renderTable(list) {
    const tbody = document.getElementById("transaction-list");
    tbody.innerHTML = "";

    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center p-3 text-secondary">無資料</td></tr>';
      return;
    }

    list.forEach((tx) => {
      const tr = document.createElement("tr");

      // 金額顏色
      const amtClass = tx.amount > 0 ? "text-success" : "text-danger";
      const amtSign = tx.amount > 0 ? "+" : "";

      // 狀態標籤
      let statusBadge = `<span class="badge" style="background:#e0e0e0;">${tx.status}</span>`;
      if (tx.status === "PENDING")
        statusBadge = `<span class="badge bg-warning text-dark">待審核</span>`;
      if (tx.status === "COMPLETED")
        statusBadge = `<span class="badge bg-success text-white">已完成</span>`;
      if (tx.status === "REJECTED")
        statusBadge = `<span class="badge bg-danger text-white">已駁回</span>`;

      // 憑證按鈕
      let proofHtml = tx.description || "-";
      if (tx.proofImage) {
        proofHtml += `<br><button class="btn btn-sm btn-outline-info mt-1" onclick="viewProof('${tx.id}', '${tx.proofImage}', '${tx.status}')"><i class="fas fa-image"></i> 查看憑證</button>`;
      }

      // 操作按鈕
      let actionHtml = "-";
      if (tx.status === "PENDING") {
        actionHtml = `<button class="btn btn-sm btn-primary" onclick="viewProof('${
          tx.id
        }', '${tx.proofImage || ""}', '${tx.status}')">審核</button>`;
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
                <td>${proofHtml}</td>
                <td>${statusBadge}</td>
                <td>${actionHtml}</td>
            `;
      tbody.appendChild(tr);
    });
  }

  // 檢視憑證與審核
  window.viewProof = function (id, imgUrl, status) {
    currentProofTxId = id;
    const modal = document.getElementById("proof-modal");
    const img = document.getElementById("proof-img-display");
    const actions = document.getElementById("review-actions");

    if (imgUrl) {
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.style.display = "block";
    } else {
      img.style.display = "none";
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
    }
  }

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
    // ... (分頁邏輯同其他頁面) ...
    const div = document.getElementById("pagination");
    div.innerHTML = "";
    if (pg.totalPages <= 1) return;

    // 簡易實作
    const prev = document.createElement("button");
    prev.className = "btn btn-sm btn-light";
    prev.innerText = "上一頁";
    prev.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        loadTransactions();
      }
    };

    const next = document.createElement("button");
    next.className = "btn btn-sm btn-light";
    next.innerText = "下一頁";
    next.onclick = () => {
      if (currentPage < pg.totalPages) {
        currentPage++;
        loadTransactions();
      }
    };

    const info = document.createElement("span");
    info.className = "btn btn-sm disabled";
    info.innerText = `${currentPage} / ${pg.totalPages}`;

    div.appendChild(prev);
    div.appendChild(info);
    div.appendChild(next);
  }
});
