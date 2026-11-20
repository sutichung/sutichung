'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runStrategyLab,validateCandles,validateResearchHistory,inferAnnualization}=require('../lib/strategy-lab');
const {dailyTrendMap,runMtfStrategy}=require('../lib/mtf-structure-strategy');

function candles(n=240,mode='trend'){
 let price=100;
 return Array.from({length:n},(_,i)=>{
  const drift=mode==='trend'?0.22:mode==='down'?-0.18:Math.sin(i/5)*0.35;
  const open=price;price=Math.max(10,price+drift+Math.sin(i/2)*0.12);
  return {time:new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10),open,high:Math.max(open,price)+0.5,low:Math.min(open,price)-0.5,close:price,volume:1000+i*3};
 });
}

test('strategy lab rejects insufficient or malformed OHLCV instead of inventing metrics',()=>{
 assert.equal(runStrategyLab(candles(80),{market:'tw-stock'}).status,'insufficient_data');
 const bad=candles();bad[10].high=1;
 assert.equal(validateCandles(bad).ok,false);
 assert.equal(runStrategyLab(bad,{market:'tw-stock'}).status,'insufficient_data');
});


test('strategy lab requires one exact supported market value',()=>{
 assert.equal(runStrategyLab(candles(),{}).status,'invalid_market');
 for(const market of ['TW-STOCK','US','stocks','crypto-futures','']) assert.equal(runStrategyLab(candles(),{market}).status,'invalid_market');
 for(const market of ['tw-stock','us-stock','crypto']) assert.equal(runStrategyLab(candles(),{market}).status,'ok');
});

test('research history fails closed on upstream errors, stale timestamps, unknown sources and insufficient candles',()=>{
 const now=Date.now(); const recent=candles(140).map((x,i)=>({...x,time:new Date(now-(139-i)*86400000).toISOString()})); const valid={data:recent,source:'official test fixture',asOf:recent.at(-1).time};
 assert.equal(validateResearchHistory(valid,'tw-stock').ok,true);
 assert.equal(validateResearchHistory({...valid,error:'upstream timeout'},'tw-stock').status,'upstream_unavailable');
 assert.equal(validateResearchHistory({...valid,source:'unavailable'},'tw-stock').status,'upstream_unavailable');
 assert.equal(validateResearchHistory({...valid,data:candles(100)},'tw-stock').status,'insufficient_data');
 assert.equal(validateResearchHistory({...valid,asOf:'2000-01-01T00:00:00Z'},'tw-stock').status,'stale_data');
 assert.equal(validateResearchHistory(valid,'crypto',{now,interval:'4h'}).ok,true);
 assert.equal(validateResearchHistory({...valid,asOf:new Date(Date.now()+10*60*1000).toISOString()},'tw-stock').status,'invalid_data');
});

