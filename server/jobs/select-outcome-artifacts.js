'use strict';
const fs=require('node:fs');

function selectOutcomeArtifacts(artifacts,currentRunId,currentDate=new Date().toISOString().slice(0,10)){
 const byDate=new Map();
 for(const artifact of (Array.isArray(artifacts)?artifacts:[])){
  const date=String(artifact.created_at||'').slice(0,10);
  if(!artifact.name||!artifact.name.startsWith('taiwan-market-close-review-')||
     String(artifact.workflow_run?.id)===String(currentRunId)||artifact.expired===true||
     !/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=currentDate)continue;
  const old=byDate.get(date);
  if(!old||String(artifact.created_at)>String(old.created_at))byDate.set(date,artifact);
 }
 const dates=[...byDate.keys()].sort((a,b)=>b.localeCompare(a));
 const targets=[{horizon:'1d',sessions:1,index:0},{horizon:'5d',sessions:5,index:4},{horizon:'20d',sessions:20,index:19}];
 const selected=[],missing=[];
 for(const target of targets){
  const date=dates[target.index],artifact=date?byDate.get(date):null;
  if(!artifact){missing.push({horizon:target.horizon,requiredTradingSessions:target.sessions,availableTradingDates:dates.length});continue;}
  selected.push({horizon:target.horizon,sessions:target.sessions,tradeDate:date,artifactId:artifact.id,artifactName:artifact.name});
 }
 return {availableTradingDates:dates.length,selected,missing,method:'只選今天以前的收盤報告；依不同交易日期排序，每個日期取最後產生的報告；週末與休市日不計入交易日序號。'};
}

if(require.main===module){
 const [,,inputPath,currentRunId]=process.argv;
 if(!inputPath||!fs.existsSync(inputPath))throw new Error('GitHub artifact listing JSON is required');
 const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 process.stdout.write(JSON.stringify({generatedAt:new Date().toISOString(),...selectOutcomeArtifacts(payload.artifacts,currentRunId)},null,2));
}
module.exports={selectOutcomeArtifacts};
