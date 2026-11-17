# 三 AI Agent 與 K 線圖設定

## 已整合功能

- Gemini：獨立技術分析，檢查 K 線、EMA、MACD、RSI、量價與支撐壓力。
- Grok：獨立市場情境分析；本版不會自行宣稱有即時新聞搜尋，沒有提供新聞資料時必須標示資料缺口。
- DeepSeek：獨立籌碼與風險分析，檢查法人、融資融券、集保持股與量價。
- 每個 Agent 輸出方向、0–100 分數、信心分數、看多理由、看空理由、可公開的判讀邏輯、風險及失效條件。
- 系統只彙整已成功回覆的模型；未設定或失敗的模型不會用假分數補位。
- 不顯示模型隱藏思維鏈，只呈現結論、依據與簡明邏輯。
- K 線圖支援日／週／月 K、60／120／240 根、成交量、EMA5／20／60、布林通道、十字游標 OHLC、縮放與拖曳。

## 設定 API Key（Render）

在 Render Dashboard 選擇服務 `taiwan-stock-hunter` → Environment，新增以下環境變數：

| Key | 用途 | 預設模型 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API | `gemini-3.8-flash` |
| `XAI_API_KEY` | xAI Grok API | `grok-4.7` |
| `DEEPSEEK_API_KEY` | DeepSeek API | `deepseek-flash` |

可選模型覆寫：`GEMINI_MODEL`、`XAI_MODEL`、`DEEPSEEK_MODEL`。

金鑰只能放 Render 後端環境變數，不可放進 React 的 `REACT_APP_*` 變數、前端程式碼、GitHub 檔案或公開聊天。

## 費用與呼叫方式

三 AI 不會在背景自動呼叫。使用者必須在個股頁按「啟動三 AI 分析」或「重新執行三 AI」才會發出請求；結果快取 10 分鐘，手動重新執行會略過快取。Grok API 明確按 token 用量收費；Gemini 是否有免費額度依模型、帳戶與專案配額；DeepSeek 依官方 API 當期價格及尖峰／離峰規則計費。先確認供應商帳戶用量及額度，未設定金鑰不會發出請求。

## 端點

- `GET /api/market/agents/2330`：取得快取或執行三 AI 分析。
- `GET /api/market/agents/2330?refresh=1`：略過 10 分鐘 AI 結果快取並重新分析。

## 資料與時間標示

- 即時報價時間取自報價來源回傳的個股時間戳；API 接收時間另外顯示，不把兩者混為一談。
- K 線來源、最後一根 K 線日期及後端載入時間分開顯示。
- 目前 K 線來源為 TWSE 官方 STOCK_DAY 日線或 FinMind 日線；週 K、月 K 是從日 K 聚合，並非即時分鐘線。
- AI 的評分是模型對方向強度的主觀意見，不是統計勝率或未來報酬機率，也不構成下單指令。
