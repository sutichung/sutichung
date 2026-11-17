'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { indicators } = require('./lib/indicators');
const { scoreStock } = require('./lib/scoring');

const PORT = Number(process.env.PORT || 8787);
const FINMIND_BASE = process.env.FINMIND_BASE || 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_TOKEN = process.env.FINMIND_TOKEN || '';
const FUGLE_API_KEY = process.env.FUGLE_API_KEY || '';
const FUGLE_BASE = process.env.FUGLE_BASE_URL || 'https://api.fugle.tw/marketdata/v1.0/stock';
const CACHE = new Map();
const PENDING = new Map();
const RATE = new Map();
const TTL = { universe: 6*60*60*1000, snapshot: 5000, scan: 15000, history: 5*60*1000, flows: 30*60*1000, futures: 5*60*1000, sentiment: 30*60*1000, news: 5*60*1000 };
const now = () => new Date().toISOString();
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
async function finmindEndpoint(endpoint, extra={}, timeoutMs=8000) {
  if(!FINMIND_TOKEN) throw new Error('未設定 FINMIND_TOKEN');
  const u=new URL(FINMIND_BASE);u.pathname=u.pathname.replace(/\\/data\\/?$/,'/'+endpoint);
  for(const [k,v] of Object.entries(extra))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  const payload=await fetchJson(u.toString(),timeoutMs,{Authorization:'Bearer '+FINMIND_TOKEN});
  if(payload.status!==200&&payload.status!==undefined)throw new Error('FinMind status '+payload.status);
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
  if(u.pathname==='/api/health')return json(res,200,{ok:true,time:now(),node:process.version,provider:FINMIND_TOKEN?'FinMind token configured':'FinMind token missing',providers:{fugle:!!FUGLE_API_KEY,realtime:!!process.env.MARKET_REALTIME_URL,scan:!!process.env.MARKET_SCAN_URL,flows:!!process.env.MARKET_FLOWS_URL,futures:!!process.env.MARKET_FUTURES_URL,sentiment:!!process.env.MARKET_SENTIMENT_URL,news:!!process.env.MARKET_NEWS_URL},mode:process.env.NODE_ENV==='production'?'production':'development'});
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
      if(FUGLE_API_KEY){
        const markets=['TSE','OTC'];
        const payloads=await Promise.all(markets.map(async market=>{const u=new URL(FUGLE_BASE+'/snapshot/quotes/'+market);u.searchParams.set('type','COMMONSTOCK');return fetchJson(u.toString(),8000,{'X-API-KEY':FUGLE_API_KEY});}));
        const data={};for(const payload of payloads){for(const row of (payload.data||[])){if(!row.symbol)continue;const stamp=Number(row.lastUpdated);data[String(row.symbol)]={symbol:String(row.symbol),name:row.name||String(row.symbol),price:Number(row.closePrice),changePct:Number(row.changePercent),volume:Number(row.tradeVolume),timestamp:Number.isFinite(stamp)&&stamp>0?new Date(stamp/1000).toISOString():now(),market:payload.market};}}
        return {data,source:'Fugle market-wide snapshot quotes (TSE + OTC; upstream refresh every 5 seconds)',timestamp:now(),delayed:false};
      }
      const x=await external('MARKET_REALTIME_URL','未設定授權即時行情供應商；可設定 FUGLE_API_KEY 或 MARKET_REALTIME_URL');
      return {data:x.data||{},source:x.source||'Configured realtime provider',timestamp:x.timestamp||now(),delayed:!!x.delayed};
    },e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/scan'){
    const result=await safeLoad('scan',TTL.scan,async()=>{
      if(process.env.MARKET_SCAN_URL){
        const x=await external('MARKET_SCAN_URL','');
        const timestamp=x.timestamp||null,raw=x.data||{},data={};
        for(const [symbol,row] of Object.entries(raw)){
          if(!row||typeof row!=='object')continue;
          data[symbol]={...row,scorecard:scoreStock({...row,asOf:row.asOf||timestamp,fearGreed:row.fearGreed??x.fearGreed,advanceDecline:row.advanceDecline??x.advanceDecline,futuresChangePct:row.futuresChangePct??x.futuresChangePct})};
        }
        return {data,source:x.source||'Configured full-market scanner',timestamp:timestamp||now(),scannedCount:Object.keys(data).length};
      }
      if(!FINMIND_TOKEN)throw new Error('請設定 MARKET_SCAN_URL，或提供具備全市場查詢權限的 FINMIND_TOKEN');
      const base=await safeLoad('all-market-history',6*60*60*1000,async()=>{
        const d=new Date();d.setDate(d.getDate()-180);const start=d.toISOString().slice(0,10);
        const rows=await finmind('TaiwanStockPrice',{start_date:start},45000);
        if(!rows.length)throw new Error('FinMind 全市場日資料為空；此功能需要支援省略 data_id 的全市場方案');
        const grouped=new Map();
        for(const r of rows){
          const symbol=String(r.stock_id||r.data_id||'');if(!validateSymbol(symbol))continue;
          const candle={time:r.date,open:Number(r.open),high:Number(r.max),low:Number(r.min),close:Number(r.close),volume:Number(r.Trading_Volume)};
          if(![candle.open,candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite))continue;
          if(!grouped.has(symbol))grouped.set(symbol,[]);grouped.get(symbol).push(candle);
        }
        const data={};
        for(const [symbol,candles] of grouped){
          candles.sort((a,b)=>String(a.time).localeCompare(String(b.time)));
          if(candles.length<60)continue;
          const ind=indicators(candles);if(!ind)continue;
          const last=candles.at(-1),close5=candles.at(-6)?.close,close20=candles.at(-21)?.close;
          data[symbol]={...ind,technicalAsOf:last.time,return5dPct:close5?((last.close/close5)-1)*100:null,return20dPct:close20?((last.close/close20)-1)*100:null};
        }
        return {data,historyAsOf:rows.at(-1)?.date||null,historyCount:Object.keys(data).length};
      },e=>({data:{},error:e.message,historyCount:0}));
      if(base.error)throw new Error(base.error);
      const quotes=stale('snapshot')?.data||{},data={};
      for(const [symbol,technical] of Object.entries(base.data||{})){
        const quote=quotes[symbol]||{},price=Number.isFinite(Number(quote.price))?Number(quote.price):null;
        const row={...technical,price,changePct:quote.changePct,volume:quote.volume,asOf:quote.timestamp||null,priceVsEma20Pct:price!==null&&technical.ema20?((price/technical.ema20)-1)*100:null,priceVsEma60Pct:price!==null&&technical.ema60?((price/technical.ema60)-1)*100:null};
        row.scorecard=scoreStock({...row,asOf:row.asOf,maxAgeMs:180000});
        data[symbol]=row;
      }
      return {data,source:'FinMind all-market daily history + live quote overlay',timestamp:now(),scannedCount:Object.keys(data).length,historyAsOf:base.historyAsOf};
    },e=>({data:{},source:'unavailable',timestamp:now(),scannedCount:0,error:e.message}));
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
    const result=await safeLoad('flows',TTL.flows,async()=>{
      if(process.env.MARKET_FLOWS_URL){const x=await external('MARKET_FLOWS_URL','');return {data:x.data||{},source:x.source||'Configured flow provider',timestamp:x.timestamp||now()};}
      if(!FINMIND_TOKEN)throw new Error('未設定 FINMIND_TOKEN 或 MARKET_FLOWS_URL');
      const d=new Date();d.setDate(d.getDate()-10);const start=d.toISOString().slice(0,10);
      const [inst,margin]=await Promise.all([finmind('TaiwanStockInstitutionalInvestorsBuySell',{start_date:start},30000),finmind('TaiwanStockMarginPurchaseShortSale',{start_date:start},30000)]);
      const data={},latestInst=new Map();
      for(const r of inst){const symbol=String(r.stock_id||'');if(!validateSymbol(symbol))continue;const prev=latestInst.get(symbol);if(!prev||String(r.date)>String(prev.date))latestInst.set(symbol,{date:r.date,rows:[r]});else if(String(r.date)===String(prev.date))prev.rows.push(r);}
      for(const [symbol,group] of latestInst){const x={asOf:group.date,foreignNet:0,trustNet:0,dealerNet:0,institutionalNet:0};for(const r of group.rows){const net=Number(r.buy||0)-Number(r.sell||0);x.institutionalNet+=net;const name=String(r.name||'').toLowerCase();if(name.includes('foreign'))x.foreignNet+=net;else if(name.includes('trust')||name.includes('investment'))x.trustNet+=net;else if(name.includes('dealer'))x.dealerNet+=net;}data[symbol]=x;}
      const grouped=new Map();for(const r of margin){const symbol=String(r.stock_id||'');if(!validateSymbol(symbol))continue;if(!grouped.has(symbol))grouped.set(symbol,[]);grouped.get(symbol).push(r);}
      for(const [symbol,rows] of grouped){rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));const last=rows.at(-1),prev=rows.at(-2);const x=data[symbol]||{asOf:last.date};if(prev){x.marginChange=Number(last.MarginPurchaseTodayBalance||0)-Number(prev.MarginPurchaseTodayBalance||0);x.shortChange=Number(last.ShortSaleTodayBalance||0)-Number(prev.ShortSaleTodayBalance||0);}x.asOf=x.asOf||last.date;data[symbol]=x;}
      return {data,source:'FinMind all-market institutional investors + margin/short-sale daily data',timestamp:now(),asOf:[...latestInst.values()].map(x=>x.date).sort().at(-1)||null};
    },e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/futures'){
    const result=await safeLoad('futures',TTL.futures,async()=>{const x=await external('MARKET_FUTURES_URL','未設定台指期授權行情供應商 MARKET_FUTURES_URL');return {data:x.data||null,source:x.source||'Configured futures provider',timestamp:x.timestamp||now()};},e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/news'){
    const result=await safeLoad('news',TTL.news,async()=>{const x=await external('MARKET_NEWS_URL','未設定授權新聞資料供應商 MARKET_NEWS_URL');return {data:Array.isArray(x.data)?x.data:[],source:x.source||'Configured licensed news provider',timestamp:x.timestamp||now()};},e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/sentiment'){
    const result=await safeLoad('sentiment',TTL.sentiment,async()=>{const x=await external('MARKET_SENTIMENT_URL','未設定市場情緒資料供應商 MARKET_SENTIMENT_URL');return {data:x.data||null,source:x.source||'Configured sentiment provider',timestamp:x.timestamp||now()};},e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
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
