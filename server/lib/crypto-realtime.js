'use strict';

const { isMarketDataLicensed } = require('./market-data-license');

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const QUOTE_SUFFIXES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USD', 'BTC', 'ETH', 'BNB'];
const PROVIDERS = Object.freeze({
  binance: { name: 'Binance', license: 'Binance' },
  bybit: { name: 'Bybit', license: 'Bybit' },
  okx: { name: 'OKX', license: 'OKX' },
  coinbase: { name: 'Coinbase', license: 'Coinbase' },
  kraken: { name: 'Kraken', license: 'Kraken' }
});

function normalizeSymbols(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(x => String(x || '').trim().toUpperCase())
    .filter(x => /^[A-Z0-9]{4,20}$/.test(x)))].slice(0, 100);
}
function splitSymbol(symbol) {
  const value = String(symbol || '').toUpperCase();
  const suffix = QUOTE_SUFFIXES.find(x => value.endsWith(x) && value.length > x.length);
  return suffix ? { baseAsset: value.slice(0, -suffix.length), quoteAsset: suffix } : { baseAsset: value, quoteAsset: null };
}
function isoTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value) ? Date.parse(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}
function canonicalSymbol(value) {
  return String(value || '').toUpperCase().replace(/-SWAP$/, '').replace(/[^A-Z0-9]/g, '');
}
function parseJson(raw) {
  try { return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); } catch (_) { return null; }
}

