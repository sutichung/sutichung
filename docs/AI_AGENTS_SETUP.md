# 三 AI Agent 與 K 線圖設定

## 已整合功能

- Gemini：獨立技術分析，檢查 K 線、EMA、MACD、RSI、量價與支撐壓力。
- Grok：獨立市場情境分析；本版不會自行宣稱有即時新聞搜尋，沒有提供新聞資料時必須標示資料缺口。
- DeepSeek：獨立籌碼與風險分析，檢查法人、融資融券、集保持股與量價。
- 每個 Agent 輸出方向、0–100 分數、信心分數、看多理由、看空理由、可公開的判讀邏輯、風險及失效條件。
- 系統只彙整已成功回覆的模型；未設定或失敗的模型不會用假分數補位。
- 不顯示模型隱藏思維鏈，只呈現結論、依據與簡明邏輯。
- K 線圖支援日／週／月 K、60／120／240 根、成交量、EMA5／20／60、布林通道、十字游標 OHLC、縮放與拖曳。

## 財經直播中心與有聲播放

- 已加入可嵌入的官方 YouTube 頻道：57 東森財經、SBN 全球財經台、非凡商業台、寰宇財經新聞、TVBS 財經。前兩者有官方 24 小時直播說明；其餘依頻道當下是否開播而定。
- 另列三立財經 iNEWS、非凡新聞台官方直播頁。這些頁面可能拒絕第三方 iframe，因此保留官方外開播放，不以破解方式繞過限制。
- YouTube 播放器本身提供音量控制；使用者按播放即可聽聲音。瀏覽器會阻擋未經使用者操作的自動發聲。
- 開源 HLS 播放器採用 hls.js（MIT），支援直接授權提供的 HLS .m3u8 直播。Safari 可使用原生 HLS；其他支援 Media Source Extensions 的瀏覽器由 hls.js 播放。串流主機必須開放正確 CORS，並允許瀏覽器讀取播放清單及分段。
- 若取得電視台授權的 HLS URL，可在前端建置環境設定 `REACT_APP_LIVE_HLS_STREAMS`，值為 JSON 陣列，例如：
  `[{"id":"licensed-finance-tv","name":"授權財經直播","src":"https://stream.example.com/live/index.m3u8","url":"https://publisher.example.com/live"}]`
- 不要使用破解 DRM、抓取付費訊號、未授權轉播或未經同意擷取直播音訊。

## 自動化方式與範圍

- 全市場技術掃描沿用規則引擎，目標每 60 秒更新；這是全市場低成本篩選，不代表每一檔都呼叫三家 LLM。
- 個股三 AI 自動分析預設開啟：目前選取股票首次載入時分析，之後每 15 分鐘更新一次；可在三 AI 區關閉。必須保持網站分頁開啟且後端可用。
- 未設定 API Key 的模型會回報未設定，不會假造分析。已設定的供應商才會產生 API 用量；手動「立即重跑」也會產生額外請求。
- 目前不是 24 小時無人值守的雲端排程，也不會自動對所有股票逐檔呼叫 AI。Render Free 可能休眠；要做全天候背景掃描，需另設持續運作的 worker／排程服務與用量上限。
- AI 多空劇本分為偏多、盤整、偏空三種，包含觸發條件、應對、可推導的目標價／停損價及風險。資料不足時價格欄位應留空，不得臆造。
- 這些輸出是研究輔助，不會自動送出券商委託，也不是投資建議。

## 設定 API Key（Render）

在 Render Dashboard 選擇服務 `taiwan-stock-hunter` → Environment，新增以下環境變數：

| Key | 用途 | 預設模型 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API | `gemini-3.8-flash` |
| `XAI_API_KEY` | xAI Grok API | `grok-4.7` |
| `DEEPSEEK_API_KEY` | DeepSeek API | `deepseek-flash` |

可選模型覆寫：`GEMINI_MODEL`、`XAI_MODEL`、`DEEPSEEK_MODEL`。

金鑰只能放 Render 後端環境變數，不可放進 React 的 `REACT_APP_*` 變數、前端程式碼、GitHub 檔案或公開聊天。

官方建立金鑰入口：
- Gemini：`https://aistudio.google.com/app/apikey`
- Grok：`https://console.x.ai/`
- DeepSeek：`https://platform.deepseek.com/api_keys`

預設模型 ID 已依官方模型文件設定為 `gemini-3.8-flash`、`grok-4.7`、`deepseek-flash`。可用環境變數覆寫模型名稱。

## 費用與呼叫方式

個股三 AI 自動分析預設開啟：首次載入選股時執行，之後每 15 分鐘更新一次；可在三 AI 區關閉。按「立即重跑」會略過快取並額外發出請求。自動分析只針對目前選取的個股，必須保持網站分頁開啟；全市場其餘股票仍由低成本規則掃描篩選。Grok API 明確按 token 用量收費；Gemini 是否有免費額度依模型、帳戶與專案配額；DeepSeek 依官方 API 當期價格及尖峰／離峰規則計費。先確認供應商帳戶用量及額度，未設定金鑰不會發出請求。

## 端點

- `GET /api/market/agents/2330`：取得快取或執行三 AI 分析。
- `GET /api/market/agents/2330?refresh=1`：略過 10 分鐘 AI 結果快取並重新分析。

## 資料與時間標示

- 即時報價時間取自報價來源回傳的個股時間戳；API 接收時間另外顯示，不把兩者混為一談。
- K 線來源、最後一根 K 線日期及後端載入時間分開顯示。
- 目前 K 線來源為 TWSE 官方 STOCK_DAY 日線或 FinMind 日線；週 K、月 K 是從日 K 聚合，並非即時分鐘線。
- AI 的評分是模型對方向強度的主觀意見，不是統計勝率或未來報酬機率，也不構成下單指令。
