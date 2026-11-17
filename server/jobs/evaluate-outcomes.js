'use strict';
const fs=require('node:fs');
const path=require('node:path');
const base=String(process.env.MARKET_APP_URL||'').replace(/\/$/,'');
const reportPath=process.argv[2];
if(!base)throw new Error('MARKET_APP_URL secret is required');
if(!reportPath||!fs.existsSync(reportPath))throw new Error('Previous close-review JSON file is required');
const previous=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const costPct=Number.isFinite(Number(process.env.ROUND_TRIP_COST_PCT))?Number(process.env.ROUND_TRIP_COST_PCT):0.3;
async function get(endpoint){
 const response=await fetch(base+endpoint,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
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
 const results=[];
 for(const signal of signals){
  const entry=Number(signal.price),quote=quotes[signal.symbol],current=Number(quote?.price);
  const quoteTime=Date.parse(quote?.timestamp||'');
  const fresh=Number.isFinite(quoteTime)&&Date.now()-quoteTime>=-30000&&Date.now()-quoteTime<=15*60*1000;
  if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(current)||current<=0||!fresh)continue;
  const rawReturnPct=(current/entry-1)*100;
  const directionalReturnPct=signal.side==='long'?rawReturnPct:-rawReturnPct;
  results.push({symbol:signal.symbol,side:signal.side,score:signal.scorecard?.score,entryPrice:entry,currentPrice:current,rawReturnPct,directionalReturnPct,netReturnPct:directionalReturnPct-costPct,success:directionalReturnPct>costPct});
 }
 const avg=(key)=>results.length?results.reduce((sum,x)=>sum+x[key],0)/results.length:null;
 const report={
  generatedAt:new Date().toISOString(),
  evaluatedSignalDate:previous.generatedAt||previous.scanTimestamp||null,
  evaluatedSignalCount:signals.length,
  evaluatedCount:results.length,
  excludedCount:signals.length-results.length,
  assumedRoundTripCostPct:costPct,
  directionalHitRatePct:results.length?results.filter(x=>x.success).length/results.length*100:null,
  averageDirectionalReturnPct:avg('directionalReturnPct'),
  averageNetReturnPct:avg('netReturnPct'),
  results,
  caveat:'以前一份收盤研究快照的價格，對照本次快照計算一個交易日方向性變化；不是實際成交、不是完整策略回測，空方亦是假設避險方向，未計融券可得性與個別費率。樣本不足時不得據此調整模型。'
 };
 fs.mkdirSync('reports',{recursive:true});
 const date=new Date().toISOString().slice(0,10);
 fs.writeFileSync(path.join('reports','outcome-review-'+date+'.json'),JSON.stringify(report,null,2));
 const lines=['# 前一日訊號結果檢查 '+date,'',`訊號數：${signals.length}；有效比較數：${results.length}；排除：${report.excludedCount}`,`假設來回成本：${costPct}%`,`方向命中率：${report.directionalHitRatePct==null?'樣本不足':report.directionalHitRatePct.toFixed(1)+'%'}`,`平均方向報酬：${report.averageDirectionalReturnPct==null?'—':report.averageDirectionalReturnPct.toFixed(3)+'%'}`,`平均扣除假設成本後報酬：${report.averageNetReturnPct==null?'—':report.averageNetReturnPct.toFixed(3)+'%'}`,'','## 個別訊號'];
 for(const x of results)lines.push(`- ${x.symbol} ${x.side==='long'?'多方':'空方'}：方向報酬 ${x.directionalReturnPct.toFixed(2)}%；淨報酬假設 ${x.netReturnPct.toFixed(2)}%`);
 lines.push('','> '+report.caveat,'');
 fs.writeFileSync(path.join('reports','outcome-review-'+date+'.md'),lines.join('\n'));
 process.stdout.write(JSON.stringify({evaluatedCount:results.length,hitRatePct:report.directionalHitRatePct}));
})().catch(error=>{process.stderr.write(error.stack||String(error));process.exit(1);});
