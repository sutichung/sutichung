'use strict';
const fs=require('node:fs');

function selectOutcomeArtifacts(artifacts,currentRunId,currentDate=new Date().toISOString().slice(0,10)){
 const byDate=new Map();
 for(const artifact of (Array.isArray(artifacts)?artifacts:[])){
  const date=String(artifact.created_at||'').slice(0,10),created=Date.parse(artifact.created_at||'');
  if(!artifact.name||!artifact.name.startsWith('taiwan-market-close-review-')||
     String(artifact.workflow_run?.id)===String(currentRunId)||artifact.expired===true||
     !/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=currentDate||!Number.isFinite(created))continue;
  const utcMinute=new Date(created).getUTCHours()*60+new Date(created).getUTCMinutes();
  // The regular close snapshot is captured around 13:40 Taiwan time = 05:40 UTC.
  // Ignore the later 21:10 Taiwan post-publication refresh; its quote timestamps are stale.
  if(utcMinute<300||utcMinute>390)continue;
  const old=byDate.get(date),distance=Math.abs(utcMinute-340);
  if(!old||distance<old.distance)byDate.set(date,{artifact,distance});
 }
 const dates=[...byDate.keys()].sort((a,b)=>b.localeCompare(a));
 const targets=[{horizon:'1d',sessions:1,index:0},{horizon:'5d',sessions:5,index:4},{horizon:'20d',sessions:20,index:19}];
 const selected=[],missing=[];
 for(const target of targets){
  const date=dates[target.index],item=date?byDate.get(date):null;
  if(!item){missing.push({horizon:target.horizon,requiredTradingSessions:target.sessions,availableTradingDates:dates.length});continue;}
  selected.push({horizon:target.horizon,sessions:target.sessions,tradeDate:date,artifactId:item.artifact.id,artifactName:item.artifact.name,createdAt:item.artifact.created_at});
 }
 return {availableTradingDates:dates.length,selected,missing,method:'只選今天以前 05:00–06:30 UTC（台灣收盤後）的收盤快照，取最接近 05:40 UTC 的報告；每個不同交易日期只計一次，週末與休市日不計入交易日序號。'};
}

if(require.main===module){
 const [,,inputPath,currentRunId]=process.argv;
 if(!inputPath||!fs.existsSync(inputPath))throw new Error('GitHub artifact listing JSON is required');
 const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 process.stdout.write(JSON.stringify({generatedAt:new Date().toISOString(),...selectOutcomeArtifacts(payload.artifacts,currentRunId)},null,2));
}
module.exports={selectOutcomeArtifacts};
