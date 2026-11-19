'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DAILY_HISTORY_START,getHistoricalCoverage,validateHistoryRange}=require('../lib/historical-coverage');

test('daily stock history target begins at 1990-01-01',()=>assert.equal(DAILY_HISTORY_START,'1990-01-01'));
test('historical coverage remains disabled without provider and license confirmation',()=>{
 const rows=getHistoricalCoverage({});
 assert.equal(rows.find(x=>x.market==='TWSE').status,'not_ready');
 assert.equal(rows.find(x=>x.market==='US equities').coverageVerified,false);
});
test('provider configuration alone does not claim coverage is verified',()=>{
 const rows=getHistoricalCoverage({US_HISTORICAL_PROVIDER_URL:'https://provider.invalid',US_HISTORICAL_LICENSE_CONFIRMED:'true'});
 const us=rows.find(x=>x.market==='US equities');
 assert.equal(us.status,'verification_required');
 assert.equal(us.coverageVerified,false);
});
test('history range validates order and date shape',()=>{
 assert.deepEqual(validateHistoryRange({from:'1990-01-01',to:'2026-11-19'}),{from:'1990-01-01',to:'2026-11-19'});
 assert.throws(()=>validateHistoryRange({from:'2027-01-01',to:'2026-01-01'}),/invalid_history_range/);
});
