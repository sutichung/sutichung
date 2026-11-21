# ZENTRAX — Next-Gen Financial Technology

**ZENTRAX** 是整合 AI 市場情報、量化研究、全球市場監控與區塊鏈生態的金融科技平台。平台品牌採黑金視覺；ANT 仍是原有代幣名稱與代號，不因品牌改版而變更合約或代幣經濟。\n\n此 repository 包含 React 前端與 Node.js 後端 API 骨架。系統採「資料不足就不判斷」原則；沒有授權即時行情、全市場指標掃描、法人籌碼或台指期來源時，相關欄位會明確顯示缺資料，不會用假數字補齊。

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

## API
- `GET /api/health`：服務健康狀態、Node 版本、執行模式、資料供應商設定狀態與實盤交易鎖定狀態。
- `GET /api/trading/readiness`：實盤交易就緒檢查；目前固定回報 `executionEnabled: false`，並列出券商 API、成交對帳、稽核、樣本外驗證及硬性風控缺口。
- `GET /api/market/universe`：FinMind TaiwanStockInfo 股票清單（需 FINMIND_TOKEN）。
- `GET /api/market/snapshot`：使用 TWSE 與 TPEx 官方 OpenAPI 取得最新公開日收盤行情；回傳 `dataMode: END_OF_DAY`，不是盤中即時報價。
- `GET /api/market/scan`：使用已接通的歷史日 K、官方日收盤行情、估值及籌碼計算研究分數；資料不足時標示觀望，不以未授權即時報價補值。
- `GET /api/market/history/:symbol?interval=1d&limit=120`：FinMind TaiwanStockPrice 日 K 歷史資料（需 FINMIND_TOKEN）。
- `GET /api/market/fundamentals/:symbol`：單檔公司基本資料、損益表、資產負債表、現金流量表、近 24 個月營收年增率、股利紀錄、PER/PBR/殖利率、毛利率／營業利益率／淨利率、負債／流動比率及附資料覆蓋率的財務體質檢查；財報資料需 FINMIND_TOKEN，缺少憑證時仍回傳官方公司基本資料。
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

## 三 AI 多空分析與互動 K 線圖

- 個股頁新增 Gemini（技術面）、Grok（市場情境）、DeepSeek（籌碼與風險）三個獨立 Agent；每個模型各自回傳方向、0–100 評分、信心分數、看多／看空依據、可公開的分析邏輯、風險與失效條件。
- API：`GET /api/market/agents/:symbol`；加上 `?refresh=1` 可略過 10 分鐘結果快取重新分析。
- 為避免未經同意產生 API 費用，三 AI 不會背景自動呼叫；使用者按下「啟動三 AI 分析」才送出三個模型請求。未設定金鑰時顯示未設定，不產生假評分。
- Render 後端環境變數：`GEMINI_API_KEY`、`XAI_API_KEY`、`DEEPSEEK_API_KEY`；可選擇設定 `GEMINI_MODEL`、`XAI_MODEL`、`DEEPSEEK_MODEL`。金鑰不得放在 React 前端或提交到 Git。
- 預設模型：Gemini `gemini-3.8-flash`、Grok `grok-4.7`、DeepSeek `deepseek-flash`。模型供應商依 token 用量計費與免費額度政策不同；啟用前請先確認帳戶額度。
- 個股頁新增 TradingView Lightweight Charts：日／週／月 K、60／120／240 根、成交量、EMA5／20／60、布林通道切換、十字游標 OHLC、縮放與平移。資料仍以 TWSE／FinMind 歷史日線為準，日／週／月 K 不等於盤中分鐘 K。
- 報價時間與行情來源分開顯示；歷史 K 線來源、最後 K 線日期及載入時間另外標示，避免把 API 接收時間誤認為成交時間。

設定與操作詳見 [三 AI Agent 設定說明](./docs/AI_AGENTS_SETUP.md)。

## 財經直播中心與自動 AI 分析（2026.11.17.12）

