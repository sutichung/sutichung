'use strict';

const TWSE_URL = 'https://www.twse.com.tw/rwd/zh/marginTrading/TWT92U?response=json';

function clean(value) {
  return String(value ?? '').trim();
}

function findField(fields, pattern, fallback) {
  const index = (fields || []).findIndex(value => pattern.test(clean(value)));
  return index >= 0 ? index : fallback;
}

function parseRows(payload) {
  const table = (payload.tables || []).find(item => Array.isArray(item.data)) || payload;
  const fields = table.fields || payload.fields || [];
  const rows = table.data || payload.data || [];
  const indexes = {
    symbol: findField(fields, /證券代號/, 0),
    name: findField(fields, /證券名稱|證券簡稱/, 1),
    stopMargin: findField(fields, /暫停融券賣出/, 2),
    stopSbl: findField(fields, /暫停借券賣出/, 3),
    belowReference: findField(fields, /前一交易日收盤價.*禁止平盤下|禁止平盤下融券/, 4)
  };
  return rows.map(row => {
    const value = index => Array.isArray(row) ? row[index] : row;
    const symbol = clean(value(indexes.symbol));
    if (!/^[0-9A-Z]{2,10}$/.test(symbol)) return null;
    const flagged = index => clean(value(indexes[index])) === '*';
    const marginSuspended = flagged('stopMargin');
    const sblSuspended = flagged('stopSbl');
    const belowReferenceRestricted = flagged('belowReference');
    return {
      symbol,
      name: clean(value(indexes.name)) || symbol,
      exchange: 'TWSE',
      marginShortSuspended: marginSuspended,
      securitiesLendingShortSuspended: sblSuspended,
      belowReferenceRestricted,
      status: marginSuspended && sblSuspended ? 'FULL_SHORT_SUSPENSION'
        : marginSuspended || sblSuspended ? 'PARTIAL_SHORT_SUSPENSION'
        : belowReferenceRestricted ? 'NO_BELOW_REFERENCE_SHORT' : 'NO_SYMBOL_SPECIFIC_RESTRICTION',
      source: 'TWSE TWT92U'
    };
  }).filter(Boolean);
}

async function loadShortSellingStatus({ fetchJson, now = () => new Date().toISOString() }) {
  const response = await fetchJson(TWSE_URL, 12000, {
    'User-Agent': 'TaiwanStockHunter/1.0',
    'Referer': 'https://www.twse.com.tw/',
    'Accept': 'application/json'
  });
  if (response.stat && response.stat !== 'OK') {
    throw new Error('TWSE TWT92U status: ' + response.stat);
  }
  const listed = parseRows(response);
  if (!listed.length) throw new Error('TWSE TWT92U returned no usable rows');
  const data = Object.fromEntries(listed.map(row => [row.symbol, row]));
  return {
    data,
    source: 'TWSE official TWT92U',
    timestamp: now(),
    dataDate: response.date || response.queryDate || null,
    marketCoverage: { TWSE: true, TPEx: false },
    globalRule: {
      effectiveDate: '2026-11-23',
      belowPreviousCloseShortSellingProhibited: true,
      appliesTo: ['TWSE', 'TPEx', 'TDR'],
      note: '融券及借券賣出價格不得低於前一交易日收盤價；這不是全面禁止放空。'
    },
    warning: '上市個股旗標來自證交所官方名單；上櫃個股暫未接入櫃買中心 MargMark.csv 官方資料，請勿將缺少資料解讀為可放空。'
  };
}

module.exports = { loadShortSellingStatus, parseRows, TWSE_URL };
