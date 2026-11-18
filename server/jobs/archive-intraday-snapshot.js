'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {buildResearchLists}=require('../lib/research-selection');

const scanPath=process.argv[2]||'/tmp/scan.json';
const snapshotPath=process.argv[3]||'/tmp/snapshot.json';
if(!fs.existsSync(scanPath)||!fs.existsSync(snapshotPath))throw new Error('Scan and quote snapshot JSON files are required');
const scan=JSON.parse(fs.readFileSync(scanPath,'utf8'));
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const rows=Object.entries(scan.data||{}).map(([symbol,row])=>({symbol,...row,scorecard:row.scorecard||null}));
const lists=buildResearchLists(rows,15);
function attachPrice(items){
 return items.flatMap(item=>{
  const quote=snapshot.data?.[item.symbol],price=Number(quote?.price),time=Date.parse(quote?.timestamp||'');
  const age=Date.now()-time;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(time)||age< -30000||age>15*60*1000)return [];
  return [{...item,price,quoteTimestamp:quote.timestamp,quoteSource:quote.source||snapshot.source||null}];
 });
}
const report={
 generatedAt:new Date().toISOString(),
 scanTimestamp:scan.timestamp||null,
 snapshotTimestamp:snapshot.timestamp||null,
 source:scan.source||null,
 topBullish:attachPrice(lists.topBullish),
 topBearish:attachPrice(lists.topBearish),
 neutralCount:lists.neutralCount,
 scannedCount:rows.length,
 caveat:'盤中五分鐘掃描快照，用於一小時後的方向性結果比較；只保留有效方向訊號與新鮮價格，不代表實際成交。'
};
fs.mkdirSync('reports',{recursive:true});
const out=path.join('reports','intraday-snapshot.json');
fs.writeFileSync(out,JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify({scannedCount:report.scannedCount,bullish:report.topBullish.length,bearish:report.topBearish.length,asOf:report.snapshotTimestamp}));
