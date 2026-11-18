'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectOutcomeArtifacts}=require('../jobs/select-outcome-artifacts');

function artifact(id,date,time='13:40:00Z',run=id){
 return {id,name:'taiwan-market-close-review-'+run,created_at:date+'T'+time,expired:false,workflow_run:{id:run}};
}
test('selects prior trading dates only and uses the latest report per date',()=>{
 const rows=[
  artifact(99,'2026-11-18','13:10:00Z','earlier-today'),
  artifact(100,'2026-11-18','13:40:00Z','current-run'),
  artifact(1,'2026-11-17','13:10:00Z','old-a'),
  artifact(2,'2026-11-17','13:40:00Z','old-b'),
  ...Array.from({length:20},(_,i)=>artifact(i+3,new Date(Date.UTC(2026,10,16-i)).toISOString().slice(0,10)))
 ];
 const result=selectOutcomeArtifacts(rows,'current-run','2026-11-18');
 assert.equal(result.selected.find(x=>x.horizon==='1d').artifactId,2);
 assert.equal(result.selected.find(x=>x.horizon==='5d').sessions,5);
 assert.equal(result.selected.find(x=>x.horizon==='20d').sessions,20);
 assert.ok(result.selected.every(x=>x.tradeDate<'2026-11-18'));
});
test('reports missing history instead of fabricating unavailable horizons',()=>{
 const result=selectOutcomeArtifacts([artifact(1,'2026-11-17')],'current','2026-11-18');
 assert.equal(result.selected.length,1);
 assert.deepEqual(result.missing.map(x=>x.horizon),['5d','20d']);
});
