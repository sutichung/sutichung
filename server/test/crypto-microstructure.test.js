'use strict';
const MARKET_DATA_TEST_LICENSES={BINANCE_MARKET_DATA_LICENSE_CONFIRMED:'true',BYBIT_MARKET_DATA_LICENSE_CONFIRMED:'true',OKX_MARKET_DATA_LICENSE_CONFIRMED:'true',COINBASE_MARKET_DATA_LICENSE_CONFIRMED:'true',KRAKEN_MARKET_DATA_LICENSE_CONFIRMED:'true',KRAKEN_FUTURES_MARKET_DATA_LICENSE_CONFIRMED:'true'};
for(const [key,value] of Object.entries(MARKET_DATA_TEST_LICENSES))if(process.env[key]===undefined)process.env[key]=value;
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBook, normalizeTrades, getJsonFallback } = require('../lib/crypto-microstructure');

test('order book computes spread and depth imbalance from valid levels', () => {
  const book = normalizeBook('test', [[101, 8], [100, 2]], [[103, 4], [104, 1]], null, 10);
  assert.equal(book.bestBid, 101);
  assert.equal(book.bestAsk, 103);
  assert.equal(book.midPrice, 102);
  assert.ok(Math.abs(book.spreadPct - (2 / 102 * 100)) < 1e-10);
  assert.equal(book.bidDepth, 10);
  assert.equal(book.askDepth, 5);
  assert.equal(book.obi, 1 / 3);
  assert.equal(book.weightedObi, (8 + 2 / 2 - (4 + 1 / 2)) / (8 + 2 / 2 + 4 + 1 / 2));
  assert.ok(book.obiNotional > 0, 'quote notional imbalance should reflect stronger bid-side notional');
  assert.equal(book.bestBidSize, 8);
  assert.equal(book.bestAskSize, 4);
  assert.ok(book.microPrice > book.midPrice, 'larger bid size should pull microprice upward');
  assert.deepEqual(book.depthBands, [], 'do not label fewer than five levels as a five-level band');
  assert.equal(book.timestamp, null, 'do not invent an exchange timestamp');
});

test('empty or invalid order books are rejected', () => {
  assert.throws(() => normalizeBook('test', [], [[1, 1]], null), /orderbook_empty/);
  assert.throws(() => normalizeBook('test', [[0, 1]], [[1, 1]], null), /orderbook_empty/);
});

test('trade tape identifies large trades and ignores invalid rows', () => {
  const rows = normalizeTrades('test', [
    { id: '1', timestamp: 1000, side: 'buy', price: 60000, amount: 1 },
    { id: '2', timestamp: 2000, side: 'sell', price: 60000, amount: 0.5 },
    { id: '3', timestamp: 3000, side: 'buy', price: 'bad', amount: 1 }
  ], 50000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '2');
  assert.equal(rows[0].large, false);
  assert.equal(rows[1].large, true);
});

test('order book rejects crossed books and non-positive depth rows', () => {
  assert.throws(() => normalizeBook('test', [[102, 1]], [[101, 1]], null), /orderbook_crossed/);
  assert.throws(() => normalizeBook('test', [[100, 'NaN']], [[101, 1]], null), /orderbook_empty/);
});

test('whale classification only runs when quote currency is USD comparable', () => {
  const rows = [{ id: '1', timestamp: 1700000000000, side: 'buy', price: '60000', amount: '1', quoteCurrency: 'USDT' }];
  assert.equal(normalizeTrades('Binance', rows, 50000)[0].large, true);
  assert.equal(normalizeTrades('Binance', [{ ...rows[0], quoteCurrency: 'BTC' }], 50000)[0].large, null);
});

test('missing trade timestamps and explicit null cost stay missing or derive from price and amount', () => {
  const [trade] = normalizeTrades('Binance', [{ price: '100', amount: '2', timestamp: null, cost: null, side: 'buy' }]);
  assert.equal(trade.timestamp, null);
  assert.equal(trade.quoteValue, 200);
});

test('unsupported exchanges and malformed symbols fail closed', async () => {
  const { fetchMicrostructure } = require('../lib/crypto-microstructure');
  await assert.rejects(() => fetchMicrostructure({ exchange: 'Unknown', symbol: 'BTCUSDT' }), /unsupported_exchange/);
  await assert.rejects(() => fetchMicrostructure({ exchange: 'Binance', symbol: '../../secret' }), /invalid_symbol/);
});

test('derivative contract sizing can be explicitly disabled when quote notional is not reliable', () => {
  const trade = { id: 'swap-1', timestamp: 1700000000000, side: 'buy', price: '60000', amount: '1', quoteCurrency: 'USDT', whaleClassificationAvailable: false };
  assert.equal(normalizeTrades('OKX', [trade], 50000)[0].large, null);
});

