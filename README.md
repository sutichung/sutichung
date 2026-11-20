# 泰丞・台股 AI 智慧操盤中樞

此 repository 包含 React 前端與 Node.js 後端 API 骨架。系統採「資料不足就不判斷」原則；沒有授權即時行情、全市場指標掃描、法人籌碼或台指期來源時，相關欄位會明確顯示缺資料，不會用假數字補齊。

## ANT Ant Colony 全球推廣計畫

ANT 專案的全球自然流量推廣執行計畫已整理於 [ANT Global Growth Plan](./docs/ANT_GLOBAL_GROWTH_PLAN.md)。計畫目標為 10,000 名真實社群會員，採零成本自然流量、科技型品牌定位，包含 90 天執行節奏、內容日曆、社群治理、反詐騙規範、成效指標與公開銷售前置門檻。此文件是執行計畫，不代表社群帳號已建立、活動已發布或會員目標已達成。

## ANT 專案重要狀態

- 代幣規格：ANT，規劃總量 200,000，具可銷毀設計；請以合約原始碼與部署驗證為準。
- 網路：先使用 BSC Testnet；測試代幣不具承諾的貨幣價值。
- 管理：多簽託管方向；部署地址、簽署人與門檻須在實際部署後核實。
- 佣金：平台規劃 5%，必須與代幣轉帳稅或協議費分開揭露。
- 售價：Market 的定價與執行機制仍須明確定義價格來源、滑價、過期價格保護及失敗退款行為。
- 收款：USDT 收款與 ANT 自動交付必須完成合約審查、測試及適用地區法律審查後，才可用於公開銷售。
- 不得將未部署、未審計、未上架或未驗證的功能描述為已完成。

## 專案技術
- 前端：Create React App / React 18（不是 Vite）。
- 後端：Node.js 18+ 原生 HTTP 與 fetch，無額外伺服器依賴。
- 指標：EMA 5/20/60、RSI(14)、MACD、KD-K、ATR、20 日支撐壓力、量比。
- 風控工具：資料時間戳檢查、OHLC 合法性檢查、信心門檻、樣本外交易筆數與最大回撤門檻。
- 測試：Node.js 內建 node:test。

## 啟動
1. 安裝 Node.js 20 或更新版本。
2. 複製環境設定：`cp .env.example .env`，填入可用資料供應商設定。
3. 安裝前端依賴：`npm install`。
4. 終端機 A 啟動後端：`npm run server`（預設 http://localhost:8787）。
5. 終端機 B 啟動前端：`npm start`（Vite dev server 透過 vite.config.js proxy 連後端）。
6. 測試：`npm run test:server`；正式前端建置：`npm run build`。

正式部署：可直接使用根目錄 Dockerfile 與 render.yaml，在 Render 建立 Blueprint 服務；詳細步驟見 [DEPLOYMENT.md](./DEPLOYMENT.md)。Docker 正式模式由同一個 Node 服務提供 React 網頁與 /api，不必另設前端代理。不可將 FinMind Token 或其他 API 金鑰放在瀏覽器環境變數。

其餘行情 API、資料來源限制、交易風控、AI Agent、會員系統、美股與加密貨幣模組等完整文件，請參閱本 README 其餘歷史章節及 docs/ 目錄。
