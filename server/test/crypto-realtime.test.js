'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCryptoRealtimeFeed, normalizeSymbols, splitSymbol, isoTimestamp } = require('../lib/crypto-realtime');

test('symbol configuration is normalized, deduplicated and bounded', () => {
  assert.deepEqual(normalizeSymbols('btcusdt, ETHUSDT,btcusdt,invalid!'), ['BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(splitSymbol('BTCUSDT'), { baseAsset: 'BTC', quoteAsset: 'USDT' });
  assert.equal(isoTimestamp(0), null);
  assert.equal(isoTimestamp(1700000000000), new Date(1700000000000).toISOString());
});

test('Binance ticker and bookTicker messages combine into one normalized live quote', () => {
  let clock = 1700000005000;
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'], now: () => clock });
  const eventTime = 1700000004000;
  assert.equal(feed.applyEvent('spot', JSON.stringify({ stream: 'btcusdt@ticker', data: {
    e: '24hrTicker', E: eventTime, s: 'BTCUSDT', c: '65000.5', P: '1.25', q: '123456',
    v: '12.5', h: '66000', l: '64000'
  }})), true);
  assert.equal(feed.applyEvent('spot', JSON.stringify({ stream: 'btcusdt@bookTicker', data: {
    e: 'bookTicker', E: eventTime + 1, s: 'BTCUSDT', b: '65000', B: '0.5', a: '65001', A: '0.4'
  }})), true);
  const quote = feed.getQuotes()[0];
  assert.equal(quote.price, 65000.5);
  assert.equal(quote.changePct, 1.25);
  assert.equal(quote.bid, 65000);
  assert.equal(quote.ask, 65001);
  assert.equal(quote.bidSize, 0.5);
  assert.equal(quote.askSize, 0.4);
  assert.equal(quote.sourceTimestamp, new Date(eventTime).toISOString());
  assert.equal(quote.marketType, 'spot');
  clock += 31000;
  assert.equal(feed.getQuotes().length, 0);
});

test('WebSocket quotes overlay only matching Binance instruments and preserve REST fallback', () => {
  const now = 1700000005000;
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'], now: () => now });
  feed.applyEvent('spot', JSON.stringify({ e: '24hrTicker', E: now - 500, s: 'BTCUSDT', c: '65000', P: '2', q: '1000', v: '1' }));
  const original = {
    markets: [
      { id: 'Binance:spot:BTCUSDT', exchange: 'Binance', marketType: 'spot', symbol: 'BTCUSDT', nativeSymbol: 'BTCUSDT', price: 64000 },
      { id: 'OKX:spot:BTC-USDT', exchange: 'OKX', marketType: 'spot', symbol: 'BTC-USDT', price: 65000 }
    ],
    exchanges: [{ name: 'Binance', quoteMode: 'REST snapshot polling' }],
    summary: { total: 2 },
    quoteMode: 'REST snapshot polling'
  };
  const merged = feed.mergeMarket(original);
  assert.equal(merged.markets[0].price, 65000);
  assert.equal(merged.markets[0].quoteMode, 'WebSocket push');
  assert.equal(merged.markets[0].signalEligible, true);
  assert.equal(merged.markets[1].price, 65000);
  assert.equal(merged.markets[1].quoteMode, undefined);
  assert.equal(merged.summary.websocketQuoteCount, 1);
  assert.match(merged.quoteMode, /REST fallback/);
});

test('invalid and unrelated WebSocket messages are safely ignored', () => {
  const feed = createCryptoRealtimeFeed({ symbols: ['BTCUSDT'] });
  assert.equal(feed.applyEvent('spot', 'not-json'), false);
  assert.equal(feed.applyEvent('spot', JSON.stringify({ e: '24hrTicker', s: 'ETHUSDT', c: '3000' })), false);
  assert.equal(feed.getQuotes().length, 0);
});
