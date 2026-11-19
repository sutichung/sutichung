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
  assert.equal(safeError(new Error('request timeout')), '連線逾時（12 秒）');
  assert.equal(safeError(new Error('upstream_http_401')), 'API 金鑰驗證失敗（HTTP 401）');
  assert.ok(!safeError(new Error('Bearer secret-token')).includes('secret-token'));
});


test('provider diagnostics verify actual public crypto ticker responses and expose missing official US entitlement', async () => {
  const originalFetch = global.fetch;
  const payloads = [
    ['openapi.twse.com.tw', [{ Code: '2330' }]],
    ['data-api.ecb.europa.eu', 'KEY,OBS_VALUE' + String.fromCharCode(10) + 'X,1.1'],
    ['www.bankofcanada.ca/valet/observations/FXCADUSD', { observations: [{ d: '2026-11-17', FXCADUSD: { v: '0.6997' } }] }],
    ['data-api.binance.vision', { symbol: 'BTCUSDT', price: '65000' }],
    ['fapi.binance.com', { symbol: 'BTCUSDT', markPrice: '65000' }],
    ['api.bytick.com', { retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '65000' }] } }],
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
    for (const id of ['binance', 'binance-futures', 'bybit', 'okx', 'coinbase', 'kraken']) {
      const check = result.checks.find(x => x.id === id);
      assert.equal(check.status, 'connected', id + ' should validate a real quote-shaped response');
      assert.equal(check.dataCount, 1);
    }
    const bankOfCanada = result.checks.find(x => x.id === 'bank-of-canada');
    assert.equal(bankOfCanada.status, 'connected');
    assert.equal(bankOfCanada.sourceTime, '2026-11-17');
    const us = result.checks.find(x => x.id === 'us-equities-official');
    assert.equal(us.status, 'not_configured');
    assert.match(us.message, /CTA/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('ECB provider falls back to the official daily XML feed when the primary API times out', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const target = String(url);
    if (target.includes('data-api.ecb.europa.eu')) {
      const error = new Error('simulated timeout'); error.name = 'AbortError'; throw error;
    }
    if (target.includes('www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')) return { ok:true,status:200,text:async()=>'<gesmes:Envelope><Cube time="2026-11-19"><Cube currency="USD" rate="1.15"/></Cube></gesmes:Envelope>' };
    if (target.includes('openapi.twse.com.tw')) return { ok:true,status:200,text:async()=>JSON.stringify([{Code:'2330'}]) };
    if (target.includes('bankofcanada.ca')) return { ok:true,status:200,text:async()=>JSON.stringify({observations:[{d:'2026-11-18',FXCADUSD:{v:'0.7'}}]}) };
    if (target.includes('data-api.binance.vision')) return { ok:true,status:200,text:async()=>JSON.stringify({symbol:'BTCUSDT',price:'65000'}) };
    if (target.includes('fapi.binance.com')) return { ok:true,status:200,text:async()=>JSON.stringify({symbol:'BTCUSDT',markPrice:'65000'}) };
    if (target.includes('api.bytick.com')) return { ok:true,status:200,text:async()=>JSON.stringify({retCode:0,result:{list:[{lastPrice:'65000'}]}}) };
    if (target.includes('www.okx.com')) return { ok:true,status:200,text:async()=>JSON.stringify({code:'0',data:[{last:'65000'}]}) };
    if (target.includes('api.exchange.coinbase.com')) return { ok:true,status:200,text:async()=>JSON.stringify({price:'65000'}) };
    if (target.includes('api.kraken.com')) return { ok:true,status:200,text:async()=>JSON.stringify({error:[],result:{X:{c:['65000']}}}) };
    throw new Error('unexpected_test_url');
  };
  try {
    const result = await diagnoseProviders({});
    const ecb = result.checks.find(x => x.id === 'ecb');
    assert.equal(ecb.status, 'connected');
    assert.equal(ecb.sourceTime, '2026-11-19');
    assert.match(ecb.message, /XML 備援/);
  } finally { global.fetch = originalFetch; }
});
