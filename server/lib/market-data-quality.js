'use strict';

function buildMarketDataQuality(input = {}) {
  const quotes = input.quotes || {};
  const history = input.history || {};
  const listed = input.listed || {};
  const flows = input.flows || {};
  const listedCount = Number(listed.data?.length || 0);
  const historyCount = Number(history.historyCount || 0);
  const historyDays = Number(history.historyDateCount || 0);
  const requiredStocks = Math.max(100, Math.ceil(listedCount * 0.6));
  const coveragePct = listedCount > 0 ? Math.round(historyCount / listedCount * 100) : null;
  const historyReady = !history.error && listedCount > 0 && historyDays >= 60 && historyCount >= requiredStocks;
  const flowRows = Object.values(flows.data || {});
  const institutionalCount = flowRows.filter(row => row.institutionalNet != null).length;
  const marginCount = flowRows.filter(row => row.marginChange != null || row.shortChange != null).length;
  const tdccCount = flowRows.filter(row => row.largeHolderPct != null).length;
  const quoteAvailable = quotes.ok === true && Number(quotes.quoteCount || 0) > 0;
  const errors = [quotes.error, history.error, listed.error, flows.error].filter(Boolean).map(x => String(x).slice(0, 240));
  const warnings = [];
  if (!quoteAvailable) warnings.push('官方台股日行情目前不可用或沒有有效報價。');
  if (quotes.realtime !== true) warnings.push('目前官方快照為盤後日行情，不是盤中即時報價。');
  if (!historyReady) warnings.push('歷史資料尚未達至少 60 個交易日及上市櫃清單 60%（且至少 100 檔）的全市場掃描門檻。');
  if (listedCount === 0) warnings.push('上市櫃標的清單不可用，無法計算歷史資料覆蓋率。');
  if (flows.error) warnings.push('法人、融資融券或集保資料來源發生錯誤。');
  if (errors.length) warnings.push('部分資料來源發生錯誤；請勿將不完整結果視為完整市場資料。');
  return {
    status: quoteAvailable && historyReady && !flows.error ? 'healthy' : 'degraded',
    generatedAt: input.now || new Date().toISOString(),
    markets: {
      TWSE_TPEx: {
        status: quoteAvailable ? 'available' : 'unavailable',
        source: quotes.source || null,
        dataMode: quotes.dataMode || 'unknown',
        realtime: quotes.realtime === true,
        quoteCount: Number(quotes.quoteCount || 0),
        marketCounts: quotes.markets || {},
        asOf: quotes.serverTime || null,
        freshnessStatus: 'not_evaluated_without_exchange_calendar'
      }
    },
    historical: {
      status: historyReady ? 'ready' : 'insufficient_or_unavailable',
      source: history.error ? 'unavailable' : 'TWSE／TPEx 官方日K Supabase 歷史資料庫',
      historyDays,
      historyStocks: historyCount,
      listedCount,
      coveragePct,
      requiredDays: 60,
      requiredStocks,
      asOf: history.historyAsOf || null
    },
    flows: {
      status: flows.error ? 'unavailable' : flowRows.length ? 'available_with_field_coverage' : 'unavailable',
      rows: flowRows.length,
      institutionalStocks: institutionalCount,
      marginStocks: marginCount,
      tdccStocks: tdccCount,
      institutionalAsOf: flows.asOf || null,
      marginAsOf: flows.marginAsOf || null,
      tdccAsOf: flows.tdccAsOf || null
    },
    verified: {
      realtime: quotes.realtime === true,
      historicalCoverage: historyReady,
      allSourcesAvailable: errors.length === 0
    },
    warnings,
    errors
  };
}

module.exports = { buildMarketDataQuality };
