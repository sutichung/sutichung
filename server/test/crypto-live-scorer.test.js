'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CryptoLiveScorer, median } = require('../lib/crypto-live-scorer');

const BASE = Date.parse('2026-11-20T00:00:00.000Z');
const event = (overrides = {}) => ({
  exchange: 'OKX', marketType: 'spot', symbol: 'BTC-USDT',
  timestamp: BASE, last: 100, bid: 99.99, ask: 100.01,
  changePct: 0.2, intervalQuoteVolume: 1000, ...overrides
});

test('live scorer validates identity, price and source timestamp', () => {
  const scorer = new CryptoLiveScorer();
  assert.throws(() => scorer.update(event({ symbol: '' }), BASE), /ticker_identity/);
  assert.throws(() => scorer.update(event({ last: 0 }), BASE), /ticker_identity/);
  assert.throws(() => scorer.update(event({ timestamp: null }), BASE), /source_timestamp/);
});

test('stale and future-dated events are excluded from signal scoring', () => {
  const scorer = new CryptoLiveScorer();
  assert.equal(scorer.update(event({ timestamp: BASE - 61_000 }), BASE).status, 'stale');
  assert.equal(scorer.update(event({ timestamp: BASE + 61_000 }), BASE).status, 'stale');
});

test('duplicate and out-of-order exchange events are ignored', () => {
  const scorer = new CryptoLiveScorer();
  assert.equal(scorer.update(event(), BASE).eligible, true);
  assert.equal(scorer.update(event(), BASE).status, 'duplicate_or_out_of_order');
  assert.equal(scorer.update(event({ timestamp: BASE - 1 }), BASE).status, 'duplicate_or_out_of_order');
});

test('momentum is calculated from the rolling price history', () => {
  const scorer = new CryptoLiveScorer();
  for (let i = 0; i < 5; i++) {
    const result = scorer.update(event({ timestamp: BASE + i * 1000, last: 100 + i * 0.2 }), BASE + i * 1000);
    if (i === 4) {
      assert.ok(result.momentumPct > 0.7);
      assert.match(result.reasons.join(' '), /短期動能/);
    }
  }
});

test('volume anomaly uses completed interval volume, never 24h turnover', () => {
  const scorer = new CryptoLiveScorer();
  for (let i = 0; i < 5; i++) {
    scorer.update(event({ timestamp: BASE + i * 1000, quoteVolume: 1000, changePct: 0 }), BASE + i * 1000);
  }
  const result = scorer.update(event({ timestamp: BASE + 5000, intervalQuoteVolume: 2500, changePct: 0 }), BASE + 5000);
  assert.equal(result.volumeMultiple, 2.5);
  assert.match(result.reasons.join(' '), /已完成 K 線成交額/);
});

test('spread and score remain null when order book fields are missing', () => {
  const scorer = new CryptoLiveScorer();
  const result = scorer.update(event({ bid: null, ask: null }), BASE);
  assert.equal(result.spreadBps, null);
  assert.equal(result.eligible, true);
});

test('scoring histories are isolated by exchange, market type and symbol', () => {
  const scorer = new CryptoLiveScorer();
  scorer.update(event(), BASE);
  const other = scorer.update(event({ exchange: 'Binance', timestamp: BASE + 1 }), BASE + 1);
  assert.equal(other.sampleCount, 1);
});

test('median handles even and odd sample sizes', () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 4, 2, 3]), 2.5);
  assert.equal(median([]), null);
});
