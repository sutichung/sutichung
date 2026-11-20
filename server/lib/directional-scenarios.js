'use strict';

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function ema(values, period) {
  if (values.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = mean(values.slice(0, period));
  for (let i = period; i < values.length; i++) value = values[i] * alpha + value * (1 - alpha);
  return value;
}
function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    gain += Math.max(0, delta); loss += Math.max(0, -delta);
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, delta)) / period;
    loss = (loss * (period - 1) + Math.max(0, -delta)) / period;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
function validateCandles(input) {
  if (!Array.isArray(input) || input.length < 60) return { ok: false, reason: '至少需要 60 根有效 K 線' };
  const rows = input.map((row, index) => {
    const open = Number(row.open), high = Number(row.high), low = Number(row.low), close = Number(row.close), volume = Number(row.volume);
    if (![open, high, low, close, volume].every(Number.isFinite) || Math.min(open, high, low, close) <= 0 || volume < 0 ||
      high < Math.max(open, close, low) || low > Math.min(open, close, high)) return { invalidIndex: index };
    const time = row.time || row.timestamp || null;
    return { open, high, low, close, volume, time };
  });
  const invalid = rows.find(row => row.invalidIndex !== undefined);
  if (invalid) return { ok: false, reason: 'OHLCV 欄位無效或價格高低關係不成立', invalidIndex: invalid.invalidIndex };
  for (let i = 1; i < rows.length; i++) {
    const previous = Date.parse(rows[i - 1].time || '');
    const current = Date.parse(rows[i].time || '');
    if (Number.isFinite(previous) && Number.isFinite(current) && current <= previous) return { ok: false, reason: 'K 線時間必須嚴格遞增', invalidIndex: i };
  }
  return { ok: true, rows };
}
function analyzeDirectionalScenarios(input, options = {}) {
  const checked = validateCandles(input);
  if (!checked.ok) return { status: 'insufficient_data', label: '資料不足，暫不判讀', reason: checked.reason, invalidIndex: checked.invalidIndex ?? null, scenarios: [] };
  const candles = checked.rows, closes = candles.map(x => x.close), last = candles.at(-1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), momentum = rsi(closes, 14);
  const trueRanges = candles.slice(1).map((c, i) => Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close)));
  const atr = mean(trueRanges.slice(-14));
  const averageVolume = mean(candles.slice(-21, -1).map(x => x.volume));
  const volumeRatio = averageVolume > 0 ? last.volume / averageVolume : null;
  const support = Math.min(...candles.slice(-20).map(x => x.low));
  const resistance = Math.max(...candles.slice(-20).map(x => x.high));
  const price = last.close;
  const bull = [], bear = [], neutral = [];
  let bullScore = 0, bearScore = 0;
  if (price > e20) { bullScore += 20; bull.push('收盤價位於 EMA20 上方'); } else { bearScore += 20; bear.push('收盤價位於 EMA20 下方'); }
  if (e20 > e50) { bullScore += 20; bull.push('EMA20 高於 EMA50'); } else { bearScore += 20; bear.push('EMA20 低於 EMA50'); }
  if (momentum >= 55) { bullScore += 15; bull.push('RSI 動能偏強'); } else if (momentum <= 45) { bearScore += 15; bear.push('RSI 動能偏弱'); } else neutral.push('RSI 位於中性區');
  if (volumeRatio !== null && volumeRatio >= 1.5) {
    if (price >= last.open) { bullScore += 10; bull.push('上漲伴隨量能放大'); }
    else { bearScore += 10; bear.push('下跌伴隨量能放大'); }
  } else neutral.push('成交量未達近期均量 1.5 倍，量能確認有限');
  const totalEvidence = 4;
  const confidence = Math.round(([e20, e50, momentum, volumeRatio].filter(finite).length / totalEvidence) * 100);
  const direction = bullScore - bearScore >= 20 ? '偏多觀察' : bearScore - bullScore >= 20 ? '偏空觀察' : '中性觀望';
  const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 86400000;
  const asOf = last.time ? new Date(last.time).toISOString() : null;
  const ageMs = asOf ? Date.now() - Date.parse(asOf) : null;
  const maxAgeMs = Number(options.maxAgeMs) > 0 ? Number(options.maxAgeMs) : intervalMs * 2.5;
  const fresh = ageMs !== null && ageMs >= 0 && ageMs <= maxAgeMs;
  const stale = !fresh;
  const round = value => Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  const makeScenario = (id, title, score, evidence, trigger, invalidation, response, target, stop) => ({
    id, title, score: Math.min(100, score), evidence, trigger, invalidation, response,
    targetPrice: round(target), stopPrice: round(stop)
  });
  const scenarios = [
    makeScenario('bullish', '偏多情境', bullScore, bull,
      '收盤有效站上近 20 根高點，且下一根 K 線未跌回突破位；需以收盤確認',
      '收盤跌破 EMA20 或跌破最近 20 根低點，原偏多假設失效',
      '等待突破確認；若量能不足或價格重新跌回區間，不追價',
      resistance + atr, price - 1.5 * atr),
    makeScenario('bearish', '偏空情境', bearScore, bear,
      '收盤有效跌破近 20 根低點，且下一根 K 線未收復跌破位；需以收盤確認',
      '收盤重新站回 EMA20 並突破近 20 根高點，原偏空假設失效',
      '等待跌破確認；若快速收復區間，取消偏空假設',
      support - atr, price + 1.5 * atr),
    makeScenario('neutral', '盤整情境', Math.max(0, 100 - Math.abs(bullScore - bearScore)), neutral,
      '價格持續在近 20 根支撐與壓力之間，且 EMA20／EMA50 方向不一致',
      '有效收盤突破區間上緣或跌破區間下緣',
      '區間未被有效突破前保持觀察，避免在區間中央追價',
      resistance, support)
  ];
  return {
    status: stale ? 'stale_data' : 'ok',
    label: stale ? '行情過期或時間缺漏，暫停方向判讀' : direction,
    direction: stale ? '資料不足' : direction,
    score: stale ? null : Math.max(bullScore, bearScore),
    confidence: stale ? 0 : confidence,
    confidenceMeaning: '資料因子覆蓋率，不是勝率或預測機率',
    source: options.source || 'provided OHLCV',
    symbol: options.symbol || null,
    interval: options.interval || null,
    asOf,
    receivedAt: new Date().toISOString(),
    freshness: { fresh, ageMs, maxAgeMs },
    metrics: { price: round(price), ema20: round(e20), ema50: round(e50), rsi14: round(momentum), atr14: round(atr), volumeRatio: round(volumeRatio), support20: round(support), resistance20: round(resistance) },
    scenarios: stale ? [] : scenarios,
    evidence: { bullish: bull, bearish: bear, neutral },
    safety: { liveTrading: false, modelProbability: false, syntheticData: false },
    disclaimer: '此模組是可解釋的規則式研究判讀，不是 AI 勝率預測或交易指令。目標與停損為 ATR 情境參考，未模擬跳空、流動性、滑價及個別商品交易限制；未經樣本外驗證不得自動進入實盤。'
  };
}
module.exports = { analyzeDirectionalScenarios, validateCandles, ema, rsi };