test('trade tape exposes aggressive buy pressure only from known quote notional', () => {
  const { normalizeTrades: normalize } = require('../lib/crypto-microstructure');
  const trades = normalize('Binance', [
    { id: 'b', timestamp: 2, side: 'buy', price: 100, amount: 3, quoteCurrency: 'USDT' },
    { id: 's', timestamp: 1, side: 'sell', price: 100, amount: 1, quoteCurrency: 'USDT' }
  ]);
  const buy = trades.filter(x => x.side === 'buy').reduce((s, x) => s + x.quoteValue, 0);
  const sell = trades.filter(x => x.side === 'sell').reduce((s, x) => s + x.quoteValue, 0);
  assert.equal(buy / (buy + sell) * 100, 75);
});

test('depth bands only report levels actually present in the order book', () => {
  const bids = Array.from({ length: 20 }, (_, i) => [100 - i, 20 - i]);
  const asks = Array.from({ length: 20 }, (_, i) => [102 + i, 20 - i]);
  const book = normalizeBook('test', bids, asks, null, 20);
  assert.deepEqual(book.depthBands.map(x => x.levels), [5, 10, 20]);
});

test('order book normalizes unsorted levels before calculating best bid and ask', () => {
  const book = normalizeBook('test', [[99, 2], [101, 3], [100, 4]], [[103, 2], [102, 5], [104, 1]], null, 10);
  assert.equal(book.bestBid, 101);
  assert.equal(book.bestAsk, 102);
  assert.equal(book.bids[0][0], 101);
  assert.equal(book.asks[0][0], 102);
});

test('contract order books do not publish quote-notional imbalance without a verified multiplier', () => {
  const book = normalizeBook('OKX', [[60000, 12], [59900, 8]], [[60100, 10], [60200, 9]], 1700000000000, 10, { notionalAvailable: false });
  assert.equal(book.obiNotional, null);
  assert.ok(Number.isFinite(book.obi), 'unit-based visible depth imbalance remains available');
});

test('exchange timestamp is sourced from the order book snapshot timestamp', () => {
  const timestamp = 1700000000123;
  const book = normalizeBook('Bybit', [[100, 2]], [[101, 2]], timestamp, 10);
  assert.equal(book.timestamp, new Date(timestamp).toISOString());
});

test('Bybit official alternate host fallback records the successful endpoint',async()=>{
 const original=global.fetch;const calls=[];
 global.fetch=async url=>{
  calls.push(String(url));
  if(String(url).includes('api.bybit.com'))return {ok:false,status:403,json:async()=>({})};
  return {ok:true,status:200,json:async()=>({retCode:0})};
 };
 try{
  const result=await getJsonFallback(['https://api.bybit.com/v5/market/time','https://api.bytick.com/v5/market/time']);
  assert.equal(result.base,'https://api.bytick.com');
  assert.equal(result.data.retCode,0);
  assert.equal(calls.length,2);
 }finally{global.fetch=original;}
});

test('Kraken Futures microstructure uses official instrument, orderbook and recent executions',async()=>{
 const original=global.fetch;const calls=[];
 global.fetch=async url=>{
  const u=String(url);calls.push(u);
  const ok=data=>({ok:true,status:200,json:async()=>data});
  if(u.includes('/derivatives/api/v3/tickers'))return ok({tickers:[{tag:'perpetual',pair:'XBT:USD',symbol:'pf_xbtusd'}]});
  if(u.includes('/derivatives/api/v3/orderbook'))return ok({result:'success',serverTime:'2026-11-19T12:00:00.000Z',orderBook:{bids:[[65000,2],[64999,3]],asks:[[65001,2],[65002,3]]}});
  if(u.includes('/derivatives/api/v3/history'))return ok({result:'success',serverTime:'2026-11-19T12:00:00.000Z',history:[{trade_id:1,time:'2026-11-19T11:59:59.000Z',side:'buy',price:65001,size:2,type:'fill'}]});
  return {ok:false,status:404,json:async()=>({})};
 };
 try{
  const {fetchMicrostructure}=require('../lib/crypto-microstructure');
  const result=await fetchMicrostructure({exchange:'Kraken Futures',symbol:'BTCUSDT',marketType:'perpetual',depth:10});
  assert.equal(result.exchange,'Kraken Futures');
  assert.equal(result.book.bestBid,65000);
  assert.equal(result.book.bestAsk,65001);
  assert.equal(result.tape.count,1);
  assert.equal(result.tape.knownSideCount,1);
  assert.equal(result.tape.largeTradeCount,null);
  assert.equal(result.tape.buyQuoteValue,null);
  assert.ok(calls.some(x=>x.includes('/orderbook?symbol=PF_XBTUSD')));
  assert.ok(calls.some(x=>x.includes('/history?symbol=PF_XBTUSD')));
 }finally{global.fetch=original;}
});
