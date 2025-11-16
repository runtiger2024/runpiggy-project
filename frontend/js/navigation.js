// 這是 frontend/js/navigation.js
// 負責管理所有頁面的「導航列」

//
//
//
//
// (這個函式會在 DOM 載入後立刻執行)
document.addEventListener("DOMContentLoaded", () => {
  const navContainer = document.querySelector(".main-nav");
  if (!navContainer) return;

  const token = localStorage.getItem("token");
  const currentPage = window.location.pathname.split("/").pop();

  let navHTML = "";

  // [修改重點] href 從 "index.html" 改為 "index.html#calculator-section"
  // 這樣點擊後，瀏覽器就會自動捲動到該 ID 的位置

  if (token) {
    // --- 狀態：已登入 ---
    navHTML = `
      <a href="index.html#calculator-section" class="nav-link ${
        currentPage === "index.html" ? "active" : ""
      }">運費試算</a>
      <a href="dashboard.html" class="nav-link ${
        currentPage === "dashboard.html" ? "active" : ""
      }">會員中心</a>
      <a href="#" id="btn-nav-logout" class="nav-link btn-logout">登出</a>
    `;
  } else {
    // --- 狀態：未登入 (訪客) ---
    navHTML = `
      <a href="index.html#calculator-section" class="nav-link ${
        currentPage === "index.html" ? "active" : ""
      }">運費試算</a>
      <a href="login.html" class="nav-link ${
        currentPage === "login.html" ? "active" : ""
      }">會員登入/註冊</a>
      <a href="dashboard.html" class="nav-link ${
        currentPage === "dashboard.html" ? "active" : ""
      }">會員中心</a>
    `;
  }

  navContainer.innerHTML = navHTML;

  // (3) (僅限登入狀態) 幫新的「登出」按鈕加上事件
  const logoutButton = document.getElementById("btn-nav-logout");
  if (logoutButton) {
    logoutButton.addEventListener("click", (e) => {
      e.preventDefault(); // 防止連結跳轉
      if (confirm("確定要登出嗎？")) {
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        alert("您已經成功登出");
        window.location.href = "login.html"; // 登出後一律跳回登入頁
      }
    });
  }
});
