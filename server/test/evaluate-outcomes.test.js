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


function eodPrevious(snapshotTimestamp='2026-11-19T13:40:00+08:00'){
 return {snapshotTimestamp,topBullish:[{symbol:'2330',price:100}],topBearish:[]};
}
function officialDailyQuote(overrides={}){
 return {
  symbol:'2330',market:'TWSE',price:102,timestamp:null,sourceTimestamp:null,
  dataMode:'END_OF_DAY',quoteType:'official-daily-close',delayed:true,
  asOf:'2026-11-20',source:'TWSE OpenAPI STOCK_DAY_ALL',...overrides
 };
}
function eodSnapshot(quote){
 return {source:'TWSE + TPEx official daily close',data:{'2330':quote}};
}

test('1d evaluation accepts a later official TWSE EOD close using the Taiwan session close timestamp',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious(),eodSnapshot(officialDailyQuote()),{horizon:'1d',sessions:1,now:fixedNow});
 assert.equal(report.evaluatedCount,1);
 assert.equal(report.excludedCount,0);
 assert.equal(report.results[0].observationMode,'END_OF_DAY');
 assert.equal(report.results[0].quoteTimestamp,'2026-11-20T05:30:00.000Z');
 assert.equal(report.currentSnapshotAsOf,'2026-11-20T05:30:00.000Z');
});

test('1h evaluation refuses to substitute an official EOD close for an intraday observation',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious('2026-11-20T12:00:00+08:00'),eodSnapshot(officialDailyQuote()),{horizon:'1h',sessions:0,now:fixedNow});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'intraday_quote_required');
});

test('1h evaluation accepts a fresh source timestamp from a real intraday quote',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const quote={symbol:'2330',market:'TWSE',price:102,timestamp:'2026-11-20T13:59:00+08:00',source:'Licensed realtime feed',dataMode:'REALTIME',delayed:false};
 const report=evaluateOutcomes(eodPrevious('2026-11-20T13:00:00+08:00'),eodSnapshot(quote),{horizon:'1h',sessions:0,now:fixedNow});
 assert.equal(report.evaluatedCount,1);
 assert.equal(report.results[0].observationMode,'REALTIME');
 assert.equal(report.results[0].quoteTimestamp,'2026-11-20T05:59:00.000Z');
});

test('stale official daily closes are excluded rather than treated as current prices',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious('2026-11-10T13:40:00+08:00'),eodSnapshot(officialDailyQuote({asOf:'2026-11-14'})),{horizon:'1d',sessions:1,now:fixedNow});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'stale_or_future_quote');
});

test('future-dated official daily closes are excluded',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious(),eodSnapshot(officialDailyQuote({asOf:'2026-11-21'})),{horizon:'1d',sessions:1,now:fixedNow});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'stale_or_future_quote');
});

test('an official daily close observed before the signal snapshot is excluded',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious('2026-11-20T13:35:00+08:00'),eodSnapshot(officialDailyQuote()),{horizon:'1d',sessions:1,now:fixedNow});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'quote_predates_signal_snapshot');
});

test('EOD data from an unsupported market is not assigned the Taiwan session close time',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious(),eodSnapshot(officialDailyQuote({market:'US',exchange:'NASDAQ'})),{horizon:'1d',sessions:1,now:fixedNow});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'unsupported_eod_market');
});

test('malformed official EOD dates are excluded',()=>{
 const fixedNow=Date.parse('2026-11-20T14:00:00+08:00');
 const report=evaluateOutcomes(eodPrevious(),eodSnapshot(officialDailyQuote({asOf:'20-11-2026'})),{horizon:'1d',sessions:1,now:fixedNow});
 assert.equal(report.evaluatedCount,0);
 assert.equal(report.excluded[0].reason,'invalid_eod_date');
});
