'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectOutcomeArtifacts}=require('../jobs/select-outcome-artifacts');
const {selectIntradayArtifact}=require('../jobs/select-intraday-artifact');

function closeArtifact(date,id,minute=340){
 const hour=String(Math.floor(minute/60)).padStart(2,'0'),min=String(minute%60).padStart(2,'0');
 return {id,name:'taiwan-market-close-review-'+id,created_at:date+'T'+hour+':'+min+':00.000Z',workflow_run:{id:Number(id)}};
}

test('outcome artifact selector chooses distinct prior trading dates and correct horizons',()=>{
 const dates=['2026-11-17','2026-11-16','2026-11-13','2026-11-12','2026-11-11','2026-11-10','2026-11-09','2026-11-06','2026-11-05','2026-11-04','2026-11-03','2026-11-02','2026-10-30','2026-10-29','2026-10-28','2026-10-27','2026-10-26','2026-10-23','2026-10-22','2026-10-21'];
 const artifacts=dates.map((date,i)=>closeArtifact(date,String(i+1)));
 artifacts.push(closeArtifact('2026-11-18','today'));
 artifacts.push({...closeArtifact('2026-11-17','late'),created_at:'2026-11-17T13:10:00.000Z'});
 const result=selectOutcomeArtifacts(artifacts,'999','2026-11-18');
 assert.equal(result.availableTradingDates,20);
 assert.deepEqual(result.selected.map(x=>x.horizon),['1d','5d','20d']);
 assert.deepEqual(result.selected.map(x=>x.tradeDate),['2026-11-17','2026-11-11','2026-10-21']);
 assert.equal(new Set(result.selected.map(x=>x.tradeDate)).size,3);
});

test('outcome artifact selector does not fabricate unavailable session horizons',()=>{
 const result=selectOutcomeArtifacts([closeArtifact('2026-11-17','1'),closeArtifact('2026-11-16','2')],'999','2026-11-18');
 assert.equal(result.selected.length,1);
 assert.deepEqual(result.missing.map(x=>x.horizon),['5d','20d']);
});

test('one-hour selector excludes current run and artifacts outside its time window',()=>{
 const now=Date.parse('2026-11-18T06:00:00.000Z');
 const artifacts=[
  {id:1,name:'taiwan-market-intraday-current',created_at:'2026-11-18T05:00:00.000Z',workflow_run:{id:100}},
  {id:2,name:'taiwan-market-intraday-old',created_at:'2026-11-18T04:45:00.000Z',workflow_run:{id:101}},
  {id:3,name:'taiwan-market-intraday-valid',created_at:'2026-11-18T05:02:00.000Z',workflow_run:{id:102}},
  {id:4,name:'taiwan-market-intraday-expired',created_at:'2026-11-18T05:01:00.000Z',expired:true,workflow_run:{id:103}}
 ];
 const result=selectIntradayArtifact(artifacts,now,100);
 assert.equal(result.selected.artifactId,3);
 assert.equal(result.selected.ageMinutes,58);
});
