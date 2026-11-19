# App Store / Google Play 上架準備計畫

> 專案：泰丞・台股 AI 智慧操盤中樞  
> 目標：iOS App Store 與 Google Play  
> 狀態：準備文件；尚未建立可簽署的 iOS/Android 安裝包，也尚未送審。

## 1. 目前程式盤點（依 GitHub main 原始碼）

- 前端為 React 18 + Vite，使用 `vite build`。
- 後端為 Node.js，Render 同一服務提供網站與 `/api`。
- 已有登入／註冊介面與 Supabase Auth 整合說明。
- 已有手機版導覽元件（例如 `MobileDock.jsx`）及 K 線／行情等功能。
- `package.json` 目前未列出 Capacitor、Expo 或 React Native。
- `index.html` 有 viewport、description、theme-color，但目前檢視的 `public/` 清單未見 App icon、manifest、service worker 等完整 PWA 套件。
- 專案 README 明確說明實盤下單鎖定；研究評分不可當成交易指令。
- README 說明美股資料目前包含 Yahoo Finance 非官方端點；台股／其他來源仍需逐一核實授權與延遲狀態。

## 2. 建議技術路線

採用 Capacitor 將既有 React 網站包裝為 iOS 與 Android App，先共用既有前端與 Render API，避免重寫整套系統。保留原網站正常運作。

建議階段：
1. 完成 PWA 基礎（manifest、圖示、主畫面啟動、HTTPS、離線錯誤狀態）。
2. 新增 Capacitor iOS／Android 專案與必要原生設定。
3. 加入安全的登入狀態保存、深層連結、鍵盤／安全區域／返回鍵處理。
4. 推播通知採使用者明確同意後啟用；不得以推播暗示保證獲利或未經驗證的即時訊號。
5. 使用 TestFlight 與 Google Play internal/closed testing 測試，再送正式審核。

## 3. 商店送審前必備項目

### 品牌與商店素材
- 正式 App 名稱、英文名稱與副標題。
- App icon（iOS／Android 尺寸與安全區域依最新規格輸出）。
- iPhone、iPad（若支援）、Android 手機和平板截圖。
- 商店簡介、完整描述、關鍵字、支援網址、客服聯絡方式。
- 年齡分級問卷、內容權利聲明及第三方素材授權清單。

### 隱私與會員
- 公開可讀的隱私權政策網址。
- 蒐集資料清單：帳號／Email、登入識別資料、裝置推播 token、診斷／分析資料，以及實際啟用的第三方服務。
- 說明每項資料用途、保存期間、第三方處理者、跨境處理、刪除方式及聯絡窗口。
- 若 App 支援建立帳號，提供 App 內可找到的帳號刪除流程，並同步刪除或依法保留必要資料。
- 完成 Apple App Privacy 與 Google Play Data safety 表單；不得在未盤點前猜填。
- 若使用 Google／其他第三方登入，依商店當期登入政策檢查是否需提供相應登入選項。
- 提供審核人員可用的測試帳號與清楚的測試步驟；不得提供管理員帳號或真實會員資料。

### 金融資訊與風險揭露
- 清楚說明產品為行情研究、資訊整理與技術分析工具，不保證獲利、不構成個人化投資建議。
- 每個市場標示資料供應商、最後更新時間、即時／延遲／歷史／不可用狀態。
- 未取得正式授權的來源不得描述為官方即時行情；美股非官方來源必須清楚標示。
- AI／規則評分需揭露其方法限制、資料覆蓋率及失效條件，不得宣稱為勝率或保證預測。
- 實盤下單維持鎖定；未完成券商授權、交易風控、稽核與法規檢查前，不加入交易執行。
- 檢查金融資料展示、行情再散布及商標／市場資料授權條款。

## 4. 工程驗收門檻

- `npm ci`、`npm run build`、`npm run test:server` 通過。
- iOS 真機與 Android 真機測試登入、登出、註冊、密碼重設、會員刪除、深層連結及網路中斷。
- API 只經 HTTPS；金鑰只放伺服器，不得打包在 App 或前端。
- 檢查 token 儲存方式、憑證／敏感資料日誌、權限最小化及依賴套件漏洞。
- 行情 API 斷線、限流、休市、過期及來源切換時，顯示正確狀態，不得沿用舊報價冒充即時。
- 測試小螢幕、平板、動態字體、深色模式、無障礙標籤、旋轉、鍵盤遮擋與耗電。
- 推播需可關閉、可控頻率，並驗證不會重複或發送過期訊號。
- 完成隱私政策、服務條款、風險揭露與客服支援頁面。
- 產生簽署版 IPA／AAB，保存版本號、build number、簽署資訊與可重現建置紀錄。

