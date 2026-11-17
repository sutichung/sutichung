# 部署指南（Render / GitHub Actions）

## Render Blueprint
目前已在 Render 建立 Blueprint 設定並產生待審核的首次同步計畫；尚未建立正式服務或上線。請先開啟 [Render Blueprint 計畫](https://dashboard.render.com/blueprint/exs-dbu3qhdckfvc73b15l60/sync/exe-dbu3sjhsrm7s73ehn8e0)，確認服務為 Free Docker Web Service，再按 Apply。這一步不會替你購買行情方案。

首次同步完成後，進入 Render 服務的 Environment，安全地填入：
- `FINMIND_TOKEN`：FinMind token。全市場日 K、全市場法人／融資資料需要 Backer 以上方案。
- `FUGLE_API_KEY`：Fugle API Key。TSE/OTC 全市場快照需要 Developer 或 Advanced 方案，上游快照每五秒更新。
- 可選：`MARKET_REALTIME_URL`、`MARKET_SCAN_URL`、`MARKET_FLOWS_URL`、`MARKET_FUTURES_URL`、`MARKET_SENTIMENT_URL`、`MARKET_NEWS_URL`，只在你有合法授權的替代供應商時設定。

不要把任何金鑰貼在聊天、GitHub 程式碼、Issue 或 README；直接在 Render Environment 輸入即可。沒有設定金鑰時，系統會顯示缺資料，不會產生假行情。

## GitHub 自動掃描與收盤報告
部署成功取得 Render 網址後：
1. 開啟 GitHub repository → Settings → Secrets and variables → Actions。
2. 新增 Repository secret：名稱 `MARKET_APP_URL`，值為 Render 網址（例如 `https://你的服務.onrender.com`，不要加 `/api`）。
3. `.github/workflows/market-automation.yml` 會在台灣交易時段每 5 分鐘暖機行情並掃描，13:40 產生收盤研究報告。
4. 報告上傳為 GitHub Actions Artifact，保存 90 天。

GitHub Actions 的排程有可能延遲；請在 Actions 頁確認 workflow 已啟用。這個流程會存檔及產生研究排名，尚未代表模型已自動再訓練。

## 行情方案與授權注意
- Fugle 官方文件列出快照行情功能僅供 Developer / Advanced 方案，快照資料每五秒更新。Developer 方案目前標示 NT$1,499/月、Advanced NT$2,999/月；Basic 免費方案不含快照行情。請自行在官方頁面確認最新方案與授權。
- FinMind 全市場日 K、法人、融資融券批次資料需要 Backer 以上；官方目前標示 Backer NT$699/月、Sponsor NT$999/月、Sponsor Pro NT$3,330/月。Free / Backer / Sponsor 僅限非商業用途；商業 AI／App 需要 Sponsor Pro，但 Sponsor Pro 也不代表可把即時資料直接公開顯示，須遵守官方資料授權。
- 本專案的 Render Web Service 目前規劃使用 Free 方案，適合先驗證，不是正式交易系統的 SLA 保證。資料庫、長駐 WebSocket worker、模型訓練與持久化學習尚未配置；這些若採付費資源，必須先檢視費用再啟用。

## Docker 本機啟動
```bash
docker build -t taiwan-stock-hunter .
docker run --rm -p 8787:8787 --env-file .env taiwan-stock-hunter
```

## Windows PowerShell 本機開發
```powershell
Copy-Item .env.example .env
# 用記事本編輯 .env，填入 FinMind Token 與 Fugle API Key
npm install
# 終端機一：
npm run server
# 終端機二：
npm start
```

正式環境使用 Dockerfile，Node 同時提供 React 靜態頁面與 /api。API Key 僅放 Render Environment，不要提交到 GitHub 或前端環境變數。
