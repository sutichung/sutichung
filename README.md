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
- `GET /api/market/snapshot`：授權即時行情服務；需 MARKET_REALTIME_URL。
- `GET /api/market/scan`：全市場指標摘要服務；需 MARKET_SCAN_URL。回傳 `{data: {"2330": {rsi,trend,macd,signal,volumeRatio}}}`。
- `GET /api/market/history/:symbol?interval=1d&limit=120`：FinMind TaiwanStockPrice 日 K 歷史資料（需 FINMIND_TOKEN）。
- `GET /api/market/institutional-flows`：法人、大戶級距、融資融券；需 MARKET_FLOWS_URL。
- `GET /api/market/futures`：台指期行情與未平倉；需 MARKET_FUTURES_URL。
- `GET /api/market/sentiment`：市場恐懼貪婪與市場廣度；需 MARKET_SENTIMENT_URL。
- `GET /api/market/news`：授權新聞標題、摘要與連結；需 MARKET_NEWS_URL。

全市場掃描資料每檔可提供 `trend, macd, signal, rsi, volumeRatio, institutionalNet, foreignNet, trustNet, dealerNet, marginChange, shortChange`；亦可提供全市場 `fearGreed, advanceDecline, futuresChangePct`。後端會回傳 `scorecard`（0–100 多空方向分數、信心覆蓋率、方向與原因）。分數是透明規則式研究排序，不是勝率；時間戳過期或覆蓋率不足時只顯示觀望。

自訂 URL 必須回傳 JSON，資料契約範例見下方：
- 行情：`{source, timestamp, data: {"2330": {price, changePct, volume, timestamp}}}`
- 全市場掃描：`{source, timestamp, data: {"2330": {rsi, trend, macd, signal, volumeRatio}}}`
- 籌碼：`{source, timestamp, data: {"2330": {foreignNet, trustNet, dealerNet, institutionalNet, largeHolderPct, marginChange, shortChange, asOf}}}`
- 台指期：`{source, timestamp, data: {last, changePct, openInterestChange, asOf}}`
- 情緒：`{source, timestamp, data: {fearGreed, label, retailBias, advanceDecline, asOf}}`

## 資料來源與限制
- FinMind API 文件：<https://finmind.github.io/>
- TWSE OpenAPI：<https://openapi.twse.com.tw/>
- TPEx OpenAPI：<https://www.tpex.org.tw/openapi/>
- TAIFEX OpenAPI：<https://openapi.taifex.com.tw/>
- 非凡新聞官方直播：<https://news.ustv.com.tw/livevideo>

FinMind 日 K 資料不是逐筆即時行情。前端每秒輪詢只代表每秒向本系統詢問一次，不代表供應商每秒有新成交。正式逐秒／逐筆報價、即時期貨、全市場逐股掃描與法人籌碼需要有相應授權及 API 配額。新聞 iframe 可能受官方網站 CSP/X-Frame-Options 限制，系統保留官方頁面連結作為備援。

## 降低預測錯誤率的防呆原則
1. 資料時間戳過期、欄位缺漏、OHLC 不合理、歷史不足 60 根時，不產生有效訊號。
2. 缺少行情／籌碼來源時顯示「未設定」或「資料不足」，不以隨機值、固定值或手動預設值偽裝成即時資料。
3. 目前畫面多空分數屬規則式研究評分，不是勝率或預測機率。
4. 正式發布預測前，必須做 walk-forward 樣本外回測、計入手續費／稅／滑價，至少 100 筆樣本外交易，並檢查最大回撤；不足門檻一律觀望。
5. 追蹤命中率、Precision、Recall、Brier score、最大回撤及不同市場 regime 的表現；定期重新校準，不能用訓練集準確率宣稱預測能力。
6. 大戶持股、法人買賣超及融資融券多為日資料或延遲資料，不應標成逐秒更新。

## 安全提醒
API Key 僅放後端環境變數；不要提交 .env、Token、券商帳密或個人憑證。此專案不會自動下單，也不是投資建議。
