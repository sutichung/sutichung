'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectOutcomeArtifacts}=require('../jobs/select-outcome-artifacts');

function artifact(id,date,time='05:40:00Z',run=id){
 return {id,name:'taiwan-market-close-review-'+run,created_at:date+'T'+time,expired:false,workflow_run:{id:run}};
}
test('selects the Taiwan cash-close snapshot, not the stale after-hours refresh',()=>{
 const rows=[
  artifact(99,'2026-11-18','05:40:00Z','current-run'),
  artifact(100,'2026-11-18','13:10:00Z','late-today'),
  artifact(1,'2026-11-17','05:35:00Z','close-a'),
  artifact(2,'2026-11-17','05:45:00Z','close-b'),
  artifact(3,'2026-11-17','13:10:00Z','after-hours'),
  ...Array.from({length:20},(_,i)=>artifact(i+4,new Date(Date.UTC(2026,10,16-i,5,40)).toISOString().slice(0,10)))
 ];
 const result=selectOutcomeArtifacts(rows,'current-run','2026-11-18');
 assert.equal(result.selected.find(x=>x.horizon==='1d').artifactId,1);
 assert.equal(result.selected.find(x=>x.horizon==='5d').sessions,5);
 assert.equal(result.selected.find(x=>x.horizon==='20d').sessions,20);
 assert.ok(result.selected.every(x=>x.tradeDate<'2026-11-18'));
});
test('reports missing history instead of fabricating unavailable horizons',()=>{
 const result=selectOutcomeArtifacts([artifact(1,'2026-11-17','05:40:00Z')],'current','2026-11-18');
 assert.equal(result.selected.length,1);
 assert.deepEqual(result.missing.map(x=>x.horizon),['5d','20d']);
});
test('ignores artifacts outside the Taiwan market-close capture window',()=>{
 const result=selectOutcomeArtifacts([artifact(1,'2026-11-17','13:10:00Z')],'current','2026-11-18');
 assert.equal(result.selected.length,0);
 assert.equal(result.missing[0].availableTradingDates,0);
});
