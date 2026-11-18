'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBook, normalizeTrades } = require('../lib/crypto-microstructure');

test('order book computes spread and depth imbalance from valid levels', () => {
  const book = normalizeBook('test', [[101, 8], [100, 2]], [[103, 4], [104, 1]], null, 10);
  assert.equal(book.bestBid, 101);
  assert.equal(book.bestAsk, 103);
  assert.equal(book.midPrice, 102);
  assert.ok(Math.abs(book.spreadPct - (2 / 102 * 100)) < 1e-10);
  assert.equal(book.bidDepth, 10);
  assert.equal(book.askDepth, 5);
  assert.equal(book.obi, 1 / 3);
  assert.equal(book.timestamp, null, 'do not invent an exchange timestamp');
});

test('empty or invalid order books are rejected', () => {
  assert.throws(() => normalizeBook('test', [], [[1, 1]], null), /orderbook_empty/);
  assert.throws(() => normalizeBook('test', [[0, 1]], [[1, 1]], null), /orderbook_empty/);
});

test('trade tape identifies large trades and ignores invalid rows', () => {
  const rows = normalizeTrades('test', [
    { id: '1', timestamp: 1000, side: 'buy', price: 60000, amount: 1 },
    { id: '2', timestamp: 2000, side: 'sell', price: 60000, amount: 0.5 },
    { id: '3', timestamp: 3000, side: 'buy', price: 'bad', amount: 1 }
  ], 50000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '2');
  assert.equal(rows[0].large, false);
  assert.equal(rows[1].large, true);
});
