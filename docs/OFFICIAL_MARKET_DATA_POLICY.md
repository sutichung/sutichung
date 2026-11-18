# 官方行情資料來源與資料品質規格（Official Market Data Policy）

版本：2.0  
狀態：已納入規格；實際 API 接線、授權與部署狀態必須逐項驗證。  
適用：台股、美股、加密貨幣，以及所有行情、選股、技術指標、AI Agent、回測與風控模組。

## 1. 核心政策

1. 台股與美股行情的第一優先來源必須是交易所、官方市場資料計畫、監管機構或其明確授權的資料通路。
2. 不得把私人資料商、券商轉售資料、爬蟲、非官方網站或模型推估值標示為「交易所官方即時報價」。
3. 每筆資料必須攜帶來源、資料種類、交易所／市場、事件時間（event time）、接收時間（received time）、時區、延遲狀態、授權／方案狀態及品質狀態。
4. 官方來源沒有提供、未授權、超出額度或資料過期時，回傳明確的 unavailable / delayed / stale 狀態；不得以舊值、合成值或其他未核准來源靜默補值。
5. 官方來源優先不代表所有官方 OpenAPI 都是即時行情。必須區分即時、延遲、盤後、日資料及歷史資料。
6. SEC、FINRA 等監管資料可作為申報、交易活動或監理分析依據，但不能冒充 NYSE/Nasdaq 的即時逐筆報價或完整 NBBO。

## 2. 核准來源登記表

### 台灣市場

| 市場／資料 | 優先官方來源 | 使用限制 |
|---|---|---|
| 上市股票、指數、成交及公開市場資訊 | TWSE 官方網站與 OpenAPI（https://openapi.twse.com.tw/） | 逐端點確認更新頻率、欄位、歷史範圍與使用條款；不可一律標成盤中即時 |
| 上櫃／興櫃及櫃買市場資料 | TPEx 官方 OpenAPI（https://www.tpex.org.tw/openapi/） | 依端點標示資料日期與延遲 |
| 台指期、選擇權及期貨市場 | TAIFEX 官方 OpenAPI（https://openapi.taifex.com.tw/） | 日資料、盤後資料與即時授權資料分開處理 |
| 公司重大訊息、公開資訊 | 公開資訊觀測站（https://mops.twse.com.tw/）及交易所官方公告 | 公告時間與行情時間不可混用 |

### 美國市場

| 市場／資料 | 優先官方來源 | 使用限制 |
|---|---|---|
| Nasdaq 掛牌證券市場資料 | Nasdaq 官方 Market Data / Data Link（https://www.nasdaq.com/solutions/data） | 依產品確認即時／延遲、涵蓋範圍、再散布及展示授權 |
| NYSE 掛牌證券市場資料 | NYSE 官方 Market Data（https://www.nyse.com/market-data） | 依產品確認即時／延遲、涵蓋範圍、再散布及展示授權 |
| 美國跨市場整合報價／成交 | CTA（Tape A/B）與 UTP（Tape C）官方 SIP 計畫及其授權通路 | 完整 NBBO／整合行情須確認 SIP 權利與授權；單一交易所資料不等於全市場 |
| 公司申報、財報、重大文件 | SEC EDGAR / data.sec.gov（https://www.sec.gov/edgar/sec-api-documentation） | 官方申報資料，不是即時行情 API |
| 場外交易申報與監理資料 | FINRA 官方資料（https://www.finra.org/finra-data） | 依資料集頻率使用；不可冒充全市場即時報價 |

### 加密貨幣

使用各交易所自己的官方 API，例如交易所官方 REST、WebSocket、交易規則與市場資訊端點。每個交易所分開記錄市場深度、成交、時間戳及連線狀態；不同交易所價格不可直接視為同一市場的可成交價格。官方 API 亦須遵守其速率限制與使用條款。

## 3. 資料來源分級與路由

- Tier 0：交易所／官方市場資料計畫直接提供，且符合所需即時性與授權。
- Tier 1：監管機構或官方公告資料，僅供其適用的基本面、申報或監理用途。
- Tier 2：經明確授權的官方資料轉播通路；必須記錄授權來源與產品名稱。不得宣稱為交易所直連。
- Blocked：私人未核准 API、爬蟲、未知來源、無法驗證授權或來源標示不清的報價。不得進入正式行情與交易訊號路徑。

