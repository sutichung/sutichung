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

## 開源／免 API Key 的本機 AI 選項

若要避免每次呼叫雲端模型產生 Token 費用，可在自己的電腦或自有伺服器安裝 Ollama，使用 Qwen、Gemma、DeepSeek 開放權重等模型。Ollama 本機 API 預設 `http://localhost:11434`，本機呼叫不需要 API Key；Ollama 雲端 API 則需要自己的 API Key。

重要限制：目前網站部署在 Render，Render 裡的 `localhost` 是 Render 容器，不是使用者的 Windows 電腦。要讓 Render 呼叫本機 Ollama，必須自行架設安全、可連線的 HTTPS 端點或把整套網站與模型部署在同一台主機；不要直接把本機 11434 連接埠裸露到公網。本專案目前已整合 Gemini／Grok／DeepSeek 雲端 Agent，Ollama 是可選的開源部署路線，尚未接入目前三個 Agent 卡片。

參考：`https://ollama.com/`、`https://github.com/ollama/ollama`。

## 費用與呼叫方式

個股三 AI 自動分析預設開啟：首次載入選股時執行，之後每 15 分鐘更新一次；可在三 AI 區關閉。按「立即重跑」會略過快取並額外發出請求。自動分析只針對目前選取的個股，必須保持網站分頁開啟；全市場其餘股票仍由低成本規則掃描篩選。Grok API 按 Token 用量計費；Gemini 依模型與帳戶提供有限免費層或付費額度；DeepSeek API 依官方 Token 價格計費，並有尖峰／離峰價差。先確認供應商帳戶用量及額度，未設定金鑰不會發出請求。

## 端點

- `GET /api/market/agents/2330`：取得快取或執行三 AI 分析。
- `GET /api/market/agents/2330?refresh=1`：略過 10 分鐘 AI 結果快取並重新分析。

## 資料與時間標示

- 即時報價時間取自報價來源回傳的個股時間戳；API 接收時間另外顯示，不把兩者混為一談。
- K 線來源、最後一根 K 線日期及後端載入時間分開顯示。
- 目前 K 線來源為 TWSE 官方 STOCK_DAY 日線或 FinMind 日線；週 K、月 K 是從日 K 聚合，並非即時分鐘線。
- AI 的評分是模型對方向強度的主觀意見，不是統計勝率或未來報酬機率，也不構成下單指令。


## 免付費 AI 備援（OpenRouter Free）

若 Gemini、Grok、DeepSeek 原廠 API 未設定或呼叫失敗，可設定一組 OpenRouter API Key 作為備援。三個 Agent 仍會各自使用技術面、市場情境、籌碼風險的獨立提示詞；回覆會明確標示「OpenRouter 免費模型備援」及實際回傳模型，不會冒稱為 Gemini、Grok 或 DeepSeek 原廠模型。

1. 到 https://openrouter.ai/keys 建立 API Key。
2. 在 Render Environment 設定 `OPENROUTER_API_KEY`。
3. `OPENROUTER_MODEL` 預設 `openrouter/free`，由路由器挑選當下可用的免費模型；也可改成 OpenRouter 目錄中以 `:free` 結尾的特定模型 ID。
4. 免費模型的可用性、速度與品質會變動；免費變體目前有每日 50 次、每分鐘 20 次限制，失敗請求也可能計入每日額度。免費模型不保證金融研究等級或服務可用性。

官方說明：https://openrouter.ai/collections/free-models/

## YouTube 免 API Key 播放備援

財經直播中心已改用已知官方頻道 ID 建立頻道直播播放器，不再呼叫 YouTube Data API 搜尋直播影片，因此不需要 `YOUTUBE_API_KEY`。頻道未開播、直播不允許嵌入或 YouTube 調整播放器規則時，仍需點「開啟官方直播」在 YouTube 官方頁觀看。這是降低 API 依賴的備援，不保證所有頻道每個時段都可內嵌。

YouTube 官方播放器文件：https://developers.google.com/youtube/player_parameters

## 台指期夜盤資料來源分級

- 富果 FutOpt REST：可提供期權日內行情，但需具備期權即時行情權限；免費基本用戶不含期權即時行情。
- TAIFEX OpenAPI：提供官方日報等資料，可做歷史／日資料核對，不等同盤中夜盤即時行情。
- TAIFEX 官網盤後交易報表：可供人工查看交易時段資料；交易所明確表示網站行情頁是瀏覽用途，並未提供可任意介接的即時資料庫 API。正式即時串接應使用有授權的期貨行情商／期貨商 API。
- FinMind TaiwanFuturesDaily：只作期貨日資料備援，不得標示為夜盤即時。

參考： https://openapi.taifex.com.tw/ 、https://www.taifex.com.tw/cht/9/tradersQAIS 、https://developer.fugle.tw/docs/pricing/
