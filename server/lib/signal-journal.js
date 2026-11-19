'use strict';
const crypto=require('node:crypto');
const ACTIONS=new Set(['ALERT_BULLISH','ALERT_BEARISH','HOLD']);
const HORIZONS=new Set(['1h','1d','5d','20d']);
function error(code,message){const e=new Error(message||code);e.code=code;return e;}
function timestamp(v,label){const n=Date.parse(v||'');if(!Number.isFinite(n))throw error('invalid_'+label,label+' must be a valid timestamp');return new Date(n).toISOString();}
function positive(v,label){const n=Number(v);if(!Number.isFinite(n)||n<=0)throw error('invalid_'+label,label+' must be positive');return n;}
function normalizeSignal(x={}){
 const symbol=String(x.symbol||'').trim().toUpperCase(),market=String(x.market||'').trim().toUpperCase();
 const timeframe=String(x.timeframe||''),action=String(x.action||'').toUpperCase();
 const price=positive(x.price,'price'),asOf=timestamp(x.asOf,'as_of'),source=String(x.source||'').trim().slice(0,160),confidence=Number(x.confidence);
 if(!/^[A-Z0-9._:-]{1,40}$/.test(symbol))throw error('invalid_symbol');
 if(!/^[A-Z0-9_-]{2,24}$/.test(market))throw error('invalid_market');
 if(!HORIZONS.has(timeframe))throw error('invalid_timeframe');
 if(!ACTIONS.has(action))throw error('invalid_action');
 if(!source)throw error('source_required','A verifiable market data source is required');
 if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw error('invalid_confidence');
 const strategyId=String(x.strategyId||'default').slice(0,100);
 const signalKey=String(x.signalKey||crypto.createHash('sha256').update([market,symbol,timeframe,action,asOf,strategyId].join('|')).digest('hex'));
 return {signalKey,symbol,market,timeframe,action,side:action==='ALERT_BULLISH'?'LONG':action==='ALERT_BEARISH'?'SHORT':'FLAT',price,asOf,source,confidence,regimeTag:String(x.regimeTag||'UNKNOWN').slice(0,80),strategyId,thesis:String(x.thesis||'').slice(0,500),metadata:x.metadata&&typeof x.metadata==='object'&&!Array.isArray(x.metadata)?x.metadata:{}};
}
function classifyOutcome({side,signalPrice,observedPrice,feeBps=0,neutralBps=5}={}){
 if(!['LONG','SHORT','FLAT'].includes(side))throw error('invalid_side');
 const entry=positive(signalPrice,'signal_price'),exit=positive(observedPrice,'observed_price'),fees=Number(feeBps),neutral=Number(neutralBps);
 if(!Number.isFinite(fees)||fees<0||fees>5000||!Number.isFinite(neutral)||neutral<0||neutral>10000)throw error('invalid_costs');
 const gross=(exit/entry-1)*100*(side==='SHORT'?-1:1),net=gross-fees/100;
 return {grossReturnPct:Number(gross.toFixed(6)),netReturnPct:Number(net.toFixed(6)),outcome:side==='FLAT'||Math.abs(net)<=neutral/100?'NEUTRAL':net>0?'WIN':'LOSS'};
}
function buildDailyReview(rows=[],date){
 const settled=rows.filter(x=>['WIN','LOSS','NEUTRAL'].includes(x.outcome));
 const directional=settled.filter(x=>x.side!=='FLAT'&&x.outcome!=='NEUTRAL');
 const wins=directional.filter(x=>x.outcome==='WIN').length,losses=directional.filter(x=>x.outcome==='LOSS').length,total=wins+losses,byRegime={};
 for(const row of directional){const key=String(row.regime_tag||'UNKNOWN');byRegime[key] ||= {wins:0,losses:0,netReturnPct:0};if(row.outcome==='WIN')byRegime[key].wins++;else byRegime[key].losses++;byRegime[key].netReturnPct+=Number(row.net_return_pct||0);}
 for(const v of Object.values(byRegime)){const n=v.wins+v.losses;v.winRate=n?Number((v.wins/n).toFixed(4)):null;v.netReturnPct=Number(v.netReturnPct.toFixed(4));}
 return {reviewDate:date,totalSignals:rows.length,settledSignals:settled.length,directionalTrades:total,wins,losses,winRate:total?Number((wins/total).toFixed(4)):null,byRegime};
}
function createSignalJournal({env=process.env,fetchImpl=fetch}={}){
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,''),key=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
 function config(){if(!base||!key)throw error('journal_not_configured','Supabase service credentials are not configured');}
 async function request(path,options={}){
  config();const {timeoutMs=12000,...init}=options;
  const response=await fetchImpl(base+'/rest/v1/'+path,{...init,headers:{apikey:key,authorization:'Bearer '+key,accept:'application/json',...(init.headers||{})},signal:AbortSignal.timeout(timeoutMs)});
  const body=await response.text();if(!response.ok){const e=error('journal_upstream_error','Signal journal database request failed');e.status=response.status;throw e;}return body?JSON.parse(body):null;
 }
 async function record(input,opts={}){
  const s=normalizeSignal(input),clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)));
  const result=await request('rpc/record_market_signal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   p_signal_key:s.signalKey,p_symbol:s.symbol,p_market:s.market,p_timeframe:s.timeframe,p_action:s.action,p_side:s.side,p_price:s.price,p_as_of:s.asOf,p_source:s.source,p_confidence:s.confidence,p_regime_tag:s.regimeTag,p_strategy_id:s.strategyId,p_thesis:s.thesis,p_metadata:s.metadata,
   p_cooldown_seconds:clamp(opts.cooldownSeconds??180,0,86400),p_daily_max_triggers:clamp(opts.dailyMaxTriggers??20,1,500),p_min_shift_pct:clamp(opts.minShiftPct??0.8,0,100)
  })});
  return {signal:s,status:result?.status||'unknown',reason:result?.reason||null,signalId:result?.signal_id||null};
 }
 async function listPending(limit=100){const n=Math.max(1,Math.min(500,Number(limit)||100));const rows=await request('market_signal_events?select=*&outcome=eq.PENDING&order=created_at.asc&limit='+n);return Array.isArray(rows)?rows:[];}
 async function settle(id,observation){
  if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))throw error('invalid_signal_id');
  const at=timestamp(observation?.asOf,'observation_as_of'),source=String(observation?.source||'').trim().slice(0,160),price=positive(observation?.price,'observed_price');
  if(!source)throw error('source_required','Settlement requires a verifiable source');
  const rows=await request('market_signal_events?id=eq.'+encodeURIComponent(id)+'&outcome=eq.PENDING&select=id,side,price,as_of,timeframe');
  const s=Array.isArray(rows)?rows[0]:null;if(!s)throw error('signal_not_pending','Signal not found or already settled');
  const duration={'1h':3600000,'1d':86400000,'5d':432000000,'20d':1728000000}[s.timeframe];
  if(Date.parse(at)<Date.parse(s.as_of)+duration)throw error('observation_too_early','Observation is earlier than the configured horizon');
  const c=classifyOutcome({side:s.side,signalPrice:s.price,observedPrice:price,feeBps:observation.feeBps??0,neutralBps:observation.neutralBps??5});
  const updated=await request('market_signal_events?id=eq.'+encodeURIComponent(id)+'&outcome=eq.PENDING',{method:'PATCH',headers:{'content-type':'application/json','prefer':'return=representation'},body:JSON.stringify({outcome:c.outcome,gross_return_pct:c.grossReturnPct,net_return_pct:c.netReturnPct,observed_price:price,observed_at:at,observation_source:source,evaluated_at:new Date().toISOString()})});
  if(!Array.isArray(updated)||updated.length!==1)throw error('settlement_conflict','Signal settled concurrently or no longer pending');return updated[0];
 }
 async function dailyReview(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))throw error('invalid_review_date');
  const start=new Date(date+'T00:00:00.000Z');if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==date)throw error('invalid_review_date');
  const end=new Date(start.getTime()+86400000).toISOString();
  const rows=await request('market_signal_events?select=*&created_at=gte.'+start.toISOString()+'&created_at=lt.'+end+'&order=created_at.asc');
  const review=buildDailyReview(Array.isArray(rows)?rows:[],date);
  const stored=await request('market_signal_daily_reviews?on_conflict=review_date',{method:'POST',headers:{'content-type':'application/json','prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify({review_date:date,total_signals:review.totalSignals,settled_signals:review.settledSignals,directional_trades:review.directionalTrades,wins:review.wins,losses:review.losses,win_rate:review.winRate,by_regime:review.byRegime,created_at:new Date().toISOString()})});
  return {review,stored:Array.isArray(stored)&&stored.length>0};
 }
 return {record,listPending,settle,dailyReview};
}
module.exports={createSignalJournal,normalizeSignal,classifyOutcome,buildDailyReview};
