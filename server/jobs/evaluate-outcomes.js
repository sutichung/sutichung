'use strict';
const fs=require('node:fs');
const path=require('node:path');
const base=String(process.env.MARKET_APP_URL||'').replace(/\/$/,'');
const reportPath=process.argv[2];
const horizon=process.argv[3]||'1d';
const sessions=process.argv[4]===undefined?1:Number(process.argv[4]);
const REQUIRED_SESSIONS={'1h':0,'1d':1,'5d':5,'20d':20};

function evaluateOutcomes(previous,snapshot,{horizon='1d',sessions=1,costPct=0.785,now=Date.now()}={}){
 if(!previous||typeof previous!=='object'||!snapshot||typeof snapshot!=='object')throw new Error('Historical report and current snapshot are required');
 if(!(horizon in REQUIRED_SESSIONS)||sessions!==REQUIRED_SESSIONS[horizon])throw new Error('Horizon and trading-session count do not match');
 if(!Number.isFinite(costPct)||costPct<0||costPct>10)throw new Error('Round-trip cost assumption must be between 0 and 20 percent');
 const sourceAsOf=previous.snapshotTimestamp||previous.scanTimestamp||previous.generatedAt;
 const sourceTime=Date.parse(sourceAsOf||'');
 if(!Number.isFinite(sourceTime)||sourceTime>now+30000)throw new Error('Historical signal snapshot timestamp is invalid or in the future');
 const elapsedMs=now-sourceTime;
 if(horizon==='1h'&&(elapsedMs<45*60*1000||elapsedMs>3*60*60*1000))throw new Error('One-hour outcome evaluation is outside the allowed 45-minute to 3-hour window');
 const signals=[
  ...(previous.topBullish||[]).map(x=>({...x,side:'long'})),
  ...(previous.topBearish||[]).map(x=>({...x,side:'short'}))
 ];
 const quotes=snapshot.data||{},results=[],excluded=[];
 for(const signal of signals){
  const entry=Number(signal.price),quote=quotes[signal.symbol],current=Number(quote?.price);
  const quoteTime=Date.parse(quote?.timestamp||'');
  const ageMs=now-quoteTime;
  let reason=null;
  if(!['long','short'].includes(signal.side))reason='invalid_signal_side';
  else if(!Number.isFinite(entry)||entry<=0)reason='invalid_entry_price';
  else if(!Number.isFinite(current)||current<=0)reason='missing_current_quote';
  else if(!Number.isFinite(quoteTime))reason='missing_quote_timestamp';
  else if(quoteTime<sourceTime)reason='quote_predates_signal_snapshot';
  else if(ageMs< -30000||ageMs>15*60*1000)reason='stale_or_future_quote';
  if(reason){excluded.push({symbol:signal.symbol,side:signal.side,reason});continue;}
  const rawReturnPct=(current/entry-1)*100;
  const directionalReturnPct=signal.side==='long'?rawReturnPct:-rawReturnPct;
  results.push({symbol:signal.symbol,side:signal.side,score:signal.scorecard?.score,entryPrice:entry,currentPrice:current,quoteTimestamp:quote.timestamp,quoteSource:quote.source||snapshot.source||null,rawReturnPct,directionalReturnPct,netReturnPct:directionalReturnPct-costPct,success:directionalReturnPct>costPct});
 }
 const avg=key=>results.length?results.reduce((sum,x)=>sum+x[key],0)/results.length:null;
 const wins=results.filter(x=>x.success).length;
 const bySide=side=>{
  const subset=results.filter(x=>x.side===side);
  return {count:subset.length,hitRatePct:subset.length?subset.filter(x=>x.success).length/subset.length*100:null,averageNetReturnPct:subset.length?subset.reduce((s,x)=>s+x.netReturnPct,0)/subset.length:null};
 };
 const quoteTimes=results.map(x=>Date.parse(x.quoteTimestamp)).sort((a,b)=>a-b);
 return {
  generatedAt:new Date(now).toISOString(),horizon,sessions,elapsedSinceSignalMinutes:Math.round(elapsedMs/60000),
  evaluatedSignalDate:previous.generatedAt||previous.scanTimestamp||null,sourceReportAsOf:sourceAsOf,
  currentSnapshotAsOf:quoteTimes.length?new Date(quoteTimes[Math.floor(quoteTimes.length/2)]).toISOString():null,
  currentSnapshotSource:snapshot.source||null,evaluatedSignalCount:signals.length,evaluatedCount:results.length,excludedCount:excluded.length,
  assumedRoundTripCostPct:costPct,\n  costAssumption:'預設 0.785%：台股一般股票手續費 0.1425% 買賣各一次 + 賣出證交稅 0.30% + 單邊滑價假設 0.10% 買賣各一次；實際依商品、券商折扣及成交情況不同。',directionalHitRatePct:results.length?wins/results.length*100:null,
  averageDirectionalReturnPct:avg('directionalReturnPct'),averageNetReturnPct:avg('netReturnPct'),
  long:bySide('long'),short:bySide('short'),results,excluded,
  caveat:'以指定交易日研究快照的訊號價格，對照訊號之後且時間戳新鮮的官方行情計算方向性報酬；不是實際成交或完整策略回測。空方是方向性反向比較，未計融券可得性、借券費、個別實際滑價、股利與公司行動；預設成本只是台股一般股票估算，不代表真實成交。1h 另限制在訊號後 45 分鐘至 3 小時評估；1d/5d/20d 由工作流程按不同交易日的官方收盤報告選取。缺少報告或有效報價時不補值，樣本不足不得據此調整模型。'
 };
}

