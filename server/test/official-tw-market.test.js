'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRow, numberValue, loadOfficialDailyQuotes } = require('../lib/official-tw-market');

test('parses exchange number signs and thousands separators', () => {
  assert.equal(numberValue('1,234,567'), 1234567);
  assert.equal(numberValue('▼2.5'), -2.5);
  assert.equal(numberValue('▲3.2'), 3.2);
  assert.equal(numberValue('--'), null);
});

test('normalizes TWSE official daily close without claiming real-time', () => {
  const row = normalizeRow({
    Code: '2330', Name: '台積電', TradeVolume: '12,345,000',
    OpeningPrice: '900.00', HighestPrice: '910.00', LowestPrice: '895.00',
    ClosingPrice: '905.00', Change: '+5.00', TradeValue: '11,000,000,000',
    Transaction: '25,000'
  }, 'TWSE', 'twse_openapi_stock_day_all', 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
  assert.equal(row.symbol, '2330');
  assert.equal(row.price, 905);
  assert.ok(Math.abs(row.changePct - (5 / 900 * 100)) < 1e-9);
  assert.equal(row.volume, 12345000);
  assert.equal(row.dataMode, 'END_OF_DAY');
  assert.equal(row.delayed, true);
  assert.equal(row.timestamp, null);
  assert.equal(row.sourceTier, 0);
});

test('normalizes TPEx daily close and rejects invalid symbols or prices', () => {
  const row = normalizeRow({
    'SecuritiesCompanyCode': '6488', 'CompanyName': '環球晶', 'Open': '450', 'High': '460',
    'Low': '448', 'Close': '455', 'Change': '5', 'TradingShares': '1,234', 'TransactionAmount': '560,000'
  }, 'TPEx', 'tpex_openapi_daily_close', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes');
  assert.equal(row.symbol, '6488');
  assert.equal(row.price, 455);
  assert.equal(row.change, 5);
  assert.equal(row.dataMode, 'END_OF_DAY');
  assert.equal(row.volume, 1234);
  assert.equal(row.turnover, 560000);
  assert.equal(row.asOf, null);
  assert.equal(normalizeRow({ Code: 'A!B', ClosingPrice: 20 }, 'TWSE', 'x', 'x'), null);
  assert.equal(normalizeRow({ Code: '2330', ClosingPrice: '--' }, 'TWSE', 'x', 'x'), null);
});


test('falls back to the alternate official TPEx quote endpoint when the primary endpoint fails', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async url => {
    const target = String(url);
    calls.push(target);
    if (target.includes('STOCK_DAY_ALL')) {
      return { ok: true, json: async () => [{ Code: '2330', Name: '台積電', ClosingPrice: '100', Change: '1' }] };
    }
    if (target.endsWith('/tpex_mainboard_daily_close_quotes')) {
      return { ok: false, status: 403, json: async () => ({}) };
    }
    if (target.endsWith('/tpex_mainboard_quotes')) {
      return { ok: true, json: async () => [{
        Date: '1151120', SecuritiesCompanyCode: '6488', CompanyName: '環球晶',
        Open: '450', High: '460', Low: '448', Close: '455', Change: '5',
        TradingShares: '1,234', TransactionAmount: '560,000', Transaction: '120'
      }] };
    }
    throw new Error('unexpected_test_url:' + target);
  };
  try {
    const result = await loadOfficialDailyQuotes();
    assert.equal(result.markets.TWSE, 1);
    assert.equal(result.markets.TPEx, 1);
    assert.equal(result.data['6488'].price, 455);
    assert.equal(result.data['6488'].volume, 1234);
    assert.equal(result.data['6488'].turnover, 560000);
    assert.equal(result.data['6488'].asOf, '2026-11-20');
    assert.deepEqual(result.providerFallbacks, [{
      market: 'TPEx',
      sourceId: 'tpex_openapi_mainboard_quotes',
      sourceUrl: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
    }]);
    assert.ok(calls.some(url => url.endsWith('/tpex_mainboard_daily_close_quotes')));
    assert.ok(calls.some(url => url.endsWith('/tpex_mainboard_quotes')));
  } finally {
    global.fetch = originalFetch;
  }
});
