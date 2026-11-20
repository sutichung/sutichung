'use strict';
const {createPredictionJournal}=require('../lib/prediction-journal');
const base=String(process.env.MARKET_APP_URL||'').replace(/\/$/,'');
async function main(){
 if(!base)throw new Error('MARKET_APP_URL is required');
 const journal=createPredictionJournal();
 const due=await journal.listDue();
 const summary={checked:due.length,settled:0,excluded:0,errors:[]};
 for(const item of due){
  try{
   const meta=item.market_prediction_snapshots;
   const url=base+'/api/market/quote/'+encodeURIComponent(meta.symbol)+'?market='+encodeURIComponent(meta.market.toLowerCase());
   const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('quote_http_'+response.status);
   const quote=await response.json();
   if(!quote||!Number.isFinite(Number(quote.price))||!quote.source||!quote.timestamp)throw new Error('quote_missing_verified_fields');
   await journal.settle(item.id,{price:quote.price,observedAt:quote.timestamp,source:quote.source,authorized:quote.authorized===true,costPct:Number(process.env.PREDICTION_COST_PCT||0)});
   summary.settled++;
  }catch(error){summary.errors.push({id:item.id,code:error.code||error.message});}
 }
 process.stdout.write(JSON.stringify(summary));
 if(summary.errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{process.stderr.write(e.stack||String(e));process.exit(1);});
module.exports={main};
