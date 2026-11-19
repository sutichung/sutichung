'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRuntimeHealth, buildDependencyReadiness } = require('../lib/health');

test('runtime health reports process liveness without leaking environment secrets', () => {
  const report = buildRuntimeHealth({ mode: 'production', region: 'singapore', service: 'api-apac', instance: 'instance-a', expectedInstances: '2' });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'healthy');
  assert.equal(report.mode, 'production');
  assert.equal(report.deployment.region, 'singapore');
  assert.equal(report.deployment.service, 'api-apac');
  assert.equal(report.deployment.instance, 'instance-a');
  assert.equal(report.deployment.expectedInstances, 2);
  assert.equal(report.deployment.topologyConfigured, true);
  assert.ok(Number.isInteger(report.uptimeSeconds));
  assert.equal(Object.hasOwn(report, 'env'), false);
  assert.equal(Object.hasOwn(report, 'secrets'), false);
});

test('runtime health marks unknown topology instead of claiming redundancy', () => {
  const report = buildRuntimeHealth({ expectedInstances: '' });
  assert.equal(report.deployment.expectedInstances, null);
  assert.equal(report.deployment.topologyConfigured, false);
  assert.equal(report.deployment.region, 'unknown');
});

test('runtime health rejects invalid expected instance counts', () => {
  const report = buildRuntimeHealth({ expectedInstances: '-3' });
  assert.equal(report.deployment.expectedInstances, null);
});

test('dependency readiness distinguishes server readiness from incomplete integrations', () => {
  const report = buildDependencyReadiness({});
  assert.equal(report.ready, true, 'the HTTP process can serve requests even when optional integrations are absent');
  assert.equal(report.status, 'degraded');
  assert.equal(report.checks.httpServer.ready, true);
  assert.equal(report.checks.supabaseAuth.configured, false);
  assert.equal(report.checks.adminMemberRecovery.configured, false);
  assert.equal(report.checks.cryptoRedistributionLicenses.confirmed, 0);
  assert.equal(report.connectivityVerified, false);
  assert.equal(report.coverageVerified, false);
  assert.ok(report.warnings.some(x => /歷史資料來源或授權/.test(x)));
});

test('historical provider URL and license gate never masquerades as verified connectivity or coverage', () => {
  const env = {
    TWSE_HISTORICAL_PROVIDER_URL: 'https://provider.example/api',
    TWSE_HISTORICAL_LICENSE_CONFIRMED: 'true',
    TPEX_HISTORICAL_PROVIDER_URL: 'https://provider.example/tpex',
    TPEX_HISTORICAL_LICENSE_CONFIRMED: 'false'
  };
  const report = buildDependencyReadiness(env);
  const twse = report.checks.historicalProviders.find(x => x.id === 'twse');
  const tpex = report.checks.historicalProviders.find(x => x.id === 'tpex');
  assert.equal(twse.configurationComplete, true);
  assert.equal(twse.status, 'verification_required');
  assert.equal(twse.connectivityVerified, false);
  assert.equal(twse.coverageVerified, false);
  assert.equal(tpex.configurationComplete, false);
  assert.equal(tpex.status, 'not_configured');
  assert.equal(report.status, 'degraded');
});

test('configured keys are not proof of live provider connectivity', () => {
  const report = buildDependencyReadiness({
    TWSE_REALTIME_PROVIDER_URL: 'https://licensed-provider.example/feed',
    TWSE_REALTIME_LICENSE_CONFIRMED: 'true',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'present',
    SUPABASE_SERVICE_ROLE_KEY: 'present',
    SUPABASE_ADMIN_EMAIL: 'admin@example.com'
  });
  assert.equal(report.checks.realtimeMarket.status, 'configured_unverified');
  assert.equal(report.checks.supabaseAuth.status, 'configured_unverified');
  assert.equal(report.checks.adminMemberRecovery.status, 'configured_unverified');
  assert.equal(report.connectivityVerified, false);
  assert.ok(report.warnings.some(x => /授權/.test(x)));
});