台股與美股行情模組預設只接受 Tier 0；允許 Tier 2 必須由管理設定明確啟用並標示「授權轉播」，不得靜默降級。Tier 1 只可餵入相應公告／基本面模組。

## 4. 標準行情資料契約

所有供應商 Adapter 必須正規化為下列欄位；不適用欄位可為 null，但不得捏造：

```json
{
  "symbol": "AAPL",
  "market": "US",
  "venue": "NASDAQ",
  "assetType": "EQUITY",
  "sourceId": "nasdaq_official",
  "sourceTier": 0,
  "sourceProduct": "licensed_product_name",
  "price": 0,
  "bid": null,
  "ask": null,
  "volume": null,
  "currency": "USD",
  "eventTime": null,
  "receivedAt": "ISO-8601 timestamp",
  "session": "REGULAR",
  "dataMode": "REALTIME",
  "delaySeconds": null,
  "entitlement": "VERIFIED",
  "quality": "VALID",
  "sequence": null
}
```

必要狀態：
- dataMode：REALTIME、DELAYED、END_OF_DAY、HISTORICAL、UNKNOWN。
- quality：VALID、STALE、INCOMPLETE、OUT_OF_ORDER、INVALID、UNAVAILABLE。
- entitlement：VERIFIED、NOT_CONFIGURED、NOT_AUTHORIZED、RATE_LIMITED、UNKNOWN。

若無法證實即時性，dataMode 必須為 UNKNOWN 或 DELAYED，不能標成 REALTIME。

## 5. 資料驗證與風控閘門

每筆行情進入快取、指標或 AI 分析前，依序檢查：

1. 來源是否在核准清單，且來源識別與市場相符。
2. 授權是否有效、產品是否涵蓋該市場及資料用途。
3. eventTime、receivedAt 是否存在且可解析；時區必須明確。
4. 是否超過該資料類型設定的最大新鮮度；不同市場、盤中／盤後、日資料使用不同門檻。
5. 價格、成交量、買賣價及 OHLC 數值是否合法；bid 不得高於 ask（若來源定義允許交叉市場則另行處理）。
6. 是否重複、亂序、時間倒退、序號缺口或異常跳價。
7. 交易日、交易時段、休市、熔斷及盤前盤後狀態是否吻合。
8. 多來源交叉核對只比較相同商品、相同時間窗、相同資料類型；不一致時標記衝突，不以平均值掩蓋差異。

驗證失敗時隔離該筆資料並產生告警。不得讓無效資料更新最後有效報價，也不得讓舊快取繼續被顯示成即時。

## 6. 故障處理

- 連線逾時、HTTP 429、5xx：指數退避、隨機抖動、尊重 Retry-After，並設最大重試次數。
- WebSocket 中斷：重連後補抓缺口；無法補齊時標記 INCOMPLETE。
- API Key 缺失／權限不足：健康狀態顯示 NOT_CONFIGURED / NOT_AUTHORIZED，不得用其他未核准私人來源代替。
- 官方服務中斷：顯示最後有效資料及其時間，並醒目標示 STALE；超過門檻後停止用於訊號。
- Rate limit：佇列與快取依授權條款節流，不得以多帳號規避限制。
- 系統恢復：先跑完整性檢查，再恢復該來源的訊號資格。

## 7. AI、掃描、回測與交易的資料閘門

- AI Agent、飆股掃描、多空評分、技術指標、資金流向及警示必須引用資料來源與 as-of 時間。
- 缺少必要欄位或資料過期時，輸出「資料不足／觀望」，不得推估填補。
- 回測只能使用當時可取得的資料版本與時間戳，避免前視偏誤；需保留公司行動、下市及存活者偏誤處理紀錄。
- 訊號不得混用即時、延遲與日線資料而不標示頻率。
- 實盤下單維持獨立風控與授權閘門；本規格不會自行啟用交易執行。

## 8. 監控、稽核與管理控制台

每個 Adapter 至少暴露：
- source_id、market、product、entitlement、connection_status。
- last_event_time、last_received_at、data_mode、delay_seconds。
- request_count、rate_limit_count、error_rate、reconnect_count。
- stale_count、invalid_count、missing_field_count、sequence_gap_count。
- 最近錯誤、最近成功時間及健康狀態。

管理端可啟用／停用來源、查看授權狀態及設定新鮮度門檻；一般客戶端不得看見 API Secret。所有變更寫入稽核紀錄。

## 9. 安全要求

