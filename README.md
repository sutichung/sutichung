# 泰丞・台股 AI 智慧操盤中樞（前端更新版）

## 本次更新
- 非凡新聞官方直播頁面嵌入（若官方網站禁止 iframe，仍可點連結開啟）。
- 上市／上櫃全市場清單掃描、搜尋、排序。
- 1 秒輪詢前端資料服務；畫面同時顯示來源時間戳，避免把舊行情誤認為新行情。
- 以真實歷史 OHLCV 計算 EMA5/20/60、RSI(14)、MACD、KD-K、ATR、支撐壓力與量比。
- 台指期、法人買賣超、大戶持股級距、融資融券、散戶情緒與市場廣度面板。
- AI 多空分數附上可檢查的理由；資料不足時不硬算、不用假數字補值。

## 安裝
在 React + Vite 專案中以此檔案取代 `src/App.jsx`。此畫面需要後端提供以下 API：

| API | 回傳格式 | 說明 |
|---|---|---|
| `GET /api/market/universe` | `{ data: [{symbol,name,sector,exchange,indicators:{rsi,trend,macd,macdSignal,volumeRatio}}] }` | 全部上市＋上櫃股票清單；掃描清單每檔需由後端提供已計算指標摘要 |
| `GET /api/market/snapshot` | `{ data: {"2330": {price,changePct,volume,timestamp}}, source, timestamp }` | 即時行情快照 |
| `GET /api/market/history/:symbol?interval=1d&limit=120` | `{ data: [{time,open,high,low,close,volume}] }` | 歷史 K 線；至少 60 根才計算 EMA60 |
| `GET /api/market/institutional-flows` | `{ data: {"2330": {foreignNet,trustNet,dealerNet,largeHolderPct,marginChange,shortChange,asOf}} }` | 法人、持股級距、融資融券 |
| `GET /api/market/futures` | `{ data: {last,changePct,openInterestChange,asOf}, source, timestamp }` | 台指期行情及未平倉資訊 |
| `GET /api/market/sentiment` | `{ data: {fearGreed,label,retailBias,advanceDecline,asOf} }` | 自訂市場情緒模型及市場廣度 |

以上欄位是前後端資料契約。後端必須自行接資料供應商、處理交易日／盤中時段、快取、速率限制、資料時間戳與錯誤狀態。不可將前端每秒輪詢誤稱為上游逐筆即時行情。

## 建議資料來源
- 非凡新聞官方直播頁：<https://news.ustv.com.tw/livevideo>
- TWSE 官方 OpenAPI：<https://openapi.twse.com.tw/>
- TPEx 官方 OpenAPI：<https://www.tpex.org.tw/openapi/>
- TAIFEX 官方 OpenAPI：<https://openapi.taifex.com.tw/>
- FinMind 文件：<https://finmind.github.io/v3/>

TWSE／TPEx／TAIFEX 公開資料不等於所有商品的即時逐筆授權行情。FinMind 亦有不同資料集與方案限制。正式逐秒行情、即時五檔與期貨逐筆資料，請確認資料商授權、延遲規則、API 配額與商用條款。Token/API Key 應放在後端環境變數，絕不可寫進 React 前端。

## 交易判斷模型說明
目前分數是透明的規則式研究評分，不是已驗證的預測模型。大戶／法人資料常為日資料或特定時間更新，不能假裝逐秒更新。要提升預測能力，下一步應加入歷史回測、樣本外驗證、交易成本、滑價、停損與風險報酬分析，並追蹤訊號命中率及最大回撤。
