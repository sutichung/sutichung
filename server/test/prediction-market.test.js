'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SYMBOLS, quoteFromPools, validateMarketInput, validateOrderInput,
  evaluateOutcome, parseBinanceKline
} = require('../lib/prediction-market');

test('supports only BTC, ETH and BNB USDT spot markets', () => {
  assert.deepEqual(Object.keys(SYMBOLS), ['BTCUSDT','ETHUSDT','BNBUSDT']);
  assert.throws(() => validateMarketInput({symbol:'DOGEUSDT',direction:'ABOVE',strikePrice:1,closeAt:'2026-12-01T00:00:00Z'}, Date.parse('2026-11-20T00:00:00Z')), /unsupported_prediction_symbol/);
});

test('pool odds begin at 50/50, move with paper stakes, and stay bounded', () => {
  assert.deepEqual(quoteFromPools(0,0), {yesPrice:0.5,noPrice:0.5});
  const afterYes = quoteFromPools(500,0);
  assert.ok(afterYes.yesPrice > 0.5);
  assert.equal(afterYes.yesPrice + afterYes.noPrice, 1);
  assert.equal(quoteFromPools(1e9,0).yesPrice, 0.95);
  assert.equal(quoteFromPools(0,1e9).yesPrice, 0.05);
  assert.throws(() => quoteFromPools(-1,0), /invalid_prediction_pool/);
});

test('validates market direction, symbol, strike, minute boundary and expiry range', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const good = validateMarketInput({symbol:'BTCUSDT',direction:'ABOVE',strikePrice:100000,closeAt:'2026-11-21T12:30:00Z'},now);
  assert.equal(good.baseAsset,'BTC');
  assert.equal(good.resolveAfter,'2026-11-21T12:31:00.000Z');
  assert.throws(() => validateMarketInput({symbol:'BTCUSDT',direction:'SIDEWAYS',strikePrice:100000,closeAt:'2026-11-21T12:30:00Z'},now), /invalid_prediction_direction/);
  assert.throws(() => validateMarketInput({symbol:'BTCUSDT',direction:'ABOVE',strikePrice:0,closeAt:'2026-11-21T12:30:00Z'},now), /invalid_prediction_strike/);
  assert.throws(() => validateMarketInput({symbol:'BTCUSDT',direction:'ABOVE',strikePrice:100000,closeAt:'2026-11-21T12:30:30Z'},now), /minute_boundary/);
  assert.throws(() => validateMarketInput({symbol:'BTCUSDT',direction:'ABOVE',strikePrice:100000,closeAt:'2026-11-20T00:30:00Z'},now), /out_of_range/);
});

test('validates paper orders and client idempotency UUIDs', () => {
  const marketId='11111111-1111-4111-8111-111111111111';
  const clientOrderId='22222222-2222-4222-8222-222222222222';
  assert.deepEqual(validateOrderInput({marketId,clientOrderId,side:'YES',amount:25}),{marketId,clientOrderId,side:'YES',amount:'25.00'});
  assert.throws(() => validateOrderInput({marketId,clientOrderId,side:'LONG',amount:25}), /invalid_prediction_side/);
  assert.throws(() => validateOrderInput({marketId,clientOrderId,side:'YES',amount:1001}), /invalid_prediction_order_amount/);
  assert.throws(() => validateOrderInput({marketId,side:'YES',amount:25}), /invalid_prediction_client_order_id/);
});

test('resolves ABOVE inclusively and BELOW strictly at the published strike', () => {
  assert.equal(evaluateOutcome('ABOVE',100,100),true);
  assert.equal(evaluateOutcome('ABOVE',100,99.99),false);
  assert.equal(evaluateOutcome('BELOW',100,99.99),true);
  assert.equal(evaluateOutcome('BELOW',100,100),false);
  assert.throws(() => evaluateOutcome('UP',100,101), /invalid_prediction_resolution/);
});

test('accepts only the exact Binance one-minute candle open timestamp', () => {
  const openTime=1795262400000;
  assert.deepEqual(parseBinanceKline([[openTime,'100','102','99','101.5','10']],openTime),{openTime,close:101.5});
  assert.equal(parseBinanceKline([[openTime+60000,'100','102','99','101.5','10']],openTime),null);
  assert.equal(parseBinanceKline([],openTime),null);
});
