'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { indicators } = require('./lib/indicators');
const { scoreStock } = require('./lib/scoring');
const { getTradingReadiness } = require('./lib/trading-readiness');
const { buildAiCommittee } = require('./lib/agents');
const { applyFirewall, getTelemetry } = require('./lib/firewall');
const antColony = require('./lib/ant-colony');
const { loadMarket: loadUsMarket, getChart: getUsChart, searchSymbols: searchUsSymbols, getUniversePage: getUsUniversePage } = require('./lib/us-market');
const cryptoMarket = require('./lib/crypto-market');
const cryptoRealtime = require('./lib/crypto-stream-engine');
const cryptoRealtimeFeed = cryptoRealtime.createDefaultCryptoStreamEngine();
const cryptoMicrostructure = require('./lib/crypto-microstructure');
const { assessMarketRisk } = require('./lib/market-risk');
const { loadRiskHistory, loadFreshMicrostructure } = require('./lib/crypto-risk-fallback');
const { runStrategyLab, validateResearchHistory } = require('./lib/strategy-lab');
const globalFinance = require('./lib/global-finance');
const globalIntelligence = require('./lib/intelligence');
const marketIntelligence = require('./lib/market-intelligence');
const { diagnoseProviders } = require('./lib/provider-diagnostics');
const { loadOfficialDailyQuotes, diagnoseOfficialDailyQuotes } = require('./lib/official-tw-market');
const { epochMilliseconds, isStaleTimestamp } = require('./lib/market-timestamps');
const { createDependencyVulnerabilityScanner } = require('./lib/dependency-vulnerabilities');
const { verifyGitHubActionsToken } = require('./lib/github-oidc');
const { buildRuntimeHealth, buildDependencyReadiness } = require('./lib/health');
const { getHistoricalCoverage, validateHistoryRange } = require('./lib/historical-coverage');
const researchStorage = require('./lib/research-storage').createResearchStorage();
const cryptoEventStorage = require('./lib/crypto-event-storage').createCryptoEventStorage();
const dependencyVulnerabilityScanner = createDependencyVulnerabilityScanner({ lockPath: path.join(__dirname, '..', 'package-lock.json'), manifestPath: path.join(__dirname, '..', 'package.json'), auditPath: path.join(__dirname, '..', 'dependency-audit.json') });

const PORT = Number(process.env.PORT || 8787);
const FINMIND_BASE = process.env.FINMIND_BASE || 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_TOKEN = process.env.FINMIND_TOKEN || '';
const CACHE = new Map();
const PENDING = new Map();
const RATE = new Map();
const TTL = { universe: 6*60*60*1000, snapshot: 5*60*1000, scan: 10000, history: 5*60*1000, flows: 30*60*1000, futures: 5*60*1000, sentiment: 30*60*1000, news: 5*60*1000 };
const now = () => new Date().toISOString();
const parseMarketNumber = value => value===null||value===undefined||String(value).trim()===''?NaN:Number(String(value).replace(/,/g,'').trim());
const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
function cached(key, ttl) { const x=CACHE.get(key); return x && Date.now()-x.time<ttl ? x.value : null; }
function put(key,value){ CACHE.set(key,{time:Date.now(),value}); return value; }
async function fetchJson(url, timeoutMs=8000, extraHeaders={}) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try { const r=await fetch(url,{signal:controller.signal,headers:{accept:'application/json',...extraHeaders}}); if(!r.ok) throw new Error('upstream_http_'+r.status); return await r.json(); }
  finally { clearTimeout(timer); }
}
async function finmind(dataset, extra={}, timeoutMs=8000) {
  if(!FINMIND_TOKEN) throw new Error('未設定 FINMIND_TOKEN');
  const u=new URL(FINMIND_BASE); u.searchParams.set('dataset',dataset);
  for(const [k,v] of Object.entries(extra)) if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  const payload=await fetchJson(u.toString(),timeoutMs,{Authorization:'Bearer '+FINMIND_TOKEN});
  if(payload.status!==200 && payload.status!==undefined) throw new Error('FinMind status '+payload.status);
  return Array.isArray(payload.data)?payload.data:[];
}
async function external(urlEnv, fallbackMessage) {
  const target=process.env[urlEnv];
  if(!target) throw new Error(fallbackMessage);
  const data=await fetchJson(target);
  return data && typeof data==='object' ? data : {};
}
function stale(key){const x=CACHE.get(key);return x?x.value:null;}
async function safeLoad(key, ttl, loader, fallback) {
  const hit=cached(key,ttl); if(hit!==null)return hit;
  if(PENDING.has(key))return PENDING.get(key);
  const job=(async()=>{
    try{return put(key,await loader());}
    catch(e){const old=stale(key);if(old!==null)return {...old,stale:true,warning:'上游暫時失敗，顯示快取舊資料；不可視為即時行情'};return fallback(e);}
    finally{PENDING.delete(key);}
  })();
  PENDING.set(key,job);
  return job;
}
async function mapLimit(items,limit,worker){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await worker(items[i],i);}}));return out;}
const INDUSTRY_NAMES={
  '01':'水泥工業','02':'食品工業','03':'塑膠工業','04':'紡織纖維','05':'電機機械','06':'電器電纜',
  '08':'玻璃陶瓷','09':'造紙工業','10':'鋼鐵工業','11':'橡膠工業','12':'汽車工業','14':'建材營造',
  '15':'航運業','16':'觀光餐旅','17':'金融保險','18':'貿易百貨','19':'綜合','20':'其他',
  '21':'化學工業','22':'生技醫療業','23':'油電燃氣業','24':'半導體業','25':'電腦及週邊設備業',
  '26':'光電業','27':'通信網路業','28':'電子零組件業','29':'電子通路業','30':'資訊服務業',
  '31':'其他電子業','32':'綠能環保','33':'數位雲端','34':'運動休閒','35':'居家生活'
};
function industryName(code){const key=String(code||'').trim().padStart(2,'0');return INDUSTRY_NAMES[key]||String(code||'未分類');}
function currentTwseRows(rows){
  const latest=new Map();
  for(const row of rows||[]){
    const symbol=String(row.stock_id||row['公司代號']||row['股票代號']||row['有價證券代號']||row['代號']||'').trim();
    if(!/^[0-9]{4,6}$/.test(symbol))continue;
    if(String(row.type||'').toLowerCase() && String(row.type).toLowerCase()!=='twse')continue;
    const name=row.stock_name||row['公司簡稱']||row['有價證券名稱']||row['公司名稱']||symbol;
    latest.set(symbol,{symbol,name,sector:industryName(row.industry_category||row['產業別']),exchange:'TWSE'});
  }
  return [...latest.values()];
}
async function twseListedUniverse(){
  const listedPromise=(async()=>{
    const rows=await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L',10000);
    const data=currentTwseRows(rows).map(x=>({...x,exchange:'TWSE'}));
    if(!data.length)throw new Error('證交所上市公司清單沒有回傳有效資料');
    return data;
  })();
  const otcPromise=(async()=>{
    try{
      const rows=await fetchJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',12000);
      const data=(rows||[]).map(row=>({
        symbol:String(row.SecuritiesCompanyCode||row['公司代號']||'').trim(),
        name:String(row.CompanyAbbreviation||row['公司簡稱']||row.CompanyName||'').trim(),
        sector:industryName(row.SecuritiesIndustryCode||row['產業別']),
        exchange:'TPEx'
      })).filter(x=>/^[0-9A-Z]{2,10}$/.test(x.symbol));
      if(data.length)return data;
      throw new Error('TPEx 公司清單沒有有效資料');
    }catch(error){
      try{
        const csv=await fetchText('https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv',12000,{'Accept':'text/csv,text/plain,*/*'});
        const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
        if(lines.length>1){
          const headers=parseCsvLine(lines[0]).map(x=>x.trim());
          const codeIndex=headers.findIndex(x=>/公司代號|證券代號/.test(x)),nameIndex=headers.findIndex(x=>/公司簡稱/.test(x)),sectorIndex=headers.findIndex(x=>/產業別/.test(x));
          const csvRows=lines.slice(1).map(line=>{const cells=parseCsvLine(line);return {symbol:String(cells[codeIndex]||'').trim(),name:String(cells[nameIndex]||'').trim(),sector:String(cells[sectorIndex]||'未分類').trim(),exchange:'TPEx'};}).filter(x=>validateSymbol(x.symbol));
          if(csvRows.length)return csvRows;
        }
      }catch(_){}
      const archive=await recentOpenArchive('price_tpex',1);
      if(!archive.length)throw new Error('TPEx 公司清單 API、官方 CSV 與日行情備援皆不可用：'+error.message);
      return Object.keys(archive[0].rows||{}).filter(validateSymbol).map(symbol=>({symbol,name:symbol,sector:'未分類',exchange:'TPEx',namePending:true}));
    }
  })();
  const [listed,otc]=await Promise.all([listedPromise,otcPromise]);
  const merged=new Map();
  for(const row of [...listed,...otc])if(!merged.has(row.symbol))merged.set(row.symbol,row);
  return {data:[...merged.values()],source:'TWSE + TPEx 官方上市櫃公司清單（TPEx 清單失效時以官方日行情代碼備援）',timestamp:now(),markets:{TWSE:listed.length,TPEx:otc.length}};
}

