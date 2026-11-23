'use strict';

function monthStartKeys(count = 36, referenceDate = new Date()) {
  const total = Math.max(1, Math.min(120, Math.floor(Number(count) || 36)));
  const cursor = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const keys = [];
  for (let i = 0; i < total; i++) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    keys.push(String(year) + month + '01');
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return keys;
}

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  return Number(String(value).replace(/,/g, '').trim());
}

function normalizeStockDayRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const parts = String(row?.[0] || '').trim().split('/');
    if (parts.length !== 3) return null;
    const year = Number(parts[0]) + 1911;
    const month = String(Number(parts[1])).padStart(2, '0');
    const day = String(Number(parts[2])).padStart(2, '0');
    const time = String(year) + '-' + month + '-' + day;
    const bar = {
      time,
      volume: parseNumber(row[1]),
      turnover: parseNumber(row[2]),
      open: parseNumber(row[3]),
      high: parseNumber(row[4]),
      low: parseNumber(row[5]),
      close: parseNumber(row[6])
    };
    const date = new Date(time + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== time) return null;
    if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)) return null;
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.volume < 0) return null;
    if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) return null;
    if (Number.isFinite(bar.turnover) && bar.turnover < 0) return null;
    return bar;
  }).filter(Boolean);
}

function mergeStockDayPages(pages) {
  const byDate = new Map();
  for (const page of Array.isArray(pages) ? pages : []) {
    for (const bar of Array.isArray(page) ? page : []) {
      if (bar && /^\d{4}-\d{2}-\d{2}$/.test(String(bar.time || ''))) byDate.set(bar.time, bar);
    }
  }
  return [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
}

module.exports = { monthStartKeys, normalizeStockDayRows, mergeStockDayPages };
