'use strict';
const http = require('node:http');
const { URL } = require('node:url');
const { indicators } = require('./lib/indicators');

const PORT = Number(process.env.PORT || 8787);
const FINMIND_BASE = process.env.FINMIND_BASE || 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_TOKEN = process.env.FINMIND_TOKEN || '';
const CACHE = new Map();
const PENDING = new Map();
const RATE = new Map();
const TTL = { universe: 6*60*60*1000, snapshot: 1000, history: 5*60*1000, flows: 60*1000, futures: 1000, sentiment: 15000 };
const now = () => new Date().toISOString();
const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
function cached(key, ttl) { const x=CACHE.get(key); return x && Date.now()-x.time<ttl ? x.value : null; }
function put(key,value){ CACHE.set(key,{time:Date.now(),value}); return value; }
async function fetchJson(url, timeoutMs=8000) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try { const r=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}}); if(!r.ok) throw new Error('upstream_http_'+r.status); return await r.json(); }
  finally { clearTimeout(timer); }
}
async function finmind(dataset, extra={}) {
  if(!FINMIND_TOKEN) throw new Error('未設定 FINMIND_TOKEN');
  const u=new URL(FINMIND_BASE); u.searchParams.set('dataset',dataset);
  u.searchParams.set('token',FINMIND_TOKEN);
  for(const [k,v] of Object.entries(extra)) if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  const payload=await fetchJson(u.toString());
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
function validateSymbol(s){return /^[0-9A-Z]{2,10}$/.test(s||'');}
function rateLimit(req){const ip=req.socket.remoteAddress||'unknown';const t=Date.now();let a=RATE.get(ip)||[];a=a.filter(x=>t-x<60000);if(a.length>=480)return false;a.push(t);RATE.set(ip,a);return true;}
async function route(req,res){
  const u=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){return json(res,405,{error:'method_not_allowed'});}
  if(u.pathname==='/api/health')return json(res,200,{ok:true,time:now(),provider:FINMIND_TOKEN?'FinMind token configured':'FinMind token missing',realtime:!!process.env.MARKET_REALTIME_URL});
  if(u.pathname==='/api/market/universe'){
    const result=await safeLoad('universe',TTL.universe,async()=>{
      const rows=await finmind('TaiwanStockInfo');
      const data=rows.filter(x=>x.stock_id&&/^[0-9]{4,6}$/.test(String(x.stock_id))).map(x=>({symbol:String(x.stock_id),name:x.stock_name||x.stock_id,sector:x.industry_category||'未分類',exchange:x.type||'TW'}));
      return {data,source:'FinMind TaiwanStockInfo',timestamp:now()};
    },e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/snapshot'){
    const result=await safeLoad('snapshot',TTL.snapshot,async()=>{
      const x=await external('MARKET_REALTIME_URL','未設定授權即時行情供應商 MARKET_REALTIME_URL');
      return {data:x.data||{},source:x.source||'Configured realtime provider',timestamp:x.timestamp||now(),delayed:!!x.delayed};
    },e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/scan'){
    const result=await safeLoad('scan',TTL.history,async()=>{const x=await external('MARKET_SCAN_URL','未設定全市場掃描供應商 MARKET_SCAN_URL');return {data:x.data||{},source:x.source||'Configured full-market scanner',timestamp:x.timestamp||now()};},e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname.startsWith('/api/market/history/')){
    const symbol=decodeURIComponent(u.pathname.split('/').pop());
    if(!validateSymbol(symbol))return json(res,400,{error:'invalid_symbol'});
    const key='history:'+symbol;
    const result=await safeLoad(key,TTL.history,async()=>{
      const d=new Date();d.setDate(d.getDate()-260);const start=d.toISOString().slice(0,10);
      const rows=await finmind('TaiwanStockPrice',{data_id:symbol,start_date:start});
      const data=rows.map(x=>({time:x.date,open:Number(x.open),high:Number(x.max),low:Number(x.min),close:Number(x.close),volume:Number(x.Trading_Volume)})).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)).slice(-240);
      return {data,indicators:indicators(data),source:'FinMind TaiwanStockPrice（日資料，非逐筆即時）',timestamp:now()};
    },e=>({data:[],indicators:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/institutional-flows'){
    const result=await safeLoad('flows',TTL.flows,async()=>{const x=await external('MARKET_FLOWS_URL','未設定法人／大戶／融資融券資料供應商 MARKET_FLOWS_URL');return {data:x.data||{},source:x.source||'Configured flow provider',timestamp:x.timestamp||now()};},e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/futures'){
    const result=await safeLoad('futures',TTL.futures,async()=>{const x=await external('MARKET_FUTURES_URL','未設定台指期授權行情供應商 MARKET_FUTURES_URL');return {data:x.data||null,source:x.source||'Configured futures provider',timestamp:x.timestamp||now()};},e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/sentiment'){
    const result=await safeLoad('sentiment',TTL.sentiment,async()=>{const x=await external('MARKET_SENTIMENT_URL','未設定市場情緒資料供應商 MARKET_SENTIMENT_URL');return {data:x.data||null,source:x.source||'Configured sentiment provider',timestamp:x.timestamp||now()};},e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  return json(res,404,{error:'not_found'});
}
const server=http.createServer(async(req,res)=>{
  if(!rateLimit(req))return json(res,429,{error:'rate_limited',retryAfterSeconds:60});
  try{await route(req,res);}catch(e){json(res,500,{error:'internal_error',message:process.env.NODE_ENV==='production'?'服務暫時無法處理請求':e.message});}
});
server.listen(PORT,()=>process.stdout.write('Taiwan stock API listening on '+PORT+'\n'));
