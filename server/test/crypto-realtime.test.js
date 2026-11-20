'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCryptoRealtimeFeed, normalizeSymbols, splitSymbol, isoTimestamp } = require('../lib/crypto-realtime');

const licenses = {
  BINANCE_MARKET_DATA_LICENSE_CONFIRMED: 'true',
  BYBIT_MARKET_DATA_LICENSE_CONFIRMED: 'true',
  OKX_MARKET_DATA_LICENSE_CONFIRMED: 'true',
  COINBASE_MARKET_DATA_LICENSE_CONFIRMED: 'true',
  KRAKEN_MARKET_DATA_LICENSE_CONFIRMED: 'true'
};

test('symbol configuration is normalized, deduplicated and bounded', () => {
  assert.deepEqual(normalizeSymbols('btcusdt, ETHUSDT,btcusdt,invalid!'), ['BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(splitSymbol('BTCUSDT'), { baseAsset: 'BTC', quoteAsset: 'USDT' });
  assert.equal(isoTimestamp(0), null);
  assert.equal(isoTimestamp(1700000000000), new Date(1700000000000).toISOString());
});
test('all five exchanges normalize genuine timestamped ticker messages', () => {
  const now = Date.parse('2026-11-20T00:00:05.000Z');
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'], now: () => now, env: licenses });
  const cases = [
    ['binance', { e: '24hrTicker', E: now - 1000, s: 'BTCUSDT', c: '65000', P: '1.2' }],
    ['bybit', { topic: 'tickers.BTCUSDT', ts: now - 1000, data: { symbol: 'BTCUSDT', lastPrice: '65001', price24hPcnt: '0.01', bid1Price: '65000', ask1Price: '65002' } }],
    ['okx', { arg: { channel: 'tickers' }, data: [{ instId: 'BTC-USDT', last: '65002', ts: String(now - 1000), bidPx: '65001', askPx: '65003' }] }],
    ['coinbase', { type: 'ticker', product_id: 'BTC-USD', price: '65003', time: new Date(now - 1000).toISOString(), best_bid: '65002', best_ask: '65004' }],
    ['kraken', { channel: 'ticker', data: [{ symbol: 'BTC/USD', last: 65004, timestamp: new Date(now - 1000).toISOString(), bid: 65003, ask: 65005 }] }]
  ];
  for (const [exchange, event] of cases) assert.equal(feed.applyEvent(exchange, event), true, exchange);
  const rows = feed.getQuotes();
  assert.equal(rows.length, 5);
  assert.deepEqual(new Set(rows.map(x => x.exchange)), new Set(['Binance', 'Bybit', 'OKX', 'Coinbase', 'Kraken']));
  assert.ok(rows.every(x => x.price > 0 && x.sourceTimestamp && x.sourceAgeMs < 5000));
});
test('unlicensed exchanges cannot publish websocket quotes into the shared snapshot', () => {
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'], env: {} });
  assert.equal(feed.applyEvent('binance', { e: '24hrTicker', E: Date.now(), s: 'BTCUSDT', c: '65000' }), false);
  assert.equal(feed.getQuotes().length, 0);
});
test('websocket snapshots only overwrite the exact exchange and instrument while preserving REST fallback', () => {
  const now = Date.now();
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'], now: () => now, env: licenses });
  feed.applyEvent('okx', { arg: { channel: 'tickers' }, data: [{ instId: 'BTC-USDT', last: '65000', ts: String(now - 1000) }] });
  const original = { markets: [
    { exchange: 'OKX', marketType: 'spot', nativeSymbol: 'BTC-USDT', price: 64900 },
    { exchange: 'Binance', marketType: 'spot', nativeSymbol: 'BTCUSDT', price: 64800 }
  ], exchanges: [{ name: 'OKX' }, { name: 'Binance' }], summary: { total: 2 } };
  const merged = feed.mergeMarket(original);
  assert.equal(merged.markets[0].price, 65000);
  assert.equal(merged.markets[0].quoteMode, 'WebSocket push');
  assert.equal(merged.markets[0].signalEligible, true);
  assert.equal(merged.markets[1].price, 64800);
  assert.equal(merged.summary.websocketQuoteCount, 1);
});
test('stale, future-dated, invalid and unconfigured quote events are rejected', () => {
  const now = Date.parse('2026-11-20T00:00:05.000Z');
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'], now: () => now, staleAfterMs: 10000, env: licenses });
  assert.equal(feed.applyEvent('binance', { e: '24hrTicker', E: now - 20000, s: 'BTCUSDT', c: '65000' }), false);
  assert.equal(feed.applyEvent('binance', { e: '24hrTicker', E: now + 120000, s: 'BTCUSDT', c: '65000' }), false);
  assert.equal(feed.applyEvent('binance', { e: '24hrTicker', E: now, s: 'ETHUSDT', c: '3000' }), false);
  assert.equal(feed.applyEvent('binance', { e: '24hrTicker', E: now, s: 'BTCUSDT', c: '0' }), false);
  assert.equal(feed.getQuotes().length, 0);
});
