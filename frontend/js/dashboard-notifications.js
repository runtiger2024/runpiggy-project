// frontend/js/dashboard-notifications.js
// 負責通知中心邏輯

document.addEventListener("DOMContentLoaded", () => {
  if (!window.dashboardToken) return;

  // 1. 綁定鈴鐺點擊
  const btnNotif = document.getElementById("btn-notification");
  const dropdown = document.getElementById("notification-dropdown");

  if (btnNotif && dropdown) {
    btnNotif.addEventListener("click", (e) => {
      e.stopPropagation(); // 防止冒泡關閉
      const isVisible = dropdown.style.display === "block";
      dropdown.style.display = isVisible ? "none" : "block";

      if (!isVisible) {
        // 打開時載入列表
        loadNotifications();
      }
    });

    // 點擊外部關閉選單
    document.addEventListener("click", (e) => {
      if (!btnNotif.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }

  // 2. 綁定「全部已讀」
  const btnReadAll = document.getElementById("btn-read-all");
  if (btnReadAll) {
    btnReadAll.addEventListener("click", markAllRead);
  }

  // 3. 初始檢查未讀數 (並啟動定時輪詢)
  checkUnreadCount();
  setInterval(checkUnreadCount, 60000); // 每 60 秒檢查一次
});

// --- 核心功能 ---

async function checkUnreadCount() {
  try {
    // 使用 limit=1 為了節省流量，只拿 count
    const res = await fetch(`${API_BASE_URL}/api/notifications?limit=1`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      updateBadge(data.unreadCount);
    }
  } catch (e) {
    console.warn("通知檢查失敗", e);
  }
}

async function loadNotifications() {
  const listEl = document.getElementById("notification-list");
  if (!listEl) return;

  listEl.innerHTML =
    '<div class="empty-state" style="padding:15px; text-align:center; color:#999;">載入中...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications?limit=10`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      updateBadge(data.unreadCount); // 順便更新紅點
      renderList(data.notifications);
    }
  } catch (e) {
    listEl.innerHTML =
      '<div class="empty-state" style="padding:15px; text-align:center; color:red;">載入失敗</div>';
  }
}

function renderList(list) {
  const listEl = document.getElementById("notification-list");
  listEl.innerHTML = "";

  if (list.length === 0) {
    listEl.innerHTML =
      '<div class="empty-state" style="padding:20px; text-align:center; color:#999;">沒有新通知</div>';
    return;
  }

  list.forEach((n) => {
    const div = document.createElement("div");
    div.className = `notification-item ${!n.isRead ? "unread" : ""}`;

    // 點擊後標記已讀並跳轉 (如果有的話)
    div.onclick = () => handleNotificationClick(n);

    div.innerHTML = `
            <div class="notif-title">${n.title}</div>
            <div style="font-size:13px; color:#555; margin-bottom:4px;">${
              n.message
            }</div>
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
        `;
    listEl.appendChild(div);
  });
}

function updateBadge(count) {
  const badge = document.getElementById("notification-badge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

async function markAllRead() {
  try {
    await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    // 重新載入列表與紅點
    loadNotifications();
  } catch (e) {
    alert("操作失敗");
  }
}

async function handleNotificationClick(n) {
  // 1. 如果未讀，標記為已讀
  if (!n.isRead) {
    try {
      await fetch(`${API_BASE_URL}/api/notifications/${n.id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      });
      // 前端視覺更新
      checkUnreadCount();
    } catch (e) {}
  }

  // 2. 處理跳轉連結
  // 假設 link 格式為 "SHIPMENT:clxxxxxx" 或直接是 URL
  if (n.link) {
    if (n.link.startsWith("http")) {
      window.location.href = n.link;
    } else if (n.type === "SHIPMENT") {
      // 切換到訂單頁並打開詳情
      document.getElementById("tab-shipments").click();
      // 等待一點時間讓列表渲染，或者直接呼叫詳情 Modal
      setTimeout(() => {
        if (window.openShipmentDetails) window.openShipmentDetails(n.link);
      }, 500);
    } else if (n.type === "PACKAGE") {
      document.getElementById("tab-packages").click();
    } else if (n.type === "WALLET") {
      document.getElementById("tab-wallet").click();
    }
  }
}

// 簡易時間格式化 (剛剛, 5分鐘前...)
function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000); // 秒

  if (diff < 60) return "剛剛";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  return date.toLocaleDateString();
}
