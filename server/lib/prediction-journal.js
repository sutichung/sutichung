'use strict';
const crypto=require('node:crypto');
const HORIZONS=new Set(['1h','1d','5d','20d']);
const MARKETS=new Set(['TW-STOCK','US-STOCK','CRYPTO']);
const MAX_FUTURE_SKEW_MS=5*60*1000;
function fail(code,message=code){const e=new Error(message);e.code=code;return e;}
function iso(value,name){const n=Date.parse(value||'');if(!Number.isFinite(n)||n>Date.now()+MAX_FUTURE_SKEW_MS)throw fail('invalid_'+name,name+' timestamp invalid or in future');return new Date(n).toISOString();}
function dueIso(value,name,reference){const n=Date.parse(value||'');if(!Number.isFinite(n)||n<=Date.parse(reference)||n>Date.now()+21*86400000+MAX_FUTURE_SKEW_MS)throw fail('invalid_'+name,name+' must be after the prediction time and within 21 days');return new Date(n).toISOString();}
function positive(value,name){const n=Number(value);if(!Number.isFinite(n)||n<=0)throw fail('invalid_'+name,name+' must be positive');return n;}
function normalizeObservation(x={}){
 const provider=String(x.provider||'').trim().slice(0,120),sourceClass=String(x.sourceClass||'').trim().slice(0,80);
 const dataMode=String(x.dataMode||'').toUpperCase(),authorized=x.authorized===true;
 if(!provider||!sourceClass)throw fail('source_identity_required');
 if(!['REALTIME','DELAYED','END_OF_DAY','HISTORICAL'].includes(dataMode))throw fail('invalid_data_mode');
 if(!authorized)throw fail('source_not_authorized','Unlicensed or unverified sources cannot enter verified consensus');
 const latencyMs=x.latencyMs==null?null:Number(x.latencyMs);
 if(latencyMs!==null&&(!Number.isInteger(latencyMs)||latencyMs<0))throw fail('invalid_latency');
 return {provider,sourceClass,price:positive(x.price,'source_price'),observedAt:iso(x.observedAt,'source_time'),dataMode,authorized,region:x.region?String(x.region).slice(0,80):null,latencyMs};
}
function compareSources(input,{maxSpreadBps=50,maxTimestampSkewMs=30000,minProviders=2,now=Date.now()}={}){
 const observations=input.map(normalizeObservation);
 const providers=new Set(observations.map(x=>x.provider));
 const independentClasses=new Set(observations.map(x=>x.sourceClass));
 if(providers.size<minProviders||independentClasses.size<2)return {status:'INSUFFICIENT_SOURCES',verified:false,reason:'independent_provider_count_below_minimum',observations};
 const times=observations.map(x=>Date.parse(x.observedAt));
 if(observations.some(x=>{const age=now-Date.parse(x.observedAt),limit=({REALTIME:5*60*1000,DELAYED:60*60*1000,END_OF_DAY:3*86400000,HISTORICAL:30*86400000})[x.dataMode];return age< -30000||age>limit;}))return {status:'INSUFFICIENT_SOURCES',verified:false,reason:'stale_or_future_source_timestamp',observations};
 if(Math.max(...times)-Math.min(...times)>maxTimestampSkewMs)return {status:'INSUFFICIENT_SOURCES',verified:false,reason:'source_timestamp_skew_exceeded',observations};
 const prices=observations.map(x=>x.price).sort((a,b)=>a-b);
 const median=prices.length%2?prices[(prices.length-1)/2]:(prices[prices.length/2-1]+prices[prices.length/2])/2;
 const spreadBps=(Math.max(...prices)-Math.min(...prices))/median*10000;
 return {status:spreadBps<=maxSpreadBps?'VERIFIED':'DISAGREEMENT',verified:spreadBps<=maxSpreadBps,reason:spreadBps<=maxSpreadBps?null:'source_price_spread_exceeded',consensusPrice:median,spreadBps:Number(spreadBps.toFixed(4)),observedAt:new Date(Math.max(...times)).toISOString(),providers:[...providers],observations};
}
function normalizePrediction(x={}){
 const market=String(x.market||'').toUpperCase(),symbol=String(x.symbol||'').trim().toUpperCase(),timeframe=String(x.timeframe||'');
 if(!MARKETS.has(market))throw fail('invalid_market');
 if(!/^[A-Z0-9._:-]{1,40}$/.test(symbol))throw fail('invalid_symbol');
 if(!HORIZONS.has(timeframe))throw fail('invalid_horizon');
 const direction=String(x.direction||'').toUpperCase();
 if(!['UP','DOWN','NEUTRAL'].includes(direction))throw fail('invalid_direction');
 const confidence=x.confidence==null?null:Number(x.confidence);
 if(confidence!==null&&(!Number.isFinite(confidence)||confidence<0||confidence>1))throw fail('invalid_confidence');
 const probability=x.upProbability==null?null:Number(x.upProbability);
 if(probability!==null&&(!Number.isFinite(probability)||probability<0||probability>1||x.probabilitySemantics!=='UP_PROBABILITY'))throw fail('invalid_probability_semantics');
 const observations=(x.observations||[]).map(normalizeObservation);
 const consensus=compareSources(observations,x.consensusOptions);
 if(!consensus.verified)throw fail('source_consensus_unverified',consensus.reason);
 const referencePrice=positive(x.referencePrice,'reference_price');
 if(Math.abs(referencePrice-consensus.consensusPrice)/consensus.consensusPrice*10000>Number(x.maxReferenceDeviationBps??50))throw fail('reference_price_not_in_consensus');
 const referenceAsOf=iso(x.referenceAsOf||consensus.observedAt,'reference_time');
 const modelVersion=String(x.modelVersion||'').trim().slice(0,100);
 if(!modelVersion)throw fail('model_version_required');
 const predictionKey=String(x.predictionKey||crypto.createHash('sha256').update([market,symbol,timeframe,modelVersion,direction,referenceAsOf].join('|')).digest('hex'));
 const horizons=(x.horizons||[{horizon:timeframe,dueAt:new Date(Date.parse(referenceAsOf)+({'1h':3600000,'1d':86400000,'5d':432000000,'20d':1728000000}[timeframe])).toISOString()}]).map(h=>{
  if(!HORIZONS.has(h.horizon))throw fail('invalid_outcome_horizon');
  return {horizon:h.horizon,dueAt:dueIso(h.dueAt,'outcome_due_at',referenceAsOf)};
 });
 return {snapshot:{prediction_key:predictionKey,market,symbol,timeframe,model_version:modelVersion,direction,score:x.score==null?null:Number(x.score),confidence,raw_up_probability:probability,up_probability:probability,calibration_applied:false,probability_semantics:probability===null?null:'UP_PROBABILITY',reference_price:referencePrice,reference_as_of:referenceAsOf,source_consensus:{providers:consensus.providers,observedAt:consensus.observedAt,consensusPrice:consensus.consensusPrice},source_spread_bps:consensus.spreadBps,consensus_status:consensus.status,feature_snapshot:x.featureSnapshot||{}},observations:observations.map(o=>({...o,source_class:o.sourceClass,observed_at:o.observedAt,data_mode:o.dataMode,latency_ms:o.latencyMs})),horizons:horizons.map(h=>({horizon:h.horizon,due_at:h.dueAt})),consensus};
}
function applyCalibration(rawProbability,calibration,{minimumBinSamples=5}={}){
 if(rawProbability==null)return {probability:null,applied:false,reason:'probability_not_provided'};
 const raw=Number(rawProbability);
 if(!Number.isFinite(raw)||raw<0||raw>1)throw fail('invalid_probability');
 if(!calibration||calibration.eligible!==true||!Array.isArray(calibration.calibration_bins))return {probability:raw,applied:false,reason:'calibration_not_eligible'};
 const anchors=calibration.calibration_bins.filter(x=>Number(x.count)>=minimumBinSamples&&Number.isFinite(Number(x.meanProbability))&&Number.isFinite(Number(x.observedUpRate))).sort((a,b)=>Number(a.meanProbability)-Number(b.meanProbability));
 if(!anchors.length)return {probability:raw,applied:false,reason:'insufficient_populated_bins'};
 if(anchors.length===1)return {probability:Number(Math.max(0,Math.min(1,anchors[0].observedUpRate)).toFixed(6)),applied:true,reason:null};
 let left=anchors[0],right=anchors.at(-1);
 for(let i=1;i<anchors.length;i++)if(raw<=Number(anchors[i].meanProbability)){left=anchors[i-1];right=anchors[i];break;}
 const x1=Number(left.meanProbability),x2=Number(right.meanProbability),y1=Number(left.observedUpRate),y2=Number(right.observedUpRate);
 const ratio=x2===x1?0:Math.max(0,Math.min(1,(raw-x1)/(x2-x1)));
 return {probability:Number(Math.max(0,Math.min(1,y1+(y2-y1)*ratio)).toFixed(6)),applied:true,reason:null};
}
function calibrationMetrics(rows,{minimumSamples=30,bins=10}={}){
 const valid=rows.filter(x=>x.up_probability!==null&&x.up_probability!==undefined&&x.up_probability!==''&&Number.isFinite(Number(x.up_probability))&&Number(x.up_probability)>=0&&Number(x.up_probability)<=1&&typeof x.actual_up==='boolean');
 const n=valid.length;
 if(n<minimumSamples)return {eligible:false,sampleCount:n,brierScore:null,directionalAccuracy:null,bins:[],reason:'minimum_calibration_sample_not_met'};
 const groups=Array.from({length:bins},(_,i)=>({lower:i/bins,upper:(i+1)/bins,count:0,meanProbability:0,observedUpRate:0}));
 let brier=0,correct=0;
 for(const row of valid){const p=Number(row.up_probability),actual=row.actual_up?1:0;brier+=(p-actual)**2;if((p>=0.5)===row.actual_up)correct++;const idx=Math.min(bins-1,Math.floor(p*bins)),g=groups[idx];g.count++;g.meanProbability+=p;g.observedUpRate+=actual;}
 for(const g of groups)if(g.count){g.meanProbability=Number((g.meanProbability/g.count).toFixed(6));g.observedUpRate=Number((g.observedUpRate/g.count).toFixed(6));}
 return {eligible:true,sampleCount:n,brierScore:Number((brier/n).toFixed(6)),directionalAccuracy:Number((correct/n).toFixed(6)),bins:groups};
}
function createPredictionJournal({env=process.env,fetchImpl=fetch}={}){
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,''),key=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
 function config(){if(!base||!key)throw fail('journal_not_configured','Supabase service credentials are not configured');}
 async function request(path,options={}){config();const response=await fetchImpl(base+'/rest/v1/'+path,{...options,headers:{apikey:key,authorization:'Bearer '+key,accept:'application/json',...(options.headers||{})},signal:AbortSignal.timeout(options.timeoutMs||15000)});const body=await response.text();if(!response.ok){const e=fail('prediction_database_error','Prediction journal database request failed');e.status=response.status;throw e;}return body?JSON.parse(body):null;}
 async function record(input){
  config();const x=normalizePrediction(input);
  const raw=x.snapshot.raw_up_probability;
  if(raw!==null){
   const rows=await request('market_model_calibration?model_version=eq.'+encodeURIComponent(x.snapshot.model_version)+'&market=eq.'+encodeURIComponent(x.snapshot.market)+'&horizon=eq.'+encodeURIComponent(x.snapshot.timeframe)+'&eligible=eq.true&select=calibration_bins,eligible&limit=1');
   const applied=applyCalibration(raw,Array.isArray(rows)?rows[0]:null);
   x.snapshot.up_probability=applied.probability;x.snapshot.calibration_applied=applied.applied;x.calibration=applied;
  }else{x.snapshot.up_probability=null;x.snapshot.calibration_applied=false;x.calibration={probability:null,applied:false,reason:'probability_not_provided'};}
  const result=await request('rpc/record_prediction_snapshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_snapshot:x.snapshot,p_observations:x.observations,p_horizons:x.horizons})});
  return {...result,consensus:x.consensus,calibration:x.calibration};
 }
 async function listDue(now=new Date().toISOString(),limit=200){const rows=await request('market_prediction_outcomes?select=id,snapshot_id,horizon,due_at,market_prediction_snapshots!inner(market,symbol,direction,up_probability,reference_price,reference_as_of,model_version)&status=eq.PENDING&due_at=lte.'+encodeURIComponent(iso(now,'now'))+'&order=due_at.asc&limit='+Math.max(1,Math.min(500,Number(limit)||200)));return Array.isArray(rows)?rows:[];}
 async function settle(id,observation){if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))throw fail('invalid_outcome_id');const price=positive(observation.price,'observed_price'),at=iso(observation.observedAt,'observation_time'),source=String(observation.source||'').trim();if(!source||observation.authorized!==true)throw fail('observation_source_not_authorized');const rows=await request('market_prediction_outcomes?id=eq.'+encodeURIComponent(id)+'&select=id,snapshot_id,horizon,due_at,status,market_prediction_snapshots!inner(direction,reference_price,reference_as_of)');const row=rows?.[0];if(!row||row.status!=='PENDING')throw fail('outcome_not_pending');if(Date.parse(at)<Date.parse(row.due_at))throw fail('observation_before_due');if(Date.parse(at)<Date.parse(row.market_prediction_snapshots.reference_as_of))throw fail('observation_predates_prediction');const gross=(price/Number(row.market_prediction_snapshots.reference_price)-1)*100;const direction=row.market_prediction_snapshots.direction;const directional=direction==='UP'?gross:direction==='DOWN'?-gross:0;const net=directional-Number(observation.costPct||0);const actualUp=price>Number(row.market_prediction_snapshots.reference_price);const directionCorrect=direction==='NEUTRAL'?Math.abs(gross)<=Number(observation.neutralBandPct||0.1):(direction==='UP'?actualUp:!actualUp);const updated=await request('market_prediction_outcomes?id=eq.'+encodeURIComponent(id)+'&status=eq.PENDING',{method:'PATCH',headers:{'content-type':'application/json','prefer':'return=representation'},body:JSON.stringify({status:'SETTLED',observed_price:price,observed_at:at,observation_source:source,net_return_pct:Number(net.toFixed(6)),direction_correct:directionCorrect,actual_up:actualUp,settled_at:new Date().toISOString()})});if(!Array.isArray(updated)||updated.length!==1)throw fail('outcome_settlement_conflict');return updated[0];}
 async function calibrate({modelVersion,market,horizon,minimumSamples=30}={}){const rows=await request('market_prediction_outcomes?select=actual_up,market_prediction_snapshots!inner(model_version,market,raw_up_probability)&status=eq.SETTLED&market_prediction_snapshots.model_version=eq.'+encodeURIComponent(modelVersion)+'&market_prediction_snapshots.market=eq.'+encodeURIComponent(market)+'&horizon=eq.'+encodeURIComponent(horizon));const metrics=calibrationMetrics(rows.map(x=>({actual_up:x.actual_up,up_probability:x.market_prediction_snapshots.raw_up_probability})),{minimumSamples});const payload={model_version:modelVersion,market,horizon,sample_count:metrics.sampleCount,brier_score:metrics.brierScore,directional_accuracy:metrics.directionalAccuracy,calibration_bins:metrics.bins,eligible:metrics.eligible,exclusion_reason:metrics.reason||null,computed_at:new Date().toISOString()};await request('market_model_calibration?on_conflict=model_version,market,horizon',{method:'POST',headers:{'content-type':'application/json','prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});return metrics;}
 async function calibrateAll({minimumSamples=30}={}){
  const rows=await request('market_prediction_outcomes?select=horizon,market_prediction_snapshots!inner(model_version,market,raw_up_probability)&status=eq.SETTLED&market_prediction_snapshots.raw_up_probability=not.is.null&limit=5000');
  const groups=new Map();
  for(const row of rows||[]){const model=row.market_prediction_snapshots?.model_version,market=row.market_prediction_snapshots?.market,horizon=row.horizon;if(!model||!market||!HORIZONS.has(horizon))continue;groups.set([model,market,horizon].join('|'),{modelVersion:model,market,horizon});}
  const results=[];
  for(const group of groups.values())results.push({...group,...await calibrate({...group,minimumSamples})});
  return {groups:results.length,eligible:results.filter(x=>x.eligible).length,results};
 }
 return {record,listDue,settle,calibrate,calibrateAll};
}
module.exports={normalizeObservation,compareSources,normalizePrediction,calibrationMetrics,applyCalibration,createPredictionJournal,HORIZONS,MARKETS};
