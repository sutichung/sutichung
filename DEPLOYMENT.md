# 部署與實盤驗收（Render / GitHub Actions）

## 目前部署狀態
- Render Web Service：`taiwan-stock-hunter-o3tt`
- 網址：https://taiwan-stock-hunter-o3tt.onrender.com
- Git 分支：`main`；Render 自動部署已設定為 commit 觸發。
- 目前使用 Render Free、單一 Oregon instance。免費服務可能休眠，不提供盤中 SLA、固定低延遲或不中斷保證。
- GitHub Actions 的前端 build、伺服器測試與 Docker build 必須全部成功；Render 必須部署到最新 main commit 並通過 /api/health，才可視為部署完成。
- Render 目前部署版本可能落後於 GitHub main；請以 Render Deploys 顯示的 commit SHA 為準，不可只看 GitHub push 成功就宣稱上線。

## 資料來源與密鑰
API Key 只放 Render Environment，不可放前端、GitHub 程式碼或聊天內容。
- `FUGLE_API_KEY`：若帳戶已有合法授權，供即時快照使用。不要為本專案自動購買或升級方案。
- `FINMIND_TOKEN`：若已有可用權限，供日 K、法人、融資融券及估值資料使用。
- 可選 `MARKET_REALTIME_URL`、`MARKET_SCAN_URL`、`MARKET_FLOWS_URL`、`MARKET_FUTURES_URL`、`MARKET_SENTIMENT_URL`、`MARKET_NEWS_URL`，只可接入合法授權且符合後端 JSON 契約的資料來源。
- 沒有設定或授權不足時，系統應顯示缺資料；不得用假價格、固定值或過期快取冒充即時行情。

## GitHub Actions
在 Repository → Settings → Secrets and variables → Actions 設定 `MARKET_APP_URL`，值為 Render 網址，不加 `/api`。排程工作會掃描並保存收盤研究報告；GitHub 排程可能延遲，不可作為即時下單觸發器。

## 實盤交易鎖定
目前系統是市場資料監控與研究評分介面，並非已完成的券商交易終端。
- `GET /api/trading/readiness` 會列出目前阻擋實盤下單的項目。
- `executionEnabled` 固定為 `false`；目前沒有券商委託、取消、成交回報及庫存／資金對帳功能。
- 解除鎖定前，必須完成券商 API 整合、安全憑證管理、持久化委託與稽核紀錄、單筆／單日／總曝險限額、停損與熔斷、斷線與重送冪等處理，以及計入手續費、證交稅、滑價和融券限制的樣本外驗證。
- 不可將規則式 0–100 分數稱為勝率或預測機率。資料過期、缺漏或服務異常時必須停止輸出可執行交易指令。

## 不付費原則
本專案不會自動升級 Render、購買行情方案或啟用付費資源。若免費資料源無法提供所需的即時性或授權，必須明確顯示限制，而不是假裝已具備實盤能力。
