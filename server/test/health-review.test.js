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
      { id: 'fugle', label: 'Fugle', status: 'permission_error', message: 'plan permission denied' }
    ] }
  );
  assert.equal(report.application.ok, true);
  assert.equal(report.providerSummary.connected, 1);
  assert.equal(report.providerSummary.notConfigured, 1);
  assert.equal(report.providerSummary.failing, 1);
  assert.deepEqual(report.failures.map(x => x.id), ['fugle']);
});

test('daily health report fails closed when application health is not ok', () => {
  const report = buildHealthReport({ ok: false }, { checks: [] });
  assert.equal(report.application.ok, false);
  assert.equal(report.providerSummary.failing, 0);
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
