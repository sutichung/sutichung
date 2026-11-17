'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ema,sma,rsi,indicators}=require('../lib/indicators');

test('moving averages and RSI return expected values and guard insufficient history',()=>{
 assert.equal(sma([1,2,3],5),null);
 assert.equal(ema([1,2,3],4),null);
 assert.equal(sma([1,2,3,4],2),3.5);
 assert.equal(rsi(Array(16).fill(10)),50);
 assert.equal(rsi(Array.from({length:16},(_,i)=>i+1)),100);
});

test('technical engine returns trend, momentum, volatility, volume and price-level indicators',()=>{
 const candles=Array.from({length:100},(_,i)=>{
  const close=50+i*0.4+Math.sin(i/3);
  return {time:String(i),open:close-0.2,high:close+1,low:close-1,close,volume:1000+i*10+(i%5)*30};
 });
 const x=indicators(candles);
 assert.ok(x);
 for(const key of ['rsi','sma5','sma20','sma60','ema5','ema10','ema20','ema60','macd','macdSignal','macdHistogram','atr','atrPercent','adx','plusDi','minusDi','bollingerUpper','bollingerMiddle','bollingerLower','cci','obv','mfi','k','d','williamsR','roc20','vwap20','volumeRatio','support','resistance']) assert.ok(Number.isFinite(x[key]),key);
 assert.ok(x.rsi>=0&&x.rsi<=100);
 assert.ok(x.mfi>=0&&x.mfi<=100);
 assert.ok(x.bollingerUpper>=x.bollingerMiddle&&x.bollingerMiddle>=x.bollingerLower);
 assert.ok(x.resistance>=x.support);
});

test('technical engine rejects malformed OHLCV rather than manufacturing values',()=>{
 const candles=Array.from({length:60},(_,i)=>({open:10,high:11,low:9,close:10+i*.01,volume:100}));
 assert.equal(indicators(candles),null);
 candles[10].volume=-1;
 assert.equal(indicators(candles),null);
});
