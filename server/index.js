'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { indicators } = require('./lib/indicators');
const { scoreStock } = require('./lib/scoring');
const { getTradingReadiness } = require('./lib/trading-readiness');
const { buildAiCommittee } = require('./lib/agents');

const PORT = Number(process.env.PORT || 8787);
const FINMIND_BASE = process.env.FINMIND_BASE || 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_TOKEN = process.env.FINMIND_TOKEN || '';
const FUGLE_API_KEY = process.env.FUGLE_API_KEY || '';
const FUGLE_BASE = process.env.FUGLE_BASE_URL || 'https://api.fugle.tw/marketdata/v1.0/stock';
const CACHE = new Map();
const PENDING = new Map();
const RATE = new Map();
const TTL = { universe: 6*60*60*1000, snapshot: 10000, scan: 10000, history: 5*60*1000, flows: 30*60*1000, futures: 5*60*1000, sentiment: 30*60*1000, news: 5*60*1000 };
const now = () => new Date().toISOString();
const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
function cached(key, ttl) { const x=CACHE.get(key); return x && Date.now()-x.time<ttl ? x.value : null; }
function put(key,value){ CACHE.set(key,{time:Date.now(),value}); return value; }
async function fetchJson(url, timeoutMs=8000, extraHeaders={}) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try { const r=await fetch(url,{signal:controller.signal,headers:{accept:'application/json',...extraHeaders}}); if(!r.ok) throw new Error('upstream_http_'+r.status); return await r.json(); }
  finally { clearTimeout(timer); }
}
async function twseMisSnapshot(){
  const listed=await safeLoad('universe',TTL.universe,twseListedUniverse);
  const symbols=(listed.data||[]).map(x=>x.symbol).filter(x=>/^[0-9]{4,6}$/.test(x));
  if(!symbols.length)throw new Error('無上市股票清單，無法連接證交所行情');
  const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Referer':'https://mis.twse.com.tw/stock/index.jsp','Origin':'https://mis.twse.com.tw','Accept':'application/json, text/plain, */*'};
  const warmUrl='https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw&json=1&delay=0&_='+Date.now();
  const warm=await fetch(warmUrl,{headers,signal:AbortSignal.timeout(12000)});
  if(!warm.ok)throw new Error('證交所 MIS 初始化連線失敗 HTTP '+warm.status);
  const cookies=(warm.headers.getSetCookie?.()||[]).map(x=>x.split(';')[0]).filter(Boolean).join('; ');
  const warmBody=await warm.json();
  if(warmBody.rtmessage && warmBody.rtmessage!=='OK')throw new Error('證交所 MIS 初始化回應：'+warmBody.rtmessage);
  const chunks=[];for(let i=0;i<symbols.length;i+=25)chunks.push(symbols.slice(i,i+25));
  const payloads=await mapLimit(chunks,2,async chunk=>{
    const params=new URLSearchParams({ex_ch:chunk.map(x=>'tse_'+x+'.tw').join('|'),json:'1',delay:'0',_:String(Date.now())});
    const h={...headers};if(cookies)h.Cookie=cookies;
    const payload=await fetchJson('https://mis.twse.com.tw/stock/api/getStockInfo.jsp?'+params.toString(),12000,h);
    if(payload.rtmessage && payload.rtmessage!=='OK')throw new Error('證交所 MIS 回應：'+payload.rtmessage);
    return payload;
  });
  const data={};
  for(const payload of payloads)for(const q of (payload.msgArray||[])){
    const symbol=String(q.c||'');if(!symbol)continue;
    const price=Number(q.z),preClose=Number(q.y),volume=Number(q.v??q.tv);
    const quoteTime=q.tlong?new Date(Number(q.tlong)).toISOString():(q.t&&q.d?new Date(String(q.d).replace(/\//g,'-')+'T'+q.t+'+08:00').toISOString():null);
    data[symbol]={symbol,name:q.n||symbol,price:Number.isFinite(price)&&price>0?price:(Number(q.pz)>0?Number(q.pz):null),changePct:Number.isFinite(price)&&Number.isFinite(preClose)&&preClose>0?((price/preClose)-1)*100:null,volume:Number.isFinite(volume)?volume:null,timestamp:quoteTime,market:'TSE',source:'TWSE MIS'};
  }
  if(!Object.keys(data).length)throw new Error('證交所 MIS 已連線但未回傳股票報價；回應 '+(payloads[0]?.rtmessage||'無有效 msgArray'));
  return {data,source:'證交所 TWSE MIS 官方行情',timestamp:now(),delayed:false,scannedCount:Object.keys(data).length,listedCount:symbols.length};
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
function currentTwseRows(rows){
  const latest=new Map();
  for(const row of rows||[]){
    const symbol=String(row.stock_id||row['公司代號']||row['股票代號']||row['有價證券代號']||row['代號']||'').trim();
    if(!/^[0-9]{4,6}$/.test(symbol))continue;
    if(String(row.type||'').toLowerCase() && String(row.type).toLowerCase()!=='twse')continue;
    const name=row.stock_name||row['公司簡稱']||row['有價證券名稱']||row['公司名稱']||symbol;
    latest.set(symbol,{symbol,name,sector:row.industry_category||row['產業別']||'未分類',exchange:'TWSE'});
  }
  return [...latest.values()];
}
async function twseListedUniverse(){
  const rows=await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L',10000);
  const data=currentTwseRows(rows);
  if(!data.length)throw new Error('證交所上市公司清單沒有回傳有效資料');
  return {data,source:'TWSE OpenAPI 上市公司清單',timestamp:now()};
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
  let marginAsOf=null;
  try{
    const margins=await recentOpenArchive('margin_twse',2);
    if(margins.length){
      const latest=margins.at(-1),previous=margins.at(-2);
      marginAsOf=latest.trade_date;
      for(const [symbol,values] of Object.entries(latest.rows)){
        const old=previous?.rows?.[symbol];
        const x=data[symbol]||(data[symbol]={asOf:valid.at(-1).date});
        const margin=Number(values?.[0]),short=Number(values?.[1]);
        if(Number.isFinite(margin)){x.marginBalance=margin;if(old&&Number.isFinite(Number(old[0])))x.marginChange=margin-Number(old[0]);}
        if(Number.isFinite(short)){x.shortBalance=short;if(old&&Number.isFinite(Number(old[1])))x.shortChange=short-Number(old[1]);}
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
  return {data,source:'TWSE T86 三大法人 + TWSE/TDCC 開放資料（法人、融資融券、集保股權分散）',timestamp:now(),asOf:valid.at(-1).date,days:valid.map(x=>x.date),marginAsOf,tdccAsOf};
}
async function openSourceMarketHistory(){
  const dates=archiveDates(120);
  const docs=await mapLimit(dates,8,async date=>{try{return await fetchOpenArchive('price_twse',date);}catch(_){return null;}});
  const valid=docs.filter(Boolean).sort((a,b)=>a.trade_date.localeCompare(b.trade_date));
  if(valid.length<60)throw new Error('開放資料歷史庫目前只有 '+valid.length+' 個有效交易日，至少需要 60 日才能計算完整技術指標');
  const grouped=new Map();
  for(const doc of valid){
    const fields=doc.fields||[],idx={open:fields.indexOf('open'),high:fields.indexOf('high'),low:fields.indexOf('low'),close:fields.indexOf('close'),volume:fields.indexOf('volume_shares')};
    if(Object.values(idx).some(i=>i<0))continue;
    for(const [symbol,values] of Object.entries(doc.rows||{})){
      if(!/^[0-9A-Z]{4,10}$/.test(symbol)||!Array.isArray(values))continue;
      const candle={time:doc.trade_date,open:Number(values[idx.open]),high:Number(values[idx.high]),low:Number(values[idx.low]),close:Number(values[idx.close]),volume:Number(values[idx.volume])};
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
    data[symbol]={...ind,technicalAsOf:last.time,asOf:valid.at(-1).fetched_at||now(),close:last.close,latestVolume:last.volume,volume5d,dailyChangePct:prior?((last.close/prior)-1)*100:null,return5dPct:close5?((last.close/close5)-1)*100:null,return20dPct:close20?((last.close/close20)-1)*100:null};
  }
  return {data,historyAsOf:valid.at(-1).trade_date,historyDateCount:valid.length,historyCount:Object.keys(data).length,source:'88jiayu/tw-chip-open-data（TWSE 官方開放資料歸檔；OGDL）'};
}

function validateSymbol(s){return /^[0-9A-Z]{2,10}$/.test(s||'');}
function rateLimit(req){const ip=req.socket.remoteAddress||'unknown';const t=Date.now();let a=RATE.get(ip)||[];a=a.filter(x=>t-x<60000);if(a.length>=480)return false;a.push(t);RATE.set(ip,a);return true;}
async function loadStockHistory(symbol){
  let data=[],source='';
  if(FINMIND_TOKEN){
    const d=new Date();d.setDate(d.getDate()-260);const start=d.toISOString().slice(0,10);
    const rows=await finmind('TaiwanStockPrice',{data_id:symbol,start_date:start});
    data=rows.map(x=>({time:x.date,open:Number(x.open),high:Number(x.max),low:Number(x.min),close:Number(x.close),volume:Number(x.Trading_Volume)})).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)).slice(-240);
    source='FinMind TaiwanStockPrice（日資料，非逐筆即時）';
  }else{
    const months=[];for(let i=0;i<8;i++){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7)+'-01');}
    const pages=await mapLimit(months,3,async month=>{
      const date=month.replace(/-/g,'').slice(0,6)+'01';
      const url='https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date='+date+'&stockNo='+encodeURIComponent(symbol)+'&response=json';
      const payload=await fetchJson(url,12000,{'User-Agent':'Mozilla/5.0','Referer':'https://www.twse.com.tw/','Accept':'application/json'});
      return (payload.data||[]).map(r=>{const parts=String(r[0]||'').split('/');const day=parts.length===3?String(Number(parts[0])+1911)+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'):'';const n=v=>Number(String(v??'').replace(/,/g,'').trim());return {time:day,volume:n(r[1]),open:n(r[3]),high:n(r[4]),low:n(r[5]),close:n(r[6])};}).filter(x=>x.time&&[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite));
    });
    data=pages.flat().sort((a,b)=>a.time.localeCompare(b.time)).slice(-240);source='TWSE 官方 STOCK_DAY 月日線（日資料，非逐筆即時）';
    if(data.length<20)throw new Error('TWSE 個股歷史日線不足 20 根');
  }
  if(!data.length)throw new Error('沒有可供分析的歷史K線');
  return {data,source,timestamp:now(),asOf:data.at(-1).time,indicators:indicators(data)};
}
async function route(req,res){
  const u=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){return json(res,405,{error:'method_not_allowed'});}
  if(u.pathname==='/api/health')return json(res,200,{ok:true,time:now(),node:process.version,provider:FINMIND_TOKEN?'FinMind token configured':'FinMind token missing',trading:getTradingReadiness(),providers:{finmind:!!FINMIND_TOKEN,fugle:!!FUGLE_API_KEY,youtubeLiveResolver:!!process.env.YOUTUBE_API_KEY,realtime:true,twseMisFallback:true,scan:true,flows:true,futures:true,sentiment:true,news:true,openDataArchive:true},mode:process.env.NODE_ENV==='production'?'production':'development'});
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
  if(u.pathname==='/api/trading/readiness')return json(res,200,getTradingReadiness());
  if(u.pathname==='/api/market/universe'){
    const result=await safeLoad('universe',TTL.universe,twseListedUniverse,e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/diagnostics/market'){
    try{
      const listed=await twseListedUniverse();
      const live=await twseMisSnapshot();
      const sample=Object.values(live.data).slice(0,5).map(x=>({symbol:x.symbol,name:x.name,price:x.price,timestamp:x.timestamp}));
      return json(res,200,{ok:true,connection:'connected',source:live.source,listedCount:listed.data.length,quoteCount:live.scannedCount,serverTime:now(),sample});
    }catch(e){
      console.error('[market-diagnostics] '+(e.stack||e.message));
      return json(res,200,{ok:false,connection:'disconnected',error:e.message,serverTime:now()});
    }
  }
  if(u.pathname==='/api/market/snapshot'){
    const result=await safeLoad('snapshot',TTL.snapshot,async()=>{
      if(FUGLE_API_KEY){
        const markets=['TSE'];
        const payloads=await Promise.all(markets.map(async market=>{const u=new URL(FUGLE_BASE+'/snapshot/quotes/'+market);return fetchJson(u.toString(),8000,{'X-API-KEY':FUGLE_API_KEY});}));
        const data={};for(const payload of payloads){for(const row of (payload.data||[])){if(!row.symbol)continue;const stamp=Number(row.lastUpdated);data[String(row.symbol)]={symbol:String(row.symbol),name:row.name||String(row.symbol),price:Number.isFinite(Number(row.lastPrice??row.closePrice))&&Number(row.lastPrice??row.closePrice)>0?Number(row.lastPrice??row.closePrice):null,changePct:Number.isFinite(Number(row.changePercent))?Number(row.changePercent):null,volume:Number(row.tradeVolume),timestamp:Number.isFinite(stamp)&&stamp>0?new Date(stamp/1000).toISOString():now(),market:payload.market};}}
        return {data,source:'Fugle market-wide snapshot quotes (TSE; upstream refresh every 5 seconds)',timestamp:now(),delayed:false};
      }
      if(process.env.MARKET_REALTIME_URL){
        const x=await external('MARKET_REALTIME_URL','');
        return {data:x.data||{},source:x.source||'Configured realtime provider',timestamp:x.timestamp||now(),delayed:!!x.delayed};
      }
      return await twseMisSnapshot();
    },e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
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
      const twseSymbols=new Set(listed.data.map(x=>x.symbol));
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
        if(!twseSymbols.has(symbol))continue;
        const quote=quotes[symbol]||{},flow=flows[symbol]||{},valuation=perResult.data?.[symbol]||{},livePrice=quote.price!=null&&Number.isFinite(Number(quote.price))&&Number(quote.price)>0?Number(quote.price):null,price=livePrice??Number(technical.close);
        const trustFlowPct5d=Number.isFinite(Number(flow.trustNet5d))&&technical.volume5d>0?(Number(flow.trustNet5d)/technical.volume5d)*100:null;
        const foreignFlowPct5d=Number.isFinite(Number(flow.foreignNet5d))&&technical.volume5d>0?(Number(flow.foreignNet5d)/technical.volume5d)*100:null;
        const row={...technical,...flow,...valuation,pe:valuation.pe,pb:valuation.pb,dividendYield:valuation.dividendYield,trustFlowPct5d,foreignFlowPct5d,signal:technical.macdSignal,price,quoteIsLive:livePrice!==null,changePct:quote.changePct??technical.dailyChangePct,volume:quote.volume??technical.latestVolume,asOf:quote.timestamp||technical.asOf||null,priceVsEma20Pct:price!==null&&technical.ema20?((price/technical.ema20)-1)*100:null,priceVsEma60Pct:price!==null&&technical.ema60?((price/technical.ema60)-1)*100:null};
        row.scorecard=scoreStock({...row,asOf:row.asOf,maxAgeMs:36*60*60*1000,fearGreed:sentiment.fearGreed,advanceDecline:sentiment.advanceDecline??advanceDecline,futuresChangePct:futures.changePct});
        data[symbol]=row;
      }
      return {data,source:(base.source||'FinMind')+' + TWSE 即時行情／公開估值／籌碼',timestamp:now(),scannedCount:Object.keys(data).length,historyAsOf:base.historyAsOf,historyCount:base.historyCount||Object.keys(base.data||{}).length,advanceDecline};
    },e=>({data:{},source:'unavailable',timestamp:now(),scannedCount:0,error:e.message}));
    if(result.stale&&result.data){const safeData={};for(const [symbol,row] of Object.entries(result.data)){const card=row?.scorecard||{};safeData[symbol]={...row,scorecard:{...card,direction:'觀望',status:'insufficient-data',fresh:false,reasons:[...(card.reasons||[]),'全市場掃描快取已過期，暫停方向判斷']}};}return json(res,200,{...result,data:safeData});}
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/market/agents/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop());
    if(!validateSymbol(symbol))return json(res,400,{error:'invalid_symbol'});
    const load=()=>buildAiCommittee(symbol,{
      getHistory:s=>safeLoad('history:'+s,TTL.history,()=>loadStockHistory(s),e=>({data:[],error:e.message})),
      quotes:stale('snapshot')?.data||{},scan:stale('scan')?.data||{},flows:stale('flows')?.data||{},
      quoteSource:stale('snapshot')?.source||'未取得報價來源',env:process.env
    });
    const result=u.searchParams.get('refresh')==='1'?await load():await safeLoad('agents:'+symbol,10*60*1000,load,e=>({symbol,agents:['gemini','grok','deepseek'].map(provider=>({provider,status:'error',message:e.message})),consensus:null,analysisTime:now()}));
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/market/history/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop());
    if(!validateSymbol(symbol))return json(res,400,{error:'invalid_symbol'});
    const key='history:'+symbol;
    const result=await safeLoad(key,TTL.history,async()=>{
      let data=[],source='';
      if(FINMIND_TOKEN){
        const d=new Date();d.setDate(d.getDate()-260);const start=d.toISOString().slice(0,10);
        const rows=await finmind('TaiwanStockPrice',{data_id:symbol,start_date:start});
        data=rows.map(x=>({time:x.date,open:Number(x.open),high:Number(x.max),low:Number(x.min),close:Number(x.close),volume:Number(x.Trading_Volume)})).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)).slice(-240);
        source='FinMind TaiwanStockPrice（日資料，非逐筆即時）';
      }else{
        const months=[];
        for(let i=0;i<8;i++){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7)+'-01');}
        const pages=await mapLimit(months,3,async month=>{
          const date=month.replace(/-/g,'').slice(0,6)+'01';
          const url='https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date='+date+'&stockNo='+encodeURIComponent(symbol)+'&response=json';
          const payload=await fetchJson(url,12000,{'User-Agent':'Mozilla/5.0','Referer':'https://www.twse.com.tw/','Accept':'application/json'});
          return (payload.data||[]).map(r=>{
            const parts=String(r[0]||'').split('/');
            const day=parts.length===3?String(Number(parts[0])+1911)+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'):'';
            const n=v=>Number(String(v??'').replace(/,/g,'').trim());
            return {time:day,volume:n(r[1]),open:n(r[3]),high:n(r[4]),low:n(r[5]),close:n(r[6])};
          }).filter(x=>x.time&&[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite));
        });
        data=pages.flat().sort((a,b)=>a.time.localeCompare(b.time)).slice(-240);
        source='TWSE 官方 STOCK_DAY 月日線（日資料，非逐筆即時）';
        if(data.length<60)throw new Error('證交所個股歷史日線不足 60 根，暫不能計算完整技術指標');
      }
      return {data,indicators:indicators(data),source,timestamp:now()};
    },e=>({data:[],indicators:null,source:'unavailable',timestamp:now(),error:e.message}));
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
    const result=await safeLoad('futures',FUGLE_API_KEY?5000:TTL.futures,async()=>{
      let nightSession=null,nightSessionError=null,daySession=null;
      if(FUGLE_API_KEY){
        const base=(process.env.FUGLE_FUTOPT_BASE_URL||'https://api.fugle.tw/marketdata/v1.0/futopt').replace(/\/$/,'');
        const headers={'X-API-KEY':FUGLE_API_KEY};
        const toIso=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n>1e14?n/1000:n>1e11?n:n*1000).toISOString():null;};
        const normalize=(q,session)=>{
          if(!q||typeof q!=='object')return null;
          const last=q.isTrial?(Number(q.lastTrade?.price)>0?Number(q.lastTrade.price):null):(Number(q.lastPrice??q.closePrice)>0?Number(q.lastPrice??q.closePrice):null);
          return {symbol:q.symbol||'TXF1!',name:q.name||'臺股期貨近月',last,change:Number.isFinite(Number(q.change))?Number(q.change):null,changePct:Number.isFinite(Number(q.changePercent))?Number(q.changePercent):null,previousClose:Number(q.previousClose)>0?Number(q.previousClose):null,open:Number(q.openPrice)>0?Number(q.openPrice):null,high:Number(q.highPrice)>0?Number(q.highPrice):null,low:Number(q.lowPrice)>0?Number(q.lowPrice):null,volume:Number(q.total?.tradeVolume??0),timestamp:toIso(q.lastUpdated||q.lastTrade?.time||q.closeTime),date:q.date||null,isTrial:!!q.isTrial,session};
        };
        try{
          const q=await fetchJson(base+'/intraday/quote/TXF1!?session=afterhours',8000,headers);
          nightSession=normalize(q,'afterhours');
          if(!nightSession||nightSession.last==null)nightSessionError='富果已回應，但目前沒有可用的正式夜盤成交價（可能尚未開盤或只有試撮）';
        }catch(e){
          const message=String(e.message||e);
          if(message.includes('upstream_http_403'))nightSessionError='富果拒絕期權即時行情（HTTP 403）：目前 API 方案未開通期權即時行情權限。請在 Fugle 會員中心升級至支援期權行情的「開發者」或「進階用戶」方案，並確認期權即時行情已啟用；一般股票 API Key 不代表具備期權權限。';
          else if(message.includes('upstream_http_401'))nightSessionError='富果期權 API 金鑰驗證失敗（HTTP 401）：請在 Fugle 行情 API 金鑰頁重新建立 Key，並更新 Render 的 FUGLE_API_KEY。';
          else if(message.includes('upstream_http_429'))nightSessionError='富果期權 API 呼叫已達方案限制（HTTP 429）：請稍後重試或確認方案呼叫額度。';
          else nightSessionError='富果夜盤報價連線失敗：'+message;
        }
        try{
          const q=await fetchJson(base+'/intraday/quote/TXF1!',8000,headers);
          daySession=normalize(q,'regular');
        }catch(e){if(!nightSessionError)nightSessionError='富果日盤報價連線失敗：'+e.message;}
        if(nightSession||daySession){
          return {data:{last:daySession?.last??null,changePct:daySession?.changePct??null,openInterestChange:null,volume:daySession?.volume??null,contractDate:nightSession?.symbol||daySession?.symbol||'TXF1!',frequency:'intraday-rest',daySession,nightSession,nightSessionError,nightSessionErrorCode:nightSessionError?.includes('HTTP 403')?'permission_denied':nightSessionError?.includes('HTTP 401')?'invalid_api_key':nightSessionError?.includes('HTTP 429')?'rate_limited':nightSessionError?'upstream_error':null,nightSessionAction:nightSessionError?.includes('HTTP 403')?'升級 Fugle 期權即時行情權限後再測試':nightSessionError?.includes('HTTP 401')?'重新建立 API Key 並更新 Render 環境變數':null,nightSessionSource:'Fugle Futopt REST API',nightSessionRefreshMs:5000},source:'Fugle Futopt REST API（TXF1!；日盤／夜盤分開查詢）',timestamp:now()};
        }
      }
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
  if(!rateLimit(req))return json(res,429,{error:'rate_limited',retryAfterSeconds:60});
  try{await route(req,res);}catch(e){json(res,500,{error:'internal_error',message:process.env.NODE_ENV==='production'?'服務暫時無法處理請求':e.message});}
});
server.listen(PORT,()=>process.stdout.write('Taiwan stock API listening on '+PORT+'\n'));