function createCryptoRealtimeFeed(options = {}) {
  const WebSocketImpl = options.WebSocketImpl || (() => { try { return require('ws'); } catch (_) { return null; } })();
  const now = options.now || Date.now;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const setIntervalFn = options.setInterval || setInterval;
  const clearIntervalFn = options.clearInterval || clearInterval;
  const symbols = normalizeSymbols(options.symbols || process.env.CRYPTO_WS_SYMBOLS || DEFAULT_SYMBOLS);
  const staleAfterMs = Math.max(5000, Number(options.staleAfterMs || process.env.CRYPTO_WS_STALE_MS) || 30000);
  const reconnectBaseMs = Math.max(250, Number(options.reconnectBaseMs) || 1000);
  const reconnectMaxMs = Math.max(reconnectBaseMs, Number(options.reconnectMaxMs) || 30000);
  const enabledExchanges = (options.exchanges || Object.keys(PROVIDERS)).map(x => String(x).toLowerCase()).filter(x => PROVIDERS[x]);
  const enableFutures = options.enableFutures === true || process.env.CRYPTO_WS_ENABLE_FUTURES === 'true';
  const feeds = new Map();
  const quotes = new Map();
  let startedAt = null;
  let stopped = false;

  function feedKey(exchange, marketType) { return exchange + ':' + marketType; }
  function allowed(exchange) { return isMarketDataLicensed(PROVIDERS[exchange].license, options.env || process.env); }
  function exchangeSymbols(exchange) {
    return symbols.map(symbol => {
      const { baseAsset, quoteAsset } = splitSymbol(symbol);
      if (!baseAsset || !quoteAsset) return null;
      if (exchange === 'coinbase') return quoteAsset === 'USDT' || quoteAsset === 'USDC' ? baseAsset + '-USD' : baseAsset + '-' + quoteAsset;
      if (exchange === 'kraken') return baseAsset + '/' + (quoteAsset === 'USDT' || quoteAsset === 'USDC' ? 'USD' : quoteAsset);
      if (exchange === 'okx') return baseAsset + '-' + (quoteAsset === 'USDT' || quoteAsset === 'USDC' ? 'USDT' : quoteAsset);
      return symbol;
    }).filter(Boolean);
  }
  function feedStatus(key) {
    const f = feeds.get(key);
    if (!f) return { id: key, state: 'not_started', connected: false, reconnectAttempts: 0, lastMessageAt: null, lastError: null };
    return {
      id: key, exchange: f.exchange, marketType: f.marketType, state: f.state,
      connected: f.state === 'connected', reconnectAttempts: f.attempt,
      lastMessageAt: f.lastMessageAt ? new Date(f.lastMessageAt).toISOString() : null,
      lastError: f.lastError, nextReconnectAt: f.nextReconnectAt ? new Date(f.nextReconnectAt).toISOString() : null
    };
  }
  function quoteFromEvent(exchange, marketType, event) {
    let symbol, price, timestamp, changePct, bid, ask, bidSize, askSize, quoteVolume, volume, high24h, low24h;
    if (exchange === 'binance') {
      const d = event.data || event;
      symbol = d.s; price = d.c; timestamp = d.E || d.T; changePct = d.P;
      bid = d.b; ask = d.a; bidSize = d.B; askSize = d.A;
      quoteVolume = d.q; volume = d.v; high24h = d.h; low24h = d.l;
    } else if (exchange === 'bybit') {
      const d = Array.isArray(event.data) ? event.data[0] : event.data;
      if (!d || !String(event.topic || '').startsWith('tickers.')) return null;
      symbol = d.symbol; price = d.lastPrice; timestamp = event.ts || d.ts;
      changePct = d.price24hPcnt === undefined ? null : Number(d.price24hPcnt) * 100;
      bid = d.bid1Price; ask = d.ask1Price; bidSize = d.bid1Size; askSize = d.ask1Size;
      quoteVolume = d.turnover24h; volume = d.volume24h; high24h = d.highPrice24h; low24h = d.lowPrice24h;
    } else if (exchange === 'okx') {
      const d = event.data && event.data[0];
      if (!d || event.arg?.channel !== 'tickers') return null;
      symbol = d.instId; price = d.last; timestamp = d.ts;
      bid = d.bidPx; ask = d.askPx; bidSize = d.bidSz; askSize = d.askSz;
      quoteVolume = d.volCcy24h; volume = d.vol24h; high24h = d.high24h; low24h = d.low24h;
    } else if (exchange === 'coinbase') {
      if (event.type !== 'ticker') return null;
      symbol = event.product_id; price = event.price; timestamp = event.time;
      bid = event.best_bid; ask = event.best_ask; bidSize = event.best_bid_size; askSize = event.best_ask_size;
      volume = event.last_size;
    } else if (exchange === 'kraken') {
      if (event.channel !== 'ticker' || !Array.isArray(event.data)) return null;
      const d = event.data[0];
      symbol = d.symbol; price = d.last; timestamp = d.timestamp;
      bid = d.bid; ask = d.ask; bidSize = d.bid_qty; askSize = d.ask_qty;
      volume = d.volume;
    }
    const nativeSymbol = String(symbol || '');
    const normalized = canonicalSymbol(nativeSymbol);
    const configured = exchangeSymbols(exchange).some(x => canonicalSymbol(x) === normalized.replace(/SWAP$/, ''));
    const numPrice = Number(price);
    if (!configured || !Number.isFinite(numPrice) || numPrice <= 0) return null;
    const sourceTimestamp = isoTimestamp(timestamp);
    const sourceMs = sourceTimestamp ? Date.parse(sourceTimestamp) : NaN;
    if (!Number.isFinite(sourceMs) || sourceMs > now() + 60000 || now() - sourceMs > staleAfterMs) return null;
    const { baseAsset, quoteAsset } = exchange === 'coinbase'
      ? { baseAsset: nativeSymbol.split('-')[0], quoteAsset: nativeSymbol.split('-')[1] }
      : exchange === 'kraken'
        ? { baseAsset: nativeSymbol.split('/')[0], quoteAsset: nativeSymbol.split('/')[1] }
        : exchange === 'okx'
          ? { baseAsset: nativeSymbol.split('-')[0], quoteAsset: nativeSymbol.split('-')[1] }
          : splitSymbol(nativeSymbol);
    const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    return {
      exchange: PROVIDERS[exchange].name, marketType, symbol: canonicalSymbol(nativeSymbol),
      nativeSymbol, baseAsset, quoteAsset, price: numPrice, changePct: num(changePct),
      bid: num(bid), ask: num(ask), bidSize: num(bidSize), askSize: num(askSize),
      quoteVolume: num(quoteVolume), volume: num(volume), high24h: num(high24h), low24h: num(low24h),
      sourceTimestamp, receivedAtMs: now(), quoteMode: 'WebSocket push'
    };
  }
  function applyEvent(exchange, raw, marketType = 'spot') {
    const key = String(exchange || '').toLowerCase();
    if (!PROVIDERS[key] || !allowed(key)) return false;
    const event = typeof raw === 'string' || Buffer.isBuffer(raw) ? parseJson(raw) : raw;
    if (!event || typeof event !== 'object') return false;
    const quote = quoteFromEvent(key, marketType, event);
    if (!quote || !quote.sourceTimestamp) return false;
    quotes.set(feedKey(quote.exchange, marketType) + ':' + canonicalSymbol(quote.nativeSymbol), quote);
    return true;
  }
  function subscription(exchange, marketType) {
    const list = exchangeSymbols(exchange);
    if (exchange === 'binance') {
      const host = marketType === 'perpetual' ? 'wss://fstream.binance.com/stream?streams=' : 'wss://stream.binance.com:9443/stream?streams=';
      return { url: host + list.map(x => x.toLowerCase() + '@ticker').join('/'), onOpen() {} };
    }
    if (exchange === 'bybit') return { url: 'wss://stream.bybit.com/v5/public/' + (marketType === 'perpetual' ? 'linear' : 'spot'), onOpen: ws => ws.send(JSON.stringify({ op: 'subscribe', args: list.map(x => 'tickers.' + x) })) };
    if (exchange === 'okx') return { url: 'wss://ws.okx.com:8443/ws/v5/public', onOpen: ws => ws.send(JSON.stringify({ op: 'subscribe', args: list.map(x => ({ channel: 'tickers', instId: marketType === 'perpetual' ? x + '-SWAP' : x })) })) };
    if (exchange === 'coinbase') return { url: 'wss://ws-feed.exchange.coinbase.com', onOpen: ws => ws.send(JSON.stringify({ type: 'subscribe', product_ids: list, channels: ['ticker'] })) };
    return { url: 'wss://ws.kraken.com/v2', onOpen: ws => ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: list } })) };
  }
  function scheduleReconnect(key) {
    const f = feeds.get(key);
    if (!f || stopped || f.timer) return;
    f.attempt += 1;
    const delay = Math.min(reconnectBaseMs * (2 ** Math.min(f.attempt - 1, 10)), reconnectMaxMs);
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    f.nextReconnectAt = now() + jittered;
    f.timer = setTimer(() => { f.timer = null; f.nextReconnectAt = null; connect(key); }, jittered);
    if (f.timer && typeof f.timer.unref === 'function') f.timer.unref();
  }
  function connect(key) {
    const f = feeds.get(key);
    if (!f || stopped) return;
    if (!WebSocketImpl) { f.state = 'unavailable'; f.lastError = 'ws_dependency_not_installed'; return; }
    f.state = 'connecting';
    const cfg = subscription(f.exchangeKey, f.marketType);
    let socket;
    try { socket = new WebSocketImpl(cfg.url, { handshakeTimeout: 10000 }); }
    catch (error) { f.state = 'disconnected'; f.lastError = String(error.message || error); scheduleReconnect(key); return; }
    f.socket = socket;
    socket.on('open', () => {
      if (f.socket !== socket) return;
      f.state = 'connected'; f.attempt = 0; f.lastError = null; f.openedAt = now();
      cfg.onOpen(socket);
      if (f.watchdog) clearIntervalFn(f.watchdog);
      f.watchdog = setIntervalFn(() => {
        if (f.socket !== socket || f.state !== 'connected') return;
        if (now() - (f.lastMessageAt || f.openedAt || now()) > staleAfterMs) {
          f.lastError = 'websocket_heartbeat_timeout';
          try { socket.terminate(); } catch (_) { try { socket.close(); } catch (_) {} }
        }
      }, Math.min(10000, Math.max(1000, Math.floor(staleAfterMs / 3))));
      if (f.watchdog && typeof f.watchdog.unref === 'function') f.watchdog.unref();
    });
    socket.on('message', message => {
      if (f.socket !== socket) return;
      f.lastMessageAt = now();
      if (!applyEvent(f.exchangeKey, message, f.marketType) && f.exchangeKey !== 'binance') f.lastError = 'unrecognized_websocket_message';
    });
    socket.on('error', error => { if (f.socket === socket) f.lastError = String(error.message || error); });
    socket.on('close', () => {
      if (f.socket !== socket) return;
      if (f.watchdog) clearIntervalFn(f.watchdog);
      f.watchdog = null; f.socket = null; f.state = 'disconnected'; scheduleReconnect(key);
    });
  }
  function start() {
    if (startedAt !== null && !stopped) return status();
    startedAt = now(); stopped = false;
    if (!symbols.length) return status();
    for (const exchange of enabledExchanges) {
      if (!allowed(exchange)) {
        const key = feedKey(PROVIDERS[exchange].name, 'spot');
        feeds.set(key, { exchange: PROVIDERS[exchange].name, exchangeKey: exchange, marketType: 'spot', state: 'not_configured', attempt: 0, lastMessageAt: null, lastError: 'market_data_license_required' });
        continue;
      }
      const types = ['spot'];
      if (enableFutures && ['binance', 'bybit', 'okx'].includes(exchange)) types.push('perpetual');
      for (const type of types) {
        const key = feedKey(PROVIDERS[exchange].name, type);
        feeds.set(key, { exchange: PROVIDERS[exchange].name, exchangeKey: exchange, marketType: type, state: 'idle', socket: null, timer: null, attempt: 0, lastMessageAt: null, lastError: null, nextReconnectAt: null });
        connect(key);
      }
    }
    return status();
  }
  function stop() {
    stopped = true;
    for (const f of feeds.values()) {
      if (f.timer) clearTimer(f.timer);
      if (f.watchdog) clearIntervalFn(f.watchdog);
      f.watchdog = null; f.timer = null; f.nextReconnectAt = null;
      const socket = f.socket; f.socket = null; f.state = 'stopped';
      if (socket) { try { socket.close(); } catch (_) {} }
    }
    return status();
  }
  function status() {
    const nowMs = now();
    const all = [...feeds.keys()].map(feedStatus);
    const quoteRows = [...quotes.values()];
    const fresh = quoteRows.filter(q => q.sourceTimestamp && nowMs - Date.parse(q.sourceTimestamp) <= staleAfterMs && nowMs - q.receivedAtMs <= staleAfterMs);
    return {
      enabled: feeds.size > 0 && !stopped, configured: symbols.length > 0, symbols, staleAfterMs,
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      feeds: all, connectedFeedCount: all.filter(x => x.connected).length,
      configuredFeedCount: all.filter(x => x.state !== 'not_configured').length,
      licenseBlockedCount: all.filter(x => x.state === 'not_configured').length,
      quoteCount: quoteRows.length, freshQuoteCount: fresh.length, staleQuoteCount: quoteRows.length - fresh.length,
      lastMessageAt: all.map(x => x.lastMessageAt).filter(Boolean).sort().at(-1) || null,
      quoteMode: 'Multi-exchange WebSocket push with REST snapshot fallback'
    };
  }
  function getQuotes() {
    const nowMs = now();
    return [...quotes.values()].filter(q => q.price > 0 && q.sourceTimestamp &&
      nowMs - Date.parse(q.sourceTimestamp) >= -60000 && nowMs - Date.parse(q.sourceTimestamp) <= staleAfterMs &&
      nowMs - q.receivedAtMs <= staleAfterMs)
      .map(q => ({ ...q, sourceAgeMs: Math.max(0, nowMs - Date.parse(q.sourceTimestamp)), receivedAt: new Date(q.receivedAtMs).toISOString() }));
  }
  function mergeMarket(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.markets)) return snapshot;
    const freshQuotes = getQuotes();
    const byId = new Map(freshQuotes.map(q => [q.exchange + ':' + q.marketType + ':' + canonicalSymbol(q.nativeSymbol), q]));
    let merged = 0;
    const markets = snapshot.markets.map(item => {
      const quote = byId.get(item.exchange + ':' + item.marketType + ':' + canonicalSymbol(item.nativeSymbol || item.symbol));
      if (!quote) return item;
      merged += 1;
      return {
        ...item, price: quote.price, changePct: quote.changePct ?? item.changePct,
        quoteVolume: quote.quoteVolume ?? item.quoteVolume, volume: quote.volume ?? item.volume,
        high24h: quote.high24h ?? item.high24h, low24h: quote.low24h ?? item.low24h,
        bid: quote.bid ?? item.bid ?? null, ask: quote.ask ?? item.ask ?? null,
        bidSize: quote.bidSize ?? item.bidSize ?? null, askSize: quote.askSize ?? item.askSize ?? null,
        timestamp: quote.sourceTimestamp, sourceTimestamp: quote.sourceTimestamp,
        sourceAgeMs: quote.sourceAgeMs, freshnessStatus: 'fresh', signalEligible: true,
        delayed: false, receivedAt: quote.receivedAt, quoteMode: 'WebSocket push'
      };
    });
    const exchanges = (snapshot.exchanges || []).map(x => ({
      ...x,
      quoteMode: merged && freshQuotes.some(q => q.exchange === x.name) ? 'WebSocket push + REST catalogue fallback' : (x.quoteMode || 'REST snapshot fallback')
    }));
    return {
      ...snapshot, markets, exchanges, quoteMode: 'Multi-exchange WebSocket push + REST fallback',
      realtime: status(), summary: { ...(snapshot.summary || {}), websocketQuoteCount: merged }
    };
  }
  return { start, stop, status, getQuotes, mergeMarket, applyEvent };
}
let defaultFeed = null;
function createDefaultCryptoRealtimeFeed() {
  if (!defaultFeed) defaultFeed = createCryptoRealtimeFeed();
  return defaultFeed;
}
module.exports = { createCryptoRealtimeFeed, createDefaultCryptoRealtimeFeed, normalizeSymbols, splitSymbol, isoTimestamp, canonicalSymbol };
