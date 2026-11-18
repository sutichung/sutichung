'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadCryptoRiskInputs}=require('../lib/crypto-risk-loader');

test('uses the selected exchange when its candle history is available',async()=>{
 const calls=[];
 const result=await loadCryptoRiskInputs({symbol:'BTCUSDT',type:'perpetual',exchange:'Binance',nativeSymbol:'BTCUSDT',
  getHistory:async(...args)=>{calls.push(args);return {data:[{close:100}],source:'Binance candles'};},
  getDerivatives:async()=>({fundingRate:0.0001}),
  getMicrostructure:async(ex,symbol)=>({exchange:ex,symbol,receivedAt:new Date().toISOString()})});
 assert.equal(calls.length,1);assert.equal(result.dataExchange,'Binance');assert.equal(result.exchangeFallback,false);
 assert.equal(result.derivatives.fundingRate,0.0001);assert.equal(result.microstructure.exchange,'Binance');
});

test('falls back to another official exchange without mixing requested exchange metadata',async()=>{
 const calls=[];
 const result=await loadCryptoRiskInputs({symbol:'BTCUSDT',type:'perpetual',exchange:'Binance',nativeSymbol:'BTCUSDT',
  getHistory:async(s,t,i,ex,native)=>{calls.push({ex,native});if(ex==='Binance')throw new Error('HTTP 451 https://fapi.binance.com/blocked');return {data:[{close:101}],source:ex+' candles'};},
  getDerivatives:async(s,ex)=>({exchange:ex}),getMicrostructure:async(ex,symbol)=>({exchange:ex,symbol})});
 assert.deepEqual(calls,[{ex:'Binance',native:'BTCUSDT'},{ex:'Bybit',native:''}]);
 assert.equal(result.requestedExchange,'Binance');assert.equal(result.dataExchange,'Bybit');assert.equal(result.exchangeFallback,true);
 assert.equal(result.derivatives.exchange,'Bybit');assert.equal(result.microstructure.exchange,'Bybit');
 assert.match(result.historyFailures[0].error,/HTTP 451/);assert.doesNotMatch(result.historyFailures[0].error,/https:\/\//);
});

test('derivatives and microstructure failures do not suppress valid candle risk data',async()=>{
 const result=await loadCryptoRiskInputs({symbol:'BTCUSDT',type:'perpetual',exchange:'OKX',
  getHistory:async()=>({data:[{close:100}],source:'OKX candles'}),
  getDerivatives:async()=>{throw new Error('derivatives timeout');},
  getMicrostructure:async()=>{throw new Error('order book timeout');}});
 assert.equal(result.history.source,'OKX candles');assert.equal(result.derivatives,null);assert.equal(result.microstructure,null);
 assert.equal(result.derivativesError,'derivatives timeout');assert.equal(result.microstructureError,'order book timeout');
});

test('fails explicitly only when all supported candle sources are unavailable',async()=>{
 const result=await loadCryptoRiskInputs({symbol:'BTCUSDT',type:'perpetual',exchange:'Binance',
  getHistory:async(s,t,i,ex)=>{throw new Error(ex+' unavailable');}}).catch(error=>error);
 assert.match(result.message,/risk_history_unavailable/);assert.match(result.message,/Binance unavailable/);
 assert.match(result.message,/Bybit unavailable/);assert.match(result.message,/OKX unavailable/);
});
