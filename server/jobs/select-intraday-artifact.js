'use strict';
const fs=require('node:fs');

function selectIntradayArtifact(artifacts,nowMs=Date.now(),currentRunId=null){
 const targetAge=60*60*1000,minAge=50*60*1000,maxAge=70*60*1000;
 const candidates=(Array.isArray(artifacts)?artifacts:[]).flatMap(x=>{
  if(!x.name||!x.name.startsWith('taiwan-market-intraday-')||x.expired===true||String(x.workflow_run?.id)===String(currentRunId))return [];
  const created=Date.parse(x.created_at||''),age=nowMs-created;
  if(!Number.isFinite(created)||age<minAge||age>maxAge)return [];
  return [{artifact:x,age,distance:Math.abs(age-targetAge)}];
 }).sort((a,b)=>a.distance-b.distance);
 const best=candidates[0];
 return best?{selected:{artifactId:best.artifact.id,artifactName:best.artifact.name,createdAt:best.artifact.created_at,ageMinutes:Math.round(best.age/60000)},missing:null}:{selected:null,missing:{reason:'no_intraday_snapshot_in_50_to_70_minute_window',targetMinutes:60}};
}
if(require.main===module){
 const [,,inputPath,currentRunId]=process.argv;
 if(!inputPath||!fs.existsSync(inputPath))throw new Error('GitHub artifact listing JSON is required');
 const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 process.stdout.write(JSON.stringify({generatedAt:new Date().toISOString(),...selectIntradayArtifact(payload.artifacts,Date.now(),currentRunId)},null,2));
}
module.exports={selectIntradayArtifact};
