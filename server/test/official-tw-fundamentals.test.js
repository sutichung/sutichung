'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getOfficialFundamentals, periodOf, sectorKey } = require('../lib/official-tw-fundamentals');

test('normalizes ROC revenue periods and industry statement endpoints', () => {
  assert.equal(periodOf({ '資料年月': '11510' }), '2026-10');
  assert.equal(sectorKey('半導體業'), 'ci');
  assert.equal(sectorKey('金融保險業'), 'ins');
  assert.equal(sectorKey('金控業'), 'fh');
});

test('loads listed-company financials and revenue from official TWSE endpoints without tokens', async () => {
  const originalFetch = global.fetch;
  const seen = [];
  global.fetch = async url => {
    const target = String(url); seen.push(target);
    let rows = [];
    if (target.endsWith('/opendata/t187ap05_L')) rows = [{
      '資料年月': '11510', '公司代號': '2330', '公司名稱': '台積電',
      '營業收入-當月營收': '367,000,000', '營業收入-去年同月增減(%)': '12.5',
      '營業收入-上月比較增減(%)': '3.2'
    }];
    if (target.endsWith('/opendata/t187ap06_L_ci')) rows = [{
      '公司代號': '2330', '年度': '115', '季別': '3',
      '營業收入合計': '1,000,000', '營業毛利（毛損）淨額': '500,000',
      '營業利益（損失）': '300,000', '本期淨利（淨損）': '250,000',
      '基本每股盈餘（元）': '9.5'
    }];
    if (target.endsWith('/opendata/t187ap07_L_ci')) rows = [{
      '公司代號': '2330', '年度': '115', '季別': '3',
      '資產總計': '2,000,000', '負債總計': '800,000', '權益總計': '1,200,000',
      '流動資產合計': '900,000', '流動負債合計': '400,000'
    }];
    if (target.endsWith('/exchangeReport/BWIBBU_ALL')) rows = [{
      Code: '2330', Date: '20261120', PEratio: '20.1', PBratio: '5.2', DividendYield: '2.1'
    }];
    if (target.endsWith('/opendata/t187ap45_L')) rows = [{ '公司代號': '2330', '年度': '114', '現金股利(元/股)': '5.0', '股票股利(元/股)': '0.5', '除息交易日': '2026/07/01' }];
    return { ok: true, status: 200, json: async () => rows };
  };
  try {
    const result = await getOfficialFundamentals({ symbol: '2330', exchange: 'TWSE', sector: '半導體業' });
    assert.equal(result.financials.monthlyRevenue[0].date, '2026-10');
    assert.equal(result.financials.monthlyRevenue[0].yoy, 12.5);
    assert.equal(result.financials.income.eps, 9.5);
    assert.equal(result.financials.balance.totalAssets, 2000000);
    assert.equal(result.financials.valuation.pe, 20.1);
    assert.equal(result.financials.dividends[0].CashEarningsDistribution, 5);
    assert.equal(result.financials.dividends[0].StockEarningsDistribution, 0.5);
    assert.equal(result.financials.cash, null);
    assert.equal(result.completeness.cashFlow, false);
    assert.ok(result.source.includes('TWSE OpenAPI'));
    assert.ok(seen.every(url => url.startsWith('https://openapi.twse.com.tw/v1/')));
  } finally {
    global.fetch = originalFetch;
  }
});
