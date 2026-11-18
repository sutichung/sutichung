'use strict';

const { indicators } = require('./indicators');
const { scoreStock } = require('./scoring');

const STOCKS = [
  ['AAPL','Apple','Technology'],['MSFT','Microsoft','Technology'],['NVDA','NVIDIA','Semiconductors'],
  ['AMZN','Amazon','Consumer'],['GOOGL','Alphabet','Communication'],['META','Meta Platforms','Communication'],
  ['TSLA','Tesla','Automotive'],['AVGO','Broadcom','Semiconductors'],['BRK-B','Berkshire Hathaway','Financials'],
  ['LLY','Eli Lilly','Healthcare'],['JPM','JPMorgan Chase','Financials'],['V','Visa','Financials'],
  ['WMT','Walmart','Consumer'],['MA','Mastercard','Financials'],['XOM','Exxon Mobil','Energy'],
  ['COST','Costco','Consumer'],['ORCL','Oracle','Technology'],['NFLX','Netflix','Communication'],
  ['AMD','AMD','Semiconductors'],['CRM','Salesforce','Technology'],['INTC','Intel','Semiconductors'],
  ['PLTR','Palantir','Technology'],['UBER','Uber','Technology'],['COIN','Coinbase','Financials'],
  ['DIS','Walt Disney','Communication'],['BAC','Bank of America','Financials'],['QQQ','Invesco QQQ ETF','ETF'],
  ['SPY','SPDR S&P 500 ETF','ETF'],['IWM','iShares Russell 2000 ETF','ETF'],['GLD','SPDR Gold Shares','ETF']
];
const INDICES = [['^GSPC','S&P 500'],['^DJI','Dow Jones'],['^IXIC','NASDAQ Composite'],['^VIX','VIX']];
const UA = 'Mozilla/5.0 (compatible; TaiwanStockHunter/1.0; +https://taiwan-stock-hunter-o3tt.onrender.com)';
const allowed = /^[A-Z0-9.^=-]{1,12}$/;

async function getChart(symbol, range='1y', interval='1d') {
  if(!allowed.test(symbol)) throw new Error('invalid_us_symbol');
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({range,interval,events:'div,splits',includePrePost:'false'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':UA,accept:'application/json'}});
    if(!response.ok)throw new Error('Yahoo Finance chart HTTP '+response.status);
    const payload=await response.json(),result=payload?.chart?.result?.[0];
    if(payload?.chart?.error)throw new Error(payload.chart.error.description||'Yahoo chart error');
    if(!result)throw new Error('Yahoo Finance 沒有回傳此代號的行情');
    const meta=result.meta||{},q=result.indicators?.quote?.[0]||{},adj=result.indicators?.adjclose?.[0]?.adjclose||[];
    const candles=(result.timestamp||[]).map((stamp,i)=>{
      const open=Number(q.open?.[i]),high=Number(q.high?.[i]),low=Number(q.low?.[i]),close=Number(q.close?.[i]),rawVolume=q.volume?.[i],volume=rawVolume===null||rawVolume===undefined?NaN:Number(rawVolume);
      if(!Number.isFinite(stamp)||![open,high,low,close].every(Number.isFinite)||![open,high,low,close].every(x=>x>0)||!Number.isFinite(volume)||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))return null;
      return {time:new Date(stamp*1000).toISOString().slice(0,10),timestamp:new Date(stamp*1000).toISOString(),open,high,low,close,adjustedClose:Number.isFinite(Number(adj[i]))&&Number(adj[i])>0?Number(adj[i]):null,volume};
    }).filter(Boolean).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const candleMap=new Map();for(const candle of candles)candleMap.set(candle.time,candle);
    candles.splice(0,candles.length,...candleMap.values());
    const marketTime=Number(meta.regularMarketTime||result.timestamp?.at(-1)||0);
    const timestamp=marketTime?new Date(marketTime*1000).toISOString():null;
    const rawPrice=Number(meta.regularMarketPrice),price=Number.isFinite(rawPrice)&&rawPrice>0?rawPrice:null;
    const rawPrevious=Number(meta.chartPreviousClose??meta.previousClose),previous=Number.isFinite(rawPrevious)&&rawPrevious>0?rawPrevious:null;
    const changePct=price!==null&&previous!==null?(price/previous-1)*100:null;
    const marketState=String(meta.marketState||'UNKNOWN');
    const ageMs=timestamp?Date.now()-Date.parse(timestamp):Infinity;
    const delayed=!timestamp||price===null||!Number.isFinite(ageMs)||ageMs>15*60*1000||ageMs< -60000;
    const rawVolume=q.volume?.at(-1)??meta.regularMarketVolume,volume=rawVolume!==null&&rawVolume!==undefined&&Number.isFinite(Number(rawVolume))&&Number(rawVolume)>=0?Number(rawVolume):null;
    return {symbol,name:STOCKS.find(x=>x[0]===symbol)?.[1]||meta.longName||meta.shortName||symbol,exchange:meta.exchangeName||meta.fullExchangeName||'US',currency:meta.currency||'USD',price,previousClose:previous,changePct,volume,timestamp,sourceTimestamp:timestamp,receivedAt:new Date().toISOString(),marketState,session:marketState,delayed,quoteType:delayed?'stale-or-unavailable':'fresh-timestamped-snapshot',source:'Yahoo Finance Chart（非官方公開端點；供應商延遲狀態未必可驗證）',candles,meta:{fiftyTwoWeekHigh:meta.fiftyTwoWeekHigh,fiftyTwoWeekLow:meta.fiftyTwoWeekLow,exchangeTimezoneName:meta.exchangeTimezoneName}};
  } finally {clearTimeout(timer);}
}

