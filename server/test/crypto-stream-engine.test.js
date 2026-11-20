'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCryptoStreamEngine } = require('../lib/crypto-stream-engine');

const BASE = Date.parse('2026-11-20T06:00:00.000Z');
function makeStorage(configured = true) {
  const saved = [];
  return { configured, saved, saveMinuteBatch: async x => { saved.push(x); return { stored:true, count:x.events.length }; }, saveStatus: async () => ({ stored:true }) };
}
function engine(extra = {}) {
  const storage = extra.storage || makeStorage();
  let clock = BASE;
  const instance = createCryptoStreamEngine({
    symbols:['BTCUSDT'], exchanges:['Binance','Bybit','OKX'], skipLicenseCheck:true,
    enableFutures:true, now:()=>clock, storage, ...extra
  });
  return { instance, storage, advance(ms=1000) { clock += ms; return clock; } };
}

test('Coinbase and Kraken native USD ticker symbols are normalized and merged', () => {
  const x = engine();
  x.instance.ingest('Coinbase','spot',JSON.stringify({type:'ticker',product_id:'BTC-USD',price:'65000',best_bid:'64999',best_ask:'65001',time:new Date(BASE).toISOString()}));
  x.instance.ingest('Kraken','spot',JSON.stringify({channel:'ticker',data:[{symbol:'BTC/USD',last:65010,bid:65009,ask:65011,timestamp:new Date(BASE).toISOString()}]}));
  const quotes=x.instance.getQuotes();
  assert.equal(quotes.find(q=>q.exchange==='Coinbase').price,65000);
  assert.equal(quotes.find(q=>q.exchange==='Kraken').price,65010);
  const merged=x.instance.mergeMarket({markets:[{exchange:'Coinbase',marketType:'spot',nativeSymbol:'BTC-USD',price:1},{exchange:'Kraken',marketType:'spot',nativeSymbol:'BTC/USD',price:1}]});
  assert.equal(merged.markets[0].price,65000);
  assert.equal(merged.markets[1].price,65010);
});
test('Binance ticker websocket message is normalized with source and receive time', () => {
  const x = engine();
  x.instance.ingest('Binance','spot',JSON.stringify({stream:'btcusdt@ticker',data:{e:'24hrTicker',E:BASE,s:'BTCUSDT',c:'100',P:'1.25',q:'123456',h:'105',l:'95'}}));
  const q = x.instance.getQuotes()[0];
  assert.equal(q.exchange,'Binance');
  assert.equal(q.price,100);
  assert.equal(q.changePct,1.25);
  assert.equal(q.freshnessStatus,'fresh');
});

test('Bybit ticker and orderbook snapshot/delta maintain top levels and imbalance', () => {
  const x = engine();
  x.instance.ingest('Bybit','spot',JSON.stringify({topic:'tickers.BTCUSDT',ts:BASE,data:{s:'BTCUSDT',lastPrice:'100',bid1Price:'99',ask1Price:'101',price24hPcnt:'0.01',turnover24h:'5000'}}));
  x.instance.ingest('Bybit','spot',JSON.stringify({topic:'orderbook.50.BTCUSDT',type:'snapshot',ts:BASE,data:{s:'BTCUSDT',b:[['100','5'],['99','5']],a:[['101','4'],['102','4']]}}));
  x.instance.ingest('Bybit','spot',JSON.stringify({topic:'orderbook.50.BTCUSDT',type:'delta',ts:BASE+1000,data:{s:'BTCUSDT',b:[['100','2'],['99','0'],['98','5']],a:[]}}));
  const q=x.instance.getQuotes().find(x=>x.exchange==='Bybit');
  assert.equal(q.bid,100);
  assert.equal(q.ask,101);
  assert.ok(q.liveSignal);
});

test('stale source timestamps are not marked as fresh', () => {
  const x = engine();
  x.instance.ingest('Binance','spot',JSON.stringify({data:{e:'24hrTicker',E:BASE-120000,s:'BTCUSDT',c:'100',P:'0',q:'1'}}));
  assert.equal(x.instance.getQuotes()[0].freshnessStatus,'stale');
});

test('closed Bybit one-minute candles are persisted; unconfirmed candles are ignored', async () => {
  const x = engine();
  x.instance.ingest('Bybit','spot',JSON.stringify({topic:'kline.1.BTCUSDT',ts:BASE,data:[{start:BASE,end:BASE+59999,confirm:false,open:'100',high:'101',low:'99',close:'100',volume:'10',turnover:'1000'}]}));
  x.instance.ingest('Bybit','spot',JSON.stringify({topic:'kline.1.BTCUSDT',ts:BASE+60000,data:[{start:BASE,end:BASE+59999,confirm:true,open:'100',high:'101',low:'99',close:'100',volume:'10',turnover:'1000'}]}));
  await x.instance.stop();
  const rows=x.storage.saved.flatMap(batch=>batch.events);
  assert.equal(rows.filter(row=>row.eventType==='closed_1m_candle').length,1);
});

test('OKX candle close flag is honored and funding is not confused with ticker data', async () => {
  const x = engine();
  x.instance.ingest('OKX','spot',JSON.stringify({arg:{channel:'candle1m',instId:'BTC-USDT'},data:[['1763618400000','100','101','99','100','10','1000','1000','0']]}));
  x.instance.ingest('OKX','spot',JSON.stringify({arg:{channel:'candle1m',instId:'BTC-USDT'},data:[['1763618460000','100','102','99','101','12','1200','1200','1']]}));
  await x.instance.stop();
  const rows=x.storage.saved.flatMap(batch=>batch.events);
  assert.equal(rows.filter(row=>row.eventType==='closed_1m_candle').length,1);
});

test('event buffering is disabled when durable Supabase storage is not configured', () => {
  const x = engine({storage:makeStorage(false)});
  x.instance.ingest('Binance','spot',JSON.stringify({data:{e:'24hrTicker',E:BASE,s:'BTCUSDT',c:'100',P:'0',q:'1'}}));
  assert.equal(x.instance.status().storage.pendingBatches,0);
  assert.equal(x.instance.status().storage.configured,false);
});

test('OKX SWAP instrument IDs normalize to the dashboard symbol when merging live quotes', () => {
  const x = engine();
  x.instance.ingest('OKX','perpetual',JSON.stringify({arg:{channel:'tickers',instId:'BTC-USDT-SWAP'},data:[{last:'100',bidPx:'99.9',askPx:'100.1',open24h:'99',volCcy24h:'1000',ts:String(BASE)}]}));
  const merged=x.instance.mergeMarket({markets:[{exchange:'OKX',marketType:'perpetual',nativeSymbol:'BTC-USDT-SWAP',symbol:'BTCUSDT',price:99}]});
  assert.equal(merged.markets[0].price,100);
  assert.equal(merged.markets[0].quoteMode,'WebSocket push');
});

test('OKX perpetual contract sizes are not falsely classified as quote notional whales', async () => {
  const x = engine();
  x.instance.ingest('OKX','perpetual',JSON.stringify({arg:{channel:'trades',instId:'BTC-USDT-SWAP'},data:[{px:'50000',sz:'100',side:'buy',ts:String(BASE)}]}));
  await x.instance.stop();
  const rows=x.storage.saved.flatMap(batch=>batch.events);
  assert.equal(rows.filter(row=>row.eventType==='large_trade').length,0);
  const contract=rows.find(row=>row.eventType==='trade_contract_size');
  assert.equal(contract.notional,null);
  assert.equal(contract.whaleClassificationAvailable,false);
});
