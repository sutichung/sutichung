'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealthReport } = require('../jobs/health-review');

test('daily health report distinguishes missing optional APIs from real failures', () => {
  const report = buildHealthReport(
    { ok: true, mode: 'production', node: 'v20.0.0' },
    { checks: [
      { id: 'twse', label: 'TWSE', status: 'connected', latencyMs: 50 },
      { id: 'finmind', label: 'FinMind', status: 'not_configured', message: 'missing token' },
      { id: 'tpex', label: 'TPEx', status: 'permission_error', message: 'official endpoint permission denied' }
    ] }
  );
  assert.equal(report.application.ok, true);
  assert.equal(report.providerSummary.connected, 1);
  assert.equal(report.providerSummary.notConfigured, 1);
  assert.equal(report.providerSummary.failing, 1);
  assert.equal(report.providerSummary.criticalFailing, 0);
  assert.equal(report.providerSummary.optionalFailing, 1);
  assert.deepEqual(report.failures, []);
  assert.ok(report.warnings.includes('some_optional_providers_unavailable'));
  assert.equal(report.overallStatus, 'partial');
});

test('daily health report fails closed when application health is not ok', () => {
  const report = buildHealthReport({ ok: false }, { checks: [] });
  assert.equal(report.application.ok, false);
  assert.equal(report.providerSummary.failing, 0);
  assert.equal(report.overallStatus, 'degraded');
});

test('daily health report preserves firewall counters and raises threshold warnings', () => {
  const report = buildHealthReport(
    { ok: true, mode: 'production' },
    { checks: [], security: {
      requests: 1000, blocked: 80, probes: 55, rateLimited: 12,
      byRule: { api: 100, authentication: 12 },
      lastEventAt: '2026-11-18T06:00:00.000Z',
      scope: 'per-instance in-memory counters; resets on restart'
    } }
  );
  assert.equal(report.security.status, 'observed');
  assert.equal(report.security.blockedRatePct, 8);
  assert.equal(report.security.rateLimited, 12);
  assert.deepEqual(report.security.warnings, ['elevated_rate_limiting', 'elevated_probe_activity']);
  assert.match(report.security.scope, /resets on restart/);
});

test('daily health report marks missing firewall telemetry instead of inventing zero activity', () => {
  const report = buildHealthReport({ ok: true }, { checks: [] });
  assert.equal(report.security.status, 'unavailable');
  assert.equal(report.security.reason, 'firewall_telemetry_not_returned');
});

test('market data report separates a valid TWSE connection from off-session empty quotes', () => {
  const report = buildHealthReport(
    { ok: true, commit: 'abc123', branch: 'main' },
    { checks: [] },
    { ok: true, source: 'TWSE official', listedCount: 1200, quoteCount: 0, serverTime: '2026-11-18T22:00:00.000Z' },
    { markets: [{ price: 65000 }], summary: { connectedExchangeCount: 4, sourceTimestampCoveragePct: 25 }, receivedAt: '2026-11-18T22:00:00.000Z',
      exchanges: [{ name: 'Binance', status: 'connected', markets: 100 }, { name: 'Kraken', status: 'unavailable', error: 'timeout' }] }
  );
  assert.equal(report.application.commit, 'abc123');
  assert.equal(report.marketData.taiwan.status, 'connected');
  assert.equal(report.marketData.taiwan.liveQuoteCount, 0);
  assert.equal(report.marketData.crypto.status, 'partial');
  assert.equal(report.marketData.crypto.unavailableExchanges[0].name, 'Kraken');
  assert.equal(report.overallStatus, 'partial');
  assert.deepEqual(report.failures, []);
});

test('market data report fails closed when official Taiwan or all crypto exchange data is unavailable', () => {
  const report = buildHealthReport(
    { ok: true },
    { checks: [] },
    { ok: false, error: 'TWSE upstream failed', listedCount: 0, quoteCount: 0 },
    { markets: [], summary: { connectedExchangeCount: 0 }, exchanges: [] }
  );
  assert.deepEqual(report.failures.map(x => x.id), ['twse-market-data', 'crypto-market-data']);
  assert.equal(report.overallStatus, 'degraded');
});

test('daily health report blocks required Taiwan, ECB, and Supabase provider failures',()=>{
 const report=buildHealthReport(
  {ok:true},
  {checks:[
   {id:'twse',status:'connected'},
   {id:'ecb',status:'connected'},
   {id:'supabase',status:'auth_error',httpStatus:401,message:'invalid anon key'},
   {id:'binance',status:'error',httpStatus:451,message:'region restricted'}
  ]}
 );
 assert.deepEqual(report.failures.map(x=>x.id),['supabase']);
 assert.equal(report.providerSummary.criticalFailing,1);
 assert.equal(report.providerSummary.optionalFailing,1);
 assert.ok(report.warnings.includes('some_optional_providers_unavailable'));
 assert.equal(report.overallStatus,'degraded');
});

test('daily health report treats missing required authentication as a blocking configuration error',()=>{
 const report=buildHealthReport(
  {ok:true},
  {checks:[
   {id:'twse',status:'connected'},
   {id:'ecb',status:'connected'},
   {id:'supabase',status:'not_configured',message:'missing anon key'}
  ]}
 );
 assert.deepEqual(report.failures.map(x=>x.id),['supabase']);
 assert.equal(report.providerSummary.criticalFailing,1);
});