function twseNumber(value){const n=Number(String(value??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
function twseField(fields,pattern,fallback){const i=(fields||[]).findIndex(x=>pattern.test(String(x)));return i>=0?i:fallback;}
function archiveDates(days=120){
  const out=[];
  for(let i=0;i<days;i++){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-i);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)out.push(d.toISOString().slice(0,10));}
  return out;
}
async function fetchText(url,timeoutMs=12000,extraHeaders={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'TaiwanStockDashboard/1.0',...extraHeaders}});if(!r.ok)throw new Error('upstream_http_'+r.status);return await r.text();}
  finally{clearTimeout(timer);}
}
function parseCsvLine(line){
  const out=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){out.push(value);value='';}else value+=ch;}
  out.push(value);return out;
}
async function tdccShareholdingDistribution(){
  const csv=await fetchText('https://opendata.tdcc.com.tw/getOD.ashx?id=1-5',20000,{'Accept':'text/csv,text/plain,*/*'});
  const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2)throw new Error('TDCC 集保戶股權分散資料為空');
  const head=parseCsvLine(lines[0]).map(x=>x.trim());
  const idx={date:head.findIndex(x=>/日期|date/i.test(x)),symbol:head.findIndex(x=>/代號|code/i.test(x)),level:head.findIndex(x=>/分級|級距|level/i.test(x)),proportion:head.findIndex(x=>/比例|占比|proportion/i.test(x))};
  if(Object.values(idx).some(x=>x<0)){idx.date=0;idx.symbol=1;idx.level=2;idx.proportion=5;}
  const byDate={};
  for(const line of lines.slice(1)){
    const row=parseCsvLine(line);const symbol=String(row[idx.symbol]||'').trim();if(!/^[0-9A-Z]{4,10}$/.test(symbol))continue;
    const rawDate=String(row[idx.date]||'').replace(/[^0-9]/g,''),date=rawDate.length===7?String(Number(rawDate.slice(0,3))+1911)+rawDate.slice(3):rawDate;
    if(date.length!==8)continue;
    const level=Number(row[idx.level]),pct=Number(String(row[idx.proportion]||'').replace(/,/g,'').replace(/%/g,''));
    if(!Number.isFinite(level)||!Number.isFinite(pct)||level<1||level>17)continue;
    const key=symbol+'|'+date,x=byDate[key]||(byDate[key]={symbol,date,largeHolderPct:0,retailHolderPct:0});
    if(level>=12&&level<=15)x.largeHolderPct+=pct;
    if(level>=1&&level<=5)x.retailHolderPct+=pct;
  }
  const latest={};
  for(const x of Object.values(byDate))if(!latest[x.symbol]||x.date>latest[x.symbol].date)latest[x.symbol]=x;
  if(!Object.keys(latest).length)throw new Error('TDCC 集保股權分散 CSV 欄位無法解析');
  const asOf=Object.values(latest).map(x=>x.date).sort().at(-1);return {data:latest,asOf,source:'TDCC 集保戶股權分散開放資料（每週更新）'};
}
async function fetchOpenArchive(kind,date){
  const base=process.env.OPEN_DATA_ARCHIVE_URL||'https://raw.githubusercontent.com/88jiayu/tw-chip-open-data/main/data/official';
  const doc=await fetchJson(base+'/'+kind+'/'+date+'.json',12000,{'User-Agent':'TaiwanStockDashboard/1.0','Accept':'application/json'});
  if(!doc||doc.license!=='open'||doc.kind!==kind||doc.trade_date!==date||!doc.rows||typeof doc.rows!=='object')throw new Error('開放資料檔案格式或授權欄位不符');
  return doc;
}
async function recentOpenArchive(kind,count=2){
  const dates=archiveDates(18);
  const docs=await mapLimit(dates,6,async date=>{try{return await fetchOpenArchive(kind,date);}catch(_){return null;}});
  return docs.filter(Boolean).sort((a,b)=>a.trade_date.localeCompare(b.trade_date)).slice(-count);
}
async function twseInstitutionalDay(date){
  const ymd=date.replace(/-/g,'');
  const url='https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date='+ymd+'&selectType=ALLBUT0999';
  const payload=await fetchJson(url,12000,{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Referer':'https://www.twse.com.tw/','Accept':'application/json, text/plain, */*'});
  const table=(payload.tables||[]).find(t=>Array.isArray(t.data)&&t.data.length)||payload;
  const fields=table.fields||payload.fields||[];
  const rows=table.data||payload.data||[];
  if(payload.stat&&payload.stat!=='OK')return {date,rows:[]};
  if(!Array.isArray(rows)||!rows.length)return {date,rows:[]};
  const idx={
    symbol:twseField(fields,/證券代號/,0),
    foreign:twseField(fields,/外陸資買賣超股數\(不含外資自營商\)/,4),
    foreignDealer:twseField(fields,/外資自營商買賣超股數/,7),
    trust:twseField(fields,/投信買賣超股數/,10),
    dealer:twseField(fields,/自營商買賣超股數\(自行買賣\)/,13),
    dealerHedge:twseField(fields,/自營商買賣超股數\(避險\)/,16)
  };
  return {date,rows:rows.map(r=>({symbol:String(Array.isArray(r)?r[idx.symbol]:r['證券代號']||''),foreign:twseNumber(Array.isArray(r)?r[idx.foreign]:r['外陸資買賣超股數(不含外資自營商)']),foreignDealer:twseNumber(Array.isArray(r)?r[idx.foreignDealer]:r['外資自營商買賣超股數']),trust:twseNumber(Array.isArray(r)?r[idx.trust]:r['投信買賣超股數']),dealer:twseNumber(Array.isArray(r)?r[idx.dealer]:r['自營商買賣超股數(自行買賣)']),dealerHedge:twseNumber(Array.isArray(r)?r[idx.dealerHedge]:r['自營商買賣超股數(避險)'])})).filter(x=>/^[0-9]{4,6}$/.test(x.symbol))};
}
async function twseInstitutionalFlows(){
  const candidates=archiveDates(16).slice(0,8);
  const daily=await mapLimit(candidates,1,async(date,i)=>{
    if(i)await new Promise(resolve=>setTimeout(resolve,1800));
    try{return await twseInstitutionalDay(date);}catch(e){return {date,rows:[],error:e.message};}
  });
  const valid=daily.filter(x=>x.rows.length).sort((a,b)=>a.date.localeCompare(b.date)).slice(-5);
  if(!valid.length)throw new Error('TWSE T86 三大法人日報無有效資料：'+(daily.find(x=>x.error)?.error||'近 8 個交易日候選日期沒有有效資料'));
  const data={};
  for(const day of valid)for(const r of day.rows){
    const x=data[r.symbol]||(data[r.symbol]={asOf:day.date,foreignNet:0,trustNet:0,dealerNet:0,foreignNet5d:0,trustNet5d:0,dealerNet5d:0,institutionalNet:0,institutionalNet5d:0});
    const foreign=r.foreign+r.foreignDealer,dealer=r.dealer+r.dealerHedge,total=foreign+r.trust+dealer;
    x.foreignNet5d+=foreign;x.trustNet5d+=r.trust;x.dealerNet5d+=dealer;x.institutionalNet5d+=total;
    if(day.date===valid.at(-1).date){x.asOf=day.date;x.foreignNet=foreign;x.trustNet=r.trust;x.dealerNet=dealer;x.institutionalNet=total;}
  }
  let tpexInstitutionalAsOf=null;
  try{
    const docs=await recentOpenArchive('inst_tpex',5);
    tpexInstitutionalAsOf=docs.at(-1)?.trade_date||null;
    for(const doc of docs){
      const fields=doc.fields||[],ix={foreign:fields.indexOf('foreign_net'),trust:fields.indexOf('trust_net'),dealer:fields.indexOf('dealer_net'),total:fields.indexOf('total_net')};
      if(Object.values(ix).some(i=>i<0))continue;
      for(const [symbol,values] of Object.entries(doc.rows||{})){
        const x=data[symbol]||(data[symbol]={asOf:doc.trade_date,foreignNet:0,trustNet:0,dealerNet:0,foreignNet5d:0,trustNet5d:0,dealerNet5d:0,institutionalNet:0,institutionalNet5d:0});
        const foreign=Number(values?.[ix.foreign]),trust=Number(values?.[ix.trust]),dealer=Number(values?.[ix.dealer]),total=Number(values?.[ix.total]);
        if(![foreign,trust,dealer,total].every(Number.isFinite))continue;
        x.foreignNet5d=(x.foreignNet5d||0)+foreign;x.trustNet5d=(x.trustNet5d||0)+trust;x.dealerNet5d=(x.dealerNet5d||0)+dealer;x.institutionalNet5d=(x.institutionalNet5d||0)+total;
        if(doc.trade_date===tpexInstitutionalAsOf){x.asOf=doc.trade_date;x.foreignNet=foreign;x.trustNet=trust;x.dealerNet=dealer;x.institutionalNet=total;x.exchange='TPEx';}
      }
    }
  }catch(_){}
  let marginAsOf=null;
  try{
    const markets=await Promise.all([recentOpenArchive('margin_twse',2),recentOpenArchive('margin_tpex',2)]);
    for(let marketIndex=0;marketIndex<markets.length;marketIndex++){
      const margins=markets[marketIndex];
      if(!margins.length)continue;
      const latest=margins.at(-1),previous=margins.at(-2);
      if(marketIndex===0)marginAsOf=latest.trade_date;
      for(const [symbol,values] of Object.entries(latest.rows)){
        const old=previous?.rows?.[symbol];
        const x=data[symbol]||(data[symbol]={asOf:latest.trade_date});
        const margin=Number(values?.[0]),short=Number(values?.[1]);
        if(Number.isFinite(margin)){x.marginBalance=margin;if(old&&Number.isFinite(Number(old[0])))x.marginChange=margin-Number(old[0]);}
        if(Number.isFinite(short)){x.shortBalance=short;if(old&&Number.isFinite(Number(old[1])))x.shortChange=short-Number(old[1]);}
        if(marketIndex===1)x.marginAsOf=latest.trade_date;
      }
    }
  }catch(_){}
  let tdccAsOf=null;
  try{
    const tdcc=await tdccShareholdingDistribution();tdccAsOf=tdcc.asOf;
    for(const [symbol,holder] of Object.entries(tdcc.data||{})){
      const x=data[symbol]||(data[symbol]={asOf:valid.at(-1).date});
      x.largeHolderPct=holder.largeHolderPct;x.retailHolderPct=holder.retailHolderPct;x.tdccAsOf=holder.date;
    }
  }catch(_){}
  return {data,source:'TWSE T86 + TPEx 官方歸檔三大法人 + TWSE/TPEx 融資融券 + TDCC 集保資料',timestamp:now(),asOf:valid.at(-1).date,days:valid.map(x=>x.date),tpexInstitutionalAsOf,marginAsOf,tdccAsOf};
}
async function openSourceMarketHistory(){
  const dates=archiveDates(120);
  const kinds=['price_twse','price_tpex'];
  const batches=await Promise.all(kinds.map(kind=>mapLimit(dates,8,async date=>{try{return await fetchOpenArchive(kind,date);}catch(_){return null;}})));
  const valid=batches.flat().filter(Boolean).sort((a,b)=>a.trade_date.localeCompare(b.trade_date));
  const tradingDates=[...new Set(valid.map(x=>x.trade_date))].sort();
  if(tradingDates.length<60)throw new Error('上市櫃開放資料歷史庫目前只有 '+tradingDates.length+' 個有效交易日，至少需要 60 日才能計算完整技術指標');
  const grouped=new Map();
  for(const doc of valid){
    const fields=doc.fields||[],idx={open:fields.indexOf('open'),high:fields.indexOf('high'),low:fields.indexOf('low'),close:fields.indexOf('close'),volume:fields.indexOf('volume_shares')};
    if(Object.values(idx).some(i=>i<0))continue;
    for(const [symbol,values] of Object.entries(doc.rows||{})){
      if(!/^[0-9A-Z]{4,10}$/.test(symbol)||!Array.isArray(values))continue;
      const candle={time:doc.trade_date,open:Number(values[idx.open]),high:Number(values[idx.high]),low:Number(values[idx.low]),close:Number(values[idx.close]),volume:Number(values[idx.volume]),exchange:doc.kind==='price_tpex'?'TPEx':'TWSE'};
      if(![candle.open,candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite)||candle.close<=0||candle.high<=0||candle.low<=0)continue;
      if(!grouped.has(symbol))grouped.set(symbol,[]);grouped.get(symbol).push(candle);
    }
  }
  const data={};
  for(const [symbol,candles] of grouped){
    candles.sort((a,b)=>a.time.localeCompare(b.time));
    if(candles.length<60)continue;
    const ind=indicators(candles);if(!ind)continue;
    const last=candles.at(-1),prior=candles.at(-2)?.close,close5=candles.at(-6)?.close,close20=candles.at(-21)?.close,volume5d=candles.slice(-5).reduce((sum,row)=>sum+row.volume,0);
    data[symbol]={...ind,exchange:last.exchange,technicalAsOf:last.time,asOf:valid.filter(x=>x.trade_date===last.time&&x.kind===(last.exchange==='TPEx'?'price_tpex':'price_twse')).at(-1)?.fetched_at||now(),close:last.close,latestVolume:last.volume,volume5d,dailyChangePct:prior?((last.close/prior)-1)*100:null,return5dPct:close5?((last.close/close5)-1)*100:null,return20dPct:close20?((last.close/close20)-1)*100:null};
  }
  return {data,historyAsOf:tradingDates.at(-1),historyDateCount:tradingDates.length,historyCount:Object.keys(data).length,markets:{TWSE:Object.values(data).filter(x=>x.exchange==='TWSE').length,TPEx:Object.values(data).filter(x=>x.exchange==='TPEx').length},source:'88jiayu/tw-chip-open-data（TWSE + TPEx 官方開放資料歸檔；OGDL）'};
}

function validateSymbol(s){return /^[0-9A-Z]{2,10}$/.test(s||'');}
function rateLimit(req){const ip=req.socket.remoteAddress||'unknown';const t=Date.now();let a=RATE.get(ip)||[];a=a.filter(x=>t-x<60000);if(a.length>=480)return false;a.push(t);RATE.set(ip,a);return true;}

async function loadOpenArchiveStockHistory(symbol, kind='price_tpex') {
  const dates=archiveDates(120);
  const rows=await mapLimit(dates,8,async date=>{
    try{
      const doc=await fetchOpenArchive(kind,date);
      const fields=doc.fields||[],values=doc.rows?.[symbol];
      if(!Array.isArray(values))return null;
      const idx={open:fields.indexOf('open'),high:fields.indexOf('high'),low:fields.indexOf('low'),close:fields.indexOf('close'),volume:fields.indexOf('volume_shares')};
      if(Object.values(idx).some(i=>i<0))return null;
      if(!doc.trade_date||!Number.isFinite(Date.parse(String(doc.trade_date))))return null;
      const candle={time:doc.trade_date,open:parseMarketNumber(values[idx.open]),high:parseMarketNumber(values[idx.high]),low:parseMarketNumber(values[idx.low]),close:parseMarketNumber(values[idx.close]),volume:parseMarketNumber(values[idx.volume])};
      if(![candle.open,candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite)||candle.close<=0||candle.high<=0||candle.low<=0||candle.high<Math.max(candle.low,candle.close)||candle.low>Math.min(candle.high,candle.close)||candle.volume<0)return null;
      return candle;
    }catch(_){return null;}
  });
  const data=rows.filter(Boolean).sort((a,b)=>a.time.localeCompare(b.time)).slice(-240);
  if(data.length<60)throw new Error('官方開放資料歷史庫中此上櫃股票不足 60 根有效日K，暫不能計算完整技術指標');
  return {data,source:'TPEx 官方日行情開放資料歸檔（非即時日K）',timestamp:now(),asOf:data.at(-1).time,indicators:indicators(data)};
}

async function loadStockHistory(symbol){
  let data=[],source='';
  if(FINMIND_TOKEN){
    const d=new Date();d.setDate(d.getDate()-260);const start=d.toISOString().slice(0,10);
    const rows=await finmind('TaiwanStockPrice',{data_id:symbol,start_date:start});
    data=rows.map(x=>({time:x.date,open:parseMarketNumber(x.open),high:parseMarketNumber(x.max),low:parseMarketNumber(x.min),close:parseMarketNumber(x.close),volume:parseMarketNumber(x.Trading_Volume)})).filter(x=>x.time&&Number.isFinite(Date.parse(String(x.time)))&&[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)).slice(-240);
    source='FinMind TaiwanStockPrice（日資料，非逐筆即時）';
  }else{
    const listed=await safeLoad('universe',TTL.universe,twseListedUniverse,e=>({data:[],error:e.message}));
    const issuer=(listed.data||[]).find(x=>x.symbol===symbol);
    if(issuer?.exchange==='TPEx')return loadOpenArchiveStockHistory(symbol,'price_tpex');
    const months=[];for(let i=0;i<8;i++){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7)+'-01');}
    const pages=await mapLimit(months,3,async month=>{
      const date=month.replace(/-/g,'').slice(0,6)+'01';
      const url='https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date='+date+'&stockNo='+encodeURIComponent(symbol)+'&response=json';
      const payload=await fetchJson(url,12000,{'User-Agent':'Mozilla/5.0','Referer':'https://www.twse.com.tw/','Accept':'application/json'});
      return (payload.data||[]).map(r=>{const parts=String(r[0]||'').split('/');const day=parts.length===3?String(Number(parts[0])+1911)+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'):'';const n=parseMarketNumber;return {time:day,volume:n(r[1]),open:n(r[3]),high:n(r[4]),low:n(r[5]),close:n(r[6])};}).filter(x=>x.time&&[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite));
    });
    data=pages.flat().sort((a,b)=>a.time.localeCompare(b.time)).slice(-240);
    source='TWSE 官方 STOCK_DAY 月日線（日資料，非逐筆即時）';
    if(data.length<60&&issuer?.exchange!=='TWSE')return loadOpenArchiveStockHistory(symbol,'price_tpex');
  }
  if(data.length<60)throw new Error('個股官方歷史日線不足 60 根，暫不能計算完整技術指標');
  return {data,source,timestamp:now(),asOf:data.at(-1).time,indicators:indicators(data)};
}


const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const SUPABASE_ADMIN_EMAIL=String(process.env.SUPABASE_ADMIN_EMAIL||'').trim().toLowerCase();
const SUPABASE_CONFIGURED=!!(SUPABASE_URL&&SUPABASE_ANON_KEY);
async function readRequestJson(req,maxBytes=16384){
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw,'utf8')>maxBytes)throw new Error('request_body_too_large');}
  try{return raw?JSON.parse(raw):{};}catch(_){throw new Error('invalid_json');}
}
function bearerToken(req){const h=String(req.headers.authorization||'');return /^Bearer\s+\S+$/i.test(h)?h.replace(/^Bearer\s+/i,''):'';}
async function supabaseRequest(path,{method='GET',body,token,admin=false}={}){
  if(!SUPABASE_CONFIGURED)throw new Error('Supabase 尚未設定');
  if(admin&&!SUPABASE_SERVICE_ROLE_KEY)throw new Error('管理員服務金鑰尚未在 Render 設定；會員登入不受影響');
  const key=admin?SUPABASE_SERVICE_ROLE_KEY:SUPABASE_ANON_KEY;
  const headers={'apikey':key,'Authorization':'Bearer '+(token||(admin?SUPABASE_SERVICE_ROLE_KEY:key)),'Accept':'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch(_){data={message:text};}
  if(!response.ok){const error=new Error(data.msg||data.message||data.error_description||data.error||'Supabase request failed');error.status=response.status;throw error;}
  return data;
}
async function authenticatedUser(req){
  const token=bearerToken(req);if(!token)return null;
  try{return await supabaseRequest('/auth/v1/user',{token});}catch(_){return null;}
}
function isAdminUser(user){return !!(user&&user.email&&SUPABASE_ADMIN_EMAIL&&String(user.email).toLowerCase()===SUPABASE_ADMIN_EMAIL);}

async function route(req,res){
  const u=new URL(req.url,'http://localhost');
  if(req.method==='POST'&&u.pathname==='/api/automation/research/outcomes'){
    if(!await verifyGitHubActionsToken(bearerToken(req)))return json(res,401,{error:'automation_authentication_required'});
    try{
      const report=await readRequestJson(req,256*1024);
      const stored=await researchStorage.saveReport(report);
      return json(res,201,{ok:true,...stored});
    }catch(e){
      const status=e.code==='invalid_report'||e.code==='report_too_large'||e.message==='invalid_json'?400:e.message==='request_body_too_large'?413:e.code==='storage_not_configured'?503:502;
      return json(res,status,{error:e.code||'research_storage_error',message:e.message});
    }
  }
  if(u.pathname==='/api/auth/config'&&req.method==='GET'){
    let settings=null,settingsError=null;
    if(SUPABASE_CONFIGURED){
      try{
        const response=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_ANON_KEY,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.msg||payload.message||'無法讀取 Supabase Auth 設定');
        settings=payload;
      }catch(e){settingsError=e.message;}
    }
    const signupDisabled=!!settings?.disable_signup;
    return json(res,200,{configured:SUPABASE_CONFIGURED,registrationEnabled:SUPABASE_CONFIGURED&&!signupDisabled&&settings?.external?.email!==false,signupDisabled,emailProviderEnabled:settings?.external?.email!==false,phoneProviderEnabled:settings?.external?.phone!==false,emailAutoconfirm:!!settings?.mailer_autoconfirm,adminManagementConfigured:!!SUPABASE_SERVICE_ROLE_KEY&&!!SUPABASE_ADMIN_EMAIL,adminEmailConfigured:!!SUPABASE_ADMIN_EMAIL,serviceRoleConfigured:!!SUPABASE_SERVICE_ROLE_KEY,settingsAvailable:!!settings,settingsError,oauthProviders:['apple','facebook'],phoneOtp:true});
  }
  const oauthMatch=u.pathname.match(/^\/api\/auth\/oauth\/(apple|facebook)$/);
  if(oauthMatch&&req.method==='GET'){
    if(!SUPABASE_CONFIGURED)return json(res,503,{error:'Supabase 尚未設定'});
    const origin=(req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host);
    const target=new URL(SUPABASE_URL+'/auth/v1/authorize');target.searchParams.set('provider',oauthMatch[1]);target.searchParams.set('redirect_to',origin+'/');
    const upstream=await fetch(target.toString(),{headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY},redirect:'manual',signal:AbortSignal.timeout(12000)});
    const location=upstream.headers.get('location');
    if(upstream.status>=300&&upstream.status<400&&location){res.writeHead(302,{Location:location,'Cache-Control':'no-store'});return res.end();}
    const detail=(await upstream.text()).slice(0,300);
    return json(res,502,{error:'Supabase OAuth 初始化失敗：'+(detail||'請確認 Apple／Facebook Provider 設定')});
  }
  if(u.pathname==='/api/auth/phone/start'&&req.method==='POST'){
    if(!SUPABASE_CONFIGURED)return json(res,503,{error:'會員服務尚未設定'});
    try{const body=await readRequestJson(req),phone=String(body.phone||'').trim();if(!/^\+[1-9]\d{7,14}$/.test(phone))return json(res,400,{error:'請使用含國碼的手機格式，例如 +886912345678'});
      await supabaseRequest('/auth/v1/otp',{method:'POST',body:{phone,create_user:true}});return json(res,200,{ok:true,message:'SMS OTP sent'});
    }catch(e){return json(res,e.status||502,{error:e.message});}
  }
  if(u.pathname==='/api/auth/phone/verify'&&req.method==='POST'){
    if(!SUPABASE_CONFIGURED)return json(res,503,{error:'會員服務尚未設定'});
    try{const body=await readRequestJson(req),phone=String(body.phone||'').trim(),token=String(body.token||'').trim();if(!/^\+[1-9]\d{7,14}$/.test(phone)||!/^\d{4,8}$/.test(token))return json(res,400,{error:'手機號碼或簡訊驗證碼格式錯誤'});
      const data=await supabaseRequest('/auth/v1/verify',{method:'POST',body:{phone,token,type:'sms'}});return json(res,200,{access_token:data.access_token,refresh_token:data.refresh_token,expires_in:data.expires_in,user:data.user});
    }catch(e){return json(res,e.status||401,{error:e.message});}
  }
  if(u.pathname==='/api/auth/signup'&&req.method==='POST'){
    if(!SUPABASE_CONFIGURED)return json(res,503,{error:'會員系統尚未設定'});
    try{const body=await readRequestJson(req);if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.email||''))||String(body.password||'').length<10)return json(res,400,{error:'請輸入有效 Email，密碼至少 10 個字元'});
      const data=await supabaseRequest('/auth/v1/signup',{method:'POST',body:{email:String(body.email).trim(),password:String(body.password)}});
      return json(res,200,{user:data.user||null,session:data.session||null,confirmationRequired:!data.session});
    }catch(e){return json(res,e.status||502,{error:e.message});}
  }
  if(u.pathname==='/api/auth/login'&&req.method==='POST'){
    if(!SUPABASE_CONFIGURED)return json(res,503,{error:'會員系統尚未設定'});
    try{const body=await readRequestJson(req);const data=await supabaseRequest('/auth/v1/token?grant_type=password',{method:'POST',body:{email:String(body.email||'').trim(),password:String(body.password||'')}});
      return json(res,200,{access_token:data.access_token,refresh_token:data.refresh_token,expires_in:data.expires_in,user:data.user});
    }catch(e){return json(res,e.status||401,{error:e.message});}
  }
  if(u.pathname==='/api/auth/refresh'&&req.method==='POST'){
    try{const body=await readRequestJson(req);const data=await supabaseRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:String(body.refresh_token||'')}});
      return json(res,200,{access_token:data.access_token,refresh_token:data.refresh_token,expires_in:data.expires_in,user:data.user});
    }catch(e){return json(res,e.status||401,{error:e.message});}
  }
  if(u.pathname==='/api/auth/password'&&req.method==='POST'){
    const user=await authenticatedUser(req);if(!user)return json(res,401,{error:'authentication_required'});
    try{const body=await readRequestJson(req),password=String(body.password||'');if(password.length<10)return json(res,400,{error:'新密碼至少 10 個字元'});
      await supabaseRequest('/auth/v1/user',{method:'PUT',token:bearerToken(req),body:{password}});
      return json(res,200,{ok:true});
    }catch(e){return json(res,e.status||502,{error:e.message});}
  }
  if(u.pathname==='/api/auth/me'&&req.method==='GET'){
    const user=await authenticatedUser(req);if(!user)return json(res,401,{error:'authentication_required'});
    return json(res,200,{user:{id:user.id,email:user.email},isAdmin:isAdminUser(user),adminManagementConfigured:!!SUPABASE_SERVICE_ROLE_KEY});
  }
  if(u.pathname==='/api/auth/logout'&&req.method==='POST'){
    const token=bearerToken(req);if(token)try{await supabaseRequest('/auth/v1/logout',{method:'POST',token});}catch(_){}
    return json(res,200,{ok:true});
  }
  if(u.pathname.startsWith('/api/admin/members')){
    const user=await authenticatedUser(req);if(!user)return json(res,401,{error:'authentication_required'});
    if(!isAdminUser(user))return json(res,403,{error:'administrator_required'});
    if(!SUPABASE_SERVICE_ROLE_KEY)return json(res,503,{error:'請先在 Render 設定 SUPABASE_SERVICE_ROLE_KEY 才能管理會員'});
    try{
      if(u.pathname==='/api/admin/members'&&req.method==='GET'){
        const page=Math.max(1,Number(u.searchParams.get('page')||1)),perPage=100;
        const data=await supabaseRequest('/auth/v1/admin/users?page='+page+'&per_page='+perPage,{admin:true});
        return json(res,200,{users:(data.users||[]).map(x=>({id:x.id,email:x.email,created_at:x.created_at,last_sign_in_at:x.last_sign_in_at,banned_until:x.banned_until})),nextPage:(data.users||[]).length===perPage?page+1:null});
      }
      if(u.pathname==='/api/admin/members/rebuild'&&req.method==='POST'){
        const body=await readRequestJson(req);
        const email=String(body.email||'').trim().toLowerCase();
        const confirmation=String(body.confirmEmail||'').trim().toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return json(res,400,{error:'請輸入有效的會員 Email'});
        if(confirmation!==email)return json(res,400,{error:'安全確認失敗：請再次輸入完全相同的會員 Email'});
        let member=null,page=1;
        for(;page<=20;page++){
          const listed=await supabaseRequest('/auth/v1/admin/users?page='+page+'&per_page=100',{admin:true});
          const users=listed.users||[];
          member=users.find(x=>String(x.email||'').trim().toLowerCase()===email)||null;
          if(member||users.length<100)break;
        }
        if(!member&&page>20)return json(res,503,{error:'會員清單超過本次安全搜尋上限，未建立新帳號；請縮小查找範圍或分頁核對後再試。'});
        const origin=(req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host);
        let action,userId;
        if(member){
          const updated=await supabaseRequest('/auth/v1/admin/users/'+member.id,{method:'PUT',admin:true,body:{ban_duration:'none',email_confirm:true}});
          userId=updated.id||member.id;
          action='restored_existing_identity';
          try{
            await supabaseRequest('/auth/v1/recover',{method:'POST',body:{email,redirect_to:origin+'/'}});
          }catch(error){
            console.error('[admin-account-rebuild] recovery email failed',JSON.stringify({admin:user.email,target:email,userId,error:String(error.message||error)}));
            return json(res,502,{ok:false,accountRestored:true,userId,identityPreserved:true,error:'帳號已恢復且保留原使用者 ID，但密碼重設信寄送失敗：'+error.message});
          }
        }else{
          const invited=await supabaseRequest('/auth/v1/invite',{method:'POST',admin:true,body:{email,redirect_to:origin+'/'}});
          userId=invited.id;
          action='invited_new_identity';
        }
        console.info('[admin-account-rebuild]',JSON.stringify({admin:user.email,target:email,userId,action,at:now()}));
        return json(res,member?200:201,{ok:true,action,user:{id:userId,email},identityPreserved:!!member,message:member?'已恢復原帳號並寄送密碼重設信；原使用者 ID 保留。':'找不到既有帳號，已重新寄送邀請。新帳號會有新的使用者 ID，舊帳號關聯資料不會自動搬移，必須先核對後再人工處理。'});
      }
      if(u.pathname==='/api/admin/members/invite'&&req.method==='POST'){
        const body=await readRequestJson(req),email=String(body.email||'').trim().toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return json(res,400,{error:'請輸入有效的會員 Email'});
        const origin=(req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host);
        const invited=await supabaseRequest('/auth/v1/invite',{method:'POST',admin:true,body:{email,redirect_to:origin+'/' }});
        return json(res,201,{user:{id:invited.id,email:invited.email,created_at:invited.created_at},invitationSent:!!invited.id,message:'已建立邀請，請會員至信箱完成驗證及設定密碼。'});
      }
      if(u.pathname==='/api/admin/members'&&req.method==='POST'){
        const body=await readRequestJson(req),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||password.length<10)return json(res,400,{error:'Email 格式錯誤或密碼少於 10 個字元'});
        const created=await supabaseRequest('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true}});
        return json(res,201,{user:{id:created.id,email:created.email,created_at:created.created_at}});
      }
      const resetMatch=u.pathname.match(/^\/api\/admin\/members\/([0-9a-f-]{36})\/reset-password$/i);
      if(resetMatch&&req.method==='POST'){
        const member=await supabaseRequest('/auth/v1/admin/users/'+resetMatch[1],{admin:true});
        if(!member.email)return json(res,404,{error:'找不到會員 Email，無法寄送重設連結'});
        const origin=(req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host);
        await supabaseRequest('/auth/v1/recover',{method:'POST',body:{email:member.email,redirect_to:origin+'/' }});
        return json(res,200,{ok:true,message:'已寄送密碼重設信至會員信箱。'});
      }
      const match=u.pathname.match(/^\/api\/admin\/members\/([0-9a-f-]{36})\/(disable|enable)$/i);
      if(match&&req.method==='POST'){
        const disabled=match[2]==='disable';
        const updated=await supabaseRequest('/auth/v1/admin/users/'+match[1],{method:'PUT',admin:true,body:{ban_duration:disabled?'876000h':'none'}});
        return json(res,200,{user:{id:updated.id,email:updated.email,banned_until:updated.banned_until}});
      }
      return json(res,404,{error:'not_found'});
    }catch(e){return json(res,e.status||502,{error:e.message});}
  }
  if(['/api/colony/status','/api/diagnostics/providers','/api/diagnostics/vulnerabilities'].includes(u.pathname)) {
    const automationAuthorized=req.method==='GET'&&['/api/diagnostics/providers','/api/diagnostics/vulnerabilities'].includes(u.pathname)&&await verifyGitHubActionsToken(bearerToken(req),{allowProductionSmoke:true});
    if(!automationAuthorized){
      if(!SUPABASE_CONFIGURED)return json(res,503,{error:'developer_console_auth_unavailable'});
      const consoleUser=await authenticatedUser(req);
      if(!consoleUser)return json(res,401,{error:'authentication_required'});
      if(!isAdminUser(consoleUser))return json(res,403,{error:'developer_access_required'});
    }
  }
  if(req.method!=='GET'){return json(res,405,{error:'method_not_allowed'});}
  if(u.pathname==='/api/colony/status')return json(res,200,antColony.getStatus());
  if(u.pathname==='/api/diagnostics/historical-coverage'){
    try{
      const range=validateHistoryRange({from:u.searchParams.get('from')||'1990-01-01',to:u.searchParams.get('to')||now().slice(0,10)});
      return json(res,200,{targetFrom:range.from,targetTo:range.to,coverage:getHistoricalCoverage(),warning:'Provider configuration is not proof of licensed or complete coverage; per-instrument probes and gap audits are required.',timestamp:now()});
    }catch(e){return json(res,400,{error:e.message});}
  }
  if(u.pathname==='/api/diagnostics/providers'){
    const result=await diagnoseProviders();
    return json(res,200,{...result,security:getTelemetry()});
  }
  if(u.pathname==='/api/diagnostics/vulnerabilities'){
    const result=await dependencyVulnerabilityScanner.scan({force:u.searchParams.get('refresh')==='1'});
    return json(res,result.status==='unavailable'?503:200,result);
  }
  if(u.pathname==='/api/research/outcomes'||u.pathname==='/api/market/research/outcomes'){
    const result=await safeLoad('research-outcomes',60000,()=>researchStorage.listReports(30),e=>({status:'unavailable',source:'Supabase private Storage',fetchedAt:now(),count:0,data:[],error:e.message}));
    return json(res,result.status==='unavailable'?503:200,result);
  }
  // Render's health check must remain a cheap process-liveness probe. Keep all
  // storage/provider inspection on the separate details endpoint so a slow
  // optional dependency can never make a healthy HTTP process fail startup.
  if(u.pathname==='/api/health/live'||u.pathname==='/api/health')return json(res,200,buildRuntimeHealth({mode:process.env.NODE_ENV==='production'?'production':'development'}));
  if(u.pathname==='/api/health/ready'){const readiness=buildDependencyReadiness();return json(res,200,{...buildRuntimeHealth({mode:process.env.NODE_ENV==='production'?'production':'development'}),...readiness});}
  if(u.pathname==='/api/health/details'){let cryptoStatus=cryptoRealtimeFeed.status();if(process.env.CRYPTO_STREAM_EMBEDDED==='false'){try{cryptoStatus=await cryptoEventStorage.readStatus();}catch(error){cryptoStatus={...cryptoStatus,workerStatusError:error.message};}}return json(res,200,{...buildRuntimeHealth({mode:process.env.NODE_ENV==='production'?'production':'development'}),auth:{configured:SUPABASE_CONFIGURED,adminManagementConfigured:!!SUPABASE_SERVICE_ROLE_KEY},provider:FINMIND_TOKEN?'FinMind token configured':'FinMind token missing',trading:getTradingReadiness(),cryptoStreaming:cryptoStatus,providers:{finmind:!!FINMIND_TOKEN,youtubeApiKeyConfigured:!!process.env.YOUTUBE_API_KEY,youtubeLiveResolver:!!process.env.YOUTUBE_API_KEY,youtubeChannelEmbedFallback:true,openrouter:!!process.env.OPENROUTER_API_KEY,gemini:!!process.env.GEMINI_API_KEY,groq:!!process.env.GROQ_API_KEY,xai:!!process.env.XAI_API_KEY,deepseek:!!process.env.DEEPSEEK_API_KEY,cloudflare:!!(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID),realtime:cryptoStatus.connectedFeedCount>0,realtimeProviderConfigured:(cryptoStatus.exchanges||[]).length>0,officialDailyMarketData:true,twseOfficialOpenApi:true,tpexOfficialOpenApi:true,licensedRealtimeFeedConfigured:(cryptoStatus.exchanges||[]).length>0,cryptoEventStorageConfigured:cryptoStatus.storage?.configured===true,telegramAlertsConfigured:cryptoStatus.telegramConfigured===true,scan:true,flows:true,futures:true,sentiment:true,news:true,openDataArchive:true}});}
  if(SUPABASE_CONFIGURED&&u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/api/auth/')){
    const automationPaths=new Set(['/api/market/snapshot','/api/market/institutional-flows','/api/market/futures','/api/market/sentiment','/api/market/scan','/api/market/news','/api/market/calendar','/api/diagnostics/providers','/api/diagnostics/vulnerabilities','/api/diagnostics/market','/api/crypto/market','/api/crypto/realtime/status','/api/crypto/realtime/quotes','/api/crypto/risk/BTCUSDT','/api/us/market']);
    const smokeReadOnlyPaths=new Set(['/api/diagnostics/providers','/api/diagnostics/vulnerabilities','/api/diagnostics/market','/api/crypto/market','/api/crypto/realtime/status','/api/crypto/realtime/quotes','/api/crypto/risk/BTCUSDT']);
    const automationAuthorized=req.method==='GET'&&automationPaths.has(u.pathname)&&await verifyGitHubActionsToken(bearerToken(req),{allowProductionSmoke:smokeReadOnlyPaths.has(u.pathname)});
    if(!automationAuthorized){
      const user=await authenticatedUser(req);if(!user)return json(res,401,{error:'authentication_required'});
    }
  }
  if(u.pathname==='/api/live/resolve'){
    const channelId=String(u.searchParams.get('channelId')||'');
    if(!/^[A-Za-z0-9_-]{20,40}$/.test(channelId))return json(res,400,{error:'invalid_channel_id'});
    if(!process.env.YOUTUBE_API_KEY)return json(res,503,{error:'尚未在 Render 設定 YOUTUBE_API_KEY；請先使用官方直播入口。'});
    try{
      const payload=await fetchJson('https://www.googleapis.com/youtube/v3/search?'+new URLSearchParams({part:'snippet',channelId,eventType:'live',type:'video',maxResults:'1',key:process.env.YOUTUBE_API_KEY}).toString(),8000);
      const item=(payload.items||[]).find(x=>x.id&&x.id.videoId&&x.snippet&&x.snippet.liveBroadcastContent==='live');
      if(!item)return json(res,404,{error:'此頻道目前沒有可嵌入的公開直播；請使用官方直播入口。'});
      return json(res,200,{videoId:item.id.videoId,title:item.snippet.title,channelTitle:item.snippet.channelTitle,source:'YouTube Data API'});
    }catch(e){console.error('[live-resolver] '+e.message);return json(res,502,{error:'YouTube 直播解析失敗：'+e.message});}
  }
  if(u.pathname==='/api/market/calendar'){
    const result=await safeLoad('market-calendar',24*60*60*1000,async()=>{
      const rows=await fetchJson('https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule',12000);
      if(!Array.isArray(rows)||!rows.length)throw new Error('TWSE 官方開休市行事曆沒有回傳資料');
      const events=rows.map(row=>{
        const raw=String(row.Date||row.date||'').replace(/[^0-9]/g,'');
        if(raw.length!==7)return null;
        const date=String(Number(raw.slice(0,3))+1911)+raw.slice(3);
        const iso=date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8);
        const name=String(row.Name||row.name||'');
        const description=String(row.Description||row.description||'');
        const noTrade=/市場無交易|僅辦理結算交割/.test(name+' '+description);
        const holiday=/放假|補假|市場無交易/.test(name+' '+description);
        if(!holiday)return null;
        return {date:iso,name:name||'交易所公告休市',type:noTrade?'無交易・僅結算交割':'休市',description:description.replace(/<[^>]*>/g,' ').trim(),source:'TWSE OpenAPI'};
      }).filter(Boolean);
      if(!events.length)throw new Error('TWSE 官方行事曆格式尚未辨識');
      return {events,source:'TWSE 官方 OpenAPI holidaySchedule',timestamp:now(),asOf:events.map(x=>x.date).sort().at(-1)};
    },e=>({events:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/crypto/microstructure/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase();
    const exchange=u.searchParams.get('exchange')||'Binance';
    const marketType=u.searchParams.get('type')==='spot'?'spot':'perpetual';
    const depth=Math.min(50,Math.max(5,Number(u.searchParams.get('depth'))||10));
    const whaleThresholdUsd=Math.min(5000000,Math.max(1000,Number(u.searchParams.get('whaleUsd'))||50000));
    try{
      const key='crypto-microstructure:'+exchange+':'+marketType+':'+symbol+':'+depth+':'+whaleThresholdUsd;
      const result=await safeLoad(key,3000,()=>cryptoMicrostructure.fetchMicrostructure({exchange,symbol,marketType,depth,whaleThresholdUsd}),e=>({status:String(e.message||'').startsWith('market_data_license_required:')?'license_required':'unavailable',exchange,symbol,error:e.message,book:null,tape:null,timestamp:null}));
      return json(res,result.status==='unavailable'?502:200,result);
    }catch(e){return json(res,400,{error:e.message});}
  }
  if(u.pathname==='/api/crypto/realtime/status'){
    const local=cryptoRealtimeFeed.status();
    if(process.env.CRYPTO_STREAM_EMBEDDED==='false'){
      try{return json(res,200,await cryptoEventStorage.readStatus());}
      catch(e){return json(res,503,{configured:cryptoEventStorage.configured,status:'unavailable',error:e.message});}
    }
    return json(res,200,local);
  }
  if(u.pathname==='/api/crypto/worker/status'){
    try{return json(res,200,await cryptoEventStorage.readStatus());}
    catch(e){return json(res,503,{configured:cryptoEventStorage.configured,status:'unavailable',error:e.message});}
  }
  if(u.pathname==='/api/crypto/realtime/quotes'){
    if(process.env.CRYPTO_STREAM_EMBEDDED==='false'){
      try{const status=await cryptoEventStorage.readStatus();return json(res,200,{quotes:status.latestQuotes||[],status,timestamp:now()});}
      catch(e){return json(res,503,{quotes:[],status:'unavailable',error:e.message,timestamp:now()});}
    }
    return json(res,200,{quotes:cryptoRealtimeFeed.getQuotes(),status:cryptoRealtimeFeed.status(),timestamp:now()});
  }
  if(u.pathname==='/api/crypto/market'){
    const result=await safeLoad('crypto-market',15000,()=>cryptoMarket.loadMarket(cryptoRealtimeFeed),e=>({markets:[],summary:{total:0,spot:0,perpetual:0},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,result.error?503:200,result);
  }
  if(u.pathname==='/api/crypto/scan'){
    const market=await safeLoad('crypto-market',60000,()=>cryptoMarket.loadMarket(cryptoRealtimeFeed),e=>({markets:[],error:e.message}));
    const offset=Math.max(0,Number(u.searchParams.get('offset'))||0),limit=Math.min(10,Math.max(1,Number(u.searchParams.get('limit'))||8));
    const batch=(market.markets||[]).slice(offset,offset+limit);
    const results=await Promise.all(batch.map(async item=>{
      if(item.signalEligible!==true)return {...item,technical:{status:'blocked-data-quality',direction:'資料品質不足',score:null,reason:item.freshnessStatus==='stale'?'來源報價已過期':'來源時間戳未驗證'}};
      try{
        const h=await cryptoMarket.getHistory(item.symbol,item.marketType,'1d',item.exchange,item.nativeSymbol),v=h.indicators;
        if(!v)return {...item,technical:{status:'insufficient',direction:'資料不足',score:null,asOf:h.asOf}};
        const checks=[
          ['趨勢',v.trend==='bullish',v.trend==='bearish'],
          ['RSI',v.rsi>=50&&v.rsi<=70,v.rsi<40||v.rsi>75],
          ['MACD',v.macdHistogram>0,v.macdHistogram<0],
          ['ADX',v.adx>=20,false],
          ['MFI',v.mfi>=50,v.mfi<35],
          ['量比',v.volumeRatio>=1,v.volumeRatio<0.6]
        ];
        const available=checks.filter(x=>x[1]||x[2]||x[0]==='ADX'||x[0]==='量比');
        const score=Math.round(50+available.reduce((sum,x)=>sum+(x[1]?1:x[2]?-1:0),0)/Math.max(1,available.length)*50);
        const direction=score>=65?'偏多觀察':score<=35?'偏空觀察':'中立觀望';
        return {...item,technical:{status:'research-ready',direction,score,confidence:Math.round(available.length/checks.length*100),checks:checks.map(x=>({name:x[0],bullish:x[1],bearish:x[2]})),indicators:v,asOf:h.asOf}};
      }catch(e){return {...item,technical:{status:'error',direction:'資料暫缺',score:null,error:e.message}};}
    }));
    antColony.enqueue('CRYPTO',results,String(market.timestamp||'market')+':'+offset);
    return json(res,200,{results,offset,nextOffset:offset+batch.length,total:(market.markets||[]).length,done:offset+batch.length>=(market.markets||[]).length,source:'多交易所逐市場日K技術掃描',timestamp:now()});
  }
  if(u.pathname==='/api/crypto/news'){
    const result=await safeLoad('crypto-news',300000,cryptoMarket.loadNews,e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/research/strategies/')||u.pathname.startsWith('/api/market/research/strategies/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase();
    const market=u.searchParams.get('market');
    if(!['tw-stock','us-stock','crypto'].includes(market))return json(res,400,{status:'invalid_market',error:'market must be tw-stock, us-stock or crypto'});
    if(market==='tw-stock'&&!validateSymbol(symbol))return json(res,400,{status:'invalid_symbol',error:'invalid Taiwan stock symbol'});
    if(market==='us-stock'&&!/^[A-Z0-9.^=-]{1,12}$/.test(symbol))return json(res,400,{status:'invalid_symbol',error:'invalid US symbol'});
    if(market==='crypto'&&!/^[A-Z0-9_-]{2,30}$/.test(symbol))return json(res,400,{status:'invalid_symbol',error:'invalid crypto symbol'});
    try{
      let history,htfCandles;
      if(market==='crypto'){
        const type=u.searchParams.get('type')==='perpetual'?'perpetual':'spot';
        const exchange=u.searchParams.get('exchange')||'Binance';
        const native=u.searchParams.get('nativeSymbol')||symbol;
        if(exchange==='Coinbase'){
          history=await cryptoMarket.getHistory(symbol,type,'1d',exchange,native,300,false);
        }else{
          const [fourHour,daily]=await Promise.all([
            cryptoMarket.getHistory(symbol,type,'4h',exchange,native,1000,false),
            cryptoMarket.getHistory(symbol,type,'1d',exchange,native,600,false)
          ]);
          history={...fourHour,source:fourHour.source+' + '+daily.source};
          htfCandles=daily.data;
        }
      }else if(market==='us-stock'){
        const chart=await getUsChart(symbol,'2y','1d');
        history={data:chart.candles,source:chart.source,asOf:chart.candles.at(-1)?.time};
      }else history=await loadStockHistory(symbol);
      const historyCheck=validateResearchHistory(history,market,{interval:market==='crypto'&&u.searchParams.get('exchange')!=='Coinbase'?'4h':'1d'});
      if(!historyCheck.ok){
        const httpStatus=historyCheck.status==='insufficient_data'||historyCheck.status==='invalid_data'?422:503;
        return json(res,httpStatus,{status:historyCheck.status,error:historyCheck.error,symbol,market,source:history&&history.source||null,asOf:historyCheck.asOf||history&&history.asOf||null,barCount:historyCheck.barCount||history&&history.data&&history.data.length||0,strategies:[],performance:null,simulatedPerformance:false});
      }
      const result=runStrategyLab(history.data,{market,symbol,source:history.source,asOf:historyCheck.asOf,htfCandles,feeBps:u.searchParams.has('feeBps')?Number(u.searchParams.get('feeBps')):undefined,slippageBps:u.searchParams.has('slippageBps')?Number(u.searchParams.get('slippageBps')):undefined,sellTaxBps:u.searchParams.has('sellTaxBps')?Number(u.searchParams.get('sellTaxBps')):undefined});
      return json(res,result.status==='ok'?200:422,{...result,source:history.source||result.source,asOf:history.asOf||result.asOf});
    }catch(e){return json(res,502,{status:'upstream_unavailable',symbol,market,error:e.message,strategies:[],performance:null,simulatedPerformance:false});}
  }
  if(u.pathname.startsWith('/api/crypto/history/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase(),type=u.searchParams.get('type')==='perpetual'?'perpetual':'spot',interval=u.searchParams.get('interval')||'1d',exchange=u.searchParams.get('exchange')||'Binance',nativeSymbol=u.searchParams.get('nativeSymbol')||symbol;
    try{return json(res,200,await cryptoMarket.getHistory(symbol,type,interval,exchange,nativeSymbol));}catch(e){const licenseRequired=String(e.message||'').startsWith('market_data_license_required:');return json(res,licenseRequired?200:502,{status:licenseRequired?'license_required':'unavailable',error:e.message});}
  }
  if(u.pathname.startsWith('/api/crypto/risk/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase(),type=u.searchParams.get('type')==='perpetual'?'perpetual':'spot',exchange=u.searchParams.get('exchange')||'Binance',nativeSymbol=u.searchParams.get('nativeSymbol')||symbol,interval=u.searchParams.get('interval')||'15m';
    try{
      const historyResult=await loadRiskHistory({getHistory:cryptoMarket.getHistory,symbol,marketType:type,interval,exchange,nativeSymbol,limit:240});
      const [derivativesResult,microResultSettled]=await Promise.allSettled([
        type==='perpetual'?cryptoMarket.getDerivatives(symbol,historyResult.exchange,historyResult.exchange===exchange?nativeSymbol:symbol):Promise.resolve(null),
        loadFreshMicrostructure({safeLoad,fetchMicrostructure:cryptoMicrostructure.fetchMicrostructure,symbol,marketType:type,requestedExchange:exchange,preferredExchange:historyResult.exchange,nativeSymbol,depth:10,whaleThresholdUsd:50000})
      ]);
      const derivatives=derivativesResult.status==='fulfilled'?derivativesResult.value:null;
      const microResult=microResultSettled.status==='fulfilled'?microResultSettled.value:{data:null,errors:[{exchange:historyResult.exchange,error:String(microResultSettled.reason?.message||'microstructure_unavailable').slice(0,160)}]};
      const micro=microResult.data;
      const result=assessMarketRisk(historyResult.history,derivatives,micro);
      const candleAsOf=historyResult.history?.asOf||historyResult.history?.data?.[historyResult.history.data.length-1]?.time||null;
      const candleTimestamp=candleAsOf?Date.parse(candleAsOf):NaN;
      const candleAgeMinutes=Number.isFinite(candleTimestamp)?Math.round((Date.now()-candleTimestamp)/60000):null;
      const maxAgeMinutes=({'15m':30,'1h':120,'4h':480,'1d':2880})[interval]||30;
      const candleFresh=Number.isFinite(candleAgeMinutes)&&candleAgeMinutes>=0&&candleAgeMinutes<=maxAgeMinutes;
      result.asOf=candleAsOf;
      result.candleSource=historyResult.history?.source||null;
      result.candleInterval=interval;
      result.candleAgeMinutes=candleAgeMinutes;
      result.candleMaxAgeMinutes=maxAgeMinutes;
      result.dataFreshness=candleFresh?'fresh':'stale_or_unknown';
      result.receivedAt=now();
      if(!candleFresh){
        result.status='stale_data';
        result.label='K 線資料超過新鮮度門檻，暫停即時風險判讀';
        result.freshnessWarning='來源 K 線時間缺漏、位於未來或超過 '+maxAgeMinutes+' 分鐘';
      }
      result.derivativesStatus=result.coverage?.derivatives?'connected':'unavailable';
      if(derivativesResult.status==='rejected')result.derivativesWarning='衍生品資料暫不可用，風險計算仍使用有效 K 線與可取得的委託簿資料：'+String(derivativesResult.reason?.message||'upstream_unavailable').slice(0,160);
      if(!micro){
        result.microstructureStatus='unavailable';
        result.microstructureAttempts=microResult.errors;
      }else{
        result.microstructureExchange=microResult.exchange;
        if(microResult.fallbackUsed)result.microstructureWarning='原指定交易所微結構資料不可用，已改用 '+microResult.exchange+' 的新鮮委託簿與逐筆成交快照';
      }
      result.requestedExchange=exchange;
      result.candleExchange=historyResult.exchange;
      if(historyResult.fallbackUsed){
        result.candleFallbackAttempts=historyResult.errors;
        result.candleWarning='原指定交易所 K 線不可用，已改用 '+historyResult.exchange+' 的實際 K 線來源';
      }
      return json(res,200,result);
    }catch(e){
      const licenseRequired=e.code==='MARKET_DATA_LICENSE_REQUIRED'||String(e.message||'').startsWith('market_data_license_required:');
      if(!licenseRequired) console.error('[crypto-risk] '+exchange+' '+symbol+' '+String(e.message||e));
      return json(res,licenseRequired?200:502,{status:licenseRequired?'license_required':'unavailable',error:String(e.message||e),attempts:e.attempts||[],scenarios:[]});
    }
  }
  if(u.pathname.startsWith('/api/crypto/derivatives/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase(),exchange=u.searchParams.get('exchange')||'Binance';
    try{const data=await cryptoMarket.getDerivatives(symbol,exchange);return json(res,200,data);}catch(e){return json(res,502,{error:e.message});}
  }
  if(u.pathname.startsWith('/api/crypto/agents/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase(),type=u.searchParams.get('type')==='perpetual'?'perpetual':'spot';
    try{
      const exchange=u.searchParams.get('exchange')||'Binance',nativeSymbol=u.searchParams.get('nativeSymbol')||symbol;
      const history=await cryptoMarket.getHistory(symbol,type,'1d',exchange,nativeSymbol),derivatives=type==='perpetual'?await cryptoMarket.getDerivatives(symbol,exchange,nativeSymbol):null;
      const quote={symbol,price:history.data.at(-1)?.close,source:history.source,timestamp:history.asOf};
      const scan={[symbol]:{symbol,scorecard:{status:'research-ready',fresh:true,direction:history.indicators?.trend==='bullish'?'偏向買進':history.indicators?.trend==='bearish'?'偏向賣出':'中立觀望',score:50,confidence:history.indicators?75:0,reasons:['使用 '+exchange+' 日 K 技術指標；尚未接入完整鏈上／代幣基本面']}}};
      const result=await buildAiCommittee(symbol,{getHistory:async()=>({data:history.data,indicators:history.indicators,source:history.source,asOf:history.asOf}),quotes:{[symbol]:quote},scan,flows:{},fundamentals:derivatives?{derivatives}:null,quoteSource:history.source,env:process.env});
      return json(res,200,result);
    }catch(e){return json(res,502,{error:e.message});}
  }
  if(u.pathname==='/api/us/search'){
    const query=String(u.searchParams.get('q')||'').trim();
    if(!query)return json(res,200,{results:[],source:'Yahoo Finance Search'});
    try{return json(res,200,{results:await searchUsSymbols(query),source:'Yahoo Finance Search（非官方公開端點）',timestamp:now()});}
    catch(e){return json(res,502,{results:[],error:e.message,source:'unavailable',timestamp:now()});}
  }
  if(u.pathname==='/api/us/universe'){
    try{
      const result=await getUsUniversePage({query:u.searchParams.get('q')||'',exchange:u.searchParams.get('exchange')||'',page:u.searchParams.get('page')||1,limit:u.searchParams.get('limit')||100});
      return json(res,200,result);
    }catch(e){return json(res,503,{data:[],total:0,totalUniverse:0,error:e.message,source:'SEC reference unavailable'});}
  }
  if(u.pathname==='/api/us/market'){
    const result=await safeLoad('us-market',60*1000,loadUsMarket,e=>({market:'US',data:{},indices:[],scan:[],source:'unavailable',timestamp:now(),error:e.message,coverage:{stocks:0,universe:30,indices:0}}));
    if(!result.error&&!result.stale)antColony.enqueue('US',Array.isArray(result.scan)?result.scan:[],result.timestamp||result.asOf||null);
    return json(res,result.error?503:200,result);
  }
  if(u.pathname.startsWith('/api/us/history/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase();
    if(!/^[A-Z0-9.^=-]{1,12}$/.test(symbol))return json(res,400,{error:'invalid_us_symbol'});
    const result=await safeLoad('us-history:'+symbol,60*60*1000,async()=>{
      const chart=await getUsChart(symbol,'2y','1d');
      if(!chart.candles.length)throw new Error('此美股代號沒有可用日 K 資料');
      return {symbol:chart.symbol,data:chart.candles,asOf:chart.candles.at(-1).time,source:chart.source,timestamp:now(),quote:((({candles,...quote})=>quote)(chart))};
    },e=>({symbol,data:[],asOf:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,result.error?502:200,result);
  }
  if(u.pathname.startsWith('/api/us/agents/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()).toUpperCase();
    if(!/^[A-Z0-9.^=-]{1,12}$/.test(symbol))return json(res,400,{error:'invalid_us_symbol'});
    const load=async()=>{
      const history=await safeLoad('us-history:'+symbol,60*60*1000,async()=>{
        const chart=await getUsChart(symbol,'2y','1d');
        return {symbol:chart.symbol,data:chart.candles,asOf:chart.candles.at(-1)?.time,source:chart.source,quote:((({candles,...quote})=>quote)(chart)),indicators:indicators(chart.candles)};
      },e=>({data:[],error:e.message}));
      const market=stale('us-market')||{};
      const quote=market.data?.[symbol]||history.quote||{};
      const scan=(market.scan||[]).find(x=>x.symbol===symbol)||{};
      return buildAiCommittee(symbol,{getHistory:async()=>history,quotes:{[symbol]:quote},scan:{[symbol]:scan},flows:{},fundamentals:null,quoteSource:quote.source||history.source,env:process.env});
    };
    const result=u.searchParams.get('refresh')==='1'?await load():await safeLoad('us-agents:'+symbol,10*60*1000,load,e=>({symbol,agents:['gemini','groq','cloudflare'].map(provider=>({provider,status:'error',message:e.message})),consensus:null,analysisTime:now()}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/trading/readiness')return json(res,200,getTradingReadiness());
  if(u.pathname==='/api/market/universe'){
    const result=await safeLoad('universe',TTL.universe,twseListedUniverse,e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/diagnostics/market'){
    try {
      const result=await diagnoseOfficialDailyQuotes();
      return json(res,result.ok?200:503,result);
    } catch(error) {
      return json(res,503,{ok:false,connection:'disconnected',provider:'twse+tpex-openapi',dataMode:'END_OF_DAY',realtime:false,error:String(error.message||error).slice(0,240),serverTime:now()});
    }
  }
  if(u.pathname==='/api/market/snapshot'){
    const result=await safeLoad('snapshot',TTL.snapshot,loadOfficialDailyQuotes,e=>({data:{},source:'unavailable',timestamp:now(),dataMode:'END_OF_DAY',delayed:true,error:e.message,quoteCount:0}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/diagnostics/analysis'){
    const [history,flows,listed]=await Promise.all([
      safeLoad('open-source-market-history',12*60*60*1000,openSourceMarketHistory,e=>({data:{},error:e.message,historyDateCount:0,historyCount:0})),
      safeLoad('flows',TTL.flows,()=>twseInstitutionalFlows(),e=>({data:{},error:e.message})),
      safeLoad('universe',TTL.universe,twseListedUniverse,e=>({data:[],error:e.message}))
    ]);
    const flowRows=Object.values(flows.data||{});
    return json(res,200,{ok:!history.error&&history.historyCount>0,source:history.source||'open data archive',historyAsOf:history.historyAsOf,historyDays:history.historyDateCount||0,historyStocks:history.historyCount||0,listedCount:listed.data?.length||0,institutionalStocks:flowRows.filter(x=>x.institutionalNet!=null).length,marginStocks:flowRows.filter(x=>x.marginChange!=null||x.shortChange!=null).length,tdccStocks:flowRows.filter(x=>x.largeHolderPct!=null).length,institutionalAsOf:flows.asOf||null,marginAsOf:flows.marginAsOf||null,tdccAsOf:flows.tdccAsOf||null,errors:[history.error,flows.error,listed.error].filter(Boolean),serverTime:now()});
  }
  if(u.pathname==='/api/market/scan'){
    const result=await safeLoad('scan',TTL.scan,async()=>{
      if(process.env.MARKET_SCAN_URL){
        const x=await external('MARKET_SCAN_URL','');
        const timestamp=x.timestamp||null,raw=x.data||{},data={},flows=stale('flows')?.data||{},sentiment=stale('sentiment')?.data||{},futures=stale('futures')?.data||{};
        const changes=Object.values(raw).map(r=>Number(r?.changePct??r?.return5dPct)).filter(Number.isFinite),adv=changes.filter(v=>v>0).length,dec=changes.filter(v=>v<0).length,advanceDecline=adv/Math.max(1,dec);
        for(const [symbol,row] of Object.entries(raw)){
          if(!row||typeof row!=='object')continue;
          const flow=flows[symbol]||{},merged={...row,...flow};
          data[symbol]={...merged,scorecard:scoreStock({...merged,asOf:row.asOf||timestamp,fearGreed:row.fearGreed??x.fearGreed??sentiment.fearGreed,advanceDecline:row.advanceDecline??x.advanceDecline??sentiment.advanceDecline,futuresChangePct:row.futuresChangePct??x.futuresChangePct??futures.changePct})};
        }
        return {data,source:x.source||'Configured full-market scanner',timestamp:timestamp||now(),scannedCount:Object.keys(data).length,advanceDecline:x.advanceDecline??advanceDecline};
      }
      const base=await safeLoad(FINMIND_TOKEN?'all-market-history':'open-source-market-history',FINMIND_TOKEN?6*60*60*1000:12*60*60*1000,async()=>{
        if(!FINMIND_TOKEN)return await openSourceMarketHistory();
        const tradingDates=await finmind('TaiwanStockTradingDate',{},15000);
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
        const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
        const includeToday=localTime>='17:30';
        const dates=tradingDates.map(x=>String(x.date||'')).filter(x=>x&&x<=today&&(includeToday||x<today)).sort().slice(-100);
        if(dates.length<60)throw new Error('可用交易日少於 60 日，無法建立全市場技術指標');
        const dailyRows=await mapLimit(dates,8,date=>finmind('TaiwanStockPrice',{start_date:date},45000));
        const grouped=new Map();
        for(const dayRows of dailyRows)for(const r of dayRows){
          const symbol=String(r.stock_id||r.data_id||'');if(!validateSymbol(symbol))continue;
          const candle={time:r.date,open:Number(r.open),high:Number(r.max),low:Number(r.min),close:Number(r.close),volume:Number(r.Trading_Volume)};
          if(![candle.open,candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite)||candle.close<=0||candle.high<=0||candle.low<=0)continue;
          if(!grouped.has(symbol))grouped.set(symbol,[]);grouped.get(symbol).push(candle);
        }
        const data={};
        for(const [symbol,candles] of grouped){
          candles.sort((a,b)=>String(a.time).localeCompare(String(b.time)));
          if(candles.length<60)continue;
          const ind=indicators(candles);if(!ind)continue;
          const last=candles.at(-1),priorClose=candles.at(-2)?.close,close5=candles.at(-6)?.close,close20=candles.at(-21)?.close,volume5d=candles.slice(-5).reduce((sum,row)=>sum+row.volume,0);
          data[symbol]={...ind,technicalAsOf:last.time,volume5d,dailyChangePct:priorClose?((last.close/priorClose)-1)*100:null,return5dPct:close5?((last.close/close5)-1)*100:null,return20dPct:close20?((last.close/close20)-1)*100:null};
        }
        return {data,historyAsOf:dates.at(-1),historyDateCount:dates.length,historyCount:Object.keys(data).length};
      },e=>({data:{},error:e.message,historyCount:0}));
      if(base.error)throw new Error(base.error);
      const listed=await safeLoad('universe',TTL.universe,twseListedUniverse,e=>({data:[],error:e.message}));
      if(listed.error||!listed.data?.length)throw new Error(listed.error||'無法取得證交所上市股票清單');
      const marketSymbols=new Set(listed.data.map(x=>x.symbol)),exchangeBySymbol=new Map(listed.data.map(x=>[x.symbol,x.exchange||'TWSE']));
      const perResult=await safeLoad('all-market-per',6*60*60*1000,async()=>{
        const data={};
        if(FINMIND_TOKEN){
          const rows=await finmind('TaiwanStockPER',{start_date:base.historyAsOf},20000);
          for(const r of rows){const symbol=String(r.stock_id||'');if(!validateSymbol(symbol))continue;const date=String(r.date||'');if(!data[symbol]||date>String(data[symbol].date||''))data[symbol]={date,pe:Number(r.PER),pb:Number(r.PBR),dividendYield:Number(r.dividend_yield)};}
          return {data,asOf:base.historyAsOf,source:'FinMind TaiwanStockPER'};
        }
        const rows=await fetchJson('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',12000);
        for(const r of rows||[]){
          const symbol=String(r.Code||r['證券代號']||r['股票代號']||'');if(!validateSymbol(symbol))continue;
          const pick=(re)=>{const k=Object.keys(r).find(key=>re.test(key));return k?twseNumber(r[k]):null;};
          const pe=pick(/PEratio|本益比/),pb=pick(/PBratio|股價淨值比/),yieldPct=pick(/DividendYield|殖利率/);
          data[symbol]={date:base.historyAsOf,pe,pb,dividendYield:yieldPct};
        }
        return {data,asOf:base.historyAsOf,source:'TWSE OpenAPI BWIBBU_ALL'};
      },e=>({data:{},error:e.message}));
      const flowResult=await safeLoad('flows',TTL.flows,()=>twseInstitutionalFlows(),e=>({data:{},error:e.message}));
      const quotes=stale('snapshot')?.data||{},flows=flowResult.data||stale('flows')?.data||{},sentiment=stale('sentiment')?.data||{},futures=stale('futures')?.data||{},data={};
      const fiveDay=Object.values(base.data||{}).map(x=>Number(x.return5dPct)).filter(Number.isFinite),adv=fiveDay.filter(v=>v>0).length,dec=fiveDay.filter(v=>v<0).length,advanceDecline=adv/Math.max(1,dec);
      for(const [symbol,technical] of Object.entries(base.data||{})){
        if(!marketSymbols.has(symbol))continue;
        const quote=quotes[symbol]||{},flow=flows[symbol]||{},valuation=perResult.data?.[symbol]||{},livePrice=quote.price!=null&&Number.isFinite(Number(quote.price))&&Number(quote.price)>0?Number(quote.price):null,price=livePrice??Number(technical.close);
        const trustFlowPct5d=Number.isFinite(Number(flow.trustNet5d))&&technical.volume5d>0?(Number(flow.trustNet5d)/technical.volume5d)*100:null;
        const foreignFlowPct5d=Number.isFinite(Number(flow.foreignNet5d))&&technical.volume5d>0?(Number(flow.foreignNet5d)/technical.volume5d)*100:null;
        const row={...technical,...flow,...valuation,pe:valuation.pe,pb:valuation.pb,dividendYield:valuation.dividendYield,trustFlowPct5d,foreignFlowPct5d,signal:technical.macdSignal,price,quoteIsLive:livePrice!==null&&!quote.delayed,quoteDelayed:!!quote.delayed,quoteSource:quote.source||null,exchange:quote.market==='OTC'?'TPEx':exchangeBySymbol.get(symbol)||technical.exchange||'TWSE',changePct:quote.changePct??technical.dailyChangePct,volume:quote.volume??technical.latestVolume,asOf:(!quote.delayed&&quote.timestamp)|| (technical.technicalAsOf?new Date(technical.technicalAsOf+'T13:30:00+08:00').toISOString():technical.asOf||null),priceVsEma20Pct:price!==null&&technical.ema20?((price/technical.ema20)-1)*100:null,priceVsEma60Pct:price!==null&&technical.ema60?((price/technical.ema60)-1)*100:null,priceVsVwap20Pct:price!==null&&technical.vwap20?((price/technical.vwap20)-1)*100:null};
        const taiwanClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
        const taiwanWeekday=taiwanClock.find(x=>x.type==='weekday')?.value||'';
        const taiwanHour=Number(taiwanClock.find(x=>x.type==='hour')?.value||0),taiwanMinute=Number(taiwanClock.find(x=>x.type==='minute')?.value||0);
        const marketSessionOpen=!['Sat','Sun'].includes(taiwanWeekday)&&(taiwanHour*60+taiwanMinute>=540)&&(taiwanHour*60+taiwanMinute<810);
        row.scorecard=scoreStock({...row,asOf:row.asOf,maxAgeMs:36*60*60*1000,technicalAsOf:technical.technicalAsOf,quoteIsLive:row.quoteIsLive,marketSessionOpen,fearGreed:sentiment.fearGreed,advanceDecline:sentiment.advanceDecline??advanceDecline,futuresChangePct:futures.changePct});
        data[symbol]=row;
      }
      return {data,source:(base.source||'FinMind')+' + 上市櫃行情／公開估值／籌碼',timestamp:now(),scannedCount:Object.keys(data).length,historyAsOf:base.historyAsOf,historyCount:base.historyCount||Object.keys(base.data||{}).length,markets:base.markets||null,advanceDecline};
    },e=>({data:{},source:'unavailable',timestamp:now(),scannedCount:0,error:e.message}));
    if(result.stale&&result.data){const safeData={};for(const [symbol,row] of Object.entries(result.data)){const card=row?.scorecard||{};safeData[symbol]={...row,scorecard:{...card,direction:'觀望',status:'insufficient-data',fresh:false,reasons:[...(card.reasons||[]),'全市場掃描快取已過期，暫停方向判斷']}};}return json(res,200,{...result,data:safeData});}
    if(!result.error&&!result.stale)antColony.enqueue('TW',Object.entries(result.data||{}).map(([symbol,row])=>({...row,symbol,source:result.source})),result.historyAsOf||result.timestamp||null);
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/market/fundamentals/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop()||'');
    if(!validateSymbol(symbol))return json(res,400,{error:'股票代號格式錯誤'});
    const result=await safeLoad('fundamentals:'+symbol,6*60*60*1000,async()=>{
      const listed=await safeLoad('universe',TTL.universe,twseListedUniverse);
      const company=(listed.data||[]).find(x=>x.symbol===symbol)||{symbol,name:symbol,sector:'未分類',exchange:'未知'};
      let issuerProfile=null;
      if(company.exchange==='TWSE'){
        try{
          const issuerRows=await safeLoad('twse-issuer-basic',TTL.universe,()=>fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L',12000),()=>[]);
          issuerProfile=(issuerRows||[]).find(row=>String(row['公司代號']||row.Code||'').trim()===symbol)||null;
        }catch(_){}
      }else if(company.exchange==='TPEx'){
        try{
          const issuerRows=await safeLoad('tpex-issuer-basic',TTL.universe,()=>fetchJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',12000),()=>[]);
          issuerProfile=(issuerRows||[]).find(row=>String(row.SecuritiesCompanyCode||row['公司代號']||'').trim()===symbol)||null;
        }catch(_){}
      }
      const officialCompany={
        ...company,
        businessDescription:issuerProfile?.['主要經營業務']||issuerProfile?.['營業項目']||issuerProfile?.['公司簡介']||null,
        businessDescriptionNote:'證交所／櫃買中心公司基本資料未提供詳細營業項目欄位；請由公司官網及公開資訊觀測站年報確認。',
        address:issuerProfile?.['住址']||null,
        website:(()=>{const raw=String(issuerProfile?.['網址']||issuerProfile?.['公司網址']||'').trim();return raw?(raw.startsWith('http://')||raw.startsWith('https://')?raw:'https://'+raw):null;})(),
        chairman:issuerProfile?.['董事長']||null,
        establishedDate:issuerProfile?.['成立日期']||null,
        capital:issuerProfile?.['實收資本額']||null,
        mopsUrl:'https://mops.twse.com.tw/mops/web/t05st03',
        twseProfileUrl:company.exchange==='TWSE'?'https://www.twse.com.tw/pdf/ch/'+symbol+'_ch.pdf':null
      };
      if(!FINMIND_TOKEN)return {company:officialCompany,profile:{description:officialCompany.businessDescription,descriptionNote:'尚未設定 FinMind Token；財務報表、月營收與股利資料暫不可用。',mopsUrl:officialCompany.mopsUrl},financials:null,financialError:'未設定 FINMIND_TOKEN；財報資料暫不可用',source:'TWSE／TPEx 官方公司基本資料',timestamp:now()};
      const startDate='2018-01-01';
      const datasets=['TaiwanStockFinancialStatements','TaiwanStockBalanceSheet','TaiwanStockCashFlowsStatement','TaiwanStockMonthRevenue','TaiwanStockDividend','TaiwanStockPER'];
      const datasetErrors={};
      const loadDataset=async name=>{try{return await finmind(name,{data_id:symbol,start_date:name==='TaiwanStockDividend'?'2018-01-01':startDate},20000);}catch(error){datasetErrors[name]=String(error.message||error);return [];}};
      const [income,balance,cash,revenue,dividends,valuationRows]=await Promise.all(datasets.map(loadDataset));
      const datesOf=rows=>[...new Set((rows||[]).map(x=>String(x.date||'')))].filter(Boolean).sort();
      const latestIncome=datesOf(income).at(-1)||null,latestBalance=datesOf(balance).at(-1)||null,latestCash=datesOf(cash).at(-1)||null;
      const pick=(rows,date,keys)=>{const found=(rows||[]).filter(x=>String(x.date||'')===date);for(const key of keys){const row=found.find(x=>String(x.type||'').toLowerCase()===key.toLowerCase()||String(x.origin_name||'').toLowerCase()===key.toLowerCase());if(row&&Number.isFinite(Number(row.value)))return Number(row.value);}return null;};
      const incomeSummary=latestIncome?{
        revenue:pick(income,latestIncome,['Revenue','OperatingRevenue','Income','營業收入合計','收益']),
        grossProfit:pick(income,latestIncome,['GrossProfit','營業毛利（毛損）淨額']),
        operatingIncome:pick(income,latestIncome,['OperatingIncome','OperatingIncomeLoss','IncomeFromOperations','營業利益（損失）']),
        netIncome:pick(income,latestIncome,['IncomeAfterTaxes','NetIncome','本期淨利（淨損）']),
        eps:pick(income,latestIncome,['EPS','EarningsPerShare','基本每股盈餘（元）'])
      }:null;
      const balanceSummary=latestBalance?{
        totalAssets:pick(balance,latestBalance,['TotalAssets','資產總計']),
        totalLiabilities:pick(balance,latestBalance,['TotalLiabilities','負債總計']),
        totalEquity:pick(balance,latestBalance,['TotalEquity','EquityAttributableToOwnersOfParent','權益總計']),
        currentAssets:pick(balance,latestBalance,['CurrentAssets','流動資產合計']),
        currentLiabilities:pick(balance,latestBalance,['CurrentLiabilities','流動負債合計'])
      }:null;
      const cashKeys={operatingCashFlow:['CashFlowsFromOperatingActivities','CashProvidedByOperatingActivities','營業活動之淨現金流入（流出）'],investingCashFlow:['CashFlowsFromInvestingActivities','CashProvidedByInvestingActivities','投資活動之淨現金流入(流出)'],financingCashFlow:['CashFlowsFromFinancingActivities','CashProvidedByFinancingActivities','籌資活動之淨現金流入（流出）']};
      const cashYtd=latestCash?Object.fromEntries(Object.entries(cashKeys).map(([key,keys])=>[key,pick(cash,latestCash,keys)])):{};
      const cashDate=latestCash?new Date(latestCash+'T00:00:00Z'):null,cashMonth=cashDate?cashDate.getUTCMonth()+1:0;
      const priorCashDate=cashDate&&cashMonth>3?new Date(Date.UTC(cashDate.getUTCFullYear(),cashDate.getUTCMonth()-2,0)).toISOString().slice(0,10):null;
      const hasPriorCash=!!priorCashDate&&datesOf(cash).includes(priorCashDate);
      const cashQuarter=latestCash?Object.fromEntries(Object.entries(cashKeys).map(([key,keys])=>{const current=cashYtd[key],prior=hasPriorCash?pick(cash,priorCashDate,keys):cashMonth===3?0:null;return [key,current==null||prior==null?null:current-prior];})):{};
      const cashSummary=latestCash?{...cashQuarter,operatingCashFlowYtd:cashYtd.operatingCashFlow,investingCashFlowYtd:cashYtd.investingCashFlow,financingCashFlowYtd:cashYtd.financingCashFlow,periodBasis:cashMonth===3||hasPriorCash?'single-quarter':'year-to-date',periodDate:latestCash}:null;
      const debtRatio=balanceSummary?.totalAssets>0&&balanceSummary?.totalLiabilities!=null?balanceSummary.totalLiabilities/balanceSummary.totalAssets*100:null;
      const currentRatio=balanceSummary?.currentLiabilities>0&&balanceSummary?.currentAssets!=null?balanceSummary.currentAssets/balanceSummary.currentLiabilities:null;
      const grossMargin=incomeSummary?.revenue>0&&incomeSummary?.grossProfit!=null?incomeSummary.grossProfit/incomeSummary.revenue*100:null;
      const operatingMargin=incomeSummary?.revenue>0&&incomeSummary?.operatingIncome!=null?incomeSummary.operatingIncome/incomeSummary.revenue*100:null;
      const netMargin=incomeSummary?.revenue>0&&incomeSummary?.netIncome!=null?incomeSummary.netIncome/incomeSummary.revenue*100:null;
      const latestValuation=valuationRows.filter(x=>String(x.date||'')).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null;
      const valuation=latestValuation?{asOf:latestValuation.date,pe:Number.isFinite(Number(latestValuation.PER))?Number(latestValuation.PER):null,pb:Number.isFinite(Number(latestValuation.PBR))?Number(latestValuation.PBR):null,dividendYield:Number.isFinite(Number(latestValuation.dividend_yield))?Number(latestValuation.dividend_yield):null}:null;
      const months=(revenue||[]).map(x=>({date:String(x.date||''),revenue:Number(x.revenue),year:Number(x.revenue_year),month:Number(x.revenue_month)})).filter(x=>x.date&&Number.isFinite(x.revenue)).sort((a,b)=>a.date.localeCompare(b.date));
      const monthMap=new Map(months.map(x=>[x.year+'-'+x.month,x.revenue]));
      const monthlyRevenue=months.slice(-24).map(x=>({date:x.date,revenue:x.revenue,yoy:monthMap.has((x.year-1)+'-'+x.month)&&monthMap.get((x.year-1)+'-'+x.month)!==0?(x.revenue/monthMap.get((x.year-1)+'-'+x.month)-1)*100:null}));
      const dividendHistory=(dividends||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,12);
      const isFinancialIndustry=/金融|保險/.test(String(company.sector||''));
      const healthCandidates=[
        ['EPS',incomeSummary?.eps,v=>v>0?1:-1],
        ['毛利率',grossMargin,v=>v>=30?1:v<10?-1:0],
        ['營業利益率',operatingMargin,v=>v>=10?1:v<0?-1:0],
        ['稅後淨利率',netMargin,v=>v>=5?1:v<0?-1:0],
        ['負債比',debtRatio,v=>v<=40?1:v>=70?-1:0],
        ['流動比率',currentRatio,v=>v>=1.5?1:v<1?-1:0],
        ['營業現金流',cashSummary?.operatingCashFlow??cashSummary?.operatingCashFlowYtd,v=>v>0?1:-1],
        ['月營收年增率',monthlyRevenue.at(-1)?.yoy,v=>v>5?1:v< -5?-1:0]
      ];
      const applicableHealthCandidates=isFinancialIndustry?healthCandidates.filter(x=>['EPS','稅後淨利率','月營收年增率'].includes(x[0])):healthCandidates;
      const availableHealth=applicableHealthCandidates.filter(x=>x[1]!=null&&Number.isFinite(Number(x[1])));
      const healthScore=availableHealth.length?Math.round(50+availableHealth.reduce((sum,x)=>sum+x[2](Number(x[1])),0)/availableHealth.length*50):null;
      const healthMinimumCoverage=Math.min(4,applicableHealthCandidates.length);
      const financialHealth={score:availableHealth.length>=healthMinimumCoverage?healthScore:null,coverage:availableHealth.length,total:applicableHealthCandidates.length,status:availableHealth.length<healthMinimumCoverage?'資料不足':healthScore>=65?'偏強':healthScore<=35?'偏弱':'中性',note:isFinancialIndustry?'金融保險業不套用一般產業負債比、流動比及現金流門檻。':'一般產業簡易財務檢查，未作同業標準化；需搭配產業特性與多年趨勢判讀。'};
      return {company:officialCompany,profile:{description:officialCompany.businessDescription,descriptionNote:officialCompany.businessDescription?'公司業務簡介取自證交所公開公司基本資料。':'官方公司基本資料未提供可用的營業項目欄位；請以公開資訊觀測站公司基本資料／年報為準。',mopsUrl:officialCompany.mopsUrl},financials:{incomeAsOf:latestIncome,balanceAsOf:latestBalance,cashAsOf:latestCash,income:incomeSummary,balance:balanceSummary,cash:cashSummary,debtRatio,currentRatio,grossMargin,operatingMargin,netMargin,financialHealth,valuation,monthlyRevenue,dividends:dividendHistory},datasetErrors,source:'FinMind 財報／月營收／股利資料；公司清單 TWSE／TPEx',timestamp:now(),periodType:'財報為季資料；月營收為月資料'};
    },e=>({error:e.message,company:null,financials:null,source:'unavailable',timestamp:now()}));
    return json(res,result.error?503:200,result);
  }
  if(u.pathname.startsWith('/api/market/agents/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop());
    if(!validateSymbol(symbol))return json(res,400,{error:'invalid_symbol'});
    const fundamentals=stale('fundamentals:'+symbol)||null;
    const agentCacheKey='agents:'+symbol+':'+(fundamentals?.timestamp||'fundamentals-pending');
    const load=()=>buildAiCommittee(symbol,{
      getHistory:s=>safeLoad('history:'+s,TTL.history,()=>loadStockHistory(s),e=>({data:[],error:e.message})),
      quotes:stale('snapshot')?.data||{},scan:stale('scan')?.data||{},flows:stale('flows')?.data||{},fundamentals,
      quoteSource:stale('snapshot')?.source||'未取得報價來源',env:process.env
    });
    const result=u.searchParams.get('refresh')==='1'?await load():await safeLoad(agentCacheKey,10*60*1000,load,e=>({symbol,agents:['gemini','groq','cloudflare'].map(provider=>({provider,status:'error',message:e.message})),consensus:null,analysisTime:now()}));
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/market/history/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop());
    if(!validateSymbol(symbol))return json(res,400,{error:'invalid_symbol'});
    const result=await safeLoad('history:'+symbol,TTL.history,()=>loadStockHistory(symbol),e=>({data:[],indicators:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/institutional-flows'){
    const result=await safeLoad('flows',TTL.flows,async()=>{
      if(process.env.MARKET_FLOWS_URL){const x=await external('MARKET_FLOWS_URL','');return {data:x.data||{},source:x.source||'Configured flow provider',timestamp:x.timestamp||now(),asOf:x.asOf||null};}
      return await twseInstitutionalFlows();
    },e=>({data:{},source:'unavailable',timestamp:now(),error:e.message,asOf:null}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/futures'){
    const result=await safeLoad('futures',TTL.futures,async()=>{
      let nightSession=null,nightSessionError=null,daySession=null;
      if(process.env.MARKET_FUTURES_URL){
        const x=await external('MARKET_FUTURES_URL','');
        return {data:x.data||null,source:x.source||'Configured futures provider',timestamp:x.timestamp||now()};
      }
      if(FINMIND_TOKEN){
        const d=new Date();d.setDate(d.getDate()-14);const startDate=d.toISOString().slice(0,10);
        const rows=await finmind('TaiwanFuturesDaily',{data_id:'TX',start_date:startDate},20000);
        if(!rows.length)throw new Error('FinMind TX 期貨日資料目前無資料');
        const latestDate=rows.map(x=>String(x.date||'')).sort().at(-1);
        const today=rows.filter(x=>String(x.date)===latestDate).sort((a,b)=>Number(b.volume||0)-Number(a.volume||0));
        const latest=today[0],contract=String(latest.contract_date||'');
        const prior=rows.filter(x=>String(x.contract_date||'')===contract&&String(x.date)<latestDate).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
        const last=Number(latest.close),prev=Number(prior?.close);
        return {data:{last:Number.isFinite(last)?last:null,changePct:Number.isFinite(prev)&&prev!==0?(last/prev-1)*100:null,openInterestChange:prior?Number(latest.open_interest||0)-Number(prior.open_interest||0):null,volume:Number(latest.volume||0),contractDate:contract,asOf:latestDate,frequency:'daily',nightSession:null,nightSessionError:nightSessionError||'目前沒有可用的夜盤即時行情來源'},source:'FinMind TaiwanFuturesDaily（日資料，非即時）',timestamp:now()};
      }
      const rows=await fetchJson('https://openapi.taifex.com.tw/v1/DailyMarketReportFut',15000,{'User-Agent':'Mozilla/5.0','Accept':'application/json'});
      if(!Array.isArray(rows)||!rows.length)throw new Error('TAIFEX OpenAPI 未回傳期貨日報');
      const tx=rows.filter(r=>String(r.Contract||r['契約']||r['商品']||'').trim().toUpperCase()==='TX');
      if(!tx.length)throw new Error('TAIFEX 日報沒有 TX 臺股期貨資料');
      const currentMonth=new Date().toISOString().slice(0,7).replace('-','');
      const sorted=tx.map(r=>{
        const pick=(re)=>{const k=Object.keys(r).find(key=>re.test(key));return k?r[k]:null;};
        const month=String(pick(/ContractMonth|契約月份/ )||'').replace(/\D/g,'');
        const last=twseNumber(pick(/^Last$|最後成交價|最後價/));
        const changeRaw=String(pick(/Change%|漲跌百分比|漲跌幅/ )??'').replace(/[▲▼,%\s]/g,'');
        const changePct=Number(changeRaw);
        return {month,last,changePct:Number.isFinite(changePct)?changePct:null,volume:twseNumber(pick(/Volume-Total|總成交量|成交量/)),openInterest:twseNumber(pick(/OpenInterest|未平倉契約數/)),date:String(pick(/^Date$|日期/ )||'')};
      }).filter(r=>r.month&&r.last>0).sort((a,b)=>a.month.localeCompare(b.month));
      const near=sorted.find(r=>r.month.slice(0,6)>=currentMonth)||sorted[0];
      if(!near)throw new Error('TAIFEX TX 近月合約欄位無法解析');
      return {data:{last:near.last,changePct:near.changePct,openInterestChange:null,openInterest:near.openInterest,volume:near.volume,contractDate:near.month,asOf:near.date,frequency:'daily',nightSession:null,nightSessionError:nightSessionError||'此資料來源僅提供日報，非夜盤即時報價'},source:'TAIFEX OpenAPI DailyMarketReportFut（官方日資料，非逐筆即時）',timestamp:now()};
    },e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    if(result.stale&&result.data){
      const data={...result.data,nightSession:result.data.nightSession?{...result.data.nightSession,last:null,stale:true}:null,nightSessionError:'夜盤資料來源更新失敗；舊快取不作為即時成交價顯示。',nightSessionErrorCode:'stale_data'};
      return json(res,200,{...result,data,stale:true});
    }
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/sentiment'){
    const result=await safeLoad('sentiment',TTL.sentiment,async()=>{
      if(process.env.MARKET_SENTIMENT_URL){const x=await external('MARKET_SENTIMENT_URL','');return {data:x.data||null,source:x.source||'Configured sentiment provider',timestamp:x.timestamp||now()};}
      if(FINMIND_TOKEN){
        const d=new Date();d.setDate(d.getDate()-45);const startDate=d.toISOString().slice(0,10);
        const rows=await finmind('CnnFearGreedIndex',{start_date:startDate},15000);
        const latest=rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1);
        if(latest)return {data:{fearGreed:Number(latest.fear_greed),label:latest.fear_greed_emotion,asOf:latest.date},source:'FinMind CnnFearGreedIndex（日資料）',timestamp:now()};
      }
      const base=await safeLoad('open-source-market-history',12*60*60*1000,openSourceMarketHistory,e=>({data:{},error:e.message}));
      if(base.error)throw new Error(base.error);
      const returns=Object.values(base.data||{}).map(x=>Number(x.return5dPct)).filter(Number.isFinite);
      const adv=returns.filter(x=>x>0).length,dec=returns.filter(x=>x<0).length;
      return {data:{advanceDecline:adv/Math.max(1,dec),advancers:adv,decliners:dec,asOf:base.historyAsOf,label:'全市場近五日漲跌家數比'},source:'TWSE 官方開放資料計算市場廣度（非 CNN 恐懼貪婪指數）',timestamp:now()};
    },e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/news'){
    const result=await safeLoad('news',TTL.news,async()=>{
      if(process.env.MARKET_NEWS_URL){const x=await external('MARKET_NEWS_URL','');return {data:Array.isArray(x.data)?x.data:[],source:x.source||'Configured news provider',timestamp:x.timestamp||now()};}
      if(FINMIND_TOKEN){
        const d=new Date();d.setDate(d.getDate()-3);const startDate=d.toISOString().slice(0,10);
        const rows=await finmind('TaiwanStockNews',{start_date:startDate},20000);
        const data=rows.map(r=>({title:r.title||'',summary:r.description||'',url:r.link||'',source:r.source||'FinMind',publishedAt:r.date||'',symbol:r.stock_id||''})).filter(x=>x.title||x.url).sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,50);
        if(data.length)return {data,source:'FinMind TaiwanStockNews',timestamp:now()};
      }
      const rows=await fetchJson('https://openapi.twse.com.tw/v1/news/newsList',12000);
      const data=(rows||[]).map(r=>{
        const pick=(re)=>{const k=Object.keys(r).find(key=>re.test(key));return k?r[k]:'';};
        return {title:String(pick(/title|標題|主旨/i)||''),summary:String(pick(/content|摘要|內容/i)||''),url:String(pick(/url|link|網址|連結/i)||''),source:'臺灣證券交易所公告',publishedAt:String(pick(/date|時間|日期/i)||'')};
      }).filter(x=>x.title).slice(0,50);
      return {data,source:'TWSE OpenAPI newsList（交易所公告，不等同即時財經新聞）',timestamp:now()};
    },e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/finance/registry'){
    return json(res,200,globalFinance.getRegistry());
  }
  if(u.pathname==='/api/finance/fx'){
    const result=await safeLoad('global-finance-fx',60*60*1000,globalFinance.loadFx,e=>({rates:[],errors:[],base:'EUR',source:'unavailable',fetchedAt:now(),error:e.message}));
    return json(res,result.error?503:200,result);
  }
  if(u.pathname==='/api/finance/macro'){
    const result=await safeLoad('global-finance-macro',6*60*60*1000,globalFinance.loadMacro,e=>({data:[],source:'unavailable',fetchedAt:now(),status:'unavailable',summary:{requested:0,received:0,failed:0},error:e.message}));
    return json(res,result.status==='unavailable'?503:200,result);
  }
  if(u.pathname==='/api/intelligence/market-signals'){
    const symbols=String(u.searchParams.get('symbols')||'BTCUSDT,ETHUSDT').split(',').slice(0,5);
    const result=await safeLoad('global-market-intelligence:'+symbols.join(','),60*1000,()=>marketIntelligence.loadAll({symbols}),e=>({generatedAt:now(),error:e.message,policy:{items:[],sources:[]},social:{items:[],sources:[]},orderbooks:{books:[],sources:[]},whales:{status:'unavailable',items:[]},macro:{data:[],sources:[]}}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/intelligence/overview'){
    const results=await Promise.allSettled([
      safeLoad('news',TTL.news,async()=>{
        if(process.env.MARKET_NEWS_URL){const x=await external('MARKET_NEWS_URL','');return {data:Array.isArray(x.data)?x.data:[],source:x.source||'Configured news provider',timestamp:x.timestamp||now()};}
        if(FINMIND_TOKEN){const d=new Date();d.setDate(d.getDate()-3);const rows=await finmind('TaiwanStockNews',{start_date:d.toISOString().slice(0,10)},20000);const data=rows.map(r=>({title:r.title||'',summary:r.description||'',url:r.link||'',source:r.source||'FinMind',publishedAt:r.date||''})).filter(x=>x.title);if(data.length)return {data,source:'FinMind',timestamp:now()};}
        const rows=await fetchJson('https://openapi.twse.com.tw/v1/news/newsList',12000);
        return {data:(rows||[]).map(r=>{const pick=re=>{const k=Object.keys(r).find(key=>re.test(key));return k?r[k]:'';};return {title:String(pick(/title|標題|主旨/i)||''),summary:String(pick(/content|摘要|內容/i)||''),url:String(pick(/url|link|網址|連結/i)||''),source:'臺灣證券交易所公告',publishedAt:String(pick(/date|時間|日期/i)||'')};}).filter(x=>x.title).slice(0,50),source:'TWSE OpenAPI',timestamp:now()};
      },e=>({data:[],source:'unavailable',error:e.message,timestamp:now()})),
      safeLoad('crypto-news',300000,cryptoMarket.loadNews,e=>({data:[],source:'unavailable',error:e.message,timestamp:now()})),
      safeLoad('global-finance-fx',60*60*1000,globalFinance.loadFx,e=>({rates:[],errors:[],base:'EUR',source:'unavailable',fetchedAt:now(),error:e.message}))
    ]);
    const market=results[0].status==='fulfilled'?results[0].value:{data:[]};
    const crypto=results[1].status==='fulfilled'?results[1].value:{data:[]};
    const fx=results[2].status==='fulfilled'?results[2].value:null;
    const overview=globalIntelligence.buildOverview({marketNews:market.data||[],cryptoNews:crypto.data||[],fx,firewall:getTelemetry()});
    overview.fetchStatus={marketNews:market.source||'unavailable',cryptoNews:crypto.source||'unavailable',fx:fx?.source||'unavailable'};
    return json(res,200,overview);
  }
  // In production, serve the compiled React app from the same origin as the API.
  if (process.env.NODE_ENV === 'production') {
    const root = path.resolve(__dirname, '..', 'build');
    const requested = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const file = path.resolve(root, '.' + requested);
    if (file === root || file.startsWith(root + path.sep)) {
      try {
        const stat = fs.statSync(file);
        if (stat.isFile()) {
          const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2' };
          res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'x-content-type-options':'nosniff', 'cache-control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
          return fs.createReadStream(file).pipe(res);
        }
      } catch (_) { /* SPA routes fall back to index.html. */ }
      const index = path.join(root, 'index.html');
      if (fs.existsSync(index)) { res.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-cache', 'x-content-type-options':'nosniff' }); return fs.createReadStream(index).pipe(res); }
    }
  }
  return json(res,404,{error:'not_found'});
}
const server=http.createServer(async(req,res)=>{
  if(!applyFirewall(req,res))return;
  try{await route(req,res);}catch(e){json(res,500,{error:'internal_error',message:process.env.NODE_ENV==='production'?'服務暫時無法處理請求':e.message});}
});
server.listen(PORT,()=>{
  if(process.env.CRYPTO_STREAM_EMBEDDED!=='false') cryptoRealtimeFeed.start();
  process.stdout.write('Taiwan stock API listening on '+PORT+'\\n');
});
process.once('SIGTERM',()=>{cryptoRealtimeFeed.stop().finally(()=>server.close(()=>process.exit(0)));});
process.once('SIGINT',()=>{cryptoRealtimeFeed.stop().finally(()=>server.close(()=>process.exit(0)));});