async function oidcToken(){
 const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!endpoint||!requestToken)throw new Error('GitHub Actions OIDC permission is unavailable');
 const url=new URL(endpoint);url.searchParams.set('audience','taiwan-stock-hunter-automation');
 const response=await fetch(url,{headers:{authorization:'Bearer '+requestToken,accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('GitHub Actions OIDC token request failed: HTTP '+response.status);
 const payload=await response.json();if(!payload.value)throw new Error('GitHub Actions OIDC token missing');
 return payload.value;
}
async function get(endpoint){
 const token=await oidcToken();
 const response=await fetch(base+endpoint,{headers:{accept:'application/json',authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(endpoint+' returned HTTP '+response.status);
 return response.json();
}
async function main(){
 if(!base)throw new Error('MARKET_APP_URL is required');
 if(!reportPath||!fs.existsSync(reportPath))throw new Error('Historical close-review JSON file is required');
 const previous=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 const snapshot=await get('/api/market/snapshot');
 const configuredCost=process.env.ROUND_TRIP_COST_PCT===undefined?0.785:Number(process.env.ROUND_TRIP_COST_PCT);
 const rawCost=Number.isFinite(configuredCost)&&configuredCost>=0&&configuredCost<=10?configuredCost:0.785;
 const report=evaluateOutcomes(previous,snapshot,{horizon,sessions,costPct:rawCost});
 fs.mkdirSync('reports',{recursive:true});
 const date=new Date().toISOString().slice(0,10),stem='outcome-review-'+horizon+'-'+date;
 fs.writeFileSync(path.join('reports',stem+'.json'),JSON.stringify(report,null,2));
 const lines=['# '+horizon+' 訊號結果檢查 '+date,'',`歷史訊號日期：${report.evaluatedSignalDate||'未提供'}`,`訊號經過：${report.elapsedSinceSignalMinutes} 分鐘`,`有效比較：${report.evaluatedCount}/${report.evaluatedSignalCount}；排除：${report.excludedCount}`,`假設來回成本：${report.assumedRoundTripCostPct}%`,`方向命中率：${report.directionalHitRatePct==null?'樣本不足':report.directionalHitRatePct.toFixed(1)+'%'}`,`平均方向報酬：${report.averageDirectionalReturnPct==null?'—':report.averageDirectionalReturnPct.toFixed(3)+'%'}`,`平均扣除假設成本後報酬：${report.averageNetReturnPct==null?'—':report.averageNetReturnPct.toFixed(3)+'%'}`,`多方：${report.long.count} 筆；空方：${report.short.count} 筆`,'','## 個別訊號'];
 for(const x of report.results)lines.push(`- ${x.symbol} ${x.side==='long'?'多方':'空方'}：方向報酬 ${x.directionalReturnPct.toFixed(2)}%；淨報酬假設 ${x.netReturnPct.toFixed(2)}%`);
 lines.push('','## 排除原因',...report.excluded.map(x=>`- ${x.symbol}：${x.reason}`),'','> '+report.caveat,'');
 fs.writeFileSync(path.join('reports',stem+'.md'),lines.join('\\n'));
 process.stdout.write(JSON.stringify({horizon,evaluatedCount:report.evaluatedCount,excludedCount:report.excludedCount,hitRatePct:report.directionalHitRatePct}));
}
if(require.main===module)main().catch(error=>{process.stderr.write(error.stack||String(error));process.exit(1);});
module.exports={evaluateOutcomes,REQUIRED_SESSIONS};