- API Secret 僅存放後端 Secret / Environment，不可放在 React 前端、公開設定檔、Git 或日誌。
- 最小權限、定期輪替、TLS、輸入驗證及敏感欄位遮罩。
- 禁止將金鑰、完整授權標頭或個人資料寫入錯誤日誌。
- 供應商條款、交易所展示／非展示／再散布授權需由管理者確認；技術上可連線不代表取得商業使用權。

## 10. 驗收測試（完成前不得宣稱通過）

- [ ] 核准來源清單外的行情被拒絕。
- [ ] 官方端點的即時／延遲／日資料標示正確。
- [ ] 無 API Key、無授權、額度耗盡時不會回傳假行情。
- [ ] 過期行情不會進入即時訊號。
- [ ] 亂序、重複、缺欄位、異常 OHLC 均能隔離。
- [ ] 斷線重連與缺口補抓可測試，無法補齊時標示 INCOMPLETE。
- [ ] TWSE、TPEx、Nasdaq、NYSE 等來源分別驗證，不以單一測試代表全部市場。
- [ ] SEC / FINRA 資料不會被誤當即時報價。
- [ ] AI、掃描、圖表、回測均顯示來源與資料時間。
- [ ] 前端 bundle、Git、日誌均未洩漏 API Secret。
- [ ] Render 健康檢查與部署後 smoke test 通過。

## 11. 舊供應商處理清單

現有專案 README 提及的 FinMind、Fugle、MARKET_REALTIME_URL、MARKET_SCAN_URL、MARKET_FLOWS_URL、MARKET_FUTURES_URL、MARKET_SENTIMENT_URL、MARKET_NEWS_URL 必須逐一盤點：

- 不得因為目前程式有接線，就推定它們是官方來源。
- FinMind、Fugle 等第三方服務需重新分類其資料來源、授權與用途；未通過核准不得作為台股官方行情來源。
- MARKET_* 自訂 URL 預設視為未驗證來源，除非完成來源與授權登記。
- 可保留非行情研究資料的供應商，但需與官方報價路徑隔離、標示來源，且不得冒充官方。
- 不可在未確認替代官方端點、欄位與授權前，直接刪除現有服務造成整個行情功能中斷；先切換為明確的資料不足狀態。

## 12. 官方文件

- TWSE OpenAPI：https://openapi.twse.com.tw/
- TPEx OpenAPI：https://www.tpex.org.tw/openapi/
- TAIFEX OpenAPI：https://openapi.taifex.com.tw/
- Nasdaq Market Data：https://www.nasdaq.com/solutions/data
- NYSE Market Data：https://www.nyse.com/market-data
- SEC EDGAR API：https://www.sec.gov/edgar/sec-api-documentation
- FINRA Data：https://www.finra.org/finra-data
- CTA：https://www.ctaplan.com/
- UTP：https://www.utpplan.com/

---
本文件是工程規格與驗收標準，不代表上述 API 已完成申請、取得即時行情授權、已整合或已部署。每項狀態必須以實際端點測試、帳戶授權及部署紀錄為準。


## 13. 備援資料來源與故障切換（Backup / Failover）

備援的定義是「同等資料權利與資料品質的替代通路」，不是遇到官方 API 故障就改抓任意免費網站。每個市場至少設計 Primary、Secondary、Degraded 三種狀態。

### 13.1 台股備援

**上市（TWSE）**
1. Primary：TWSE 官方 OpenAPI／官方市場資訊服務，依端點實際頻率標記。
2. Secondary A：TWSE 官方核准資訊公司名單中的供應商；採購前逐一確認該供應商目前仍在名單、產品涵蓋上市股票、即時／延遲層級、API/串流介面、展示與再散布權利。
3. Secondary B：TWSE Data E-Shop 的盤後、歷史或其他正式資料產品，僅在相應資料頻率下使用。
4. Degraded：若官方與核准通路都不可用，顯示最後有效資料及時間，超過 freshness 門檻後停止即時訊號，不得用 Yahoo、爬蟲或未核准來源補位。

TWSE 官方說明即時資訊可透過直接連線，或透過已與 TWSE 簽約的資訊公司間接取得；並提供核准資訊公司名單及 Data E-Shop。官方頁面：
- 即時資料連線與費用：https://www.twse.com.tw/en/products/information/real-time.html
- 核准資訊公司名單：https://www.twse.com.tw/en/products/information/list.html
- Data E-Shop：https://eshop.twse.com.tw/en/home/index

