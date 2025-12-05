// frontend/js/admin-register.js

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  document
    .getElementById("register-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const btn = e.target.querySelector("button[type='submit']");
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';

      const name = document.getElementById("staff-name").value;
      const email = document.getElementById("staff-email").value;
      const password = document.getElementById("staff-password").value;

      // 通用權限收集邏輯：收集所有被勾選的 checkbox value
      const permissions = [];
      e.target
        .querySelectorAll("input[type='checkbox']:checked")
        .forEach((cb) => {
          permissions.push(cb.value);
        });

      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/users/create`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, email, password, permissions }),
        });

        const data = await res.json();

        if (res.ok) {
          alert(`成功建立員工帳號：${data.user.email}`);
          e.target.reset();
          // 重置後，恢復預設的基礎勾選
          const defaults = ["DASHBOARD_VIEW", "PACKAGE_VIEW", "SHIPMENT_VIEW"];
          e.target.querySelectorAll("input[type='checkbox']").forEach((cb) => {
            cb.checked = defaults.includes(cb.value);
          });
        } else {
          alert("建立失敗: " + (data.message || "未知錯誤"));
        }
      } catch (err) {
        console.error(err);
        alert("網路錯誤");
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> 建立帳號';
      }
    });
});
