'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runStrategyLab,validateCandles}=require('../lib/strategy-lab');

function candles(n=240,mode='trend'){
 let price=100;
 return Array.from({length:n},(_,i)=>{
  const drift=mode==='trend'?0.22:mode==='down'?-0.18:Math.sin(i/5)*0.35;
  const open=price;price=Math.max(10,price+drift+Math.sin(i/2)*0.12);
  return {time:new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10),open,high:Math.max(open,price)+0.5,low:Math.min(open,price)-0.5,close:price,volume:1000+i*3};
 });
}

test('strategy lab rejects insufficient or malformed OHLCV instead of inventing metrics',()=>{
 assert.equal(runStrategyLab(candles(80)).status,'insufficient_data');
 const bad=candles();bad[10].high=1;
 assert.equal(validateCandles(bad).ok,false);
 assert.equal(runStrategyLab(bad).status,'insufficient_data');
});

test('strategy lab produces separate in-sample and out-of-sample results with explicit costs',()=>{
 const result=runStrategyLab(candles(),{market:'tw-stock',symbol:'2330',source:'unit-test'});
 assert.equal(result.status,'ok');
 assert.equal(result.barCount,240);
 assert.equal(result.split.ratio,'60/40');\n assert.equal(result.split.walkForwardFolds,3);
 assert.equal(result.strategies.length,3);
 assert.ok(result.strategies.every(s=>s.periods.length===2&&s.validation.status));\n assert.ok(result.strategies.every(s=>s.walkForward.folds.length===3));\n assert.ok(result.strategies.every(s=>s.costSensitivity.halfCost&&s.costSensitivity.doubleCost));\n assert.ok(result.strategies.every(s=>s.validation.status!=='preliminary_pass'||s.walkForward.passed));
 assert.equal(result.costs.feeBps,14.25);
 assert.equal(result.costs.sellTaxBps,30);
 assert.ok(result.disclaimer.includes('下一根 K 線開盤'));
});

test('strategy lab accepts market-specific fee overrides and never validates no-trade strategies',()=>{
 const result=runStrategyLab(candles(240,'sideways'),{market:'crypto',feeBps:2,slippageBps:1,sellTaxBps:0});
 assert.equal(result.costs.feeBps,2);
 assert.equal(result.costs.annualization,365);
 assert.ok(result.strategies.every(s=>s.validation.status!=='preliminary_pass'||s.periods[1].metrics.trades>=10));
});