**上櫃／興櫃（TPEx）**
1. Primary：TPEx 官方 OpenAPI／官方市場資訊服務。
2. Secondary A：TPEx 官方公布的即時／延遲資訊使用者或核准資料通路；採購前核對產品與授權範圍。
3. Secondary B：TPEx 官方盤後與歷史資料產品，僅用於盤後／歷史用途。
4. Degraded：同上市市場規則；資料不足就停止訊號。

TPEx 官方資料產品頁列有即時及延遲資料的申請方式與費用；即時與延遲產品不能混為一談：
- 資料產品總覽：https://www.tpex.org.tw/en-us/service/data/overview.html
- 即時交易資訊：https://www.tpex.org.tw/en-us/service/data/product/real-time.html
- 延遲交易資訊：https://www.tpex.org.tw/en-us/service/data/product/delay.html

**可列入採購評估、但必須重新核實授權的候選**
- ICE Data Services：其資料目錄列有 TWSE、TPEx 市場的即時、延遲、歷史及 API/Feed 交付能力。這只代表有相關產品描述，不代表本系統已取得合約或特定 API 權限；需向 ICE 確認台灣股票涵蓋、實際 feed、時效、費用、展示與再散布權利。
  - TWSE：https://developer.ice.com/fixed-income-data-services/catalog/taiwan-stock-exchange-twse
  - TPEx：https://developer.ice.com/fixed-income-data-services/catalog/taipei-exchange-tpex

### 13.2 美股備援

1. Primary：依需求選擇 Nasdaq／NYSE 官方交易所產品；若要全市場整合報價，必須採用具適當授權的 CTA/UTP SIP 或其正式授權分發通路。
2. Secondary A：同一交易所官方的另一個合約 feed / delivery path（例如官方雲端串流或另一個官方交付方式），須確認產品覆蓋和授權相同。
3. Secondary B：CTA/UTP SIP 的正式授權分發通路，或交易所正式授權的 market-data redistributor；須標示為授權轉播，不得稱作交易所直連。
4. Degraded：只剩單一交易所 direct feed 時，只能顯示該交易所市場資料，不能聲稱完整美股 NBBO／全市場成交；失去有效整合資料時停止依賴全市場報價的訊號。

官方依據：
- Nasdaq 市場資料產品：https://www.nasdaq.com/products/data
- NYSE 市場資料產品：https://www.nyse.com/data-products/
- UTP Plan：https://www.utpplan.com/
- 美國 Consolidated Tape 計畫轉換資訊：https://consolidatedtape.com/

**2027 計畫轉換注意**
截至本規格更新時，官方 Consolidated Tape 網站說明新 CT Plan 預計於 2027-04-01 上線，並取代既有 CTA／UTP 計畫；資料 feed 技術本身不因此自動變更，但訂閱者／分發者需按新計畫完成協議與帳戶遷移。系統必須將授權與合約版本設為可配置，不可把 2026 年舊協議永久寫死。

### 13.3 備援切換規則

- 只有來源清單中已核准、授權有效且涵蓋相同商品／資料類型的來源，才能自動接手。
- 切換前後記錄 sourceId、sourceTier、dataMode、eventTime、receivedAt、entitlement 與切換原因。
- 不同來源若時間戳或報價有落差，標示 SOURCE_DIVERGENCE；不得將不同時間窗的報價平均。
- 若備援資料比主來源更延遲，必須即時切換顯示為 DELAYED，並停用要求即時資料的策略。
- 不能確認授權、來源或資料時效時，禁止自動切換；顯示 DATA_UNAVAILABLE。
- 來源恢復後需先比對序號／時間缺口、資料完整性與市場狀態，再恢復 Primary。
- 備援健康檢查必須定期執行，但不得為測試而違反 API 速率限制或產生未授權資料使用。

### 13.4 備援驗收清單

- [ ] Primary 斷線時只切換到已核准且授權有效的 Secondary。
- [ ] 未授權備援來源永遠不能進入正式訊號。
- [ ] 即時切換成延遲資料時，UI、API、AI 與掃描器同步顯示 DELAYED。
- [ ] 單一交易所 feed 不會被標示為美股全市場 NBBO。
- [ ] 台股上市與上櫃分開驗證，不以 TWSE 備援覆蓋 TPEx。
- [ ] 備援恢復後完成缺口補抓與來源一致性檢查。
- [ ] 無合格備援時，系統安全降級為 DATA_UNAVAILABLE，而不是假裝正常。
