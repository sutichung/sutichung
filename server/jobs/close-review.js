'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {buildResearchLists}=require('../lib/research-selection');
const base=String(process.env.MARKET_APP_URL||'').replace(/\/$/,'');
if(!base) throw new Error('MARKET_APP_URL is required');
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
 const response=await fetch(base+endpoint,{headers:{accept:'application/json',authorization:'Bearer '+token},signal:AbortSignal.timeout(120000)});
 if(!response.ok){let detail='';try{const payload=await response.json();detail=String(payload.error||payload.message||'').slice(0,160);}catch(_){}throw new Error(endpoint+' returned HTTP '+response.status+(detail?' ('+detail+')':''));}
 return response.json();
}
(async()=>{
 const calendar=await get('/api/market/calendar');
 const todayTaiwan=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
 if(calendar.error||!String(calendar.source||'').includes('TWSE')||!Array.isArray(calendar.events))throw new Error('Official Taiwan market calendar unavailable; close report is withheld to avoid counting an unverified trading day');
 if(calendar.events.some(event=>event.date===todayTaiwan)){
  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync(path.join('reports','market-closed-'+todayTaiwan+'.json'),JSON.stringify({marketOpen:false,date:todayTaiwan,source:calendar.source,reason:'official_exchange_calendar_closed'},null,2));
  process.stdout.write(JSON.stringify({marketOpen:false,date:todayTaiwan,reason:'official_exchange_calendar_closed'}));
  return;
 }
 await get('/api/market/snapshot');
 const [flows,futures,sentiment,news]=await Promise.all([get('/api/market/institutional-flows'),get('/api/market/futures'),get('/api/market/sentiment'),get('/api/market/news')]);
 const scan=await get('/api/market/scan');
 if(scan.error||!scan.data||!Object.keys(scan.data).length)throw new Error('Market scan returned no usable data: '+String(scan.error||'empty scan').slice(0,180));
 const rows=Object.entries(scan.data||{}).map(([symbol,row])=>({symbol,...row,scorecard:row.scorecard||null}));
 const research=buildResearchLists(rows,30);
 const date=new Date().toISOString().slice(0,10);
 const report={
  marketOpen:true,
  generatedAt:new Date().toISOString(),
  scanTimestamp:scan.timestamp||null,
  source:scan.source||null,
  scannedCount:rows.length,
  researchReadyCount:research.researchReadyCount,
  bullishCandidateCount:research.bullishCount,
  bearishCandidateCount:research.bearishCount,
  neutralCount:research.neutralCount,
  topBullish:research.topBullish,
  topBearish:research.topBearish,
  news:(news.data||[]).slice(0,30),
  coverage:{institutionalFlows:!!(flows&&flows.data&&Object.keys(flows.data).length),futures:!!(futures&&futures.data),sentiment:!!(sentiment&&sentiment.data),newsCount:(news.data||[]).length},
  caveat:'多空名單只納入研究狀態為 research-ready 且方向標籤明確為偏向買進或偏向賣出／避險的股票；中立與資料不足標的分開統計，不會強制歸入多空。研究排序不是投資建議或勝率。'
 };
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync(path.join('reports','close-review-'+date+'.json'),JSON.stringify(report,null,2));
 const lines=['# 台股收盤研究報告 '+date,'',`掃描檔數：${rows.length}；可評分檔數：${research.researchReadyCount}`,`多方候選：${research.bullishCount}；空方候選：${research.bearishCount}；中立／觀望：${research.neutralCount}`,`資料時間：${report.scanTimestamp||'未提供'}`,'','## 多方研究排名'];
 for(const x of research.topBullish) lines.push(`- ${x.symbol}：${x.scorecard.score}/100（${x.scorecard.direction}；信心覆蓋率 ${x.scorecard.confidence}%）`);
 lines.push('','## 空方／避險研究排名');
 for(const x of research.topBearish) lines.push(`- ${x.symbol}：${x.scorecard.score}/100（${x.scorecard.direction}；信心覆蓋率 ${x.scorecard.confidence}%）`);
 lines.push('','## 新聞');
 for(const n of report.news) lines.push(`- [${n.title||n.headline||'新聞'}](${n.url||'#'}) — ${n.source||''}`);
 lines.push('','> '+report.caveat,'');
 fs.writeFileSync(path.join('reports','close-review-'+date+'.md'),lines.join('\n'));
 process.stdout.write(JSON.stringify({marketOpen:true,scannedCount:rows.length,researchReadyCount:research.researchReadyCount,bullishCount:research.bullishCount,bearishCount:research.bearishCount,neutralCount:research.neutralCount,report:date}));
})().catch(error=>{process.stderr.write(error.stack||String(error));process.exit(1);});
