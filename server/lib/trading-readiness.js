'use strict';

function getTradingReadiness() {
  return {
    mode: 'live-market-data-only',
    simulatedQuotes: false,
    executionEnabled: false,
    status: 'blocked',
    blockers: [
      '尚未整合券商正式 API 與安全憑證管理',
      '尚未完成委託、取消、成交回報、庫存與資金對帳',
      '尚未建立持久化委託紀錄及不可竄改的操作稽核軌跡',
      '尚未完成含手續費、證交稅、滑價及融券限制的樣本外驗證',
      '尚未完成單筆、單日、總曝險、停損及異常熔斷等硬性風控驗證'
    ],
    generatedAt: new Date().toISOString()
  };
}

module.exports = { getTradingReadiness };
