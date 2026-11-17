# 泰丞・台股 AI 智慧操盤中樞

此 repository 包含 React 前端與 Node.js 後端 API 骨架。系統採「資料不足就不判斷」原則；沒有授權即時行情、全市場指標掃描、法人籌碼或台指期來源時，相關欄位會明確顯示缺資料，不會用假數字補齊。

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
5. 終端機 B 啟動前端：`npm start`（CRA dev server 透過 package.json proxy 連後端）。
6. 測試：`npm run test:server`；正式前端建置：`npm run build`。

正式部署：可直接使用根目錄 Dockerfile 與 render.yaml，在 Render 建立 Blueprint 服務；詳細步驟見 [DEPLOYMENT.md](./DEPLOYMENT.md)。Docker 正式模式由同一個 Node 服務提供 React 網頁與 /api，不必另設前端代理。不可將 FinMind Token 或其他 API 金鑰放在瀏覽器環境變數。

## API
- `GET /api/health`：服務健康狀態、Node 版本、執行模式與各資料供應商是否已設定。
- `GET /api/market/universe`：FinMind TaiwanStockInfo 股票清單（需 FINMIND_TOKEN）。
- `GET /api/market/snapshot`：優先使用 Fugle TSE/OTC 全市場快照（`FUGLE_API_KEY`），否則使用 `MARKET_REALTIME_URL`。
- `GET /api/market/scan`：優先使用 FinMind 全市場日 K + Fugle 即時快照計算所有股票分數；FinMind 方案不足時可改接 `MARKET_SCAN_URL`。回傳每檔 `scorecard`。
- `GET /api/market/history/:symbol?interval=1d&limit=120`：FinMind TaiwanStockPrice 日 K 歷史資料（需 FINMIND_TOKEN）。
- `GET /api/market/institutional-flows`：優先使用 FinMind 全市場三大法人與融資融券日資料（需 Backer 以上權限），否則使用 `MARKET_FLOWS_URL`。
- `GET /api/market/futures`：優先使用 FinMind TX 期貨日資料（非即時），若要即時期貨需 `MARKET_FUTURES_URL` 或另接有授權的即時供應商。
- `GET /api/market/sentiment`：優先使用 FinMind CNN Fear & Greed（日資料，需 Backer 以上），否則使用 `MARKET_SENTIMENT_URL`。
- `GET /api/market/news`：優先使用 FinMind TaiwanStockNews，否則使用 `MARKET_NEWS_URL`。

全市場掃描資料每檔可提供 `trend, macd, signal, rsi, volumeRatio, institutionalNet, foreignNet, trustNet, dealerNet, marginChange, shortChange, pe, pb, dividendYield, trustFlowPct5d, foreignFlowPct5d`；亦可提供全市場 `fearGreed, advanceDecline, futuresChangePct`。後端會回傳 `scorecard`（0–100 多空方向分數、信心覆蓋率、方向與原因）。分數是透明規則式研究排序，不是勝率；時間戳過期或覆蓋率不足時只顯示觀望。

自訂 URL 必須回傳 JSON，資料契約範例見下方：
- 行情：`{source, timestamp, data: {"2330": {price, changePct, volume, timestamp}}}`
- 全市場掃描：`{source, timestamp, data: {"2330": {rsi, trend, macd, signal, volumeRatio}}}`
- 籌碼：`{source, timestamp, data: {"2330": {foreignNet, trustNet, dealerNet, institutionalNet, largeHolderPct, largeHolderChangePct, retailBias, marginChange, shortChange, asOf}}}`
- 台指期：`{source, timestamp, data: {last, changePct, openInterestChange, asOf}}`
- 情緒：`{source, timestamp, data: {fearGreed, label, retailBias, advanceDecline, asOf}}`

## 資料來源與限制
- FinMind API 文件：<https://finmind.github.io/>
- TWSE OpenAPI：<https://openapi.twse.com.tw/>
- TPEx OpenAPI：<https://www.tpex.org.tw/openapi/>
- TAIFEX OpenAPI：<https://openapi.taifex.com.tw/>
- 非凡新聞台官方直播：<https://news.ustv.com.tw/livevideo>
- 非凡商業台官方財經直播：<https://biz.ustv.com.tw/livevideo>

Fugle 全市場快照上游每五秒更新一次；前端每秒輪詢只代表每秒向本系統詢問一次，不代表上游每秒有新成交。FinMind 日 K、法人、融資融券與恐懼貪婪資料屬日資料，不應標成逐秒更新。全市場日 K、法人與融資融券批次查詢需 FinMind Backer 以上；FinMind 方案及資料授權請見官方 [方案價格](https://finmind.github.io/Pricing/) 與 [商業使用規範](https://finmind.github.io/CommercialUse/)。Fugle 全市場快照需 Developer 或 Advanced 方案，官方快照更新頻率為五秒，方案與價格請見 [Fugle 方案](https://developer.fugle.tw/docs/pricing/)。即時期貨與主力分點資料仍需另有相應授權。前端提供非凡商業台（財經 24 小時直播）與非凡新聞台兩個官方直播來源切換；官方網站可能限制第三方 iframe 嵌入，若播放器空白可開啟官方頁面。

## 降低預測錯誤率的防呆原則
1. 資料時間戳過期、欄位缺漏、OHLC 不合理、歷史不足 60 根時，不產生有效訊號。
2. 缺少行情／籌碼來源時顯示「未設定」或「資料不足」，不以隨機值、固定值或手動預設值偽裝成即時資料。
3. 目前畫面多空分數屬規則式研究評分，不是勝率或預測機率。
4. 正式發布預測前，必須做 walk-forward 樣本外回測、計入手續費／稅／滑價，至少 100 筆樣本外交易，並檢查最大回撤；不足門檻一律觀望。
5. 追蹤命中率、Precision、Recall、Brier score、最大回撤及不同市場 regime 的表現；定期重新校準，不能用訓練集準確率宣稱預測能力。
6. 大戶持股、法人買賣超及融資融券多為日資料或延遲資料，不應標成逐秒更新。

## 自動排程與收盤研究
`.github/workflows/market-automation.yml` 會在台灣交易時段每 5 分鐘呼叫全市場掃描，並於 13:40 產生收盤研究報告；報告會以 GitHub Actions Artifact 保存 90 天。請在 GitHub repository 的 Settings → Secrets and variables → Actions 新增 `MARKET_APP_URL`，值為部署後的 Render 網址（不要加 `/api`）。這是掃描與報告存檔，不代表模型已自動再訓練。

目前尚未配置持久化資料庫與模型訓練流程；真正的自我學習必須保存歷史訊號、隔日／隔週實際報酬、成本與滑價，再做 walk-forward 樣本外驗證，不能只把當日排名稱為學習。即時網路研究／LLM 自動推理也需額外的搜尋與模型 API 服務金鑰；本系統目前只接新聞資料來源，不會假裝 ChatGPT 在雲端服務內持續思考。

## 安全提醒
API Key 僅放後端環境變數；不要提交 .env、Token、券商帳密或個人憑證。此專案不會自動下單，也不是投資建議。
