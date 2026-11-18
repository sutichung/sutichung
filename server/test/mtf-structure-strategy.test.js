'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runMtfStrategy,dailyTrendMap}=require('../lib/mtf-structure-strategy');
const DAY=86400000,HOUR=3600000;
const base=Date.UTC(2025,0,1);
function makeDaily(n=250){
 return Array.from({length:n},(_,i)=>{
  const close=80+i*0.5;
  return {time:base+i*DAY,open:close-0.2,high:close+0.6,low:close-0.6,close,volume:10000+i};
 });
}
function make4h(n=260){
 return Array.from({length:n},(_,i)=>{
  const time=base+200*DAY+i*4*HOUR,close=200+i*0.35;
  return {time,open:close-0.15,high:close+0.5,low:close-0.5,close,volume:500+i};
 });
}
const costs={market:'crypto',feeBps:10,slippageBps:8,sellTaxBps:0};
test('daily trend filter only exposes fully completed daily candles',()=>{
 const daily=makeDaily(250);
 const times=[base+200*DAY-1,base+200*DAY,base+201*DAY-1,base+201*DAY];
 const result=dailyTrendMap(daily,times);
 assert.equal(result[0],0);
 assert.equal(result[1],1);
 assert.equal(result[2],1);
 assert.equal(result[3],1);
});
test('MTF rejects insufficient intraday and daily history',()=>{
 assert.equal(runMtfStrategy(make4h(219),makeDaily(250),costs).status,'insufficient_data');
 assert.equal(runMtfStrategy(make4h(260),makeDaily(199),costs).status,'insufficient_data');
});
test('MTF rejects duplicate or out-of-order timestamps',()=>{
 const bad=make4h();bad[40].time=bad[39].time;
 assert.equal(runMtfStrategy(bad,makeDaily(),costs).status,'invalid_data');
});
test('MTF research returns train, holdout and three walk-forward folds with explicit costs',()=>{
 const result=runMtfStrategy(make4h(),makeDaily(),costs);
 assert.equal(result.status,'ok');
 assert.equal(result.periods.length,2);
 assert.equal(result.walkForward.folds.length,3);
 assert.equal(result.costs.feeBps,10);
 assert.equal(result.costs.slippageBps,8);
 assert.ok(result.periods.every(p=>p.metrics.maxDrawdownPct>=0));
 assert.ok(result.validation.status==='preliminary_pass'||result.validation.status==='not_validated');
});
