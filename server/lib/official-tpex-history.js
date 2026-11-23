'use strict';

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  const text = String(value).replace(/,/g, '').trim();
  if (!text || text === '-' || text === '--') return NaN;
  return Number(text);
}

function formatTPExQueryMonth(value) {
  const match = String(value || '').match(/^(\\d{4})(\\d{2})(?:01)?$/);
  if (!match) throw new Error('TPEx query month must be YYYYMM or YYYYMM01');
  const rocYear = Number(match[1]) - 1911;
  const month = Number(match[2]);
  if (rocYear < 1 || month < 1 || month > 12) throw new Error('TPEx query month is outside the supported ROC calendar');
  return String(rocYear).padStart(3, '0') + '/' + String(month).padStart(2, '0') + '/01';
}

function parseRocDate(value) {
  const match = String(value || '').replace(/\s+/g, '').match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]) + 1911;
  const month = String(Number(match[2])).padStart(2, '0');
  const day = String(Number(match[3])).padStart(2, '0');
  const iso = String(year).padStart(4, '0') + '-' + month + '-' + day;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function getDataTable(payload) {
  const candidates = Array.isArray(payload?.tables) ? payload.tables : [payload];
  return candidates.find(table => Array.isArray(table?.fields) && Array.isArray(table?.data)) || null;
}

function normalizeTPExTradingStock(payload) {
  const table = getDataTable(payload);
  if (!table) throw new Error('TPEx tradingStock response missing fields/data table');
  const fields = table.fields.map(value => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim());
  const find = pattern => fields.findIndex(value => pattern.test(value));
  const indexes = {
    date: find(/日期/),
    volume: find(/成交仟股/),
    turnover: find(/成交仟元/),
    open: find(/開盤/),
    high: find(/最高/),
    low: find(/最低/),
    close: find(/收盤/)
  };
  if (Object.values(indexes).some(index => index < 0)) {
    throw new Error('TPEx tradingStock schema mismatch: ' + fields.join('|'));
  }
  return table.data.map(row => {
    const time = parseRocDate(row[indexes.date]);
    const open = parseNumber(row[indexes.open]);
    const high = parseNumber(row[indexes.high]);
    const low = parseNumber(row[indexes.low]);
    const close = parseNumber(row[indexes.close]);
    const volumeThousands = parseNumber(row[indexes.volume]);
    const turnoverThousands = parseNumber(row[indexes.turnover]);
    if (!time || ![open, high, low, close, volumeThousands].every(Number.isFinite)) return null;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volumeThousands < 0) return null;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
    return {
      time, open, high, low, close,
      volume: volumeThousands * 1000,
      turnover: Number.isFinite(turnoverThousands) ? turnoverThousands * 1000 : null
    };
  }).filter(Boolean);
}

function mergeTPExHistoryPages(pages) {
  const byDate = new Map();
  for (const page of Array.isArray(pages) ? pages : []) {
    for (const bar of Array.isArray(page) ? page : []) {
      if (bar && /^\d{4}-\d{2}-\d{2}$/.test(String(bar.time || ''))) byDate.set(bar.time, bar);
    }
  }
  return [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
}

module.exports = { parseRocDate, formatTPExQueryMonth, normalizeTPExTradingStock, mergeTPExHistoryPages };
