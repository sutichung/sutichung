'use strict';

const now = () => new Date().toISOString();
const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
function safeIsoTimestamp(value) {
  const n = number(value);
  if (n === null || n <= 0) return null;
  // Exchange APIs normally return milliseconds; tolerate second-based feeds too.
  const ms = n < 1e11 ? n * 1000 : n;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
async function getJson(url, timeoutMs = 10000) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'TaiwanStockHunter/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('upstream_http_' + response.status);
  return response.json();
}
function normalizeBook(exchange, bids, asks, timestamp, depth = 10) {
  const requestedDepth = Number.isFinite(Number(depth)) ? Math.min(50, Math.max(1, Math.floor(Number(depth)))) : 10;
  const clean = (rows, side) => (Array.isArray(rows) ? rows : [])
    .map(x => [number(x?.[0]), number(x?.[1])])
    .filter(x => x[0] !== null && x[1] !== null && x[0] > 0 && x[1] > 0)
    .sort((a, b) => side === 'bid' ? b[0] - a[0] : a[0] - b[0])
    .slice(0, requestedDepth);
  const bidRows = clean(bids, 'bid'), askRows = clean(asks, 'ask');
  if (!bidRows.length || !askRows.length) throw new Error('orderbook_empty');
  const bid = bidRows[0][0], ask = askRows[0][0];
  if (!(ask > bid)) throw new Error('orderbook_crossed');
  const mid = (bid + ask) / 2;
  const bidVolume = bidRows.reduce((sum, x) => sum + x[1], 0);
  const askVolume = askRows.reduce((sum, x) => sum + x[1], 0);
  const bidNotional = bidRows.reduce((sum, x) => sum + x[0] * x[1], 0);
  const askNotional = askRows.reduce((sum, x) => sum + x[0] * x[1], 0);
  const total = bidVolume + askVolume;
  const totalNotional = bidNotional + askNotional;
  return {
    exchange, bids: bidRows, asks: askRows, bestBid: bid, bestAsk: ask,
    midPrice: mid, spreadPct: mid > 0 ? (ask - bid) / mid * 100 : null,
    bidDepth: bidVolume, askDepth: askVolume,
    bidNotional, askNotional,
    obi: total > 0 ? (bidVolume - askVolume) / total : null,
    obiNotional: totalNotional > 0 ? (bidNotional - askNotional) / totalNotional : null,
    timestamp: safeIsoTimestamp(timestamp),
    receivedAt: now(), depth: Math.min(requestedDepth, Math.min(bidRows.length, askRows.length))
  };
}
function normalizeTrades(exchange, rows, thresholdUsd = 50000) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).map(t => {
    const price = number(t.price), amount = number(t.amount), side = t.side;
    const cost = number(t.cost) ?? (price !== null && amount !== null ? price * amount : null);
    const quoteCurrency = String(t.quoteCurrency || 'USDT').toUpperCase();
    const usdComparable = ['USD','USDT','USDC','BUSD','FDUSD','TUSD'].includes(quoteCurrency) && t.whaleClassificationAvailable !== false;
    const timestamp = number(t.timestamp);
    const id = t.id == null ? null : String(t.id);
    return {
      id, timestamp, side: side === 'buy' || side === 'sell' ? side : null,
      price, amount, quoteCurrency, quoteValue: cost,
      large: usdComparable && cost !== null ? cost >= thresholdUsd : null
    };
  }).filter(t => t.price > 0 && t.amount > 0)
    .filter(t => {
      const key = t.id !== null
        ? 'id:' + t.id
        : [t.timestamp, t.side, t.price, t.amount].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
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
    book = normalizeBook(exchange, b.result?.b || [], b.result?.a || [], b.time, levels);
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
    book = normalizeBook(exchange, row?.bids || [], row?.asks || [], row?.ts, levels);
    trades = normalizeTrades(exchange, (t.data || []).map(x => ({ id: x.tradeId, timestamp: Number(x.ts), side: x.side, price: x.px, amount: x.sz, quoteCurrency, whaleClassificationAvailable })), whaleThresholdUsd);
    source = 'OKX public order book + recent trades';
  } else {
    throw new Error('unsupported_exchange');
  }
  const largeTrades = trades.filter(x => x.large === true);
  const buyValue = trades.filter(x => x.side === 'buy').reduce((s, x) => s + (x.quoteValue || 0), 0);
  const sellValue = trades.filter(x => x.side === 'sell').reduce((s, x) => s + (x.quoteValue || 0), 0);
  const notionalAvailable = !(exchange === 'OKX' && marketType === 'perpetual');
  return {
    exchange, symbol: safeSymbol, marketType, source, timestamp: book.timestamp,
    receivedAt: now(), book,
    tape: { count: trades.length, largeTradeCount: whaleClassificationAvailable ? largeTrades.length : null, largeTrades: whaleClassificationAvailable ? largeTrades.slice(0, 20) : [], whaleClassificationAvailable, quoteCurrency, buyQuoteValue: notionalAvailable ? buyValue : null, sellQuoteValue: notionalAvailable ? sellValue : null, netAggressiveQuoteValue: notionalAvailable ? buyValue - sellValue : null, whaleThresholdUsd: whaleClassificationAvailable ? whaleThresholdUsd : null }
  };
}
module.exports = { fetchMicrostructure, normalizeBook, normalizeTrades, safeIsoTimestamp };
