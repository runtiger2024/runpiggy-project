<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>新增員工帳號 - 管理後台</title>
    <link rel="icon" href="assets/logo.png" type="image/png" />
    <script src="js/styleLoader.js"></script>
  </head>
  <body>
    <div class="container" style="max-width: 500px">
      <img src="assets/logo.png" alt="小跑豬 LOGO" class="header-logo" />

      <h1>新增員工帳號</h1>

      <div id="admin-only-content">
        <div id="message-box" class="alert" style="display: none"></div>

        <form id="register-form" class="auth-form active">
          <div class="form-group">
            <label for="staff-name" class="required">員工姓名</label>
            <input type="text" id="staff-name" required />
          </div>
          <div class="form-group">
            <label for="staff-email" class="required">登入 Email</label>
            <input type="email" id="staff-email" required />
          </div>
          <div class="form-group">
            <label for="staff-password" class="required"
              >登入密碼 (至少6位數)</label
            >
            <input type="password" id="staff-password" minlength="6" required />
          </div>

          <div class="form-group">
            <label class="required">帳號權限</label>
            <fieldset
              id="permissions-fieldset"
              style="border: 1px solid #ccc; padding: 10px; border-radius: 5px"
            >
              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_VIEW_DASHBOARD"
                  value="CAN_VIEW_DASHBOARD"
                  checked
                />
                <label for="perm-CAN_VIEW_DASHBOARD">查看儀表板</label>
              </div>
              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_MANAGE_PACKAGES"
                  value="CAN_MANAGE_PACKAGES"
                  checked
                />
                <label for="perm-CAN_MANAGE_PACKAGES"
                  >管理包裹 (入庫/更新)</label
                >
              </div>
              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_MANAGE_SHIPMENTS"
                  value="CAN_MANAGE_SHIPMENTS"
                  checked
                />
                <label for="perm-CAN_MANAGE_SHIPMENTS"
                  >管理集運單 (出貨/退回)</label
                >
              </div>

              <hr style="margin: 10px 0" />

              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_MANAGE_USERS"
                  value="CAN_MANAGE_USERS"
                />
                <label
                  for="perm-CAN_MANAGE_USERS"
                  style="color: #d32f2f; font-weight: bold"
                  >[A] 管理會員/員工 (高權限)</label
                >
              </div>
              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_VIEW_LOGS"
                  value="CAN_VIEW_LOGS"
                />
                <label
                  for="perm-CAN_VIEW_LOGS"
                  style="color: #d32f2f; font-weight: bold"
                  >[A] 查看操作日誌 (高權限)</label
                >
              </div>
              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_IMPERSONATE_USERS"
                  value="CAN_IMPERSONATE_USERS"
                />
                <label
                  for="perm-CAN_IMPERSONATE_USERS"
                  style="color: #d32f2f; font-weight: bold"
                  >[A] 模擬客戶登入 (高權限)</label
                >
              </div>
              
              <div style="margin-bottom: 5px">
                <input
                  type="checkbox"
                  id="perm-CAN_MANAGE_SYSTEM"
                  value="CAN_MANAGE_SYSTEM"
                />
                <label
                  for="perm-CAN_MANAGE_SYSTEM"
                  style="color: #d32f2f; font-weight: bold; background: #e3f2fd; padding: 2px 5px;"
                  >[S] 系統全域設定 (最高權限)</label
                >
              </div>
            </fieldset>
          </div>
          <button type="submit" class="btn btn-primary">建立新帳號</button>
        </form>
      </div>
      <a
        href="admin-dashboard.html"
        class="btn btn-secondary"
        style="text-decoration: none; text-align: center; margin-top: 10px"
      >
        返回儀表板
      </a>
    </div>

    <script src="js/apiConfig.js"></script>
    <script src="js/admin-register.js"></script>
  </body>
</html>