async function searchSymbols(query){
  const q=String(query||'').trim().slice(0,60);
  if(!q) return [];
  const url='https://query1.finance.yahoo.com/v1/finance/search?'+new URLSearchParams({q,quotesCount:'12',newsCount:'0',enableFuzzyQuery:'true'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':UA,accept:'application/json'}});
    if(!response.ok)throw new Error('Yahoo Finance search HTTP '+response.status);
    const payload=await response.json();
    return (payload.quotes||[]).filter(x=>x.symbol&&/EQUITY|ETF/.test(String(x.quoteType||'EQUITY'))).slice(0,12).map(x=>({symbol:String(x.symbol),name:String(x.shortname||x.longname||x.symbol),exchange:String(x.exchange||''),type:String(x.quoteType||'EQUITY')}));
  } finally {clearTimeout(timer);}
}

async function getNews(query='US stock market'){
  const url='https://query1.finance.yahoo.com/v1/finance/search?'+new URLSearchParams({q:query,quotesCount:'0',newsCount:'10'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':UA,accept:'application/json'}});
    if(!response.ok)throw new Error('Yahoo Finance news HTTP '+response.status);
    const payload=await response.json();
    return (payload.news||[]).slice(0,10).map(x=>({title:x.title||'',publisher:x.publisher||'Yahoo Finance',link:x.link||'',publishedAt:x.providerPublishTime?new Date(x.providerPublishTime*1000).toISOString():null,type:x.type||'NEWS'})).filter(x=>x.title&&x.link);
  } finally {clearTimeout(timer);}
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;try{out[i]=await fn(items[i],i);}catch(error){out[i]={error:error.message,symbol:items[i][0]};}}}));
  return out;
}

async function loadMarket(){
  const items=[...STOCKS,...INDICES];
  const rows=await mapLimit(items,3,([symbol])=>getChart(symbol,'1y','1d'));
  const data={},rawData={},indices=[];
  for(let i=0;i<items.length;i++){
    const row=rows[i];if(!row||row.error)continue;
    const {candles,...quoteSummary}=row;rawData[row.symbol]=row;data[row.symbol]=quoteSummary;
    if(INDICES.some(x=>x[0]===row.symbol))indices.push(quoteSummary);
  }
  if(!Object.keys(data).length)throw new Error('美股資料來源暫時無法連線');
  let news=[];try{news=await getNews('US stock market');}catch(_){}
  const scanned=STOCKS.map(([symbol,name,sector])=>{
    const quote=rawData[symbol];if(!quote)return null;
    const {candles,...quoteSummary}=quote;
    const ind=indicators(candles);
    const last=candles.at(-1);
    const scorecard=ind&&last?scoreStock({...ind,signal:ind.macdSignal,asOf:quote.timestamp||last.timestamp,maxAgeMs:5*24*60*60*1000,dailyChangePct:quote.changePct,priceVsEma20Pct:ind.ema20?(last.close/ind.ema20-1)*100:null,priceVsEma60Pct:ind.ema60?(last.close/ind.ema60-1)*100:null,return5dPct:candles.length>=6?(last.close/candles.at(-6).close-1)*100:null,return20dPct:candles.length>=21?(last.close/candles.at(-21).close-1)*100:null}):null;
    return {symbol,name,sector,...quoteSummary,indicators:ind,scorecard};
  }).filter(Boolean);
  const failedSymbols=rows.filter(x=>x&&x.error).map(x=>x.symbol);
  return {data,indices,scan:scanned,news,source:'Yahoo Finance Chart 非官方端點；美股涵蓋清單 30 檔大型股／ETF，不代表全市場',timestamp:new Date().toISOString(),market:'US',coverage:{stocks:scanned.length,universe:STOCKS.length,indices:indices.length,failedSymbols,partial:failedSymbols.length>0||scanned.length<STOCKS.length},disclaimer:'非官方免費端點，可能延遲、限流或中斷；不得作為券商即時報價或下單依據。'};
}


