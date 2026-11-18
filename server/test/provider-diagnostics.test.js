'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { statusForHttp, safeError, diagnoseProviders } = require('../lib/provider-diagnostics');

test('provider diagnostics classify common upstream HTTP failures', () => {
  assert.equal(statusForHttp(200), 'connected');
  assert.equal(statusForHttp(401), 'auth_error');
  assert.equal(statusForHttp(403), 'auth_error');
  assert.equal(statusForHttp(429), 'rate_limited');
  assert.equal(statusForHttp(503), 'upstream_error');
});

test('provider diagnostics sanitize credentials and classify timeout messages', () => {
  assert.equal(safeError(new Error('request timeout')), '連線逾時（7 秒）');
  assert.equal(safeError(new Error('upstream_http_401')), 'API 金鑰驗證失敗（HTTP 401）');
  assert.ok(!safeError(new Error('Bearer secret-token')).includes('secret-token'));
});


test('provider diagnostics verify actual public crypto ticker responses and expose missing official US entitlement', async () => {
  const originalFetch = global.fetch;
  const payloads = [
    ['openapi.twse.com.tw', [{ Code: '2330' }]],
    ['data-api.ecb.europa.eu', 'KEY,OBS_VALUE\\nX,1.1'],
    ['api.binance.com', { symbol: 'BTCUSDT', price: '65000' }],
    ['api.bybit.com', { retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '65000' }] } }],
    ['www.okx.com', { code: '0', data: [{ instId: 'BTC-USDT', last: '65000' }] }],
    ['api.exchange.coinbase.com', { price: '65000', time: '2026-11-18T15:00:00Z' }],
    ['api.kraken.com', { error: [], result: { XXBTZUSD: { c: ['65000', '1'] } } }]
  ];
  global.fetch = async url => {
    const entry = payloads.find(([host]) => String(url).includes(host));
    if (!entry) throw new Error('unexpected_test_url');
    const body = typeof entry[1] === 'string' ? entry[1] : JSON.stringify(entry[1]);
    return { ok: true, status: 200, text: async () => body };
  };
  try {
    const result = await diagnoseProviders({});
    for (const id of ['binance', 'bybit', 'okx', 'coinbase', 'kraken']) {
      const check = result.checks.find(x => x.id === id);
      assert.equal(check.status, 'connected', id + ' should validate a real quote-shaped response');
      assert.equal(check.dataCount, 1);
    }
    const us = result.checks.find(x => x.id === 'us-equities-official');
    assert.equal(us.status, 'not_configured');
    assert.match(us.message, /CTA/);
  } finally {
    global.fetch = originalFetch;
  }
});
