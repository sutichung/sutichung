'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFeatures, backtestNextOpen } = require('../lib/quant-research');
function bars(n=80) {
  return Array.from({length:n},(_,i)=>{const close=100+i*0.2+Math.sin(i/3);return {timestamp:i,open:close-0.1,high:close+1,low:close-1,close,volume:1000+(i%7)*50};});
}
test('feature generation emits finite numeric features and labels proxy cautiously',()=>{
 const f=buildFeatures(bars());
 assert.ok(f.length>0);
 assert.ok(Number.isFinite(f.at(-1).rsi14));
 assert.ok(Number.isFinite(f.at(-1).volumePriceAbsorptionProxy));
});
test('backtest fills after signal bar and includes costs/open position mark-to-market',()=>{
 const b=bars(), p=Array(b.length).fill(0.5);
 p[40]=0.9; p[50]=0.1;
 const r=backtestNextOpen(b,p,{feeRate:0.001,slippageRate:0.001});
 assert.ok(Number.isFinite(r.finalEquity));
 assert.equal(r.tradeCount,1);
 assert.ok(r.openPosition===null || Number.isFinite(r.openPosition.unrealizedPnl));
});
test('rejects malformed probabilities and invalid costs',()=>{
 const b=bars();
 assert.throws(()=>backtestNextOpen(b,Array(b.length).fill(2)));
 assert.throws(()=>backtestNextOpen(b,Array(b.length).fill(0.5),{feeRate:1}));
});
