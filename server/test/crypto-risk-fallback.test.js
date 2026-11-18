'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadRiskHistory,loadFreshMicrostructure,candidates}=require('../lib/crypto-risk-fallback');

const goodHistory={data:Array.from({length:24},(_,i)=>({time:i,open:100,high:102,low:99,close:101,volume:10})),source:'public candles'};
test('risk history fails over across supported exchanges and preserves the real source',async()=>{
 const calls=[];
 const result=await loadRiskHistory({symbol:'BTCUSDT',marketType:'perpetual',exchange:'Binance',getHistory:async(s,t,i,e,n,l)=>{calls.push(e);if(e==='Binance')throw new Error('upstream_http_502');return {...goodHistory,source:e+' candles'};}});
 assert.deepEqual(calls,['Binance','Bybit']);
 assert.equal(result.exchange,'Bybit');
 assert.equal(result.fallbackUsed,true);
 assert.equal(result.history.source,'Bybit candles');
 assert.equal(result.errors[0].error,'upstream_http_502');
});
test('risk history fails closed when every exchange has fewer than 22 candles',async()=>{
 await assert.rejects(()=>loadRiskHistory({symbol:'BTCUSDT',marketType:'perpetual',getHistory:async()=>({data:[]})}),e=>e.attempts.length===3&&e.message==='all_supported_exchanges_failed_to_supply_risk_candles');
});
test('microstructure fallback accepts only a fresh order book and trade tape',async()=>{
 const now=Date.parse('2026-11-18T16:10:00Z'),calls=[];
 const result=await loadFreshMicrostructure({
  symbol:'BTCUSDT',marketType:'perpetual',requestedExchange:'Binance',preferredExchange:'Binance',now:()=>now,
  safeLoad:async(key,ttl,loader,fallback)=>{const exchange=key.split(':')[1];calls.push(exchange);if(exchange==='Binance')return fallback(new Error('upstream_http_502'));return loader();},
  fetchMicrostructure:async({exchange})=>({exchange,receivedAt:new Date(now).toISOString(),book:{bids:[[100,1]],asks:[[101,1]]},tape:{count:100,knownSideCount:100}})
 });
 assert.deepEqual(calls,['Binance','Bybit']);
 assert.equal(result.exchange,'Bybit');
 assert.equal(result.fallbackUsed,true);
 assert.equal(result.data.tape.count,100);
});
test('microstructure fallback rejects stale or incomplete snapshots',async()=>{
 const now=Date.now();
 const result=await loadFreshMicrostructure({
  symbol:'BTCUSDT',marketType:'perpetual',now:()=>now,
  safeLoad:async(key,ttl,loader)=>loader(),
  fetchMicrostructure:async()=>({receivedAt:new Date(now-60000).toISOString(),book:{bids:[[100,1]],asks:[[101,1]]},tape:{count:100,knownSideCount:100}})
 });
 assert.equal(result.data,null);
 assert.equal(result.exchange,null);
 assert.equal(result.errors.length,3);
});
test('exchange candidate order prefers selected exchange then safe alternatives',()=>{
 assert.deepEqual(candidates('Binance','Bybit'),['Bybit','Binance','OKX']);
 assert.deepEqual(candidates('Coinbase','Coinbase'),['Binance','Bybit','OKX']);
});
