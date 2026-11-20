'use strict';

const SYMBOLS = Object.freeze({ BTCUSDT: 'BTC', ETHUSDT: 'ETH', BNBUSDT: 'BNB' });
const MIN_PRICE = 0.05;
const MAX_PRICE = 0.95;
const INITIAL_VIRTUAL_CREDITS = 10000;
const MAX_ORDER_CREDITS = 1000;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function quoteFromPools(yesPool, noPool) {
  const yes = Number(yesPool || 0), no = Number(noPool || 0);
  if (![yes, no].every(Number.isFinite) || yes < 0 || no < 0) throw new Error('invalid_prediction_pool');
  const yesPrice = clamp((yes + 1000) / (yes + no + 2000), MIN_PRICE, MAX_PRICE);
  return { yesPrice, noPrice: 1 - yesPrice };
}
function validateMarketInput(input, now = Date.now()) {
  const symbol = String(input && input.symbol || '').toUpperCase();
  const direction = String(input && input.direction || '').toUpperCase();
  const strike = Number(input && input.strikePrice);
  const closeAt = Date.parse(input && input.closeAt);
  if (!Object.hasOwn(SYMBOLS, symbol)) throw new Error('unsupported_prediction_symbol');
  if (!['ABOVE', 'BELOW'].includes(direction)) throw new Error('invalid_prediction_direction');
  if (!Number.isFinite(strike) || strike <= 0 || strike > 1e12) throw new Error('invalid_prediction_strike');
  if (!Number.isFinite(closeAt) || closeAt % 60000 !== 0) throw new Error('close_at_must_be_utc_minute_boundary');
  if (closeAt < now + 60 * 60 * 1000 || closeAt > now + 30 * 24 * 60 * 60 * 1000) throw new Error('prediction_close_at_out_of_range');
  return { symbol, baseAsset: SYMBOLS[symbol], direction, strikePrice: strike, closeAt: new Date(closeAt).toISOString(), resolveAfter: new Date(closeAt + 60000).toISOString() };
}
function validateOrderInput(input) {
  const marketId = String(input && input.marketId || '');
  const clientOrderId = String(input && input.clientOrderId || '');
  const side = String(input && input.side || '').toUpperCase();
  const amount = Number(input && input.amount);
  if (!/^[0-9a-f-]{36}$/i.test(marketId)) throw new Error('invalid_prediction_market_id');
  if (!/^[0-9a-f-]{36}$/i.test(clientOrderId)) throw new Error('invalid_prediction_client_order_id');
  if (!['YES', 'NO'].includes(side)) throw new Error('invalid_prediction_side');
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX_ORDER_CREDITS || Math.round(amount * 100) !== amount * 100) throw new Error('invalid_prediction_order_amount');
  return { marketId, clientOrderId, side, amount: amount.toFixed(2) };
}
function evaluateOutcome(direction, strike, resolutionPrice) {
  const s = Number(strike), p = Number(resolutionPrice);
  if (!['ABOVE', 'BELOW'].includes(direction) || !Number.isFinite(s) || !Number.isFinite(p) || s <= 0 || p <= 0) throw new Error('invalid_prediction_resolution');
  return direction === 'ABOVE' ? p >= s : p < s;
}
function parseBinanceKline(rows, expectedOpenTime) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0]) || rows[0].length < 5) return null;
  const row = rows[0], openTime = Number(row[0]), close = Number(row[4]);
  if (!Number.isSafeInteger(openTime) || openTime !== Number(expectedOpenTime) || !Number.isFinite(close) || close <= 0) return null;
  return { openTime, close };
}
module.exports = { SYMBOLS, MIN_PRICE, MAX_PRICE, INITIAL_VIRTUAL_CREDITS, MAX_ORDER_CREDITS, quoteFromPools, validateMarketInput, validateOrderInput, evaluateOutcome, parseBinanceKline };