- 官方 YouTube 頻道入口：57 東森財經、SBN 全球財經台、非凡商業台、寰宇財經新聞、TVBS 財經。免 API Key 時以官方 `/live` 連結外開；站內嵌入需當次直播影片 ID。
- 官方外開直播：三立財經 iNEWS、非凡新聞台。若來源網站禁止 iframe，系統保留官方連結，不繞過限制。
- 有聲播放由官方播放器控制；瀏覽器通常要求使用者點播放／解除靜音。
- HLS 播放器採 hls.js 開源方案，支援加入已授權的 HLS `.m3u8` 來源；需串流伺服器允許 CORS。設定方式見 `docs/AI_AGENTS_SETUP.md`。
- 三 AI 目前選取個股自動分析，首次載入及每 15 分鐘更新；全市場其他股票仍由規則掃描篩選。保持網站頁面開啟才會持續觸發；Render Free 不是全天候背景 worker。
- 每個 AI 提供偏多、盤整、偏空三種風險劇本、觸發條件、應對、可推導目標／停損與失效條件。未設定 API Key 不會回傳假分數。
- API Key 必須放在 Render 後端 Environment。模型使用量可能產生費用。

## 資料來源與限制
- FinMind API 文件：<https://finmind.github.io/>
- TWSE OpenAPI：<https://openapi.twse.com.tw/>
- TPEx OpenAPI：<https://www.tpex.org.tw/openapi/>
- TAIFEX OpenAPI：<https://openapi.taifex.com.tw/>
- 非凡新聞台官方直播：<https://news.ustv.com.tw/livevideo>
- 非凡商業台官方財經直播：<https://biz.ustv.com.tw/livevideo>

台股行情目前以 TWSE OpenAPI（上市）與 TPEx OpenAPI（上櫃）官方日收盤資料為主，兩者都不是盤中即時逐筆 feed。前端輪詢只代表每秒向本系統詢問一次，不代表上游每秒有新成交。盤中即時行情須另行申請 TWSE／TPEx 或其核准資訊供應商的適用授權與 feed；未完成前不得將日資料標示為即時。FinMind 日 K、法人、融資融券與恐懼貪婪資料屬日資料，不應標成逐秒更新。FinMind 的資料集、額度與商業使用限制，以實際方案及官方條款為準；遇到權限不足即顯示資料不足並停止使用該因子。PER/PBR 資料不是盤中即時估值。即時期貨與主力分點資料仍需另有相應授權。前端提供官方直播入口；站內 HLS 播放僅支援已獲授權且開放 CORS 的串流。

## 降低預測錯誤率的防呆原則
1. 資料時間戳過期、欄位缺漏、OHLC 不合理、歷史不足 60 根時，不產生有效訊號。
2. 缺少行情／籌碼來源時顯示「未設定」或「資料不足」，不以隨機值、固定值或手動預設值偽裝成即時資料。
3. 目前畫面多空分數屬規則式研究評分，不是勝率或預測機率。
4. 正式發布預測前，必須做 walk-forward 樣本外回測、計入手續費／稅／滑價，至少 100 筆樣本外交易，並檢查最大回撤；不足門檻一律觀望。
5. 追蹤命中率、Precision、Recall、Brier score、最大回撤及不同市場 regime 的表現；定期重新校準，不能用訓練集準確率宣稱預測能力。
6. 大戶持股、法人買賣超及融資融券多為日資料或延遲資料，不應標成逐秒更新。

## 自動排程與收盤研究
`.github/workflows/market-automation.yml` 會在台灣交易時段每 5 分鐘呼叫全市場掃描，並於台灣時間 13:40 先產生收盤快照、21:10 再於法人資料通常公布後補做一次收盤研究；報告會以 GitHub Actions Artifact 保存 90 天。FinMind 法人資料官方更新時間約為交易日 20:00，系統僅在 20:30 後才把當日法人數據納入近五日籌碼比例。請在 GitHub repository 的 Settings → Secrets and variables → Actions 新增 `MARKET_APP_URL`，值為部署後的 Render 網址（不要加 `/api`）。這是掃描與報告存檔，不代表模型已自動再訓練。

