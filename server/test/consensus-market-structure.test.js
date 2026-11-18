'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runConsensusResearch,features,score,simulate}=require('../lib/consensus-market-structure');

function bars(count=130){
  const start=Date.parse('2026-01-01T00:00:00.000Z');
  return Array.from({length:count},(_,i)=>{
    const close=100+i*0.05;
    return {time:new Date(start+i*86400000).toISOString(),open:close-0.1,high:close+1,low:close-1,close,volume:1000+i%7};
  });
}

test('consensus research rejects insufficient data and missing OHLCV fields',()=>{
  assert.equal(runConsensusResearch(bars(129)).status,'insufficient_data');
  const missingVolume=bars();missingVolume[20].volume=null;
  assert.equal(runConsensusResearch(missingVolume).status,'invalid_data');
  const missingTime=bars();missingTime[20].time=null;
  assert.equal(runConsensusResearch(missingTime).status,'invalid_data');
});

test('consensus research rejects duplicate or non-monotonic candle timestamps',()=>{
  const duplicate=bars();duplicate[20].time=duplicate[19].time;
  const report=runConsensusResearch(duplicate);
  assert.equal(report.status,'invalid_data');
  assert.match(report.error,/嚴格遞增/);
});

test('swing points are not counted until their right-side confirmation bars exist',()=>{
  const sample=bars(30);
  sample[5].high=150;
  const result=features(sample,5);
  assert.equal(result[9].swingCount,0);
  assert.ok(result[10].swingCount>=1);
});

test('missing volatility and order-block features never create bullish score reasons',()=>{
  const result=score({
    trendDir:0,er:0.2,chop:40,volPercentile:null,
    nearestBullOb:null,nearestBearOb:null,volZ:0,structure:'neutral'
  });
  assert.equal(result.value,0);
  assert.deepEqual(result.reasons,[]);
});

test('trade simulation closes positions without reference errors and reports positive drawdown magnitude',()=>{
  const sample=[
    {time:'2026-01-01T00:00:00.000Z',open:100,high:101,low:99,close:100,volume:100},
    {time:'2026-01-02T00:00:00.000Z',open:100,high:101,low:89,close:90,volume:120},
    {time:'2026-01-03T00:00:00.000Z',open:90,high:92,low:88,close:91,volume:110}
  ];
  const strong={trendDir:1,er:0.5,chop:40,volPercentile:0.5,nearestBullOb:0,nearestBearOb:null,volZ:2,structure:'bullish_bos'};
  const weak={trendDir:-1,er:0.2,chop:70,volPercentile:0.9,nearestBullOb:null,nearestBearOb:0,volZ:0,structure:'bearish_bos'};
  const result=simulate(sample,[strong,weak,weak],0,3,{feeBps:10,slippageBps:5,sellTaxBps:0,annualization:252},3.5);
  assert.equal(result.trades,1);
  assert.ok(result.tradeDetails[0].pnl<0);
  assert.ok(result.maxDrawdownPct>0);
  assert.ok(result.maxDrawdownPct<100);
});

test('flat market research cannot pass sample-out-of-sample validation without real trades',()=>{
  const sample=bars(130).map(x=>({...x,open:100,high:101,low:99,close:100,volume:1000}));
  const result=runConsensusResearch(sample,{market:'tw-stock'});
  assert.equal(result.status,'ok');
  assert.equal(result.validation.passed,false);
  assert.equal(result.periods[1].metrics.trades,0);
});

test('consensus research rejects negative or non-finite cost assumptions',()=>{
  const result=runConsensusResearch(bars(),{feeBps:-1});
  assert.equal(result.status,'invalid_options');
});
