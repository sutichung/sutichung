'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateOutcomes,REQUIRED_SESSIONS}=require('../jobs/evaluate-outcomes');

const now=Date.parse('2026-11-18T06:40:00.000Z');
function previous(overrides={}) {
 return {
  generatedAt:'2026-11-18T05:39:00.000Z',
  snapshotTimestamp:'2026-11-18T05:35:00.000Z',
  topBullish:[{symbol:'2330',price:100,scorecard:{score:88}}],
  topBearish:[{symbol:'2317',price:200}],
  ...overrides
 };
}
function snapshot(overrides={}) {
 return {
  timestamp:'2026-11-18T06:39:00.000Z',
  source:'TWSE MIS official snapshot',
  data:{
   '2330':{price:102,timestamp:'2026-11-18T06:38:00.000Z',source:'TWSE MIS'},
   '2317':{price:196,timestamp:'2026-11-18T06:38:00.000Z',source:'TWSE MIS'}
  },
  ...overrides
 };
}

test('outcome evaluator measures long and short direction after the source snapshot and deducts costs',()=>{
 const report=evaluateOutcomes(previous(),snapshot(),{horizon:'1d',sessions:1,costPct:0.3,now});
 assert.equal(report.evaluatedSignalCount,2);
 assert.equal(report.evaluatedCount,2);
 assert.equal(report.long.count,1);
 assert.equal(report.short.count,1);
 assert.ok(report.results.find(x=>x.symbol==='2330').netReturnPct>0);
 assert.ok(report.results.find(x=>x.symbol==='2317').netReturnPct>0);
 assert.equal(report.sourceReportAsOf,'2026-11-18T05:35:00.000Z');
 assert.equal(report.elapsedSinceSignalMinutes,65);
});

test('excludes missing, stale, future and pre-signal quote timestamps rather than inventing returns',()=>{
 const data={
  '2330':{price:102,timestamp:'2026-11-18T05:30:00.000Z'},
  '2317':{price:196,timestamp:'2026-11-18T06:00:00.000Z'},
  '2303':{price:40,timestamp:'2026-11-18T07:00:00.000Z'}
 };
 const report=evaluateOutcomes(previous({topBearish:[],topBullish:[
  {symbol:'2330',price:100},{symbol:'2317',price:200},{symbol:'2303',price:40},{symbol:'2454',price:900}
 ]}),snapshot({data}),{horizon:'1d',sessions:1,now});
 assert.equal(report.evaluatedCount,0);
 assert.deepEqual(report.excluded.map(x=>x.reason),[
  'quote_predates_signal_snapshot','stale_or_future_quote','stale_or_future_quote','missing_current_quote'
 ]);
 assert.equal(report.directionalHitRatePct,null);
});

test('enforces horizon-to-session mapping and one-hour elapsed-time window',()=>{
 assert.deepEqual(REQUIRED_SESSIONS,{'1h':0,'1d':1,'5d':5,'20d':20});
 assert.throws(()=>evaluateOutcomes(previous(),snapshot(),{horizon:'5d',sessions:1,now}),/do not match/);
 assert.throws(()=>evaluateOutcomes(previous({snapshotTimestamp:'2026-11-18T06:20:00.000Z'}),snapshot(),{horizon:'1h',sessions:0,now}),/45-minute/);
 assert.throws(()=>evaluateOutcomes(previous({snapshotTimestamp:'2026-11-18T07:00:00.000Z'}),snapshot(),{horizon:'1d',sessions:1,now}),/future/);
});

test('rejects unsafe cost assumptions and invalid signal prices',()=>{
 assert.throws(()=>evaluateOutcomes(previous(),snapshot(),{horizon:'1d',sessions:1,costPct:-1,now}),/cost assumption/);
 const report=evaluateOutcomes(previous({topBullish:[{symbol:'2330',price:0}],topBearish:[]}),snapshot(),{horizon:'1d',sessions:1,now});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'invalid_entry_price');
});

test('uses a conservative Taiwan round-trip cost by default',()=>{
 const report=evaluateOutcomes(previous(),snapshot(),{horizon:'1d',sessions:1,now});
 assert.equal(report.assumedRoundTripCostPct,0.785);
 assert.match(report.costAssumption,/0\.1425%/);
 assert.match(report.costAssumption,/0\.30%/);
});
