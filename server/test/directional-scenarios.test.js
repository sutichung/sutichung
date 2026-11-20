'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDirectionalScenarios, validateCandles } = require('../lib/directional-scenarios');
function candles(count=100, slope=0.5) {
  return Array.from({length:count},(_,i)=>{
    const close=100+i*slope;
    return {time:new Date(Date.now()-(count-i)*86400000).toISOString(),open:close-0.2,high:close+1,low:close-1,close,volume:1000+(i%5)*10};
  });
}
test('directional scenarios produce explicit bull, bear and neutral cases from OHLCV',()=>{
 const result=analyzeDirectionalScenarios(candles(),{interval:'1d',source:'test fixture'});
 assert.equal(result.status,'ok');
 assert.equal(result.scenarios.length,3);
 assert.ok(result.scenarios.every(x=>x.trigger&&x.invalidation&&x.response));
 assert.equal(result.safety.liveTrading,false);
});
test('stale candles never produce an actionable direction',()=>{
 const rows=candles().map(x=>({...x,time:new Date(Date.now()-30*86400000).toISOString()}));
 const result=analyzeDirectionalScenarios(rows,{intervalMs:86400000});
 assert.equal(result.status,'stale_data');
 assert.equal(result.direction,'資料不足');
 assert.deepEqual(result.scenarios,[]);
});
test('rejects malformed OHLCV and duplicate timestamps',()=>{
 const bad=candles(); bad[10]={...bad[10],high:1};
 assert.equal(validateCandles(bad).ok,false);
 const duplicate=candles(); duplicate[20].time=duplicate[19].time;
 assert.equal(validateCandles(duplicate).ok,false);
});
test('confidence is data coverage, not a probability',()=>{
 const result=analyzeDirectionalScenarios(candles());
 assert.match(result.confidenceMeaning,/不是勝率/);
 assert.equal(result.safety.modelProbability,false);
});
test('insufficient history is safely rejected',()=>{
 const result=analyzeDirectionalScenarios(candles(30));
 assert.equal(result.status,'insufficient_data');
 assert.deepEqual(result.scenarios,[]);
});
