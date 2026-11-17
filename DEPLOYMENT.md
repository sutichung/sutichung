# 部署指南（Render / Docker）

## Render 一鍵部署
1. 將此 GitHub repository 連到 Render，選擇 Blueprint，使用根目錄的 `render.yaml`。
2. 建立服務後，在 Render Environment 設定 FinMind Token 與已授權供應商的 API URL。不要把金鑰寫進程式碼或提交到 GitHub。
3. 部署完成後開啟服務網址；首頁是儀表板，`/api/health` 是健康檢查。
4. 首次啟動若尚未設定行情供應商，畫面會顯示缺少資料源，不會產生假行情。

## Docker 本機啟動
```bash
docker build -t taiwan-stock-hunter .
docker run --rm -p 8787:8787 --env-file .env taiwan-stock-hunter
```

## Windows PowerShell 本機開發
```powershell
Copy-Item .env.example .env
# 用記事本編輯 .env，填入 FinMind Token 與合法行情供應商 URL
npm install
# 終端機一：
npm run server
# 終端機二：
npm start
```

正式環境使用 Dockerfile，Node 同時提供 React 靜態頁面與 /api。Render 的 Secret 欄位請逐項填入，不要把真實 token 貼到公開 issue、README 或前端環境變數。
