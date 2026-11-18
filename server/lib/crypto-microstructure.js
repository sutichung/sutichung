'use strict';

const now = () => new Date().toISOString();
const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
async function getJson(url, timeoutMs = 10000) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'TaiwanStockHunter/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('upstream_http_' + response.status);
  return response.json();
}
function normalizeBook(exchange, bids, asks, timestamp, depth = 10, { notionalAvailable = true } = {}) {
  const clean = rows => (rows || []).map(x => [number(x[0]), number(x[1])])
    .filter(x => x[0] !== null && x[1] !== null && x[0] > 0 && x[1] > 0);
  const bidRows = clean(bids).sort((a, b) => b[0] - a[0]).slice(0, depth);
  const askRows = clean(asks).sort((a, b) => a[0] - b[0]).slice(0, depth);
  if (!bidRows.length || !askRows.length) throw new Error('orderbook_empty');
  const bid = bidRows[0][0], ask = askRows[0][0];
  if (!(ask > bid)) throw new Error('orderbook_crossed_or_invalid');
  const mid = (bid + ask) / 2;
  const bidVolume = bidRows.reduce((sum, x) => sum + x[1], 0);
  const askVolume = askRows.reduce((sum, x) => sum + x[1], 0);
  const total = bidVolume + askVolume;
  const weighted = rows => rows.reduce((sum, x, i) => sum + x[1] / (i + 1), 0);
  const weightedBid = weighted(bidRows), weightedAsk = weighted(askRows), weightedTotal = weightedBid + weightedAsk;
  const bidNotional = bidRows.reduce((sum, x) => sum + x[0] * x[1], 0);
  const askNotional = askRows.reduce((sum, x) => sum + x[0] * x[1], 0);
  const notionalTotal = bidNotional + askNotional;
  const bestBidSize = bidRows[0][1], bestAskSize = askRows[0][1];
  const microPrice = (ask * bestBidSize + bid * bestAskSize) / (bestBidSize + bestAskSize);
  const availableLevels = Math.min(bidRows.length, askRows.length);
  const depthBands = [5, 10, 20].filter(levels => levels <= availableLevels).map(levels => {
    const b = bidRows.slice(0, levels).reduce((sum, x) => sum + x[1], 0);
    const a = askRows.slice(0, levels).reduce((sum, x) => sum + x[1], 0);
    return { levels, bid: b, ask: a, imbalance: b + a > 0 ? (b - a) / (b + a) : null };
  });
  return {
    exchange, bids: bidRows, asks: askRows, bestBid: bid, bestAsk: ask,
    bestBidSize, bestAskSize, midPrice: mid, microPrice,
    microPriceDeviationBps: mid > 0 ? (microPrice - mid) / mid * 10000 : null,
    spreadPct: mid > 0 ? (ask - bid) / mid * 100 : null,
    bidDepth: bidVolume, askDepth: askVolume,
    obi: total > 0 ? (bidVolume - askVolume) / total : null,
    weightedObi: weightedTotal > 0 ? (weightedBid - weightedAsk) / weightedTotal : null,
    obiNotional: notionalAvailable && notionalTotal > 0 ? (bidNotional - askNotional) / notionalTotal : null,
    depthBands,
    timestamp: timestamp && Number.isFinite(Number(timestamp)) ? new Date(Number(timestamp)).toISOString() : null,
    receivedAt: now(), depth: Math.min(depth, Math.min(bidRows.length, askRows.length))
  };
}
function normalizeTrades(exchange, rows, thresholdUsd = 50000) {
  return (rows || []).map(t => {
    const price = number(t.price), amount = number(t.amount), side = t.side;
    const cost = number(t.cost) ?? (price !== null && amount !== null ? price * amount : null);
    const quoteCurrency = String(t.quoteCurrency || 'USDT').toUpperCase();
    const usdComparable = ['USD','USDT','USDC','BUSD','FDUSD','TUSD'].includes(quoteCurrency) && t.whaleClassificationAvailable !== false;
    return {
      id: t.id == null ? null : String(t.id), timestamp: number(t.timestamp),
      side: side === 'buy' || side === 'sell' ? side : null,
      price, amount, quoteCurrency, quoteValue: cost, large: usdComparable && cost !== null ? cost >= thresholdUsd : null
    };
  }).filter(t => t.price > 0 && t.amount > 0)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 100);
}
async function fetchMicrostructure({ exchange = 'Binance', symbol, marketType = 'perpetual', depth = 10, whaleThresholdUsd = 50000 }) {
  const safeSymbol = String(symbol || '').toUpperCase();
  if (!/^[A-Z0-9-]{2,30}$/.test(safeSymbol)) throw new Error('invalid_symbol');
  const levels = Math.min(50, Math.max(5, Number(depth) || 10));
  const base = safeSymbol.replace(/(USDT|USDC|USD|BTC|ETH)$/, '');
  const quoteCurrency = safeSymbol.includes('-') ? safeSymbol.split('-')[1] : (base ? safeSymbol.slice(base.length) : '');
  const whaleClassificationAvailable = ['USD','USDT','USDC','BUSD','FDUSD','TUSD'].includes(quoteCurrency) && !(exchange === 'OKX' && marketType === 'perpetual');
  let book, trades, source;
  if (exchange === 'Binance') {
    const host = marketType === 'perpetual' ? 'https://fapi.binance.com' : 'https://api.binance.com';
    const path = marketType === 'perpetual' ? '/fapi/v1' : '/api/v3';
    const [b, t] = await Promise.all([
      getJson(host + path + '/depth?' + new URLSearchParams({ symbol: safeSymbol, limit: String(levels) })),
      getJson(host + path + '/trades?' + new URLSearchParams({ symbol: safeSymbol, limit: '100' }))
    ]);
    book = normalizeBook(exchange, b.bids, b.asks, null, levels);
    trades = normalizeTrades(exchange, t.map(x => ({ id: x.id, timestamp: x.time, side: x.isBuyerMaker ? 'sell' : 'buy', price: x.price, amount: x.qty, quoteCurrency, whaleClassificationAvailable })), whaleThresholdUsd);
    source = 'Binance public REST order book + recent trades';
  } else if (exchange === 'Bybit') {
    const category = marketType === 'perpetual' ? 'linear' : 'spot';
    const [b, t] = await Promise.all([
      getJson('https://api.bybit.com/v5/market/orderbook?' + new URLSearchParams({ category, symbol: safeSymbol, limit: String(levels) })),
      getJson('https://api.bybit.com/v5/market/recent-trade?' + new URLSearchParams({ category, symbol: safeSymbol, limit: '100' }))
    ]);
    if (b.retCode !== 0 || t.retCode !== 0) throw new Error(b.retMsg || t.retMsg || 'bybit_api_error');
    book = normalizeBook(exchange, b.result?.b || [], b.result?.a || [], b.result?.ts, levels);
    trades = normalizeTrades(exchange, (t.result?.list || []).map(x => ({ id: x.execId, timestamp: Number(x.time), side: String(x.side).toLowerCase(), price: x.price, amount: x.size, quoteCurrency, whaleClassificationAvailable })), whaleThresholdUsd);
    source = 'Bybit V5 public order book + recent trades';
  } else if (exchange === 'OKX') {
    const instId = safeSymbol.includes('-') ? safeSymbol : safeSymbol.replace(/(USDT|USDC|USD)$/, '-$1') + (marketType === 'perpetual' ? '-SWAP' : '');
    const [b, t] = await Promise.all([
      getJson('https://www.okx.com/api/v5/market/books?' + new URLSearchParams({ instId, sz: String(levels) })),
      getJson('https://www.okx.com/api/v5/market/trades?' + new URLSearchParams({ instId, limit: '100' }))
    ]);
    if (b.code !== '0' || t.code !== '0') throw new Error(b.msg || t.msg || 'okx_api_error');
    const row = b.data?.[0];
    book = normalizeBook(exchange, row?.bids || [], row?.asks || [], row?.ts, levels, { notionalAvailable: !(marketType === 'perpetual') });
    trades = normalizeTrades(exchange, (t.data || []).map(x => ({ id: x.tradeId, timestamp: Number(x.ts), side: x.side, price: x.px, amount: x.sz, quoteCurrency, whaleClassificationAvailable })), whaleThresholdUsd);
    source = 'OKX public order book + recent trades';
  } else {
    throw new Error('unsupported_exchange');
  }
  const largeTrades = trades.filter(x => x.large === true);
  const buyValue = trades.filter(x => x.side === 'buy').reduce((s, x) => s + (x.quoteValue || 0), 0);
  const sellValue = trades.filter(x => x.side === 'sell').reduce((s, x) => s + (x.quoteValue || 0), 0);
  const knownSideTrades = trades.filter(x => x.side === 'buy' || x.side === 'sell');
  const knownSideValue = buyValue + sellValue;
  const notionalAvailable = !(exchange === 'OKX' && marketType === 'perpetual');
  return {
    exchange, symbol: safeSymbol, marketType, source, timestamp: book.timestamp,
    receivedAt: now(), book,
    tape: { count: trades.length, knownSideCount: knownSideTrades.length, largeTradeCount: whaleClassificationAvailable ? largeTrades.length : null, largeTrades: whaleClassificationAvailable ? largeTrades.slice(0, 20) : [], whaleClassificationAvailable, quoteCurrency, buyQuoteValue: notionalAvailable ? buyValue : null, sellQuoteValue: notionalAvailable ? sellValue : null, netAggressiveQuoteValue: notionalAvailable ? buyValue - sellValue : null, aggressiveBuyPct: notionalAvailable && knownSideValue > 0 ? buyValue / knownSideValue * 100 : null, tradeImbalance: notionalAvailable && knownSideValue > 0 ? (buyValue - sellValue) / knownSideValue : null, whaleThresholdUsd: whaleClassificationAvailable ? whaleThresholdUsd : null }
  };
}
module.exports = { fetchMicrostructure, normalizeBook, normalizeTrades };