test('strategy lab produces separate in-sample and out-of-sample results with explicit costs',()=>{
 const result=runStrategyLab(candles(),{market:'tw-stock',symbol:'2330',source:'unit-test'});
 assert.equal(result.status,'ok');
 assert.equal(result.barCount,240);
 assert.equal(result.split.ratio,'60/40');
 assert.equal(result.split.walkForwardFolds,3);
 assert.equal(result.strategies.length,8);
 assert.ok(result.strategies.every(s=>s.periods.length===2&&s.validation.status));
 assert.ok(result.strategies.some(s=>s.id==='consensus_market_structure'));
 assert.ok(['sma_cross_20_50','donchian_20_10','bollinger_rsi','supertrend_atr'].every(id=>result.strategies.some(s=>s.id===id)));
 assert.ok(result.strategies.every(s=>s.walkForward.folds.length===3));
 const core=result.strategies.filter(s=>['ema_trend_rsi','macd_momentum','bb_mean_reversion'].includes(s.id));
 assert.equal(core.length,3);
 assert.ok(core.every(s=>s.autonomousLearning&&s.autonomousLearning.livePromotion===false));
 assert.ok(core.every(s=>['paper_candidate','rejected','insufficient_evidence'].includes(s.autonomousLearning.status)));
 assert.ok(result.strategies.every(s=>s.costSensitivity.halfCost&&s.costSensitivity.doubleCost));
 assert.ok(result.strategies.every(s=>s.validation.status!=='preliminary_pass'||s.walkForward.passed));
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

test('strategy lab rejects missing volume and missing timestamps instead of coercing them to zero',()=>{
  const missingVolume=candles(140);missingVolume[100].volume=null;
  const volumeResult=runStrategyLab(missingVolume,{market:'tw-stock'});
  assert.notEqual(volumeResult.status,'ok');
  assert.match(volumeResult.error,/無效/);
  const missingTime=candles(140);missingTime[100].time=null;
  const timeResult=runStrategyLab(missingTime,{market:'tw-stock'});
  assert.notEqual(timeResult.status,'ok');
  assert.match(timeResult.error,/時間/);
});

test('strategy lab rejects duplicate timestamps even when OHLCV values are valid',()=>{
  const data=candles(140);data[100].time=data[99].time;
  const result=runStrategyLab(data,{market:'tw-stock'});
  assert.notEqual(result.status,'ok');
  assert.match(result.error,/嚴格遞增/);
});

test('strategy lab normalizes Unix seconds and milliseconds timestamps',()=>{
 const millis=candles(140);millis.forEach(x=>{x.time=Date.parse(x.time);});
 const seconds=candles(140);seconds.forEach(x=>{x.time=Math.floor(Date.parse(x.time)/1000);});
 const msResult=runStrategyLab(millis,{market:'tw-stock'});
 const secResult=runStrategyLab(seconds,{market:'tw-stock'});
 assert.equal(msResult.status,'ok');
 assert.equal(secResult.status,'ok');
 assert.equal(typeof msResult.asOf,'string');
 assert.equal(typeof secResult.asOf,'string');
});

test('MTF daily filter only exposes fully closed daily candles',()=>{
 const daily=Array.from({length:201},(_,i)=>{
  const close=i<150?100:i<200?101:1;
  return {time:new Date(Date.UTC(2024,0,1+i)).toISOString(),open:close,high:close+1,low:close-1,close,volume:1000};
 });
 const times=[new Date(Date.UTC(2024,0,1+200)).toISOString(),new Date(Date.UTC(2024,0,1+201)).toISOString()];
 const aligned=dailyTrendMap(daily,times);
 assert.equal(aligned[0],1,'the still-forming day 200 must not be used');
 assert.equal(aligned[1],-1,'day 200 becomes available only after it closes');
});

test('strategy lab adds MTF structure strategy only when higher-timeframe candles are supplied',()=>{
 const ltf=Array.from({length:240},(_,i)=>{
  const t=new Date(Date.UTC(2024,6,1)+i*4*60*60*1000).toISOString();
  const close=100+i*0.08+Math.sin(i/4)*0.3,open=close-0.1;
  return {time:t,open,high:Math.max(open,close)+0.3,low:Math.min(open,close)-0.3,close,volume:1000+(i%17)*10};
 });
 const htf=candles(240,'trend');
 const withMtf=runStrategyLab(ltf,{market:'crypto',htfCandles:htf});
 assert.equal(withMtf.status,'ok');
 assert.ok(withMtf.strategies.some(s=>s.id==='mtf_structure_4h_1d'));
 assert.equal(withMtf.strategyCount,9);
 const withoutMtf=runStrategyLab(ltf,{market:'crypto'});
 assert.equal(withoutMtf.strategyCount,8);
});

test('MTF strategy rejects missing volume and timestamps in either timeframe',()=>{
 const intraday=Array.from({length:220},(_,i)=>{const close=100+i*.01;return {time:new Date(Date.UTC(2025,0,1)+i*4*60*60*1000).toISOString(),open:close,high:close+1,low:close-1,close,volume:100};});
 const daily=Array.from({length:200},(_,i)=>{const close=100+i*.01;return {time:new Date(Date.UTC(2025,0,1)+i*86400000).toISOString(),open:close,high:close+1,low:close-1,close,volume:1000};});
 const missingVolume=intraday.map(x=>({...x}));missingVolume[10].volume=null;
 assert.equal(runMtfStrategy(missingVolume,daily,{feeBps:10,slippageBps:5,sellTaxBps:0,annualization:365}).status,'invalid_data');
 const missingDailyTime=daily.map(x=>({...x}));missingDailyTime[10].time=null;
 assert.equal(runMtfStrategy(intraday,missingDailyTime,{feeBps:10,slippageBps:5,sellTaxBps:0,annualization:365}).status,'invalid_data');
});

test('annualization follows the actual bar interval across daily and intraday markets',()=>{
 const daily=candles(140);
 const intraday=candles(140);intraday.forEach((x,i)=>{x.time=new Date(Date.UTC(2024,0,1)+i*4*60*60*1000).toISOString();});
 assert.equal(inferAnnualization(daily,'crypto').annualization,365);
 assert.equal(inferAnnualization(daily,'tw-stock').annualization,252);
 assert.equal(inferAnnualization(intraday,'crypto').annualization,2190);
 assert.equal(inferAnnualization(intraday,'us-stock').annualization,410);
 assert.equal(inferAnnualization(intraday,'tw-stock').annualization,284);
});
