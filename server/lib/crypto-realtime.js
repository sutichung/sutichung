'use strict';

const { requireMarketDataLicense } = require('./market-data-license');

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const QUOTE_SUFFIXES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USD', 'BTC', 'ETH', 'BNB'];

function normalizeSymbols(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(x => String(x || '').trim().toUpperCase()).filter(x => /^[A-Z0-9]{4,20}$/.test(x)))].slice(0, 100);
}
function splitSymbol(symbol) {
  const value = String(symbol || '').toUpperCase();
  const suffix = QUOTE_SUFFIXES.find(x => value.endsWith(x) && value.length > x.length);
  return suffix ? { baseAsset: value.slice(0, -suffix.length), quoteAsset: suffix } : { baseAsset: value, quoteAsset: null };
}
function isoTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}
function createCryptoRealtimeFeed(options = {}) {
  const WebSocketImpl = options.WebSocketImpl || (() => { try { return require('ws'); } catch (_) { return null; } })();
  const now = options.now || Date.now;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const symbols = normalizeSymbols(options.symbols || process.env.CRYPTO_WS_SYMBOLS || DEFAULT_SYMBOLS);
  const staleAfterMs = Math.max(5000, Number(options.staleAfterMs || process.env.CRYPTO_WS_STALE_MS) || 30000);
  const reconnectBaseMs = Math.max(250, Number(options.reconnectBaseMs) || 1000);
  const reconnectMaxMs = Math.max(reconnectBaseMs, Number(options.reconnectMaxMs) || 30000);
  const enableFutures = options.enableFutures === true || process.env.CRYPTO_WS_ENABLE_FUTURES === 'true';
  const feeds = new Map();
  const quotes = new Map();
  let startedAt = null;
  let stopped = false;
  let licenseError = null;

  function key(type, symbol) { return type + ':' + symbol; }
  function feedStatus(type) {
    const f = feeds.get(type);
    if (!f) return { marketType: type, state: 'not_started', connected: false, reconnectAttempts: 0, lastMessageAt: null, lastError: null };
    return {
      marketType: type, state: f.state, connected: f.state === 'connected',
      reconnectAttempts: f.attempt, lastMessageAt: f.lastMessageAt ? new Date(f.lastMessageAt).toISOString() : null,
      lastError: f.lastError, nextReconnectAt: f.nextReconnectAt ? new Date(f.nextReconnectAt).toISOString() : null
    };
  }
  function applyEvent(type, raw) {
    let event;
    try { event = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); } catch (_) { return false; }
    const data = event && event.data && typeof event.data === 'object' ? event.data : event;
    const symbol = String(data.s || '').toUpperCase();
    if (!symbol || !symbols.includes(symbol)) return false;
    const id = key(type, symbol);
    const current = quotes.get(id) || { exchange: 'Binance', marketType: type, symbol, ...splitSymbol(symbol) };
    const eventType = String(data.e || '');
    if (eventType === '24hrTicker' || data.c !== undefined) {
      const price = Number(data.c);
      if (Number.isFinite(price) && price > 0) current.price = price;
      const change = Number(data.P);
      current.changePct = Number.isFinite(change) ? change : null;
      for (const [field, source] of [['quoteVolume', 'q'], ['volume', 'v'], ['high24h', 'h'], ['low24h', 'l']]) {
        const n = Number(data[source]);
        if (data[source] !== undefined && Number.isFinite(n) && n >= 0) current[field] = n;
      }
      current.sourceTimestamp = isoTimestamp(data.E || data.C);
    }
    if (eventType === 'bookTicker' || data.b !== undefined || data.a !== undefined) {
      const bid = Number(data.b), ask = Number(data.a);
      if (Number.isFinite(bid) && bid > 0) current.bid = bid;
      if (Number.isFinite(ask) && ask > 0) current.ask = ask;
      const bidSize = Number(data.B), askSize = Number(data.A);
      if (Number.isFinite(bidSize) && bidSize >= 0) current.bidSize = bidSize;
      if (Number.isFinite(askSize) && askSize >= 0) current.askSize = askSize;
    }
    current.receivedAtMs = now();
    quotes.set(id, current);
    return true;
  }
  function scheduleReconnect(type) {
    const f = feeds.get(type);
    if (!f || stopped || f.timer) return;
    f.attempt += 1;
    const delay = Math.min(reconnectBaseMs * (2 ** Math.min(f.attempt - 1, 10)), reconnectMaxMs);
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    f.nextReconnectAt = now() + jittered;
    f.timer = setTimer(() => { f.timer = null; f.nextReconnectAt = null; connect(type); }, jittered);
    if (f.timer && typeof f.timer.unref === 'function') f.timer.unref();
  }
  function connect(type) {
    if (stopped || !symbols.length) return;
    const f = feeds.get(type);
    if (!WebSocketImpl) { f.state = 'unavailable'; f.lastError = 'ws_dependency_not_installed'; return; }
    if (!f) return;
    f.state = 'connecting';
    const host = type === 'perpetual' ? 'wss://fstream.binance.com/stream?streams=' : 'wss://stream.binance.com:9443/stream?streams=';
    const streams = symbols.flatMap(s => [s.toLowerCase() + '@ticker', s.toLowerCase() + '@bookTicker']);
    let socket;
    try { socket = new WebSocketImpl(host + streams.join('/'), { handshakeTimeout: 10000 }); }
    catch (error) { f.state = 'disconnected'; f.lastError = String(error.message || error); scheduleReconnect(type); return; }
    f.socket = socket;
    socket.on('open', () => { if (f.socket !== socket) return; f.state = 'connected'; f.attempt = 0; f.lastError = null; });
    socket.on('message', message => {
      if (f.socket !== socket) return;
      f.lastMessageAt = now();
      if (!applyEvent(type, message)) f.lastError = 'unrecognized_websocket_message';
    });
    socket.on('error', error => { if (f.socket === socket) f.lastError = String(error.message || error); });
    socket.on('close', () => {
      if (f.socket !== socket) return;
      f.socket = null; f.state = 'disconnected'; scheduleReconnect(type);
    });
  }
  function start() {
    if (startedAt !== null) return status();
    startedAt = now(); stopped = false;
    if (!symbols.length) { licenseError = 'no_valid_symbols_configured'; return status(); }
    try { requireMarketDataLicense('Binance'); }
    catch (error) { licenseError = String(error.message || error); return status(); }
    licenseError = null;
    for (const type of enableFutures ? ['spot', 'perpetual'] : ['spot']) {
      feeds.set(type, { state: 'idle', socket: null, timer: null, attempt: 0, lastMessageAt: null, lastError: null, nextReconnectAt: null });
      connect(type);
    }
    return status();
  }
  function stop() {
    stopped = true;
    for (const f of feeds.values()) {
      if (f.timer) clearTimer(f.timer);
      f.timer = null;
      f.nextReconnectAt = null;
      const socket = f.socket;
      f.socket = null;
      f.state = 'stopped';
      if (socket) { try { socket.close(); } catch (_) {} }
    }
    return status();
  }
  function status() {
    const nowMs = now();
    const all = [...feeds.keys()].map(feedStatus);
    const quoteRows = [...quotes.values()];
    const fresh = quoteRows.filter(q => nowMs - q.receivedAtMs <= staleAfterMs);
    return {
      enabled: feeds.size > 0 && !stopped, configured: symbols.length > 0,
      licenseError, symbols, staleAfterMs, startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      feeds: all, connectedFeedCount: all.filter(x => x.connected).length,
      quoteCount: quoteRows.length, freshQuoteCount: fresh.length,
      staleQuoteCount: quoteRows.length - fresh.length,
      lastMessageAt: all.map(x => x.lastMessageAt).filter(Boolean).sort().at(-1) || null,
      quoteMode: 'Binance WebSocket push; REST snapshot fallback for other symbols/providers'
    };
  }
  function getQuotes() {
    const nowMs = now();
    return [...quotes.values()].filter(q => q.price > 0 && q.sourceTimestamp && nowMs - q.receivedAtMs <= staleAfterMs)
      .map(q => ({ ...q, sourceAgeMs: Math.max(0, nowMs - Date.parse(q.sourceTimestamp)), receivedAt: new Date(q.receivedAtMs).toISOString() }));
  }
  function mergeMarket(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.markets)) return snapshot;
    const freshQuotes = getQuotes();
    const byId = new Map(freshQuotes.map(q => [key(q.marketType, q.symbol), q]));
    let merged = 0;
    const markets = snapshot.markets.map(item => {
      if (item.exchange !== 'Binance') return item;
      const quote = byId.get(key(item.marketType, item.nativeSymbol || item.symbol));
      if (!quote) return item;
      const age = quote.sourceAgeMs;
      const freshnessStatus = age <= staleAfterMs ? 'fresh' : 'stale';
      merged += 1;
      return {
        ...item, price: quote.price, changePct: quote.changePct ?? item.changePct,
        quoteVolume: quote.quoteVolume ?? item.quoteVolume, volume: quote.volume ?? item.volume,
        high24h: quote.high24h ?? item.high24h, low24h: quote.low24h ?? item.low24h,
        bid: quote.bid ?? item.bid ?? null, ask: quote.ask ?? item.ask ?? null,
        bidSize: quote.bidSize ?? item.bidSize ?? null, askSize: quote.askSize ?? item.askSize ?? null,
        timestamp: quote.sourceTimestamp, sourceTimestamp: quote.sourceTimestamp,
        sourceAgeMs: age, freshnessStatus, signalEligible: freshnessStatus === 'fresh',
        delayed: freshnessStatus !== 'fresh', receivedAt: quote.receivedAt,
        quoteMode: 'WebSocket push', endpointBase: 'wss://stream.binance.com'
      };
    });
    const exchanges = (snapshot.exchanges || []).map(x => x.name === 'Binance'
      ? { ...x, quoteMode: merged ? 'WebSocket push + REST catalogue fallback' : 'REST snapshot fallback; WebSocket awaiting data', websocketQuoteCount: merged }
      : x);
    return {
      ...snapshot, markets, exchanges,
      quoteMode: merged ? 'WebSocket push + REST fallback' : snapshot.quoteMode,
      realtime: status(), summary: { ...(snapshot.summary || {}), websocketQuoteCount: merged }
    };
  }
  return { start, stop, status, getQuotes, mergeMarket, applyEvent };
}
module.exports = { createCryptoRealtimeFeed, normalizeSymbols, splitSymbol, isoTimestamp };
