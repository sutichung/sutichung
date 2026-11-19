'use strict';

const MARKET_REGISTRY = Object.freeze([
  Object.freeze({ id: 'TW', name: '台灣市場', timezone: 'Asia/Taipei', assets: ['equity', 'etf', 'index', 'futures'], quoteConvention: 'TWD', providerPolicy: 'exchange_or_authorized_official' }),
  Object.freeze({ id: 'US', name: '美國市場', timezone: 'America/New_York', assets: ['equity', 'etf', 'index', 'options', 'futures'], quoteConvention: 'USD', providerPolicy: 'exchange_or_authorized_official' }),
  Object.freeze({ id: 'CRYPTO', name: '加密貨幣市場', timezone: 'UTC', assets: ['spot', 'perpetual', 'futures'], quoteConvention: 'quote_asset', providerPolicy: 'exchange_api_with_license_review' })
]);

const MARKET_IDS = new Set(MARKET_REGISTRY.map(item => item.id));

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 1e12 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeMarketQuote(market, quote = {}) {
  const marketId = String(market || '').trim().toUpperCase();
  if (!MARKET_IDS.has(marketId)) throw new TypeError('unsupported_market');
  const symbol = String(quote.symbol || quote.code || '').trim();
  if (!symbol) throw new TypeError('quote_symbol_required');
  const price = finiteNumber(quote.price ?? quote.last ?? quote.close);
  const explicitRealtime = quote.realtime === true && String(quote.dataMode || '').toUpperCase() === 'REALTIME';
  const delayed = quote.delayed === true || !explicitRealtime;
  return {
    market: marketId,
    symbol,
    name: quote.name ? String(quote.name) : null,
    price,
    open: finiteNumber(quote.open),
    high: finiteNumber(quote.high),
    low: finiteNumber(quote.low),
    close: finiteNumber(quote.close),
    volume: finiteNumber(quote.volume),
    change: finiteNumber(quote.change),
    changePct: finiteNumber(quote.changePct),
    currency: quote.currency ? String(quote.currency) : null,
    timestamp: normalizeTimestamp(quote.timestamp ?? quote.asOf ?? quote.updatedAt),
    source: quote.source ? String(quote.source) : null,
    dataMode: explicitRealtime ? 'REALTIME' : (quote.dataMode ? String(quote.dataMode).toUpperCase() : 'UNKNOWN'),
    realtime: explicitRealtime,
    delayed,
    stale: quote.stale === true
  };
}

function createMarketEnvelope({ market, source, fetchedAt = new Date().toISOString(), data = [], errors = [] }) {
  const marketId = String(market || '').trim().toUpperCase();
  if (!MARKET_IDS.has(marketId)) throw new TypeError('unsupported_market');
  return {
    market: marketId,
    source: source || null,
    fetchedAt: normalizeTimestamp(fetchedAt),
    count: Array.isArray(data) ? data.length : 0,
    data: Array.isArray(data) ? data : [],
    errors: Array.isArray(errors) ? errors : []
  };
}

function getMarketRegistry() {
  return {
    version: 1,
    schema: {
      quote: ['market', 'symbol', 'name', 'price', 'open', 'high', 'low', 'close', 'volume', 'change', 'changePct', 'currency', 'timestamp', 'source', 'dataMode', 'realtime', 'delayed', 'stale'],
      envelope: ['market', 'source', 'fetchedAt', 'count', 'data', 'errors']
    },
    markets: MARKET_REGISTRY
  };
}

module.exports = { MARKET_REGISTRY, normalizeMarketQuote, createMarketEnvelope, getMarketRegistry };
