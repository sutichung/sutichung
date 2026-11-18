'use strict';
const fs=require('node:fs');
const path=require('node:path');
const base=String(process.env.MARKET_APP_URL||'').replace(/\\/$/,'');
const reportPath=process.argv[2];
const horizon=process.argv[3]||'1d';
const sessions=Number(process.argv[4]||1);
if(!base)throw new Error('MARKET_APP_URL is required');
if(!reportPath||!fs.existsSync(reportPath))throw new Error('Historical close-review JSON file is required');
if(!['1h','1d','5d','20d'].includes(horizon)||!([0,1,5,20].includes(sessions)))throw new Error('Unsupported evaluation horizon');
const previous=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const costPct=Number.isFinite(Number(process.env.ROUND_TRIP_COST_PCT))?Number(process.env.ROUND_TRIP_COST_PCT):0.3;
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
(async()=>{
 const snapshot=await get('/api/market/snapshot');
 const quotes=snapshot.data||{};
 const signals=[
  ...(previous.topBullish||[]).map(x=>({...x,side:'long'})),
  ...(previous.topBearish||[]).map(x=>({...x,side:'short'}))
 ];
 const results=[],excluded=[];
 for(const signal of signals){
  const entry=Number(signal.price),quote=quotes[signal.symbol],current=Number(quote?.price);
  const quoteTime=Date.parse(quote?.timestamp||'');
  const ageMs=Date.now()-quoteTime;
  const fresh=Number.isFinite(quoteTime)&&ageMs>=-30000&&ageMs<=15*60*1000;
  if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(current)||current<=0||!fresh){
   excluded.push({symbol:signal.symbol,side:signal.side,reason:!Number.isFinite(entry)||entry<=0?'invalid_entry_price':!Number.isFinite(current)||current<=0?'missing_current_quote':'stale_or_missing_quote_timestamp'});
   continue;
  }
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
 const report={
  generatedAt:new Date().toISOString(),
  horizon,sessions,
  evaluatedSignalDate:previous.generatedAt||previous.scanTimestamp||null,
  sourceReportAsOf:previous.scanTimestamp||previous.generatedAt||null,
  currentSnapshotAsOf:snapshot.timestamp||null,
  currentSnapshotSource:snapshot.source||null,
  evaluatedSignalCount:signals.length,evaluatedCount:results.length,excludedCount:excluded.length,
  assumedRoundTripCostPct:costPct,
  directionalHitRatePct:results.length?wins/results.length*100:null,
  averageDirectionalReturnPct:avg('directionalReturnPct'),
  averageNetReturnPct:avg('netReturnPct'),
  long:bySide('long'),short:bySide('short'),
  results,excluded,
  caveat:'以指定交易日收盤研究快照的訊號價格，對照目前官方行情快照計算方向性報酬；不是實際成交或完整策略回測。空方是方向性反向比較，未計融券可得性、借券費、個別滑價與市場微結構。每個 horizon 依歷史收盤報告的交易日期序號選取；缺少報告或有效報價時不補值。樣本不足不得據此調整模型。'
 };
 fs.mkdirSync('reports',{recursive:true});
 const date=new Date().toISOString().slice(0,10);
 const stem='outcome-review-'+horizon+'-'+date;
 fs.writeFileSync(path.join('reports',stem+'.json'),JSON.stringify(report,null,2));
 const lines=['# '+horizon+' 訊號結果檢查 '+date,'',`歷史訊號日期：${report.evaluatedSignalDate||'未提供'}`,`有效比較：${results.length}/${signals.length}；排除：${excluded.length}`,`假設來回成本：${costPct}%`,`方向命中率：${report.directionalHitRatePct==null?'樣本不足':report.directionalHitRatePct.toFixed(1)+'%'}`,`平均方向報酬：${report.averageDirectionalReturnPct==null?'—':report.averageDirectionalReturnPct.toFixed(3)+'%'}`,`平均扣除假設成本後報酬：${report.averageNetReturnPct==null?'—':report.averageNetReturnPct.toFixed(3)+'%'}`,`多方：${report.long.count} 筆；空方：${report.short.count} 筆`,'','## 個別訊號'];
 for(const x of results)lines.push(`- ${x.symbol} ${x.side==='long'?'多方':'空方'}：方向報酬 ${x.directionalReturnPct.toFixed(2)}%；淨報酬假設 ${x.netReturnPct.toFixed(2)}%`);
 lines.push('','## 排除原因',...excluded.map(x=>`- ${x.symbol}：${x.reason}`),'','> '+report.caveat,'');
 fs.writeFileSync(path.join('reports',stem+'.md'),lines.join('\\n'));
 process.stdout.write(JSON.stringify({horizon,evaluatedCount:results.length,excludedCount:excluded.length,hitRatePct:report.directionalHitRatePct}));
})().catch(error=>{process.stderr.write(error.stack||String(error));process.exit(1);});
