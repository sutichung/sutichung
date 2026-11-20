'use strict';

// Stateful scorer for normalized exchange ticker/WebSocket events.
// This module does not open exchange connections or place orders.
const DEFAULTS = Object.freeze({
  historySize: 60,
  minSamples: 5,
  maxAgeMs: 60_000,
  momentumWindow: 5,
  momentumThresholdPct: 0.4,
  tightSpreadBps: 3,
  wideSpreadBps: 15,
  strongChangePct: 3,
  volumeLookback: 20,
  volumeSpikeMultiple: 2
});

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

class CryptoLiveScorer {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.history = new Map();
  }

  update(event, receivedAt = Date.now()) {
    if (!event || typeof event !== 'object') throw new TypeError('ticker_event_required');
    const symbol = String(event.symbol || '').trim().toUpperCase();
    const exchange = String(event.exchange || '').trim();
    const marketType = String(event.marketType || 'spot').trim().toLowerCase();
    const last = Number(event.last ?? event.price);
    const timestamp = Number(event.timestamp);
    if (!symbol || !exchange || !finitePositive(last)) throw new TypeError('ticker_identity_and_positive_price_required');
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new TypeError('source_timestamp_required');
    const ageMs = receivedAt - timestamp;
    if (ageMs < -60_000 || ageMs > this.options.maxAgeMs) {
      return { eligible: false, status: 'stale', symbol, exchange, marketType, ageMs, score: null, reasons: ['來源時間戳過期或超前'] };
    }

    const key = [exchange, marketType, symbol].join(':');
    const rows = this.history.get(key) || [];
    const previous = rows[rows.length - 1];
    if (previous && timestamp <= previous.timestamp) {
      return { eligible: false, status: 'duplicate_or_out_of_order', symbol, exchange, marketType, ageMs, score: null, reasons: ['忽略重複或倒序行情'] };
    }

    const bid = Number(event.bid);
    const ask = Number(event.ask);
    const changePct = Number(event.changePct);
    const quoteVolume = Number(event.intervalQuoteVolume);
    const sample = {
      timestamp, last,
      quoteVolume: finitePositive(quoteVolume) ? quoteVolume : null
    };
    rows.push(sample);
    while (rows.length > this.options.historySize) rows.shift();
    this.history.set(key, rows);

    let score = 0;
    const reasons = [];
    let momentumPct = null;
    if (rows.length >= this.options.momentumWindow) {
      const base = rows[rows.length - this.options.momentumWindow].last;
      momentumPct = (last - base) / base * 100;
      if (momentumPct >= this.options.momentumThresholdPct) {
        score += 1.2;
        reasons.push('短期動能 +' + momentumPct.toFixed(2) + '%');
      } else if (momentumPct <= -this.options.momentumThresholdPct) {
        score -= 1.2;
        reasons.push('短期動能 ' + momentumPct.toFixed(2) + '%');
      }
    }

    let spreadBps = null;
    if (finitePositive(bid) && finitePositive(ask) && ask >= bid) {
      spreadBps = (ask - bid) / last * 10_000;
      if (spreadBps <= this.options.tightSpreadBps) {
        score += 0.5;
        reasons.push('買賣價差緊密');
      } else if (spreadBps >= this.options.wideSpreadBps) {
        score -= 1;
        reasons.push('買賣價差偏寬');
      }
    }

    if (Number.isFinite(changePct)) {
      if (changePct >= this.options.strongChangePct) {
        score += 0.5;
        reasons.push('24 小時漲幅偏強');
      } else if (changePct <= -this.options.strongChangePct) {
        score -= 0.5;
        reasons.push('24 小時跌幅偏弱');
      }
    }

    const priorVolumes = rows.slice(0, -1).slice(-this.options.volumeLookback)
      .map(x => x.quoteVolume).filter(finitePositive);
    const baselineVolume = median(priorVolumes);
    let volumeMultiple = null;
    if (sample.quoteVolume !== null && baselineVolume !== null && baselineVolume > 0) {
      volumeMultiple = sample.quoteVolume / baselineVolume;
      if (volumeMultiple >= this.options.volumeSpikeMultiple) {
        score += 0.8;
        reasons.push('單根已完成 K 線成交額達近期中位數 ' + volumeMultiple.toFixed(2) + ' 倍');
      }
    }

    return {
      eligible: true, status: 'ok', symbol, exchange, marketType,
      sourceTimestamp: new Date(timestamp).toISOString(),
      receivedAt: new Date(receivedAt).toISOString(),
      ageMs, last, score: Number(score.toFixed(2)),
      momentumPct, spreadBps, volumeMultiple,
      sampleCount: rows.length,
      reasons: reasons.length ? reasons : ['中性；尚無明確觸發條件']
    };
  }

  reset(key) {
    if (key) this.history.delete(key);
    else this.history.clear();
  }
}

module.exports = { CryptoLiveScorer, DEFAULTS, median };