目前尚未配置持久化資料庫與模型訓練流程；真正的自我學習必須保存歷史訊號、隔日／隔週實際報酬、成本與滑價，再做 walk-forward 樣本外驗證，不能只把當日排名稱為學習。即時網路研究／LLM 自動推理也需額外的搜尋與模型 API 服務金鑰；本系統目前只接新聞資料來源，不會假裝 ChatGPT 在雲端服務內持續思考。

## 安全提醒
API Key 僅放後端環境變數；不要提交 .env、Token、券商帳密或個人憑證。此專案目前是非模擬報價的市場研究／監控介面，不是可直接下單的正式交易終端。實盤委託功能預設鎖定；在券商正式 API、委託與成交對帳、持久化稽核、成本後樣本外驗證及硬性風控全部完成前，不得解除鎖定。不得將研究評分當成交易指令。


## Supabase 會員系統

網站已加入 Supabase Auth 會員登入／註冊、會員密碼修改與管理員會員管理介面。請依照 [Supabase 會員系統設定](./docs/SUPABASE_MEMBERSHIP_SETUP.md) 設定 Render 後端環境變數；其中 `SUPABASE_SERVICE_ROLE_KEY` 必須只放在 Render，不可提交到 Git 或前端。管理員 Email 由伺服器端 `SUPABASE_ADMIN_EMAIL` 驗證。未登入的使用者不能讀取市場 API。

## 美股專區（免費資料優先）
- `GET /api/us/market`：美股指數（S&P 500、Dow Jones、NASDAQ、VIX）、30 檔大型股／ETF 觀察清單、技術指標、規則式研究評分及美股新聞。
- `GET /api/us/history/:symbol`：指定美股／ETF 的 2 年日 K 歷史資料，供 K 線與量化回測使用。
- `GET /api/us/search?q=:query`：搜尋觀察清單以外的美股代號及公司名稱。
- `GET /api/us/agents/:symbol`：Gemini、Groq、Cloudflare Workers AI 三方獨立分析；依序使用各自 API Key，若設定 OpenRouter 則可作為免費模型備援。
- 美股行情與新聞使用 Yahoo Finance 非官方公開 Chart/Search 端點，無 API Key，但不屬於正式授權即時行情 API，可能延遲、限流或中斷；市場狀態不是 REGULAR、報價時間戳過期或休市時一律標示非即時。
- 目前量化掃描僅涵蓋程式內 30 檔大型股／ETF，不等於美國所有上市股票；可用搜尋查找其他代號並載入單檔歷史資料。
- SEC 官方 EDGAR 公司申報文件連結可由個股頁開啟；本版本尚未自動抽取 SEC XBRL 財報與估值比率。
- 美股回測預設券商佣金與賣出交易費用為 0，這只代表尚未填入成本，不代表實際交易免費；必須依券商、交易類型及 SEC/FINRA 費用調整。滑價亦須按標的流動性調整。
- 美股與台股的交易時區、幣別、休市日、盤前盤後及交易制度不同；不得將台股漲跌幅限制、三大法人或集保籌碼規則直接套用於美股。


## 官方行情資料治理規格（V2.0）
- 備援策略：TWSE／TPEx 官方服務優先，第二層採交易所官方核准／授權通路；美股使用交易所官方 feeds 或 CTA／UTP（後續 CT Plan）正式授權通路。未核准來源不得自動接手；無有效備援時標示 DATA_UNAVAILABLE。細節見規格第 13 節。
- 正式規範：[官方行情資料來源與資料品質規格](./docs/OFFICIAL_MARKET_DATA_POLICY.md)。
- 台股優先採 TWSE／TPEx／TAIFEX 官方資料；美股優先採 Nasdaq／NYSE 官方市場資料與 CTA／UTP SIP 授權資料。SEC／FINRA 僅依其資料集用途使用，不得冒充即時報價。
- **重要：美股行情目前仍有非官方 Yahoo Finance 端點，尚未完成官方授權來源替換；FinMind 與 MARKET_* 自訂來源也須逐一核實來源、授權與即時性。** 台股即時 feed 尚未取得授權；目前 TWSE／TPEx OpenAPI 路徑僅提供官方日收盤資料。
- 此次提交完成的是工程規格文件，不代表已取得交易所即時行情授權或已完成程式接線。驗收清單未通過前，不得將來源標記為正式官方即時行情。

