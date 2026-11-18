'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadRiskHistory}=require('../lib/risk-history');

const history=(exchange,count=30)=>({exchange,data:Array.from({length:count},(_,i)=>({time:new Date(Date.UTC(2026,0,1+i)).toISOString(),open:100,high:101,low:99,close:100,volume:10})),source:exchange+' public candles'});

test('risk history prefers the selected exchange when its candle history is valid',async()=>{
 const calls=[];
 const result=await loadRiskHistory({symbol:'BTCUSDT',marketType:'perpetual',interval:'1d',exchange:'Binance',getHistory:async(...args)=>{calls.push(args);return history('Binance');}});
 assert.equal(result.status,'connected');
 assert.equal(result.exchange,'Binance');
 assert.equal(result.fallbackFrom,null);
 assert.equal(calls.length,1);
});

test('risk history falls back across supported exchanges when selected candles fail',async()=>{
 const calls=[];
 const result=await loadRiskHistory({symbol:'BTCUSDT',marketType:'perpetual',exchange:'Binance',nativeSymbol:'BTCUSDT',getHistory:async(symbol,type,interval,exchange,native)=>{calls.push({exchange,native});if(exchange==='Binance')throw new Error('upstream_http_502');return history(exchange);}});
 assert.equal(result.status,'fallback');
 assert.equal(result.exchange,'Bybit');
 assert.equal(result.fallbackFrom,'Binance');
 assert.deepEqual(calls.map(x=>x.exchange),['Binance','Bybit']);
 assert.equal(calls[1].native,'BTCUSDT');
 assert.equal(result.errors[0].message,'upstream_http_502');
});

test('risk history rejects short datasets and fails closed when every source fails',async()=>{
 const result=await loadRiskHistory({symbol:'BTCUSDT',exchange:'Binance',minimumCandles:22,getHistory:async()=>history('empty',10)});
 assert.equal(result.status,'unavailable');
 assert.equal(result.history,null);
 assert.equal(result.errors.length,3);
 assert.ok(result.errors.every(x=>x.message==='insufficient_candles_10'));
});
