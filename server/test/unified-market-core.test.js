'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMarketQuote, createMarketEnvelope, getMarketRegistry } = require('../lib/unified-market-core');

test('registry exposes one shared contract for all three markets', () => {
  const registry = getMarketRegistry();
  assert.deepEqual(registry.markets.map(x => x.id), ['TW', 'US', 'CRYPTO']);
  assert.ok(registry.schema.quote.includes('timestamp'));
});

test('normalizes numeric strings, timestamps and common quote fields', () => {
  const quote = normalizeMarketQuote('tw', {
    symbol: '2330', last: '1,025.00', open: '1010', high: '1030',
    low: '1005', volume: '123456', changePct: '1.5',
    timestamp: 1795080000, source: 'TWSE', dataMode: 'END_OF_DAY'
  });
  assert.equal(quote.price, 1025);
  assert.equal(quote.open, 1010);
  assert.equal(quote.volume, 123456);
  assert.equal(quote.market, 'TW');
  assert.equal(quote.dataMode, 'END_OF_DAY');
  assert.equal(quote.realtime, false);
  assert.equal(quote.delayed, true);
  assert.equal(quote.timestamp, new Date(1795080000000).toISOString());
});

test('never upgrades an unverified feed to realtime', () => {
  const quote = normalizeMarketQuote('US', { symbol: 'AAPL', last: 200, realtime: true });
  assert.equal(quote.realtime, false);
  assert.equal(quote.delayed, true);
  assert.equal(quote.dataMode, 'UNKNOWN');
});

test('accepts realtime only with explicit REALTIME mode and flag', () => {
  const quote = normalizeMarketQuote('CRYPTO', {
    symbol: 'BTC/USDT', price: '99000', realtime: true, dataMode: 'REALTIME'
  });
  assert.equal(quote.realtime, true);
  assert.equal(quote.delayed, false);
});

test('invalid market and missing symbol are rejected', () => {
  assert.throws(() => normalizeMarketQuote('FOREX', { symbol: 'EURUSD' }), /unsupported_market/);
  assert.throws(() => normalizeMarketQuote('TW', { price: 100 }), /quote_symbol_required/);
});

test('invalid numeric values and timestamps remain null rather than fabricated', () => {
  const quote = normalizeMarketQuote('US', { symbol: 'MSFT', price: 'n/a', timestamp: 'not-a-date' });
  assert.equal(quote.price, null);
  assert.equal(quote.timestamp, null);
});

test('market envelope has consistent count and preserves errors', () => {
  const envelope = createMarketEnvelope({
    market: 'TW', source: 'TWSE official daily', data: [{ symbol: '2330' }],
    errors: [{ provider: 'TPEx', message: 'timeout' }]
  });
  assert.equal(envelope.count, 1);
  assert.equal(envelope.errors.length, 1);
  assert.equal(envelope.market, 'TW');
});
