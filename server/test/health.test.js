'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRuntimeHealth } = require('../lib/health');

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
