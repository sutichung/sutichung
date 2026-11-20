'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { REAL_MONEY_GATES, realMoneyReadiness, assertRealMoneyAllowed } = require('../lib/prediction-launch-gates');

test('real-money launch is disabled by default and lists every missing approval', () => {
  const result = realMoneyReadiness({});
  assert.equal(result.enabled, false);
  assert.equal(result.jurisdiction, 'GB');
  assert.equal(result.minimumAge, 18);
  assert.deepEqual(result.missingGates, [...REAL_MONEY_GATES]);
});

test('a feature flag alone cannot enable real-money operations', () => {
  const result = realMoneyReadiness({ ZENTRAX_REAL_MONEY_ENABLED: 'true' });
  assert.equal(result.enabled, false);
  assert.equal(result.missingGates.length, REAL_MONEY_GATES.length - 1);
});

test('real-money access requires all recorded gates, UK jurisdiction and adult age', () => {
  const env = Object.fromEntries(REAL_MONEY_GATES.map((key) => [key, key === 'ZENTRAX_REAL_MONEY_ENABLED' ? 'true' : 'approval-recorded']));
  assert.equal(assertRealMoneyAllowed({ jurisdiction: 'GB', age: 18, env }), true);
  assert.throws(() => assertRealMoneyAllowed({ jurisdiction: 'TW', age: 25, env }), /jurisdiction_not_approved/);
  assert.throws(() => assertRealMoneyAllowed({ jurisdiction: 'GB', age: 17, env }), /adult_age_verification_required/);
});

test('missing one legal or audit gate keeps real-money operations blocked', () => {
  const env = Object.fromEntries(REAL_MONEY_GATES.map((key) => [key, 'approval-recorded']));
  env.ZENTRAX_UK_LEGAL_APPROVAL_ID = '';
  assert.throws(() => assertRealMoneyAllowed({ jurisdiction: 'GB', age: 30, env }), (error) => error.status === 403 && error.message === 'real_money_launch_not_approved');
});
