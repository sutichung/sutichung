'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getTradingReadiness } = require('../lib/trading-readiness');

test('real-money order execution is fail-closed by default', () => {
  const status = getTradingReadiness();
  assert.equal(status.simulatedQuotes, false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.status, 'blocked');
  assert.ok(status.blockers.length >= 5);
  assert.ok(status.blockers.some(x => x.includes('券商')));
  assert.ok(status.blockers.some(x => x.includes('成交回報')));
  assert.ok(status.blockers.some(x => x.includes('樣本外')));
});
