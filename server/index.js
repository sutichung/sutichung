'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { indicators } = require('./lib/indicators');
const { scoreStock } = require('./lib/scoring');
const { getTradingReadiness } = require('./lib/trading-readiness');

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
  const chunks=[];for(let i=0;i<symbols.length;i+=80)chunks.push(symbols.slice(i,i+80));
  const payloads=await mapLimit(chunks,3,async chunk=>{
    const params=new URLSearchParams({ex_ch:chunk.map(x=>'tse_'+x+'.tw').join('|'),json:'1',delay:'0',_:String(Date.now())});
    return fetchJson('https://mis.twse.com.tw/stock/api/getStockInfo.jsp?'+params.toString(),10000,{'User-Agent':'Mozilla/5.0','Referer':'https://mis.twse.com.tw/stock/index.jsp'});
  });
  const data={};
  for(const payload of payloads)for(const q of (payload.msgArray||[])){
    const symbol=String(q.c||'');if(!symbol)continue;
    const price=Number(q.z),prev=Number(q.y),volume=Number(q.tv);
    data[symbol]={symbol,name:q.n||symbol,price:Number.isFinite(price)&&price>0?price:null,changePct:Number.isFinite(price)&&Number.isFinite(prev)&&prev>0?((price/prev)-1)*100:null,volume:Number.isFinite(volume)?volume:null,timestamp:q.t?new Date(String(q.d||'').replace(/\//g,'-')+'T'+q.t+'+08:00').toISOString():null,market:'TSE',source:'TWSE MIS'};
  }
  if(!Object.keys(data).length)throw new Error('證交所 MIS 未回傳有效報價');
  return {data,source:'證交所 TWSE MIS 官方行情（即時報價）',timestamp:now(),delayed:false,scannedCount:Object.keys(data).length};
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
function validateSymbol(s){return /^[0-9A-Z]{2,10}$/.test(s||'');}
function rateLimit(req){const ip=req.socket.remoteAddress||'unknown';const t=Date.now();let a=RATE.get(ip)||[];a=a.filter(x=>t-x<60000);if(a.length>=480)return false;a.push(t);RATE.set(ip,a);return true;}
async function route(req,res){
  const u=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){return json(res,405,{error:'method_not_allowed'});}
  if(u.pathname==='/api/health')return json(res,200,{ok:true,time:now(),node:process.version,provider:FINMIND_TOKEN?'FinMind token configured':'FinMind token missing',trading:getTradingReadiness(),providers:{finmind:!!FINMIND_TOKEN,fugle:!!FUGLE_API_KEY,realtime:true,twseMisFallback:true,scan:!!FINMIND_TOKEN||!!process.env.MARKET_SCAN_URL,flows:!!FINMIND_TOKEN||!!process.env.MARKET_FLOWS_URL,futures:!!FINMIND_TOKEN||!!process.env.MARKET_FUTURES_URL,sentiment:!!FINMIND_TOKEN||!!process.env.MARKET_SENTIMENT_URL,news:!!FINMIND_TOKEN||!!process.env.MARKET_NEWS_URL},mode:process.env.NODE_ENV==='production'?'production':'development'});
  if(u.pathname==='/api/trading/readiness')return json(res,200,getTradingReadiness());
  if(u.pathname==='/api/market/universe'){
    const result=await safeLoad('universe',TTL.universe,twseListedUniverse,e=>({data:[],source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
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
      if(!FINMIND_TOKEN)throw new Error('請設定 MARKET_SCAN_URL，或提供具備全市場查詢權限的 FINMIND_TOKEN');
      const base=await safeLoad('all-market-history',6*60*60*1000,async()=>{
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
        const rows=await finmind('TaiwanStockPER',{start_date:base.historyAsOf},20000);
        const data={};
        for(const r of rows){const symbol=String(r.stock_id||'');if(!validateSymbol(symbol))continue;const date=String(r.date||'');if(!data[symbol]||date>String(data[symbol].date||''))data[symbol]={date,pe:Number(r.PER),pb:Number(r.PBR),dividendYield:Number(r.dividend_yield)};}
        return {data,asOf:base.historyAsOf};
      },e=>({data:{},error:e.message}));
      const quotes=stale('snapshot')?.data||{},flows=stale('flows')?.data||{},sentiment=stale('sentiment')?.data||{},futures=stale('futures')?.data||{},data={};
      const fiveDay=Object.values(base.data||{}).map(x=>Number(x.return5dPct)).filter(Number.isFinite),adv=fiveDay.filter(v=>v>0).length,dec=fiveDay.filter(v=>v<0).length,advanceDecline=adv/Math.max(1,dec);
      for(const [symbol,technical] of Object.entries(base.data||{})){
        if(!twseSymbols.has(symbol))continue;
        const quote=quotes[symbol]||{},flow=flows[symbol]||{},valuation=perResult.data?.[symbol]||{},price=quote.price!=null&&Number.isFinite(Number(quote.price))&&Number(quote.price)>0?Number(quote.price):null;
        const trustFlowPct5d=Number.isFinite(Number(flow.trustNet5d))&&technical.volume5d>0?(Number(flow.trustNet5d)/technical.volume5d)*100:null;
        const foreignFlowPct5d=Number.isFinite(Number(flow.foreignNet5d))&&technical.volume5d>0?(Number(flow.foreignNet5d)/technical.volume5d)*100:null;
        const row={...technical,...flow,...valuation,pe:valuation.pe,pb:valuation.pb,dividendYield:valuation.dividendYield,trustFlowPct5d,foreignFlowPct5d,signal:technical.macdSignal,price,changePct:quote.changePct,volume:quote.volume,asOf:quote.timestamp||null,priceVsEma20Pct:price!==null&&technical.ema20?((price/technical.ema20)-1)*100:null,priceVsEma60Pct:price!==null&&technical.ema60?((price/technical.ema60)-1)*100:null};
        row.scorecard=scoreStock({...row,asOf:row.asOf,maxAgeMs:180000,fearGreed:sentiment.fearGreed,advanceDecline:sentiment.advanceDecline??advanceDecline,futuresChangePct:futures.changePct});
        data[symbol]=row;
      }
      return {data,source:'FinMind TWSE-listed daily history + TSE live quote overlay',timestamp:now(),scannedCount:Object.keys(data).length,historyAsOf:base.historyAsOf,advanceDecline};
    },e=>({data:{},source:'unavailable',timestamp:now(),scannedCount:0,error:e.message}));
    if(result.stale&&result.data){const safeData={};for(const [symbol,row] of Object.entries(result.data)){const card=row?.scorecard||{};safeData[symbol]={...row,scorecard:{...card,direction:'觀望',status:'insufficient-data',fresh:false,reasons:[...(card.reasons||[]),'全市場掃描快取已過期，暫停方向判斷']}};}return json(res,200,{...result,data:safeData});}
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
      const dates=await finmind('TaiwanStockTradingDate',{},15000);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
      const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
      const includeToday=localTime>='20:30';
      const recent=dates.map(x=>String(x.date||'')).filter(x=>x&&x<=today&&(includeToday||x<today)).sort().slice(-5);
      if(recent.length<5)throw new Error('近五個交易日資料不足，暫停法人籌碼評分');
      const latestDate=recent.at(-1),previousDate=recent.at(-2);
      const [inst,marginLatest,marginPrevious]=await Promise.all([
        finmind('TaiwanStockInstitutionalInvestorsBuySell',{start_date:recent[0],end_date:latestDate},30000),
        finmind('TaiwanStockMarginPurchaseShortSale',{start_date:latestDate},30000),
        finmind('TaiwanStockMarginPurchaseShortSale',{start_date:previousDate,end_date:previousDate},30000)
      ]);
      const data={},latestInst=new Map();
      for(const r of inst){const symbol=String(r.stock_id||'');if(!validateSymbol(symbol))continue;const prev=latestInst.get(symbol);if(!prev)latestInst.set(symbol,{rows:[r]});else prev.rows.push(r);}
      for(const [symbol,group] of latestInst){const x={asOf:latestDate,foreignNet:0,trustNet:0,dealerNet:0,dealerNet5d:0,institutionalNet:0,foreignNet5d:0,trustNet5d:0,institutionalNet5d:0};for(const r of group.rows){const net=Number(r.buy||0)-Number(r.sell||0);if(!Number.isFinite(net))continue;x.institutionalNet5d+=net;const name=String(r.name||'').toLowerCase();if(name.includes('foreign'))x.foreignNet5d+=net;else if(name.includes('trust')||name.includes('investment'))x.trustNet5d+=net;else if(name.includes('dealer'))x.dealerNet5d+=net;if(String(r.date||'')===latestDate){x.institutionalNet+=net;if(name.includes('dealer'))x.dealerNet+=net;if(name.includes('foreign'))x.foreignNet+=net;else if(name.includes('trust')||name.includes('investment'))x.trustNet+=net;}}data[symbol]=x;}
      const previousBySymbol=new Map(marginPrevious.map(r=>[String(r.stock_id||''),r]));
      for(const r of marginLatest){const symbol=String(r.stock_id||'');if(!validateSymbol(symbol))continue;const prev=previousBySymbol.get(symbol);const x=data[symbol]||{asOf:latestDate};if(prev){x.marginChange=Number(r.MarginPurchaseTodayBalance||0)-Number(prev.MarginPurchaseTodayBalance||0);x.shortChange=Number(r.ShortSaleTodayBalance||0)-Number(prev.ShortSaleTodayBalance||0);}data[symbol]=x;}
      return {data,source:'FinMind five-day institutional flows + daily margin/short-sale data',timestamp:now(),asOf:latestDate};
    },e=>({data:{},source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/futures'){
    const result=await safeLoad('futures',TTL.futures,async()=>{
      if(process.env.MARKET_FUTURES_URL){const x=await external('MARKET_FUTURES_URL','');return {data:x.data||null,source:x.source||'Configured futures provider',timestamp:x.timestamp||now()};}
      if(!FINMIND_TOKEN)throw new Error('未設定 FINMIND_TOKEN 或 MARKET_FUTURES_URL');
      const d=new Date();d.setDate(d.getDate()-14);const startDate=d.toISOString().slice(0,10);
      const rows=await finmind('TaiwanFuturesDaily',{data_id:'TX',start_date:startDate},20000);
      if(!rows.length)throw new Error('FinMind TX 期貨日資料目前無資料');
      const latestDate=rows.map(x=>String(x.date||'')).sort().at(-1);
      const today=rows.filter(x=>String(x.date)===latestDate).sort((a,b)=>Number(b.volume||0)-Number(a.volume||0));
      const latest=today[0],contract=String(latest.contract_date||'');
      const prior=rows.filter(x=>String(x.contract_date||'')===contract&&String(x.date)<latestDate).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
      const last=Number(latest.close),prev=Number(prior?.close);
      return {data:{last:Number.isFinite(last)?last:null,changePct:Number.isFinite(prev)&&prev!==0?(last/prev-1)*100:null,openInterestChange:prior?Number(latest.open_interest||0)-Number(prior.open_interest||0):null,volume:Number(latest.volume||0),contractDate:contract,asOf:latestDate,frequency:'daily'},source:'FinMind TaiwanFuturesDaily（非即時）',timestamp:now()};
    },e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/sentiment'){
    const result=await safeLoad('sentiment',TTL.sentiment,async()=>{
      if(process.env.MARKET_SENTIMENT_URL){const x=await external('MARKET_SENTIMENT_URL','');return {data:x.data||null,source:x.source||'Configured sentiment provider',timestamp:x.timestamp||now()};}
      if(!FINMIND_TOKEN)throw new Error('未設定 FINMIND_TOKEN 或 MARKET_SENTIMENT_URL');
      const d=new Date();d.setDate(d.getDate()-45);const startDate=d.toISOString().slice(0,10);
      const rows=await finmind('CnnFearGreedIndex',{start_date:startDate},15000);
      const latest=rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1);
      if(!latest)throw new Error('FinMind 恐懼貪婪指數目前無資料');
      return {data:{fearGreed:Number(latest.fear_greed),label:latest.fear_greed_emotion,asOf:latest.date},source:'FinMind CnnFearGreedIndex（日資料）',timestamp:now()};
    },e=>({data:null,source:'unavailable',timestamp:now(),error:e.message}));
    return json(res,200,result);
  }
  if(u.pathname==='/api/market/news'){
    const result=await safeLoad('news',TTL.news,async()=>{
      if(process.env.MARKET_NEWS_URL){const x=await external('MARKET_NEWS_URL','');return {data:Array.isArray(x.data)?x.data:[],source:x.source||'Configured licensed news provider',timestamp:x.timestamp||now()};}
      if(!FINMIND_TOKEN)throw new Error('未設定 FINMIND_TOKEN 或 MARKET_NEWS_URL');
      const d=new Date();d.setDate(d.getDate()-3);const startDate=d.toISOString().slice(0,10);
      const rows=await finmind('TaiwanStockNews',{start_date:startDate},20000);
      const data=rows.map(r=>({title:r.title||'',summary:r.description||'',url:r.link||'',source:r.source||'FinMind',publishedAt:r.date||'',symbol:r.stock_id||''})).filter(x=>x.title||x.url).sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,50);
      return {data,source:'FinMind TaiwanStockNews（標題與摘要）',timestamp:now()};
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
