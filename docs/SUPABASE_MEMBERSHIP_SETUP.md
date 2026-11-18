# Supabase 會員系統設定

## Render 後端環境變數

在 Render → taiwan-stock-hunter-o3tt → Environment 設定：

- \`SUPABASE_URL\`：Supabase Project URL。
- \`SUPABASE_ANON_KEY\`：Supabase Publishable Key（可公開，仍只由後端代轉 Auth API）。
- \`SUPABASE_ADMIN_EMAIL\`：唯一初始管理員 Email，必須與 Supabase Auth 使用者 Email 完全一致。
- \`SUPABASE_SERVICE_ROLE_KEY\`：Supabase Secret key（或舊版 service_role key），只允許放 Render 後端環境變數，禁止提交 Git、放前端或貼到聊天。

\`SUPABASE_SERVICE_ROLE_KEY\` 是新增／停用會員的必要條件；登入、註冊與改密碼不依賴它。

## 首位管理員初始化

1. 在 Supabase Dashboard → Authentication → Users 建立或邀請管理員帳號。
2. Email 必須是 \`SUPABASE_ADMIN_EMAIL\` 設定的信箱。
3. 管理員完成 Email 驗證後登入網站。
4. 管理員在網站右上角開啟「會員管理」，可新增會員與停用／恢復會員。

網站後端會向 Supabase Auth 驗證 access token，並在伺服器端比對管理員 Email。前端不能自行設定管理員權限。

## 會員功能

- Email／密碼註冊與登入。
- Supabase Email Confirmation 若啟用，會員須先完成信箱驗證才能登入。
- 登入後可修改密碼。
- 管理員可建立會員帳號、停用及恢復會員。
- 所有市場 API 都要求有效 Supabase access token；\`/api/health\` 與必要的登入／註冊路由除外。
- 本版本未建立額外公開資料表，會員憑證由 Supabase Auth 儲存；不得將 service role key 傳給瀏覽器。

## 建議 Supabase Auth 設定

- Authentication → URL Configuration：Site URL 設為正式網站網址。
- Authentication → Providers → Email：啟用 Email provider。
- 建議保留 Email confirmation。
- 設定允許的 Redirect URLs 為正式網站網址及必要的本機開發網址。

## 安全注意

- 不要把 Supabase Secret key / service_role key 放進 GitHub、React 的 \`REACT_APP_*\` 變數或聊天。
- 若管理員信箱需要變更，需同步更新 Render 的 \`SUPABASE_ADMIN_EMAIL\`，並先確認新管理員帳號已存在。
- 會員管理 API 只接受經 Supabase 驗證且 Email 符合管理員設定的使用者。


## 管理員重建／修復帳號（新增）

會員管理畫面可輸入 Email 並執行「重建／修復帳號」，系統會要求再次確認相同 Email：
- 若 Supabase Auth 仍存在該會員：解除封鎖、確認 Email，寄送密碼重設信，並保留原使用者 ID。
- 若 Supabase Auth 已找不到該會員：寄送新的邀請，Supabase 會建立新的使用者 ID。
- 每次操作會在 Render 服務日誌留下管理員、目標 Email、操作類型、使用者 ID 與時間，供稽核追查。
- 重要限制：若原帳號已被永久刪除，新帳號不會自動繼承舊 UUID 所關聯的資料。不得僅因 Email 相同就自動搬移資產、交易、權限或其他個人資料；必須先核對資料所有權及關聯後再執行遷移。
- 管理員必須具備有效登入權杖，且 Render 必須設定 SUPABASE_ADMIN_EMAIL 與 SUPABASE_SERVICE_ROLE_KEY。Service Role Key 僅能留在伺服器環境變數。
