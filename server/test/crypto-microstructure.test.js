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
  assert.equal(book.weightedObi, (8 + 2 / 2 - (4 + 1 / 2)) / (8 + 2 / 2 + 4 + 1 / 2));
  assert.equal(book.bestBidSize, 8);
  assert.equal(book.bestAskSize, 4);
  assert.ok(book.microPrice > book.midPrice, 'larger bid size should pull microprice upward');
  assert.equal(book.depthBands[0].levels, 5);
  assert.equal(book.depthBands[0].imbalance, book.obi);
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

test('unsupported exchanges and malformed symbols fail closed', async () => {
  const { fetchMicrostructure } = require('../lib/crypto-microstructure');
  await assert.rejects(() => fetchMicrostructure({ exchange: 'Unknown', symbol: 'BTCUSDT' }), /unsupported_exchange/);
  await assert.rejects(() => fetchMicrostructure({ exchange: 'Binance', symbol: '../../secret' }), /invalid_symbol/);
});

test('derivative contract sizing can be explicitly disabled when quote notional is not reliable', () => {
  const trade = { id: 'swap-1', timestamp: 1700000000000, side: 'buy', price: '60000', amount: '1', quoteCurrency: 'USDT', whaleClassificationAvailable: false };
  assert.equal(normalizeTrades('OKX', [trade], 50000)[0].large, null);
});

test('trade tape exposes aggressive buy pressure only from known quote notional', () => {
  const { normalizeTrades: normalize } = require('../lib/crypto-microstructure');
  const trades = normalize('Binance', [
    { id: 'b', timestamp: 2, side: 'buy', price: 100, amount: 3, quoteCurrency: 'USDT' },
    { id: 's', timestamp: 1, side: 'sell', price: 100, amount: 1, quoteCurrency: 'USDT' }
  ]);
  const buy = trades.filter(x => x.side === 'buy').reduce((s, x) => s + x.quoteValue, 0);
  const sell = trades.filter(x => x.side === 'sell').reduce((s, x) => s + x.quoteValue, 0);
  assert.equal(buy / (buy + sell) * 100, 75);
});
