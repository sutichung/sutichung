'use strict';

// Research-only, deterministic OHLCV feature and execution engine.
// Signals are generated from a completed bar and filled no earlier than the next bar open.
function assertBars(bars) {
  if (!Array.isArray(bars) || bars.length < 35) throw new Error('At least 35 OHLCV bars are required');
  for (const [i, b] of bars.entries()) {
    for (const k of ['open', 'high', 'low', 'close', 'volume']) {
      if (!Number.isFinite(Number(b[k]))) throw new Error(`Invalid ${k} at bar ${i}`);
    }
    if (b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high) || b.volume < 0) {
      throw new Error(`Invalid OHLCV range at bar ${i}`);
    }
  }
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
function ema(values, period) {
  const out = Array(values.length).fill(null), alpha = 2 / (period + 1);
  let prev = null;
  values.forEach((v, i) => { prev = prev === null ? v : alpha * v + (1 - alpha) * prev; if (i >= period - 1) out[i] = prev; });
  return out;
}
function buildFeatures(bars) {
  assertBars(bars);
  const c = bars.map(x => Number(x.close)), features = [];
  const e12 = ema(c, 12), e26 = ema(c, 26);
  for (let i = 20; i < bars.length; i++) {
    const b = bars[i], prev = bars[i - 1], returns = c.slice(Math.max(1, i - 19), i + 1).map((v, j, a) => j ? v / a[j - 1] - 1 : null).filter(Number.isFinite);
    const avgVol = mean(bars.slice(i - 19, i + 1).map(x => Number(x.volume)));
    const range = Math.max(1e-12, b.high - b.low);
    const bodyTop = Math.max(b.open, b.close), bodyBottom = Math.min(b.open, b.close);
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
    const gains = [], losses = [];
    for (let j = Math.max(1, i - 13); j <= i; j++) { const d = c[j] - c[j - 1]; gains.push(Math.max(0, d)); losses.push(Math.max(0, -d)); }
    const avgGain = mean(gains), avgLoss = mean(losses);
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    const closes20 = c.slice(i - 19, i + 1), mid = mean(closes20), sd = std(closes20);
    const priceChange = c[i] / c[i - 1] - 1;
    features.push({
      index: i, timestamp: b.timestamp ?? b.time ?? null,
      rsi14: rsi, macd: e12[i] - e26[i],
      upperShadow: (b.high - bodyTop) / Math.max(1e-12, b.close),
      lowerShadow: (bodyBottom - b.low) / Math.max(1e-12, b.close),
      volumeRatio20: avgVol ? b.volume / avgVol : 0,
      priceChange, bbWidth20: (4 * sd) / Math.max(1e-12, mid),
      atr14: tr, volatility20: std(returns),
      // A volume/low-price-response proxy only; it is NOT proof of institutional accumulation.
      volumePriceAbsorptionProxy: (avgVol ? b.volume / avgVol : 0) / (Math.abs(priceChange) + 1e-4)
    });
  }
  return features;
}

// probabilities[i] is the model's estimate made after bar i closes.
// The order is executed at bar i+1 open. No same-close fills.
function backtestNextOpen(bars, probabilities, options = {}) {
  assertBars(bars);
  const { buyThreshold = 0.53, sellThreshold = 0.47, feeRate = 0.001,
    slippageRate = 0.0005, stopAtrMultiple = 2, initialCapital = 100000,
    maxInvestFraction = 0.95 } = options;
  for (const [k, v] of Object.entries({ buyThreshold, sellThreshold, feeRate, slippageRate, stopAtrMultiple, initialCapital, maxInvestFraction })) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid option: ${k}`);
  }
  if (buyThreshold <= sellThreshold || feeRate > 0.1 || slippageRate > 0.1 || maxInvestFraction > 1) throw new Error('Invalid thresholds or cost settings');
  if (!Array.isArray(probabilities) || probabilities.length !== bars.length) throw new Error('probabilities must align with bars');
  let cash = initialCapital, qty = 0, entry = 0, stop = 0, entryCost = 0;
  const trades = [], equity = [];
  const cost = feeRate + slippageRate;
  for (let i = 0; i < bars.length - 1; i++) {
    const bar = bars[i], next = bars[i + 1], p = probabilities[i];
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`Invalid probability at bar ${i}`);
    const atr = buildAtrAt(bars, i);
    const nextOpen = Number(next.open);
    // Existing stop is evaluated against the next bar range; gaps fill at open, otherwise at stop.
    if (qty > 0 && (nextOpen <= stop || next.low <= stop)) {
      const rawExit = nextOpen <= stop ? nextOpen : stop;
      const proceeds = qty * rawExit * (1 - cost);
      cash += proceeds;
      trades.push({ entry, exit: rawExit, netPnl: proceeds - entryCost, reason: 'ATR_STOP' });
      qty = 0; entry = 0; stop = 0; entryCost = 0;
    } else if (qty > 0 && p < sellThreshold) {
      const fill = nextOpen * (1 - slippageRate);
      const proceeds = qty * fill * (1 - feeRate);
      cash += proceeds;
      trades.push({ entry, exit: fill, netPnl: proceeds - entryCost, reason: 'MODEL_EXIT' });
      qty = 0; entry = 0; stop = 0; entryCost = 0;
    } else if (qty === 0 && p > buyThreshold && atr > 0) {
      const budget = cash * maxInvestFraction;
      const fill = nextOpen * (1 + slippageRate);
      const units = (budget * (1 - feeRate)) / fill;
      const spent = units * fill * (1 + feeRate);
      qty = units; cash -= spent; entry = fill; entryCost = spent;
      stop = fill - stopAtrMultiple * atr;
    }
    equity.push(cash + qty * Number(next.close));
  }
  const last = bars[bars.length - 1];
  const finalEquity = cash + qty * Number(last.close);
  const curve = [initialCapital, ...equity, finalEquity];
  let peak = curve[0], maxDrawdown = 0;
  for (const value of curve) { peak = Math.max(peak, value); maxDrawdown = Math.min(maxDrawdown, value / peak - 1); }
  const wins = trades.filter(t => t.netPnl > 0).length;
  const returns = curve.slice(1).map((v, i) => i ? v / curve[i] - 1 : v / curve[0] - 1);
  const avg = returns.length ? mean(returns) : 0, volatility = returns.length ? std(returns) : 0;
  return {
    initialCapital, finalEquity, totalReturnPct: (finalEquity / initialCapital - 1) * 100,
    buyHoldReturnPct: (Number(last.close) / Number(bars[0].close) - 1) * 100,
    maxDrawdownPct: maxDrawdown * 100, tradeCount: trades.length,
    winRatePct: trades.length ? wins / trades.length * 100 : 0,
    profitFactor: profitFactor(trades), sharpeAnnualized: volatility ? avg / volatility * Math.sqrt(252) : 0,
    openPosition: qty > 0 ? { quantity: qty, entryPrice: entry, stopPrice: stop, unrealizedPnl: qty * Number(last.close) - entryCost } : null,
    trades, equityCurve: curve
  };
}
function buildAtrAt(bars, i) {
  const start = Math.max(1, i - 13), trs = [];
  for (let j = start; j <= i; j++) trs.push(Math.max(bars[j].high - bars[j].low, Math.abs(bars[j].high - bars[j - 1].close), Math.abs(bars[j].low - bars[j - 1].close)));
  return trs.length ? mean(trs) : 0;
}
function profitFactor(trades) {
  const wins = trades.filter(t => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const losses = -trades.filter(t => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0);
  return losses ? wins / losses : wins > 0 ? null : 0;
}
module.exports = { buildFeatures, backtestNextOpen, assertBars };
