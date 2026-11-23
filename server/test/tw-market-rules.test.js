'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getTwseTradingRules, validDate } = require('../lib/tw-market-rules');

test('validates calendar dates strictly', () => {
  assert.equal(validDate('2026-12-07'), true);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026/12/07'), false);
});

test('keeps pre-phase-one odd-lot rules for historical dates', () => {
  const rules = getTwseTradingRules('2026-12-06');
  assert.equal(rules.effectivePhase, 0);
  assert.equal(rules.oddLot.orderStart, '09:00');
  assert.equal(rules.oddLot.firstMatch, '09:10');
  assert.equal(rules.oddLot.matchingIntervalSeconds, 5);
  assert.equal(rules.highPriceTick.tickNtd, 5);
});

test('applies phase-one odd-lot opening rules from 2026-12-07', () => {
  const rules = getTwseTradingRules('2026-12-07');
  assert.equal(rules.effectivePhase, 1);
  assert.equal(rules.oddLot.orderStart, '08:30');
  assert.equal(rules.oddLot.firstMatch, '09:00');
  assert.equal(rules.oddLot.preOpenIndicativeIntervalSeconds, 5);
  assert.equal(rules.oddLot.delayedOpenMechanism, true);
  assert.equal(rules.oddLot.matchingIntervalSeconds, 5);
  assert.equal(rules.highPriceTick.tickNtd, 5);
});

test('applies phase-two one-second odd-lot matching and high-price tick change', () => {
  const rules = getTwseTradingRules('2027-07-05');
  assert.equal(rules.effectivePhase, 2);
  assert.equal(rules.oddLot.matchingIntervalSeconds, 1);
  assert.equal(rules.highPriceTick.thresholdNtd, 1000);
  assert.equal(rules.highPriceTick.tickNtd, 1);
});

test('rejects invalid dates instead of silently applying current rules', () => {
  assert.throws(() => getTwseTradingRules('2026-02-30'), /valid YYYY-MM-DD/);
});
