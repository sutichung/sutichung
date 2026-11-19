'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRow, numberValue } = require('../lib/official-tw-market');

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
    '代號': '6488', '名稱': '環球晶', '開盤': '450', '最高': '460',
    '最低': '448', '收盤': '455', '漲跌': '▲5', '成交股數': '1,234'
  }, 'TPEx', 'tpex_openapi_daily_close', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes');
  assert.equal(row.symbol, '6488');
  assert.equal(row.price, 455);
  assert.equal(row.change, 5);
  assert.equal(row.dataMode, 'END_OF_DAY');
  assert.equal(normalizeRow({ Code: 'bad', ClosingPrice: 20 }, 'TWSE', 'x', 'x'), null);
  assert.equal(normalizeRow({ Code: '2330', ClosingPrice: '--' }, 'TWSE', 'x', 'x'), null);
});
