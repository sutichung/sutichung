'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { statusForHttp, safeError } = require('../lib/provider-diagnostics');

test('provider diagnostics classify common upstream HTTP failures', () => {
  assert.equal(statusForHttp(200), 'connected');
  assert.equal(statusForHttp(401), 'auth_error');
  assert.equal(statusForHttp(403), 'auth_error');
  assert.equal(statusForHttp(429), 'rate_limited');
  assert.equal(statusForHttp(503), 'upstream_error');
});

test('provider diagnostics sanitize credentials and classify timeout messages', () => {
  assert.equal(safeError(new Error('request timeout')), '連線逾時（7 秒）');
  assert.equal(safeError(new Error('upstream_http_401')), 'API 金鑰驗證失敗（HTTP 401）');
  assert.ok(!safeError(new Error('Bearer secret-token')).includes('secret-token'));
});
