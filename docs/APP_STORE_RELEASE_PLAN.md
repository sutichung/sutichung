# 免費手機 App 發布計畫（零新增付費）

> 專案：泰丞・台股 AI 智慧操盤中樞  
> 主要目標：不購買 Apple Developer／Google Play 開發者帳號、不新增付費服務，讓會員可在 iPhone 與 Android 以手機 App 形式使用。  
> 原則：優先使用現有網站、現有 Render 服務與免費開源工具；不得因本計畫新增付費資源。

## 1. 發布路線

### 第一優先：PWA（iPhone／Android 共用）

- 以現有 HTTPS 網站安裝到手機主畫面，使用者可從主畫面圖示啟動。
- 不需要 App Store／Google Play 開發者會員，也不需要商店簽署憑證。
- 保留既有登入、會員、行情、K 線與分析功能，沿用現有後端 API。
- 以 manifest、圖示、service worker、離線提示與行動版版面完成 PWA。
- Service worker 只能快取不會過期的靜態外殼資源；不可快取登入、會員、API、報價、K 線或訊號資料。離線時必須明確顯示無網路／資料不可用，不得把舊報價當成即時行情。

iPhone 安裝方式：使用 Safari 開啟網站，選擇「分享」→「加入主畫面」。  
Android 安裝方式：使用 Chrome 開啟網站，選擇「安裝應用程式」或「加入主畫面」（依瀏覽器版本顯示）。

### 第二優先：Android APK（選擇性）

- 使用 Capacitor 與 GitHub Actions 的免費開源建置流程產生 debug APK，供測試或自行安裝。
- 不透過 Google Play 發布；使用者可能需要允許安裝外部來源 App。
- Debug APK 僅供測試，不是正式簽署發布包。若要提供正式 APK，需另外完成 release signing 與安全的金鑰管理；不得把簽署金鑰提交到 Git。
- 不得為此新增付費建置服務或付費憑證。

### 暫緩：App Store／Google Play

- 不購買 Apple Developer Program 或 Google Play Console 會員。
- 不提交商店審核、不宣稱已在商店上架。
- 未來若使用者主動決定支付相關費用，再另行評估商店上架；目前不以此作為交付前提。

## 2. 工程範圍

- React／Vite 前端沿用現有程式，不重寫系統。
- PWA 使用 manifest、適當尺寸圖示、service worker、離線 fallback 與 HTTPS。
- 保留既有 Render API；不新增資料庫、付費 CDN、付費推播或第三方訂閱。
- Capacitor 設定保留作為 Android APK／未來原生包裝選項，但不應讓 PWA 必須依賴 Capacitor 才能運作。
- 手機版需檢查安全區域、底部導覽、鍵盤遮擋、登入流程、窄螢幕與深色模式。
- 金鑰只能放伺服器端，不得打包進前端或 APK。

## 3. 金融資料與安全要求

- 股票及市場資料需標示來源、最後更新時間，以及即時／延遲／歷史／不可用狀態。
- 未獲授權的來源不得描述成官方即時行情；不可用舊快取假裝即時。
- API 斷線、限流、休市或資料過期時，顯示明確狀態。
- 實盤下單維持鎖定；研究評分不是交易指令，不保證獲利。
- 帳號刪除流程、資料保存義務與 Supabase migration 必須先完成測試帳號端到端驗收；不得用真實會員測試刪除。
- 不可將 Supabase service role key、API secret、簽署私鑰或其他憑證提交到 Git。

## 4. 免費方案驗收門檻

- `npm run test:server` 通過。
- `npm run build` 通過。
- PWA manifest 可正常讀取，圖示及啟動畫面可用。
- iPhone Safari「加入主畫面」及 Android Chrome 安裝流程實測。
- 登入、登出、註冊、密碼重設與會員資料在手機上正常。
- 線上行情與 API 仍能正確更新；離線或資料過期時必須明確提示。
- service worker 不得快取 API、登入資料、行情、K 線及交易訊號。
- 測試小螢幕、底部導覽、安全區域、鍵盤遮擋、重新整理與網路中斷。
- Android debug APK 若提供，需另行安裝測試並標示「測試版／未簽署商店發布版」。
- 不新增任何付費資源；如遇到必須付費才能完成的項目，停止該項並回報免費替代方案。

## 5. 目前分支工程狀態

- 準備分支：`app-store-preparation`。
- 已加入 Capacitor 設定、PWA 相關資源、離線 fallback、service worker 與 Android／iOS CI 工作流程（仍須以最新 CI 結果驗證）。
- service worker 設計上只快取靜態資源，不快取 API、登入、行情、K 線或訊號。
- 已加入會員端帳號刪除入口與伺服器端 Supabase 刪除 API；仍須確認正式 Supabase migration、Render 後端 service role key 設定與測試帳號端到端驗收。
- Android debug APK 與 iOS Simulator unsigned build 是測試產物，不等同正式簽署版或商店上架。
- PWA 必須獨立可用；不能把商店建置或 Apple／Google 會員費當成使用者安裝手機版的必要條件。

## 6. 不得擅自執行的事項

- 不得新增付費 Render 方案、資料庫、第三方 API、推播服務或開發者會員。
- 不得擅自合併到 main、部署正式服務、變更正式環境變數或刪除真實會員資料。
- 不得將未通過的測試標記為通過，也不得宣稱已完成手機實機驗收。
- 不得將網站 PWA、測試 APK 或 CI 產物描述成已經 App Store／Google Play 正式上架。
