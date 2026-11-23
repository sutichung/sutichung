'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { monthStartKeys, normalizeStockDayRows, mergeStockDayPages } = require('../lib/official-twse-history');

test('builds deterministic descending Gregorian month keys', () => {
  assert.deepEqual(monthStartKeys(3, new Date('2026-11-23T00:00:00Z')), ['20261101', '20261001', '20260901']);
});

test('normalizes Taiwan ROC dates and validates official OHLCV rows', () => {
  const rows = normalizeStockDayRows([
    ['115/11/20', '1,000', '900,000', '900', '920', '890', '910'],
    ['115/11/21', '1,200', '1,100,000', '910', '930', '905', '925'],
    ['115/11/22', '100', '90,000', '900', '899', '880', '890'],
    ['invalid', '1', '1', '1', '1', '1', '1']
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].time, '2026-11-20');
  assert.equal(rows[0].volume, 1000);
});

test('merges duplicate dates deterministically and sorts ascending', () => {
  const a = { time: '2026-11-20', close: 100 };
  const b = { time: '2026-11-21', close: 101 };
  const replacement = { time: '2026-11-20', close: 102 };
  assert.deepEqual(mergeStockDayPages([[b, a], [replacement]]), [replacement, b]);
});
