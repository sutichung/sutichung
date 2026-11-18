'use strict';

const FALLBACK_EXCHANGES = ['Binance', 'Bybit', 'OKX'];

async function loadRiskHistory({ getHistory, symbol, marketType = 'spot', interval = '1d', exchange = 'Binance', nativeSymbol = symbol, minimumCandles = 22 }) {
  if (typeof getHistory !== 'function') throw new TypeError('getHistory must be a function');
  const errors = [];
  const candidates = [exchange, ...FALLBACK_EXCHANGES.filter(x => x !== exchange)];
  for (const candidate of candidates) {
    try {
      const candidateSymbol = candidate === exchange ? (nativeSymbol || symbol) : symbol;
      const history = await getHistory(symbol, marketType, interval, candidate, candidateSymbol);
      const count = Array.isArray(history?.data) ? history.data.length : 0;
      if (count < minimumCandles) throw new Error('insufficient_candles_' + count);
      return {
        status: candidate === exchange ? 'connected' : 'fallback',
        history,
        exchange: candidate,
        fallbackFrom: candidate === exchange ? null : exchange,
        errors
      };
    } catch (error) {
      errors.push({ exchange: candidate, message: String(error?.message || error).slice(0, 240) });
    }
  }
  return { status: 'unavailable', history: null, exchange: null, fallbackFrom: exchange, errors };
}

module.exports = { loadRiskHistory, FALLBACK_EXCHANGES };
