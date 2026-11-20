'use strict';
const {createPredictionJournal}=require('../lib/prediction-journal');
const adapter=String(process.env.PREDICTION_OBSERVATION_ADAPTER_URL||'').replace(/\/$/,'');
const adapterToken=String(process.env.PREDICTION_OBSERVATION_ADAPTER_TOKEN||'');
async function main(){
 if(!adapter)throw new Error('PREDICTION_OBSERVATION_ADAPTER_URL is required; no fallback or simulated observations are allowed');
 const journal=createPredictionJournal();
 const due=await journal.listDue();
 const summary={checked:due.length,settled:0,errors:[]};
 for(const item of due){
  const prediction=item.market_prediction_snapshots;
  try{
   const url=new URL(adapter);
   url.searchParams.set('market',prediction.market);
   url.searchParams.set('symbol',prediction.symbol);
   url.searchParams.set('horizon',item.horizon);
   url.searchParams.set('dueAt',item.due_at);
   url.searchParams.set('referenceAsOf',prediction.reference_as_of);
   const headers={accept:'application/json'};
   if(adapterToken)headers.authorization='Bearer '+adapterToken;
   const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('observation_adapter_http_'+response.status);
   const observation=await response.json();
   if(observation.authorized!==true||!observation.source||!observation.observedAt||!Number.isFinite(Number(observation.price)))throw new Error('adapter_observation_missing_authorization_or_quote_fields');
   await journal.settle(item.id,{price:observation.price,observedAt:observation.observedAt,source:observation.source,authorized:true,costPct:Number(process.env.PREDICTION_COST_PCT||0),neutralBandPct:Number(process.env.PREDICTION_NEUTRAL_BAND_PCT||0.1)});
   summary.settled++;
  }catch(error){summary.errors.push({id:item.id,market:prediction.market,symbol:prediction.symbol,horizon:item.horizon,code:error.code||error.message});}
 }
 process.stdout.write(JSON.stringify(summary));
 if(summary.errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{process.stderr.write(e.stack||String(e));process.exit(1);});
module.exports={main};