## 5. 尚待帳號持有人提供／完成的外部事項

- Apple Developer Program 團隊／帳號及 App Store Connect 權限。
- Google Play Console 開發者帳號及必要身分／組織驗證。
- 最終商店顯示名稱、品牌權利確認、客服 Email、支援網站。
- 隱私權政策與服務條款的正式發布網址。
- Apple／Google 簽署、商店合約、稅務與付款資料（如適用）。

帳號、憑證、付款與商店合約必須由帳號持有人親自完成；本專案不保存或代填密碼、私鑰或付款資料。

## 6. 發布階段與狀態

| 階段 | 狀態 |
|---|---|
| 原始碼盤點 | 已完成初步盤點 |
| 上架規格文件 | 已建立 |
| PWA 基礎（manifest／離線頁／靜態資源快取） | 已在準備分支加入，待 CI 驗證 |
| Capacitor 設定與雙平台 CI 原生專案生成 | 已在準備分支加入，待 CI 驗證；原生專案由 CI 生成 |
| 隱私／帳號刪除流程驗收 | 已加入會員端刪除入口、網站申請路徑及伺服器端 Supabase 刪除 API；仍需 CI、Render 設定與端到端驗收 |
| 真機測試與簽署建置 | 尚未開始 |
| TestFlight／Play 測試 | 尚未開始 |
| 商店素材與表單 | 尚未完成 |
| 正式送審／上架 | 尚未送審 |

## 7. 不可跳過的發布原則

任何一項關鍵測試未通過，不標示為可上架；不得將網站已部署等同 App 已發布。不得擅自啟用付費服務、改動交易執行、使用者資金權限、正式憑證或商店帳號。


## 8. 本次工程準備分支變更

- 新增 `capacitor.config.ts`，以既有 Vite build 輸出目錄 `build` 作為 Capacitor webDir。
- 加入 Capacitor 8 runtime、CLI、iOS／Android 平台套件與 Splash Screen plugin。
- 加入 PWA manifest、App icon SVG、service worker 及離線說明頁。
- Service worker 僅快取 manifest／圖示；刻意不快取 `/api`、登入、行情、K 線或訊號，避免舊資料被誤認為即時行情。
- 新增 GitHub Actions Android debug APK 與 iOS Simulator unsigned build 流程。Capacitor 8 CI 使用 Node 22 與 Xcode 26；建置產物仍不是可送商店的簽署版。
- 此分支尚未完成會員自行刪除帳號。不可只刪除 Supabase Auth 身分而忽略關聯資料；需先盤點 Supabase 資料表、研究紀錄、訂閱／稽核保留義務，再設計確認、刪除與完成通知流程。
- App Store 正式商店圖示需輸出各平台規格 PNG；目前提交的 SVG 是 PWA／開發階段素材，不視為完整商店圖示包。


## 9. 帳號刪除功能實作與驗收限制

- 會員登入後可從帳號列啟動刪除，並要求重新輸入目前登入 Email 及 `DELETE` 字樣確認。
- Google Play 外部帳號刪除預定資源路徑：`https://taiwan-stock-hunter-o3tt.onrender.com/account-deletion`。此路徑隨本分支部署後才會生效；目前正式 Render 服務尚未包含此變更。使用者登入後會開啟刪除確認流程。
- 後端只接受有效登入者的請求，核對 Email／確認字串，並要求 Render 設定 `SUPABASE_SERVICE_ROLE_KEY`；缺少金鑰時安全拒絕，不會假稱刪除成功。
- 目前已檢視的 Supabase migration 中，finance_consents、finance_accounts、finance_balances、finance_transactions 對 auth.users 使用 ON DELETE CASCADE；finance_audit_events 使用 ON DELETE SET NULL，以保留去識別化稽核事件。
- 仍須在實際 Supabase 專案確認 migration 已套用，檢查是否存在未納入 Git 的資料表、Storage bucket、外部第三方紀錄或法定保存義務，並以測試帳號做端到端刪除驗收。
- 正式送審前，需確認服務角色金鑰存在於 Render 後端環境、外部刪除網址可公開存取、刪除失敗可重試且客服聯絡資訊已填妥。

