'use strict';
const { createCryptoEventStorage } = require('./crypto-event-storage');
const { CryptoLiveScorer } = require('./crypto-live-scorer');
const { isMarketDataLicensed } = require('./market-data-license');

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const toNum = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const iso = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null; };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function createCryptoStreamEngine(options = {}) {
  const WebSocketImpl = options.WebSocketImpl || require('ws');
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const toList = (value, fallback) => {
    const source = value === undefined || value === null ? fallback : value;
    return (Array.isArray(source) ? source : String(source).split(','))
      .map(item => String(item).trim()).filter(Boolean);
  };
  const symbols = [...new Set(toList(options.symbols ?? process.env.CRYPTO_WS_SYMBOLS, DEFAULT_SYMBOLS.join(','))
    .map(x => x.toUpperCase()).filter(x => /^[A-Z0-9]{4,20}$/.test(x)))].slice(0, 30);
  const requestedExchanges = toList(options.exchanges ?? process.env.CRYPTO_WS_EXCHANGES, 'Binance,Bybit,OKX')
    .filter(x => ['Binance','Bybit','OKX'].includes(x));
  const exchanges = options.skipLicenseCheck ? requestedExchanges : requestedExchanges.filter(x => isMarketDataLicensed(x));
  const unlicensedProviders = requestedExchanges.filter(x => !exchanges.includes(x));
  const enableFutures = options.enableFutures ?? process.env.CRYPTO_WS_ENABLE_FUTURES !== 'false';
  const staleMs = Number(options.staleMs || process.env.CRYPTO_WS_STALE_MS) || 30000;
  const storage = options.storage || createCryptoEventStorage();
  const scorer = new CryptoLiveScorer({ maxAgeMs: staleMs });
  const sockets = new Map(), timers = new Set(), quotes = new Map(), books = new Map(), depthBooks = new Map(), funding = new Map();
  const buckets = new Map(), alertCooldown = new Map(), stats = { messages: 0, reconnects: 0, errors: 0, persistedEvents: 0, persistErrors: 0, alerts: 0 };
  let started = false, stopping = false, flushTimer = null, fundingTimer = null, statusTimer = null, lastPersistAt = null;
  const startedAt = new Date(now()).toISOString();
  const key = (exchange, marketType, symbol) => [exchange, marketType, symbol].join(':');
  const split = symbol => {
    const suffix = ['USDT','USDC','USD','BTC','ETH'].find(x => symbol.endsWith(x));
    return suffix ? { baseAsset: symbol.slice(0, -suffix.length), quoteAsset: suffix } : { baseAsset: symbol, quoteAsset: null };
  };
  function emit(exchange, marketType, symbol, eventType, payload, sourceTimestamp) {
    if (!storage.configured) return;
    const timestamp = iso(sourceTimestamp) || new Date(now()).toISOString();
    const minute = timestamp.slice(0, 16);
    const id = key(exchange, marketType, symbol) + ':' + minute;
    let batch = buckets.get(id);
    if (!batch) {
      batch = { minute: timestamp.slice(0, 16) + ':00.000Z', exchange, marketType, symbol, events: [] };
      buckets.set(id, batch);
    }
    batch.events.push({ exchange, marketType, symbol, eventType, sourceTimestamp: timestamp, receivedAt: new Date(now()).toISOString(), ...payload });
    if (batch.events.length > 250) batch.events.splice(0, batch.events.length - 250);
  }
  function quoteEvent(exchange, marketType, symbol, data, sourceTimestamp) {
    const k = key(exchange, marketType, symbol);
    const old = quotes.get(k) || { exchange, marketType, symbol, ...split(symbol) };
    Object.assign(old, data);
    old.sourceTimestamp = iso(sourceTimestamp) || old.sourceTimestamp;
    old.receivedAtMs = now();
    quotes.set(k, old);
    emit(exchange, marketType, symbol, 'ticker', { price: old.price, bid: old.bid, ask: old.ask, changePct: old.changePct, quoteVolume24h: old.quoteVolume24h, quoteMode: old.quoteMode }, old.sourceTimestamp);
    if (old.price > 0 && old.sourceTimestamp) {
      const score = scorer.update({ exchange, marketType, symbol, timestamp: Date.parse(old.sourceTimestamp), last: old.price, bid: old.bid, ask: old.ask, changePct: old.changePct });
      old.liveSignal = score;
      if (score.eligible) maybeAlert(old, score);
    }
  }
  function maybeAlert(quote, score) {
    if (!quote || now() - (quote.receivedAtMs || 0) > staleMs || score.score < Number(process.env.CRYPTO_ALERT_SCORE || 2.0)) return;
    const k = key(quote.exchange, quote.marketType, quote.symbol);
    const prior = alertCooldown.get(k) || 0;
    if (now() - prior < (Number(process.env.CRYPTO_ALERT_COOLDOWN_MS) || 900000)) return;
    alertCooldown.set(k, now());
    stats.alerts++;
    emit(quote.exchange, quote.marketType, quote.symbol, 'signal', { score: score.score, reasons: score.reasons, price: quote.price }, quote.sourceTimestamp);
    sendTelegram(quote, score).catch(() => {});
  }
  async function sendTelegram(quote, score) {
    const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chat) return;
    const text = ['<b>加密貨幣即時訊號</b>', quote.exchange + ' ' + quote.marketType, quote.symbol, '價格: ' + quote.price, '評分: ' + score.score, score.reasons.join(' | '), '來源時間: ' + quote.sourceTimestamp].join('\n');
    const response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('telegram_http_' + response.status);
  }
  function updateBook(exchange, marketType, symbol, bids, asks, sourceTimestamp, mode = 'snapshot') {
    const id = key(exchange, marketType, symbol);
    let depth = depthBooks.get(id);
    if (!depth || mode === 'snapshot') depth = { bids: new Map(), asks: new Map() };
    const apply = (target, rows) => {
      for (const row of rows || []) {
        const price = toNum(Array.isArray(row) ? row[0] : row.price);
        const size = toNum(Array.isArray(row) ? row[1] : row.size);
        if (!(price > 0) || size === null) continue;
        if (size <= 0) target.delete(price); else target.set(price, size);
      }
    };
    apply(depth.bids, bids); apply(depth.asks, asks);
    depthBooks.set(id, depth);
    const bidRows = [...depth.bids.entries()].sort((a,b)=>b[0]-a[0]).slice(0,20);
    const askRows = [...depth.asks.entries()].sort((a,b)=>a[0]-b[0]).slice(0,20);
    const bestBid = bidRows[0]?.[0] ?? null, bestAsk = askRows[0]?.[0] ?? null;
    const bidQty = bidRows.reduce((s,x)=>s+x[1],0), askQty = askRows.reduce((s,x)=>s+x[1],0);
    const total = bidQty + askQty, imbalance = total > 0 ? (bidQty - askQty) / total : null;
    const book = { bestBid, bestAsk, bidQty, askQty, imbalance, spreadBps: bestBid > 0 && bestAsk >= bestBid ? (bestAsk-bestBid)/((bestAsk+bestBid)/2)*10000 : null, depthLevels: bidRows.length + askRows.length, updateMode: mode };
    books.set(id, book);
    const q = quotes.get(id);
    if (q) { q.bid = bestBid; q.ask = bestAsk; }
    emit(exchange, marketType, symbol, 'orderbook_summary', book, sourceTimestamp);
    if (q && Math.abs(imbalance || 0) >= 0.8) maybeAlert(q, { eligible: true, score: 2.1, reasons: ['前 20 檔委託量失衡 ' + (imbalance * 100).toFixed(1) + '%'] });
  }
  function handleTrade(exchange, marketType, symbol, trade, timestamp) {
    const price = toNum(trade.price), size = toNum(trade.size);
    if (!(price > 0 && size > 0)) return;
    const notional = price * size;
    const threshold = Number(process.env.CRYPTO_WHALE_THRESHOLD_USD || 50000);
    const side = String(trade.side || '').toLowerCase();
    if (notional >= threshold) {
      emit(exchange, marketType, symbol, 'large_trade', { side, price, size, notional, threshold }, timestamp);
      const q = quotes.get(key(exchange, marketType, symbol));
      if (q) maybeAlert(q, { eligible:true, score:2.1, reasons:['大額主動成交 '+side+' 約 '+Math.round(notional).toLocaleString()+' '+(split(symbol).quoteAsset||'報價幣')] });
    }
  }
  function handleCandle(exchange, marketType, symbol, candle, timestamp) {
    if (!candle.closed) return;
    const quoteVolume = toNum(candle.quoteVolume);
    emit(exchange, marketType, symbol, 'closed_1m_candle', { open: toNum(candle.open), high: toNum(candle.high), low: toNum(candle.low), close: toNum(candle.close), baseVolume: toNum(candle.baseVolume), quoteVolume }, timestamp);
    const q = quotes.get(key(exchange, marketType, symbol));
    if (q && quoteVolume > 0) {
      // Completed candle turnover is stored as a separate observation; never reuse 24h turnover as interval volume.
      const k = key(exchange, marketType, symbol);
      const history = volumeHistory.get(k) || [];
      history.push(quoteVolume);
      if (history.length > 20) history.shift();
      volumeHistory.set(k, history);
      const sorted = history.slice(0, -1).sort((a,b)=>a-b);
      if (sorted.length >= 5) {
        const mid = Math.floor(sorted.length / 2);
        const baseline = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
        const multiple = baseline > 0 ? quoteVolume / baseline : null;
        if (multiple >= 2) {
          emit(exchange, marketType, symbol, 'volume_spike', { quoteVolume, baselineMedian: baseline, multiple }, timestamp);
          maybeAlert(q, { eligible: true, score: 2.2, reasons: ['1 分鐘成交額達近期中位數 ' + multiple.toFixed(2) + ' 倍'] });
        }
      }
    }
  }
  const volumeHistory = new Map();
  function handleMessage(exchange, marketType, raw) {
    let message;
    try { message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); } catch (_) { return; }
    stats.messages++;
    if (exchange === 'Binance') {
      const data = message.data || message;
      const symbol = String(data.s || '').toUpperCase();
      if (!symbols.includes(symbol)) return;
      const ts = data.E || data.T || now();
      if (data.e === '24hrTicker' || data.c !== undefined) quoteEvent(exchange, marketType, symbol, {
        price: toNum(data.c), changePct: toNum(data.P), quoteVolume24h: toNum(data.q), high24h: toNum(data.h), low24h: toNum(data.l)
      }, ts);
      if (data.e === 'bookTicker' || data.b !== undefined) {
        const q = quotes.get(key(exchange, marketType, symbol)) || {};
        q.bid = toNum(data.b); q.ask = toNum(data.a); q.bidSize = toNum(data.B); q.askSize = toNum(data.A); quotes.set(key(exchange,marketType,symbol),q);
      }
      if (data.e === 'trade') handleTrade(exchange, marketType, symbol, { price: data.p, size: data.q, side: data.m ? 'sell' : 'buy' }, data.T || ts);
      if (data.e === 'kline' && data.k) handleCandle(exchange, marketType, symbol, { closed: data.k.x, open: data.k.o, high: data.k.h, low: data.k.l, close: data.k.c, baseVolume: data.k.v, quoteVolume: data.k.q }, data.k.T || ts);
      return;
    }
    if (exchange === 'Bybit') {
      const topic = String(message.topic || ''), data = message.data;
      if (!topic || !data) return;
      const parts = topic.split('.'), type = parts[0], symbol = String((Array.isArray(data) ? data[0]?.s : data.s) || parts.at(-1) || '').toUpperCase();
      if (!symbols.includes(symbol)) return;
      const ts = message.ts || data.ts || now();
      if (type === 'tickers') {
        const d = Array.isArray(data) ? data[0] : data;
        quoteEvent(exchange, marketType, symbol, { price: toNum(d.lastPrice), bid: toNum(d.bid1Price), ask: toNum(d.ask1Price), changePct: toNum(d.price24hPcnt) === null ? null : toNum(d.price24hPcnt) * 100, quoteVolume24h: toNum(d.turnover24h) }, ts);
      } else if (type === 'orderbook') {
        const d = data;
        updateBook(exchange, marketType, symbol, d.b || [], d.a || [], ts, message.type || 'snapshot');
      } else if (type === 'publicTrade') {
        for (const x of data) handleTrade(exchange, marketType, symbol, { price: x.p, size: x.v, side: x.S }, x.T || ts);
      } else if (type === 'kline') {
        for (const x of data) handleCandle(exchange, marketType, symbol, { closed: x.confirm, open: x.open, high: x.high, low: x.low, close: x.close, baseVolume: x.volume, quoteVolume: x.turnover }, x.end || ts);
      }
      return;
    }
    if (exchange === 'OKX') {
      const arg = message.arg || {}, channel = arg.channel, inst = String(arg.instId || '');
      const symbol = inst.replace(/-SWAP$/, '').replace(/-/g, '');
      if (!symbols.includes(symbol)) return;
      for (const d of message.data || []) {
        const ts = d.ts || now();
        if (channel === 'tickers') quoteEvent(exchange, marketType, symbol, { price: toNum(d.last), bid: toNum(d.bidPx), ask: toNum(d.askPx), changePct: toNum(d.open24h) > 0 ? (Number(d.last)/Number(d.open24h)-1)*100 : null, quoteVolume24h: toNum(d.volCcy24h) }, ts);
        else if (channel === 'books5') updateBook(exchange, marketType, symbol, d.bids || [], d.asks || [], ts);
        else if (channel === 'trades') handleTrade(exchange, marketType, symbol, { price: d.px, size: d.sz, side: d.side }, ts);
        else if (channel === 'candle1m') handleCandle(exchange, marketType, symbol, { closed: String(d[8]) === '1', open: d[1], high: d[2], low: d[3], close: d[4], baseVolume: d[5], quoteVolume: d[7] }, d[0]);
      }
    }
  }
  function connectionSpecs() {
    const specs = [];
    for (const exchange of exchanges) for (const marketType of (enableFutures ? ['spot','perpetual'] : ['spot'])) {
      const list = symbols;
      if (exchange === 'Binance') {
        const base = marketType === 'spot' ? 'wss://stream.binance.com:9443/stream?streams=' : 'wss://fstream.binance.com/stream?streams=';
        const streams = list.flatMap(s => [s.toLowerCase()+'@ticker',s.toLowerCase()+'@bookTicker',s.toLowerCase()+'@trade',s.toLowerCase()+'@kline_1m']);
        specs.push({ exchange, marketType, url: base + streams.join('/') });
      } else if (exchange === 'Bybit') {
        const url = marketType === 'spot' ? 'wss://stream.bybit.com/v5/public/spot' : 'wss://stream.bybit.com/v5/public/linear';
        const args = list.flatMap(s => ['tickers.'+s,'orderbook.50.'+s,'publicTrade.'+s,'kline.1.'+s]);
        specs.push({ exchange, marketType, url, subscribe: { op: 'subscribe', args } });
      } else if (exchange === 'OKX') {
        const args = list.flatMap(s => {
          const base = s.endsWith('USDT') ? s.slice(0,-4) + '-USDT' : s;
          const instId = marketType === 'spot' ? base : base + '-SWAP';
          return ['tickers','books5','trades','candle1m'].map(channel => ({ channel, instId }));
        });
        specs.push({ exchange, marketType, url: 'wss://ws.okx.com:8443/ws/v5/public', subscribe: { op: 'subscribe', args } });
      }
    }
    return specs;
  }
  function connect(spec) {
    if (stopping) return;
    const id = key(spec.exchange, spec.marketType, 'ALL');
    const state = sockets.get(id) || { attempts: 0 };
    sockets.set(id, state);
    state.state = 'connecting';
    let ws;
    try { ws = new WebSocketImpl(spec.url, { handshakeTimeout: 10000 }); }
    catch (e) { state.lastError = String(e.message || e); scheduleReconnect(spec, state); return; }
    state.ws = ws;
    ws.on('open', () => {
      if (state.ws !== ws) return;
      state.state = 'connected'; state.attempts = 0; state.connectedAt = now(); state.lastError = null;
      if (spec.subscribe) ws.send(JSON.stringify(spec.subscribe));
      if (spec.exchange === 'OKX') {
        state.ping = setInterval(() => { if (ws.readyState === WebSocketImpl.OPEN) ws.send('ping'); }, 20000);
        timers.add(state.ping);
      }
    });
    ws.on('message', raw => {
      if (state.ws !== ws) return;
      if (String(raw) === 'pong') return;
      state.lastMessageAt = now();
      handleMessage(spec.exchange, spec.marketType, raw);
    });
    ws.on('error', e => { stats.errors++; state.lastError = String(e.message || e).slice(0,200); });
    ws.on('close', () => {
      if (state.ws !== ws) return;
      state.state = 'disconnected'; state.ws = null;
      if (state.ping) { clearInterval(state.ping); timers.delete(state.ping); state.ping = null; }
      if (!stopping) scheduleReconnect(spec, state);
    });
  }
  function scheduleReconnect(spec, state) {
    if (stopping || state.timer) return;
    state.attempts++; stats.reconnects++;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(state.attempts - 1, 5)) * (0.8 + Math.random()*0.4);
    state.nextReconnectAt = new Date(now()+delay).toISOString();
    state.timer = setTimeout(() => { timers.delete(state.timer); state.timer = null; connect(spec); }, delay);
    timers.add(state.timer);
  }
  async function pollFunding() {
    const tasks = [];
    for (const symbol of symbols) for (const exchange of exchanges) {
      if (!enableFutures) continue;
      tasks.push((async () => {
        try {
          let row;
          if (exchange === 'Binance') {
            const r = await fetchImpl('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+encodeURIComponent(symbol), { signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error('HTTP '+r.status);
            const d = await r.json(); row = { rate: toNum(d.lastFundingRate), markPrice: toNum(d.markPrice), indexPrice: toNum(d.indexPrice), nextFundingAt: iso(d.nextFundingTime), sourceTimestamp: iso(d.time) };
          } else if (exchange === 'Bybit') {
            const r = await fetchImpl('https://api.bybit.com/v5/market/tickers?category=linear&symbol='+encodeURIComponent(symbol), { signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error('HTTP '+r.status);
            const d = await r.json(), x = d.result?.list?.[0]; if (d.retCode !== 0 || !x) throw new Error(d.retMsg || 'no_ticker');
            row = { rate: toNum(x.fundingRate), markPrice: toNum(x.markPrice), indexPrice: toNum(x.indexPrice), nextFundingAt: iso(x.nextFundingTime), sourceTimestamp: iso(d.time) };
          } else {
            const instId = symbol.endsWith('USDT') ? symbol.slice(0,-4)+'-USDT-SWAP' : symbol;
            const r = await fetchImpl('https://www.okx.com/api/v5/public/funding-rate?instId='+encodeURIComponent(instId), { signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error('HTTP '+r.status);
            const d = await r.json(), x = d.data?.[0]; if (d.code !== '0' || !x) throw new Error(d.msg || 'no_funding');
            row = { rate: toNum(x.fundingRate), markPrice: toNum(x.markPx), nextFundingAt: iso(x.nextFundingTime), sourceTimestamp: iso(x.ts) };
          }
          const id = key(exchange,'perpetual',symbol); funding.set(id,{exchange,symbol,...row,receivedAt:new Date(now()).toISOString()});
          emit(exchange,'perpetual',symbol,'funding_rate',row,row.sourceTimestamp);
          const q = quotes.get(id);
          const fundingAlertThreshold = Number(process.env.CRYPTO_FUNDING_ALERT_ABS || 0.001);
          if (q && row.rate !== null && Math.abs(row.rate) >= fundingAlertThreshold) maybeAlert(q, { eligible:true, score:2.3, reasons:['資金費率異常 '+(row.rate*100).toFixed(4)+'%'] });
        } catch (e) { stats.errors++; }
      })());
    }
    await Promise.allSettled(tasks);
  }
  async function flush() {
    const currentMinute = new Date(now()).toISOString().slice(0,16);
    const ready = [];
    for (const [id,batch] of buckets) if (batch.minute.slice(0,16) < currentMinute || stopping) { ready.push(batch); buckets.delete(id); }
    for (const batch of ready) {
      try { const result = await storage.saveMinuteBatch(batch); if (result.stored) stats.persistedEvents += result.count; lastPersistAt = new Date(now()).toISOString(); }
      catch (e) { stats.persistErrors++; batch.events.length = Math.min(batch.events.length,250); buckets.set(key(batch.exchange,batch.marketType,batch.symbol)+':'+batch.minute.slice(0,16),batch); }
    }
    try { await storage.saveStatus(status()); } catch (_) { stats.persistErrors++; }
  }
  function status() {
    const feeds = [...sockets.entries()].map(([id,x]) => ({ id, state:x.state||'idle', connected:x.state==='connected', reconnectAttempts:x.attempts||0, lastMessageAt:iso(x.lastMessageAt), lastError:x.lastError||null, nextReconnectAt:x.nextReconnectAt||null }));
    const rows = [...quotes.values()];
    const fresh = rows.filter(x => now()-x.receivedAtMs <= staleMs && x.sourceTimestamp && now()-Date.parse(x.sourceTimestamp) <= staleMs && now()-Date.parse(x.sourceTimestamp) >= -60000);
    return { enabled:started&&!stopping&&feeds.length>0, startedAt, symbols, exchanges, unlicensedProviders, futuresEnabled:enableFutures, feeds, connectedFeedCount:feeds.filter(x=>x.connected).length, quoteCount:rows.length, freshQuoteCount:fresh.length, staleQuoteCount:rows.length-fresh.length, fundingCount:funding.size, funding:[...funding.values()], stats:{...stats}, storage:{configured:storage.configured,lastPersistAt,pendingBatches:buckets.size}, telegramConfigured:Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID), quoteMode:'official exchange WebSocket + 15s REST fallback', timestamp:new Date(now()).toISOString() };
  }
  function getQuotes() {
    return [...quotes.values()].map(x => { const sourceAgeMs = x.sourceTimestamp ? now()-Date.parse(x.sourceTimestamp) : null; const fresh = now()-x.receivedAtMs <= staleMs && sourceAgeMs !== null && sourceAgeMs <= staleMs && sourceAgeMs >= -60000; return { ...x, sourceAgeMs, freshnessStatus:fresh?'fresh':'stale', receivedAt:new Date(x.receivedAtMs).toISOString() }; });
  }
  async function restFallback() {
    const jobs = [];
    for (const exchange of exchanges) for (const marketType of (enableFutures ? ['spot','perpetual'] : ['spot'])) for (const symbol of symbols) {
      jobs.push((async () => {
        let tickerUrl, bookUrl, candleUrl, instId, category;
        if (exchange === 'Binance') {
          const base = marketType === 'spot' ? 'https://api.binance.com/api/v3' : 'https://fapi.binance.com/fapi/v1';
          tickerUrl = base + '/ticker/24hr?symbol=' + symbol;
          bookUrl = base + '/depth?symbol=' + symbol + '&limit=20';
          candleUrl = base + '/klines?symbol=' + symbol + '&interval=1m&limit=3';
        } else if (exchange === 'Bybit') {
          category = marketType === 'spot' ? 'spot' : 'linear';
          tickerUrl = 'https://api.bybit.com/v5/market/tickers?category=' + category + '&symbol=' + symbol;
          bookUrl = 'https://api.bybit.com/v5/market/orderbook?category=' + category + '&symbol=' + symbol + '&limit=50';
          candleUrl = 'https://api.bybit.com/v5/market/kline?category=' + category + '&symbol=' + symbol + '&interval=1&limit=3';
        } else {
          instId = symbol.endsWith('USDT') ? symbol.slice(0,-4) + '-USDT' + (marketType === 'perpetual' ? '-SWAP' : '') : symbol;
          tickerUrl = 'https://www.okx.com/api/v5/market/ticker?instId=' + encodeURIComponent(instId);
          bookUrl = 'https://www.okx.com/api/v5/market/books?instId=' + encodeURIComponent(instId) + '&sz=20';
          candleUrl = 'https://www.okx.com/api/v5/market/candles?instId=' + encodeURIComponent(instId) + '&bar=1m&limit=3';
        }
        const get = async url => {
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        };
        const results = await Promise.allSettled([get(tickerUrl), get(bookUrl), get(candleUrl)]);
        if (results[0].status === 'fulfilled') {
          const raw = results[0].value;
          let d, timestamp;
          if (exchange === 'Binance') { d = raw; timestamp = d.closeTime; }
          else if (exchange === 'Bybit') { if (raw.retCode !== 0) throw new Error(raw.retMsg || 'Bybit ticker error'); d = raw.result?.list?.[0]; timestamp = raw.time; }
          else { if (raw.code !== '0') throw new Error(raw.msg || 'OKX ticker error'); d = raw.data?.[0]; timestamp = d?.ts; }
          if (d) {
            const normalized = exchange === 'Binance'
              ? { price:d.lastPrice, change:d.priceChangePercent, quoteVolume:d.quoteVolume, high:d.highPrice, low:d.lowPrice }
              : exchange === 'Bybit'
                ? { price:d.lastPrice, change:toNum(d.price24hPcnt)*100, quoteVolume:d.turnover24h, high:d.highPrice24h, low:d.lowPrice24h }
                : { price:d.last, change:toNum(d.open24h)>0?(Number(d.last)/Number(d.open24h)-1)*100:0, quoteVolume:d.volCcy24h, high:d.high24h, low:d.low24h };
            quoteEvent(exchange,marketType,symbol,{price:toNum(normalized.price),changePct:toNum(normalized.change),quoteVolume24h:toNum(normalized.quoteVolume),high24h:toNum(normalized.high),low24h:toNum(normalized.low),quoteMode:'REST fallback'},timestamp);
          }
        } else stats.errors++;
        if (results[1].status === 'fulfilled') {
          const raw = results[1].value;
          if (exchange === 'Binance') updateBook(exchange,marketType,symbol,raw.bids||[],raw.asks||[],raw.lastUpdateId||now(),'snapshot');
          else if (exchange === 'Bybit') {
            if (raw.retCode !== 0) throw new Error(raw.retMsg || 'Bybit orderbook error');
            updateBook(exchange,marketType,symbol,raw.result?.b||[],raw.result?.a||[],raw.time||now(),'snapshot');
          } else {
            if (raw.code !== '0') throw new Error(raw.msg || 'OKX orderbook error');
            const row = raw.data?.[0]; if (row) updateBook(exchange,marketType,symbol,row.bids||[],row.asks||[],row.ts||now(),'snapshot');
          }
        } else stats.errors++;
        if (results[2].status === 'fulfilled') {
          const raw = results[2].value;
          let candles = [];
          if (exchange === 'Binance') candles = (raw||[]).filter(x=>Number(x[6]) < now()-1000).map(x=>({ts:Number(x[6]),open:x[1],high:x[2],low:x[3],close:x[4],baseVolume:x[5],quoteVolume:x[7]}));
          else if (exchange === 'Bybit') {
            if (raw.retCode !== 0) throw new Error(raw.retMsg || 'Bybit kline error');
            candles = (raw.result?.list||[]).filter(x=>Number(x[0])+60000 < now()-1000).map(x=>({ts:Number(x[0])+59999,open:x[1],high:x[2],low:x[3],close:x[4],baseVolume:x[5],quoteVolume:x[6]}));
          } else {
            if (raw.code !== '0') throw new Error(raw.msg || 'OKX candles error');
            candles = (raw.data||[]).filter(x=>String(x[8])==='1'||Number(x[0])+60000<now()-1000).map(x=>({ts:Number(x[0])+59999,open:x[1],high:x[2],low:x[3],close:x[4],baseVolume:x[5],quoteVolume:x[7]}));
          }
          for (const candle of candles) handleCandle(exchange,marketType,symbol,{...candle,closed:true},candle.ts);
        } else stats.errors++;
      })());
    }
    await Promise.allSettled(jobs);
  }
  function start() {
    if (started) return status();
    started = true; stopping = false;
    if (!symbols.length) throw new Error('no_valid_crypto_symbols');
    if (!exchanges.length) { process.stderr.write('[crypto-stream] No exchange has a confirmed market-data redistribution license; streams remain disabled.\\n'); return status(); }
    if (!storage.configured) process.stderr.write('[crypto-stream] Supabase storage is not configured; market events will not be durable.\n');
    const specs = connectionSpecs();
    for (const spec of specs) connect(spec);
    restFallback().catch(()=>{});
    pollFunding().catch(()=>{});
    flushTimer = setInterval(() => flush().catch(()=>{}), 10000);
    fundingTimer = setInterval(() => pollFunding().catch(()=>{}), 60000);
    const restTimer = setInterval(() => restFallback().catch(()=>{}), 15000); timers.add(restTimer);
    statusTimer = setInterval(() => { if (storage.configured) storage.saveStatus(status()).catch(()=>{}); }, 30000);
    return status();
  }
  async function stop() {
    stopping = true;
    if (flushTimer) clearInterval(flushTimer);
    if (fundingTimer) clearInterval(fundingTimer);
    if (statusTimer) clearInterval(statusTimer);
    for (const timer of timers) clearInterval(timer), clearTimeout(timer);
    timers.clear();
    for (const state of sockets.values()) { state.state='stopped'; if(state.ws) { try { state.ws.close(1000,'shutdown'); } catch (_) {} } }
    await flush();
    started = false;
    return status();
  }
  function mergeMarket(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.markets)) return snapshot;
    const live = new Map(getQuotes().map(q=>[key(q.exchange,q.marketType,q.symbol),q]));
    const markets = snapshot.markets.map(item=>{
      const q=live.get(key(item.exchange,item.marketType,item.nativeSymbol||item.symbol));
      if(!q||!(q.price>0))return item;
      return {...item,price:q.price,bid:q.bid??item.bid,ask:q.ask??item.ask,changePct:q.changePct??item.changePct,quoteVolume:q.quoteVolume24h??item.quoteVolume,sourceTimestamp:q.sourceTimestamp,sourceAgeMs:q.sourceAgeMs,freshnessStatus:q.freshnessStatus,signalEligible:q.freshnessStatus==='fresh',quoteMode:q.quoteMode||'WebSocket push',liveSignal:q.liveSignal||null};
    });
    return {...snapshot,markets,quoteMode:'multi-exchange WebSocket push + REST fallback',realtime:status(),summary:{...(snapshot.summary||{}),websocketQuoteCount:markets.filter(x=>x.quoteMode==='WebSocket push').length}};
  }
  return {start,stop,status,getQuotes,mergeMarket,ingest:handleMessage};
}
let defaultEngine = null;
function createDefaultCryptoStreamEngine() { if (!defaultEngine) defaultEngine = createCryptoStreamEngine(); return defaultEngine; }
module.exports={createCryptoStreamEngine,createDefaultCryptoStreamEngine,DEFAULT_SYMBOLS};
