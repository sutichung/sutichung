'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRocDate, normalizeTPExTradingStock, mergeTPExHistoryPages } = require('../lib/official-tpex-history');

test('converts ROC trading dates to Gregorian dates', () => {
  assert.equal(parseRocDate('108/03/04'), '2019-03-04');
  assert.equal(parseRocDate(' 115/08/19 '), '2026-08-19');
  assert.equal(parseRocDate('not-a-date'), null);
});

test('normalizes official TPEx monthly OHLCV and converts thousand-share units', () => {
  const payload = {
    stat: 'ok',
    tables: [{
      fields: ['日 期', '成交仟股', '成交仟元', '開盤', '最高', '最低', '收盤', '漲跌', '筆數'],
      data: [['108/03/04', '13,313', '2,372,399', '177.00', '180.50', '174.00', '180.00', '5.00', '8,046']]
    }]
  };
  assert.deepEqual(normalizeTPExTradingStock(payload), [{
    time: '2019-03-04', volume: 13313000, turnover: 2372399000,
    open: 177, high: 180.5, low: 174, close: 180
  }]);
});

test('rejects unknown schemas and merges duplicate dates deterministically', () => {
  assert.throws(() => normalizeTPExTradingStock({ fields: ['date'], data: [] }), /schema mismatch/);
  const rows = mergeTPExHistoryPages([
    [{ time: '2024-01-02', close: 10 }, { time: '2024-01-03', close: 11 }],
    [{ time: '2024-01-03', close: 12 }]
  ]);
  assert.deepEqual(rows.map(row => row.close), [10, 12]);
});
