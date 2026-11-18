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