## Crypto market microstructure (2026-11-18)

- 加密貨幣研究中心新增唯讀盤口微結構 API：`GET /api/crypto/microstructure/:symbol`，支援 Binance、Bybit、OKX 公開 REST 盤口、OBI、價差與大額成交 tape。
- 手機版加密貨幣專區新增盤口與鯨魚成交面板；資料每 15 秒輪詢，不標示為 WebSocket 即時串流。
- 加密貨幣行情前端每 15 秒輪詢，伺服器快取亦為 15 秒；這是公開 REST 快照更新，不是 WebSocket 逐筆串流。各交易所更新頻率與回傳時間仍以來源時間戳為準。
- 欄位來源、資料時間戳、單位限制與風險解讀見 [微結構模組說明](./docs/CRYPTO_MICROSTRUCTURE.md)。
- 這是唯讀公開市場資料；CCXT Pro 私人帳戶串流及自動下單仍未啟用，實盤交易鎖定維持。


## 加密貨幣微結構與衍生品監控（擴充）

- `GET /api/crypto/microstructure/:symbol?exchange=Binance&type=perpetual&depth=10&whaleUsd=50000`：Binance、Bybit、OKX 公開盤口與逐筆成交快照。
- 盤口除一般 OBI 外，新增近端加權 OBI、最佳買賣檔數量、微價格（microprice）、微價格偏移 bps，以及 5／10／20 檔深度失衡。
- 成交 Tape 新增已知主動方筆數、主動買入名目金額占比與標準化成交失衡；只有報價幣別及合約單位可可靠換算時才顯示大額美元分類。
- 加密貨幣專區原有多交易所行情、K 線、技術掃描、資金費率、未平倉量、多空帳戶比、風險情境與 AI 研究維持獨立模組；不同交易所數量單位不直接相加。
- 目前微結構介面為公開 REST 快照輪詢，不是 CCXT Pro WebSocket 串流；不使用私人 API Key、不監聽私人帳戶、不執行下單。若未來加入長連線 Worker，必須獨立部署、使用唯讀金鑰、具備持久化儲存與健康檢查，並先完成壓力及斷線測試。
- OBI、微價格與大單只作為研究特徵，可能受撤單、隱藏流動性、交易所撮合規則及合約面額影響，不構成買賣指令。


## 正式環境驗收

正式驗收會檢查 Render commit、TWSE／TPEx 官方 OpenAPI 日收盤行情抽樣、多交易所加密貨幣、BTC 訂單簿與逐筆成交資料；未通過不會標記上線完成。

`.github/workflows/production-smoke.yml` 會在 main 分支每次推送後，等待 Render 啟用對應 commit，並透過 GitHub Actions OIDC 驗證台股官方行情與多交易所加密貨幣資料；美股官方行情授權未設定時會明確列為警告，不冒充官方報價。


## ZENTRAX 品牌與 ANT 生態

ANT 專案的全球自然流量推廣執行計畫已整理於 [ANT Global Growth Plan](./docs/ANT_GLOBAL_GROWTH_PLAN.md)。計畫目標為 10,000 名真實社群會員，採零成本自然流量、科技型品牌定位，包含 90 天執行節奏、內容日曆、社群治理、反詐騙規範、成效指標與公開銷售前置門檻。此文件是執行計畫，不代表社群帳號已建立、活動已發布或會員目標已達成。

- [ZENTRAX Brand System](./docs/ZENTRAX_BRAND_SYSTEM.md)：平台品牌架構、黑金視覺、ANT 代幣連續性及商標／網域檢查清單。\n- [ANT Creator Revenue & Fair-Launch Policy](./docs/ANT_CREATOR_REVENUE_POLICY.md)：5% 平台佣金、創造者收入、財庫分流、反狙擊公平發行規範與公開銷售前驗收門檻。此為規格文件，不代表銷售已上線。

- [ANT Security Operations & Incident Response](./docs/ANT_SECURITY_OPERATIONS.md)：管理員分權、多簽與金鑰保護、Oracle／USDT 驗證、監控告警及事故處理流程。
