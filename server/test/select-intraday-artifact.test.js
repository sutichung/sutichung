'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectIntradayArtifact}=require('../jobs/select-intraday-artifact');
function item(id,ageMs){return {id,name:'taiwan-market-intraday-'+id,created_at:new Date(1_800_000_000_000-ageMs).toISOString(),expired:false,workflow_run:{id}};}
test('chooses the closest valid one-hour snapshot and ignores out-of-window artifacts',()=>{
 const now=1_800_000_000_000;
 const result=selectIntradayArtifact([item(1,30*60*1000),item(2,58*60*1000),item(3,66*60*1000)],now,'current');
 assert.equal(result.selected.artifactId,2);
 assert.equal(result.selected.ageMinutes,58);
});
test('does not invent a one-hour result when no matching snapshot exists',()=>{
 const now=1_800_000_000_000;
 const result=selectIntradayArtifact([item(1,20*60*1000),item(2,90*60*1000)],now,'current');
 assert.equal(result.selected,null);
 assert.equal(result.missing.reason,'no_intraday_snapshot_in_50_to_70_minute_window');
});
