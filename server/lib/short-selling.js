'use strict';

const TWSE_URL = 'https://www.twse.com.tw/rwd/zh/marginTrading/TWT92U?response=json';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_margin_trading_margin_mark';

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
  const headers = {
    'User-Agent': 'TaiwanStockHunter/1.0',
    'Referer': 'https://www.twse.com.tw/',
    'Accept': 'application/json'
  };
  const [twseResult, tpexResult] = await Promise.allSettled([
    fetchJson(TWSE_URL, 12000, headers),
    fetchJson(TPEX_URL, 12000, { 'User-Agent': 'TaiwanStockHunter/1.0', 'Accept': 'application/json' })
  ]);
  const data = {};
  const marketCoverage = { TWSE: false, TPEx: false };
  const sourceStatus = {};
  let dataDate = null;

  if (twseResult.status === 'fulfilled') {
    try {
      const payload = twseResult.value;
      if (payload.stat && payload.stat !== 'OK') throw new Error('TWSE TWT92U status: ' + payload.stat);
      const listed = parseRows(payload);
      if (!listed.length) throw new Error('TWSE TWT92U returned no usable rows');
      for (const row of listed) data[row.symbol] = row;
      marketCoverage.TWSE = true;
      sourceStatus.TWSE = { ok: true, rows: listed.length, source: TWSE_URL };
      dataDate = payload.date || payload.queryDate || dataDate;
    } catch (error) {
      sourceStatus.TWSE = { ok: false, error: String(error?.message || error) };
    }
  } else {
    sourceStatus.TWSE = { ok: false, error: String(twseResult.reason?.message || twseResult.reason) };
  }

  if (tpexResult.status === 'fulfilled') {
    const payload = tpexResult.value;
    const rows = Array.isArray(payload) ? payload
      : Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.result) ? payload.result : [];
    const listed = rows.map(row => {
      const get = (...keys) => {
        for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null) return clean(row[key]);
        return '';
      };
      const symbol = get('證券代號', '股票代號', '股票代碼', 'Code', 'SecuritiesCode');
      if (!/^[0-9A-Z]{2,10}$/.test(symbol)) return null;
      const marginSuspended = get('暫停融券賣出') === '*';
      const sblSuspended = get('暫停借券賣出') === '*';
      const belowReferenceRestricted = get('前一交易日收盤價跌停本日禁止平盤下融(借)券賣出',
        '前一交易日收盤價跌停本日禁止平盤下融借券賣出') === '*';
      return {
        symbol,
        name: get('證券中文名稱', '證券名稱', '股票名稱', 'Name') || symbol,
        exchange: 'TPEx',
        marginShortSuspended: marginSuspended,
        securitiesLendingShortSuspended: sblSuspended,
        belowReferenceRestricted,
        status: marginSuspended && sblSuspended ? 'FULL_SHORT_SUSPENSION'
          : marginSuspended || sblSuspended ? 'PARTIAL_SHORT_SUSPENSION'
          : belowReferenceRestricted ? 'NO_BELOW_REFERENCE_SHORT' : 'NO_SYMBOL_SPECIFIC_RESTRICTION',
        source: 'TPEx official MargMark'
      };
    }).filter(Boolean);
    if (listed.length) {
      for (const row of listed) data[row.symbol] = row;
      marketCoverage.TPEx = true;
      sourceStatus.TPEx = { ok: true, rows: listed.length, source: TPEX_URL, effectiveRule: 'T+1' };
    } else {
      sourceStatus.TPEx = { ok: false, error: 'TPEx MargMark returned no usable rows' };
    }
  } else {
    sourceStatus.TPEx = { ok: false, error: String(tpexResult.reason?.message || tpexResult.reason) };
  }

  const preannouncementStatus = {};
  for (const [market, url] of [
    ['TWSE', 'https://www.twse.com.tw/rwd/zh/marginTrading/BFI84U?response=json'],
    ['TPEx', 'https://www.tpex.org.tw/openapi/tpex_margin_trading_term']
  ]) {
    try {
      const payload = await fetchJson(url, 12000, headers);
      const table = Array.isArray(payload?.tables)
        ? payload.tables.find(item => Array.isArray(item?.data)) : null;
      const fields = table?.fields || payload?.fields || [];
      const rows = Array.isArray(payload) ? payload
        : Array.isArray(payload?.data) ? payload.data
        : table?.data || [];
      let count = 0;
      for (const row of rows) {
        const get = (...keys) => {
          if (Array.isArray(row)) {
            const idx = fields.findIndex(field => keys.some(key => clean(field).includes(key)));
            return idx >= 0 ? clean(row[idx]) : '';
          }
          for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null) return clean(row[key]);
          return '';
        };
        const symbol = get('股票代號', '證券代號', 'Code', 'SecuritiesCode');
        if (!/^[0-9A-Z]{2,10}$/.test(symbol)) continue;
        const notice = {
          startDate: get('停券起日(最後回補日)', '停券起日', '停止融券賣出起日', 'StartDate'),
          endDate: get('停券迄日', '停止融券賣出迄日', 'EndDate'),
          reason: get('原因', 'Reason'),
          source: market + ' official short-sale suspension preannouncement'
        };
        if (!data[symbol]) {
          data[symbol] = {
            symbol, name: get('股票名稱', '證券名稱', 'Name') || symbol,
            exchange: market, marginShortSuspended: false,
            securitiesLendingShortSuspended: false, belowReferenceRestricted: false,
            status: 'PREANNOUNCED_SHORT_SUSPENSION'
          };
        }
        data[symbol].preannouncement = notice;
        count++;
      }
      preannouncementStatus[market] = { ok: true, rows: count, source: url };
    } catch (error) {
      preannouncementStatus[market] = { ok: false, error: String(error?.message || error) };
    }
  }

  if (!marketCoverage.TWSE && !marketCoverage.TPEx) {
    throw new Error('TWSE and TPEx official short-selling restriction sources unavailable');
  }
  return {
    data,
    source: 'TWSE TWT92U + TPEx MargMark official daily lists',
    sourceStatus,
    preannouncementStatus,
    timestamp: now(),
    dataDate,
    marketCoverage,
    globalRule: {
      effectiveDate: '2026-11-23',
      belowPreviousCloseShortSellingProhibited: true,
      appliesTo: ['TWSE', 'TPEx', 'TDR'],
      note: '融券及借券賣出價格不得低於前一交易日收盤價；這不是全面禁止放空。'
    },
    warning: '未成功取得的市場資料標示為未知，不可將缺少資料解讀為可放空。'
  };
}

module.exports = { loadShortSellingStatus, parseRows, TWSE_URL, TPEX_URL };