let universeCache={at:0,rows:[],source:null,error:null};
const UNIVERSE_TTL=24*60*60*1000;
async function loadUniverse(force=false){
  if(!force&&universeCache.rows.length&&Date.now()-universeCache.at<UNIVERSE_TTL)return universeCache;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch('https://www.sec.gov/files/company_tickers_exchange.json',{signal:controller.signal,headers:{'User-Agent':'TaiwanStockHunter/1.0 (https://taiwan-stock-hunter-o3tt.onrender.com)','Accept':'application/json'}});
    if(!response.ok)throw new Error('SEC ticker reference HTTP '+response.status);
    const payload=await response.json();
    const fields=payload.fields||[],rows=Array.isArray(payload.data)?payload.data:[];
    const ix={ticker:fields.indexOf('ticker'),name:fields.indexOf('name'),exchange:fields.indexOf('exchange'),cik:fields.indexOf('cik')};
    if(ix.ticker<0||ix.name<0||ix.exchange<0||!rows.length)throw new Error('SEC ticker reference schema changed');
    const seen=new Set(),normalized=[];
    for(const row of rows){
      const symbol=String(row[ix.ticker]||'').trim().toUpperCase(),name=String(row[ix.name]||'').trim(),exchange=String(row[ix.exchange]||'').trim();
      if(!symbol||!name||!exchange||seen.has(symbol)||!(/NASDAQ|NYSE|NYSE AMERICAN|NYSE ARCA|CBOE|BATS|IEX|NYSE NATIONAL/i.test(exchange)))continue;
      if(!/^[A-Z0-9.-]{1,12}$/.test(symbol))continue;
      seen.add(symbol);normalized.push({symbol,name,exchange,cik:String(row[ix.cik]||''),type:'EQUITY',source:'SEC company_tickers_exchange.json'});
    }
    if(!normalized.length)throw new Error('SEC ticker reference returned no eligible symbols');
    normalized.sort((a,b)=>a.symbol.localeCompare(b.symbol));
    universeCache={at:Date.now(),rows:normalized,source:'SEC 官方公司代碼與交易所參考資料',error:null};
    return universeCache;
  }catch(error){
    if(universeCache.rows.length)return {...universeCache,error:'SEC reference refresh failed; serving cached universe: '+error.message};
    universeCache={...universeCache,error:error.message};throw error;
  }finally{clearTimeout(timer);}
}
async function getUniversePage({query='',exchange='',page=1,limit=100}={}){
  const cache=await loadUniverse();
  const q=String(query||'').trim().toLowerCase().slice(0,80),ex=String(exchange||'').trim().toLowerCase();
  const filtered=cache.rows.filter(x=>(!q||(x.symbol+' '+x.name+' '+x.exchange).toLowerCase().includes(q))&&(!ex||x.exchange.toLowerCase().includes(ex)));
  const safeLimit=Math.max(10,Math.min(100,Number(limit)||100)),safePage=Math.max(1,Number(page)||1),start=(safePage-1)*safeLimit;
  return {data:filtered.slice(start,start+safeLimit),page:safePage,limit:safeLimit,total:filtered.length,totalUniverse:cache.rows.length,pages:Math.ceil(filtered.length/safeLimit),source:cache.source,asOf:new Date(cache.at).toISOString(),stale:!!cache.error,error:cache.error||null,coverage:{exchanges:[...new Set(cache.rows.map(x=>x.exchange))].sort()}};
}

module.exports={STOCKS,INDICES,getChart,loadMarket,searchSymbols,getNews,loadUniverse,getUniversePage};
