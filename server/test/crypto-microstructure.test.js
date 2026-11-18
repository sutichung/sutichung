'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBook, normalizeTrades, safeIsoTimestamp } = require('../lib/crypto-microstructure');

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

test('order book normalizes level ordering and exposes quote-notional weighted imbalance', () => {
  const book = normalizeBook('test', [[99, 10], [100, 1]], [[103, 1], [102, 10]], 1700000000, 10);
  assert.equal(book.bestBid, 100);
  assert.equal(book.bestAsk, 102);
  assert.equal(book.bids[0][0], 100);
  assert.equal(book.asks[0][0], 102);
  assert.ok(book.obiNotional > 0);
  assert.ok(book.bidNotional > 0);
  assert.ok(book.askNotional > 0);
  assert.equal(book.timestamp, new Date(1700000000000).toISOString());
});

test('empty or invalid order books are rejected', () => {
  assert.throws(() => normalizeBook('test', [], [[1, 1]], null), /orderbook_empty/);
  assert.throws(() => normalizeBook('test', [[0, 1]], [[1, 1]], null), /orderbook_empty/);
});

test('trade tape identifies large trades, ignores invalid rows and deduplicates exchange IDs', () => {
  const rows = normalizeTrades('test', [
    { id: '1', timestamp: 1000, side: 'buy', price: 60000, amount: 1 },
    { id: '1', timestamp: 1001, side: 'buy', price: 60000, amount: 1 },
    { id: '2', timestamp: 2000, side: 'sell', price: 60000, amount: 0.5 },
    { id: '3', timestamp: 3000, side: 'buy', price: 'bad', amount: 1 }
  ], 50000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '2');
  assert.equal(rows[0].large, false);
  assert.equal(rows[1].large, true);
});

test('order book rejects crossed books and non-positive depth rows', () => {
  assert.throws(() => normalizeBook('test', [[102, 1]], [[101, 1]], null), /orderbook_crossed/);
  assert.throws(() => normalizeBook('test', [[100, 'NaN']], [[101, 1]], null), /orderbook_empty/);
});

test('whale classification only runs when quote currency is USD comparable', () => {
  const rows = [{ id: '1', timestamp: 1700000000000, side: 'buy', price: '60000', amount: '1', quoteCurrency: 'USDT' }];
  assert.equal(normalizeTrades('Binance', rows, 50000)[0].large, true);
  assert.equal(normalizeTrades('Binance', [{ ...rows[0], quoteCurrency: 'BTC' }], 50000)[0].large, null);
});

test('missing trade timestamps and explicit null cost stay missing or derive from price and amount', () => {
  const [trade] = normalizeTrades('Binance', [{ price: '100', amount: '2', timestamp: null, cost: null, side: 'buy' }]);
  assert.equal(trade.timestamp, null);
  assert.equal(trade.quoteValue, 200);
});

test('timestamp parser safely handles seconds, milliseconds and invalid values', () => {
  assert.equal(safeIsoTimestamp(1700000000), new Date(1700000000000).toISOString());
  assert.equal(safeIsoTimestamp(1700000000000), new Date(1700000000000).toISOString());
  assert.equal(safeIsoTimestamp(null), null);
  assert.equal(safeIsoTimestamp('not-a-time'), null);
  assert.equal(safeIsoTimestamp(1e30), null);
});

test('unsupported exchanges and malformed symbols fail closed', async () => {
  const { fetchMicrostructure } = require('../lib/crypto-microstructure');
  await assert.rejects(() => fetchMicrostructure({ exchange: 'Unknown', symbol: 'BTCUSDT' }), /unsupported_exchange/);
  await assert.rejects(() => fetchMicrostructure({ exchange: 'Binance', symbol: '../../secret' }), /invalid_symbol/);
});

test('derivative contract sizing can be explicitly disabled when quote notional is not reliable', () => {
  const trade = { id: 'swap-1', timestamp: 1700000000000, side: 'buy', price: '60000', amount: '1', quoteCurrency: 'USDT', whaleClassificationAvailable: false };
  assert.equal(normalizeTrades('OKX', [trade], 50000)[0].large, null);
});
