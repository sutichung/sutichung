'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSignals,runAdvancedStrategies,defs}=require('../lib/advanced-strategies');

function bars(n=240,mode='cycle'){
 let close=100;
 return Array.from({length:n},(_,i)=>{
  const open=close;
  const drift=mode==='trend'?0.16:Math.sin(i/7)*0.28+(i%37===0?-1.4:0.12);
  close=Math.max(5,close+drift);
  return {time:i,open,high:Math.max(open,close)+0.45,low:Math.min(open,close)-0.45,close,volume:1000+i};
 });
}
const costs={feeBps:14.25,slippageBps:10,sellTaxBps:30,annualization:252};

test('advanced indicator warmup does not turn missing MACD values into zero signals',()=>{
 const features=buildSignals(bars());
 assert.equal(features[24].histogram,null);
 assert.equal(features[32].histogram,null);
 assert.ok(Number.isFinite(features[33].histogram));
});

test('Donchian reference high excludes the current signal candle',()=>{
 const candles=bars(40);
 const features=buildSignals(candles);
 const expected=Math.max(...candles.slice(0,20).map(x=>x.high));
 assert.equal(features[20].prevHigh20,expected);
});

test('advanced strategies return four research candidates with non-negative drawdown metrics',()=>{
 const candles=bars(240);
 const result=runAdvancedStrategies(candles,Math.floor(candles.length*0.6),costs);
 assert.equal(result.length,4);
 assert.deepEqual(result.map(x=>x.id),defs.map(x=>x.id));
 for(const strategy of result){
  assert.equal(strategy.periods.length,2);
  assert.equal(strategy.walkForward.folds.length,3);
  for(const period of strategy.periods)assert.ok(period.metrics.maxDrawdownPct>=0);
  assert.ok(strategy.validation.status==='preliminary_pass'||strategy.validation.status==='not_validated');
  assert.ok(strategy.costSensitivity.halfCost&&strategy.costSensitivity.doubleCost);
 }
});

test('advanced strategy validation cannot pass with fewer than ten walk-forward trades',()=>{
 const result=runAdvancedStrategies(bars(130,'trend'),78,costs);
 assert.ok(result.every(x=>!x.validation.passed||x.walkForward.totalTrades>=10));
});
