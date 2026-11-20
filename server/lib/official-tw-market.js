'use strict';

const BASE_TWSE = 'https://openapi.twse.com.tw/v1';
const BASE_TPEX = 'https://www.tpex.org.tw/openapi/v1';

function textValue(row, patterns) {
  for (const pattern of patterns) {
    const key = Object.keys(row || {}).find(name => pattern.test(String(name)));
    if (key && row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function normalizeDate(value) {
  const raw = String(value || '').trim().replace(/[^0-9]/g, '');
  if (raw.length === 7) return String(Number(raw.slice(0, 3)) + 1911) + '-' + raw.slice(3, 5) + '-' + raw.slice(5, 7);
  if (raw.length === 8) return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
  return value ? String(value).trim() : null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  let raw = String(value).trim().replace(/,/g, '').replace(/[元股張%\s]/g, '');
  if (!raw || raw === '--' || raw === '－' || raw === '-') return null;
  let sign = 1;
  if (/^[▼▽]/.test(raw)) sign = -1;
  raw = raw.replace(/[▲△▼▽＋]/g, '').replace(/−/g, '-');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed * sign : null;
}

function normalizeRow(row, market, sourceId, sourceUrl) {
  const symbol = String(textValue(row, [/^(Code|股票代號|證券代號|代號|SecuritiesCompanyCode)$/i, /公司代號/]) || '').trim();
  if (!/^[0-9A-Z]{2,10}$/i.test(symbol)) return null;
  const close = numberValue(textValue(row, [/^(ClosingPrice|Close|收盤價|收盤)$/i, /收盤價/]));
  if (!(close > 0)) return null;
  const open = numberValue(textValue(row, [/^(OpeningPrice|Open|開盤價|開盤)$/i, /開盤價/]));
  const high = numberValue(textValue(row, [/^(HighestPrice|High|最高價|最高)$/i, /最高價/]));
  const low = numberValue(textValue(row, [/^(LowestPrice|Low|最低價|最低)$/i, /最低價/]));
  const volume = numberValue(textValue(row, [/^(TradingVolume|TradeVolume|TradingShares|Volume|成交股數|成交量)$/i, /TradingVolume|TradingShares|成交股數|成交量/]));
  const turnover = numberValue(textValue(row, [/^(TradingValue|TradeValue|TransactionAmount|Turnover|成交金額)$/i, /TradingValue|TransactionAmount|成交金額/]));
  const trades = numberValue(textValue(row, [/^(Transaction|Trades|成交筆數)$/i, /成交筆數/]));
  const rawChange = numberValue(textValue(row, [/^(Change|漲跌價差|漲跌)$/i, /漲跌價差/]));
  const explicitPct = numberValue(textValue(row, [/^(ChangePercent|漲跌幅)$/i, /漲跌幅/]));
  const previousClose = rawChange !== null ? close - rawChange : null;
  const changePct = explicitPct !== null ? explicitPct : previousClose > 0 && rawChange !== null ? rawChange / previousClose * 100 : null;
  const date = normalizeDate(textValue(row, [/^(Date|日期|資料日期)$/i]));
  return {
    symbol, name: String(textValue(row, [/^(Name|CompanyName|CompanyAbbreviation|公司簡稱|名稱|證券名稱)$/i, /CompanyName|CompanyAbbreviation|公司簡稱|證券名稱/]) || symbol),
    market, exchange: market, price: close, close, open, high, low, volume, turnover, trades,
    change: rawChange, changePct, previousClose,
    timestamp: null, sourceTimestamp: null, receivedAt: new Date().toISOString(),
    source: market === 'TWSE' ? 'TWSE OpenAPI STOCK_DAY_ALL' : 'TPEx OpenAPI ' + (sourceId === 'tpex_openapi_mainboard_quotes' ? 'tpex_mainboard_quotes' : 'tpex_mainboard_daily_close_quotes'),
    sourceId, sourceTier: 0, sourceUrl, dataMode: 'END_OF_DAY', delayed: true,
    quoteType: 'official-daily-close', quality: 'VALID', asOf: date || null,
    disclaimer: '交易所公開日行情；不是盤中即時報價。'
  };
}

async function fetchRows(url, timeoutMs = 25000) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'User-Agent': 'TaiwanStockHunter/1.0 (+https://taiwan-stock-hunter-o3tt.onrender.com)' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('official_market_http_' + response.status);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.aaData) ? payload.aaData : [];
  if (!rows.length) throw new Error('official_market_empty_response');
  return rows;
}

async function loadOfficialDailyQuotes() {
  const endpoints = [
    { market: 'TWSE', sourceId: 'twse_openapi_stock_day_all', url: BASE_TWSE + '/exchangeReport/STOCK_DAY_ALL' },
    {
      market: 'TPEx', sourceId: 'tpex_openapi_daily_close', url: BASE_TPEX + '/tpex_mainboard_daily_close_quotes',
      fallbacks: [{ sourceId: 'tpex_openapi_mainboard_quotes', url: BASE_TPEX + '/tpex_mainboard_quotes' }]
    }
  ];
  const settled = await Promise.allSettled(endpoints.map(async endpoint => {
    const candidates = [endpoint, ...(endpoint.fallbacks || [])];
    const failures = [];
    for (const candidate of candidates) {
      try {
        const rows = await fetchRows(candidate.url, 25000);
        const normalized = rows.map(row => normalizeRow(row, endpoint.market, candidate.sourceId, candidate.url)).filter(Boolean);
        if (!normalized.length) throw new Error(endpoint.market + '_schema_or_quote_validation_failed');
        return { ...endpoint, ...candidate, rows: normalized, fallbackUsed: candidate.sourceId !== endpoint.sourceId };
      } catch (error) {
        failures.push(candidate.sourceId + ':' + String(error?.message || error).slice(0, 160));
      }
    }
    throw new Error(failures.join('; ') || endpoint.market + '_unavailable');
  }));
  const data = {};
  const errors = [];
  const markets = { TWSE: 0, TPEx: 0 };
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'rejected') {
      errors.push({ market: endpoints[i].market, error: String(result.reason?.message || result.reason).slice(0, 200) });
      continue;
    }
    for (const quote of result.value.rows) {
      data[quote.symbol] = quote;
      markets[quote.market] += 1;
    }
  }
  if (!Object.keys(data).length) throw new Error('TWSE 與 TPEx 官方日行情均無有效資料：' + errors.map(x => x.market + ' ' + x.error).join('; '));
  return {
    data, source: 'TWSE + TPEx 官方 OpenAPI（日收盤資料；非盤中即時）',
    receivedAt: new Date().toISOString(), timestamp: new Date().toISOString(),
    dataMode: 'END_OF_DAY', delayed: true, markets,
    quoteCount: Object.keys(data).length, marketErrors: errors,
    providerFallbacks: settled.flatMap((result, index) => result.status === 'fulfilled' && result.value.fallbackUsed
      ? [{ market: endpoints[index].market, sourceId: result.value.sourceId, sourceUrl: result.value.url }]
      : []),
    coverage: { twse: markets.TWSE, tpex: markets.TPEx, partial: errors.length > 0 },
    warning: '官方公開 OpenAPI 提供日行情／收盤資料；即時逐筆與即時報價需另行申請交易所授權 feed。'
  };
}

async function diagnoseOfficialDailyQuotes() {
  const result = await loadOfficialDailyQuotes();
  const sample = Object.values(result.data).slice(0, 5).map(({ symbol, name, price, changePct, market, source, dataMode, asOf }) => ({ symbol, name, price, changePct, market, source, dataMode, asOf }));
  return {
    ok: result.quoteCount > 0, connection: result.quoteCount > 0 ? 'connected' : 'no_valid_quotes',
    provider: 'twse+tpex-openapi', source: result.source, quoteCount: result.quoteCount,
    listedCount: null, requestedCount: null, scannedCount: result.quoteCount,
    markets: result.markets, marketErrors: result.marketErrors, dataMode: result.dataMode,
    realtime: false, serverTime: result.receivedAt, sample, warning: result.warning
  };
}

module.exports = { loadOfficialDailyQuotes, diagnoseOfficialDailyQuotes, normalizeRow, numberValue };
