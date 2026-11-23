'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMarketDataQuality } = require('../lib/market-data-quality');

test('does not mislabel official end-of-day quotes as realtime', () => {
  const report = buildMarketDataQuality({
    quotes: { ok: true, quoteCount: 1200, dataMode: 'END_OF_DAY', realtime: false, source: 'TWSE OpenAPI' },
    listed: { data: Array.from({ length: 1500 }, (_, i) => ({ symbol: String(i) })) },
    history: { historyDateCount: 60, historyCount: 900, historyAsOf: '2026-11-20' },
    flows: { data: {} }
  });
  assert.equal(report.markets.TWSE_TPEx.status, 'available');
  assert.equal(report.markets.TWSE_TPEx.realtime, false);
  assert.equal(report.verified.realtime, false);
  assert.ok(report.warnings.some(x => /不是盤中即時/.test(x)));
});

test('requires both 60 trading days and at least 60 percent coverage with a 100-stock floor', () => {
  const listed = { data: Array.from({ length: 1000 }, (_, i) => ({ symbol: String(i) })) };
  const tooFewDays = buildMarketDataQuality({
    quotes: { ok: true, quoteCount: 900, realtime: false },
    listed, history: { historyDateCount: 59, historyCount: 800 }, flows: { data: {} }
  });
  assert.equal(tooFewDays.historical.status, 'insufficient_or_unavailable');
  const tooFewStocks = buildMarketDataQuality({
    quotes: { ok: true, quoteCount: 900, realtime: false },
    listed, history: { historyDateCount: 60, historyCount: 599 }, flows: { data: {} }
  });
  assert.equal(tooFewStocks.historical.status, 'insufficient_or_unavailable');
  const enough = buildMarketDataQuality({
    quotes: { ok: true, quoteCount: 900, realtime: false },
    listed, history: { historyDateCount: 60, historyCount: 600 }, flows: { data: {} }
  });
  assert.equal(enough.historical.status, 'ready');
  assert.equal(enough.historical.coveragePct, 60);
});

test('reports missing sources and errors without inventing freshness', () => {
  const report = buildMarketDataQuality({
    quotes: { ok: false, quoteCount: 0, error: 'upstream down' },
    history: { error: 'database unavailable' },
    listed: { data: [], error: 'universe unavailable' },
    flows: { data: {}, error: 'flows unavailable' }
  });
  assert.equal(report.status, 'degraded');
  assert.equal(report.markets.TWSE_TPEx.freshnessStatus, 'not_evaluated_without_exchange_calendar');
  assert.equal(report.verified.allSourcesAvailable, false);
  assert.equal(report.errors.length, 4);
});

test('counts institutional, margin and TDCC field coverage independently', () => {
  const report = buildMarketDataQuality({
    quotes: { ok: true, quoteCount: 200, realtime: false },
    history: { historyDateCount: 60, historyCount: 100 },
    listed: { data: Array.from({ length: 100 }, (_, i) => ({ symbol: String(i) })) },
    flows: { data: {
      '2330': { institutionalNet: 1, marginChange: 2, largeHolderPct: 3 },
      '2317': { institutionalNet: -1, shortChange: 1 }
    }, asOf: '2026-11-20', marginAsOf: '2026-11-20', tdccAsOf: '2026-11-13' }
  });
  assert.equal(report.flows.institutionalStocks, 2);
  assert.equal(report.flows.marginStocks, 2);
  assert.equal(report.flows.tdccStocks, 1);
});
