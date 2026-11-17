'use strict';
const fs=require('node:fs');
const path=require('node:path');
const base=String(process.env.MARKET_APP_URL||'').replace(/\/$/,'');
if(!base) throw new Error('MARKET_APP_URL secret is required');
async function get(endpoint){
 const response=await fetch(base+endpoint,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok) throw new Error(endpoint+' returned HTTP '+response.status);
 return response.json();
}
(async()=>{
 await get('/api/market/snapshot');
 const [scan,news]=await Promise.all([get('/api/market/scan'),get('/api/market/news')]);
 const rows=Object.entries(scan.data||{}).map(([symbol,row])=>({symbol,...row,scorecard:row.scorecard||null}));
 const usable=rows.filter(x=>x.scorecard&&x.scorecard.status==='research-ready');
 const byScore=[...usable].sort((a,b)=>b.scorecard.score-a.scorecard.score);
 const bearish=[...usable].sort((a,b)=>a.scorecard.score-b.scorecard.score);
 const date=new Date().toISOString().slice(0,10);
 const report={
  generatedAt:new Date().toISOString(),
  scanTimestamp:scan.timestamp||null,
  source:scan.source||null,
  scannedCount:rows.length,
  researchReadyCount:usable.length,
  topBullish:byScore.slice(0,30),
  topBearish:bearish.slice(0,30),
  news:(news.data||[]).slice(0,30),
  caveat:'研究排序與資料快照，不是投資建議或勝率；本報告尚未進行次日績效驗證。'
 };
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync(path.join('reports','close-review-'+date+'.json'),JSON.stringify(report,null,2));
 const lines=['# 台股收盤研究報告 '+date,'',`掃描檔數：${rows.length}；可評分檔數：${usable.length}`,`資料時間：${report.scanTimestamp||'未提供'}`,'','## 多方研究排名'];
 for(const x of byScore.slice(0,30)) lines.push(`- ${x.symbol}：${x.scorecard.score}/100（${x.scorecard.direction}；信心覆蓋率 ${x.scorecard.confidence}%）`);
 lines.push('','## 空方／避險研究排名');
 for(const x of bearish.slice(0,30)) lines.push(`- ${x.symbol}：${x.scorecard.score}/100（${x.scorecard.direction}；信心覆蓋率 ${x.scorecard.confidence}%）`);
 lines.push('','## 新聞');
 for(const n of report.news) lines.push(`- [${n.title||n.headline||'新聞'}](${n.url||'#'}) — ${n.source||''}`);
 lines.push('','> '+report.caveat,'');
 fs.writeFileSync(path.join('reports','close-review-'+date+'.md'),lines.join('\n'));
 process.stdout.write(JSON.stringify({scannedCount:rows.length,researchReadyCount:usable.length,report:date}));
})().catch(error=>{process.stderr.write(error.stack||String(error));process.exit(1);});
