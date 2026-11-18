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
      const open=Number(q.open?.[i]),high=Number(q.high?.[i]),low=Number(q.low?.[i]),close=Number(q.close?.[i]),volume=Number(q.volume?.[i]||0);
      if(![open,high,low,close].every(Number.isFinite))return null;
      return {time:new Date(stamp*1000).toISOString().slice(0,10),timestamp:new Date(stamp*1000).toISOString(),open,high,low,close,adjustedClose:Number.isFinite(Number(adj[i]))?Number(adj[i]):null,volume:Number.isFinite(volume)?volume:0};
    }).filter(Boolean);
    const marketTime=Number(meta.regularMarketTime||result.timestamp?.at(-1)||0);
    const timestamp=marketTime?new Date(marketTime*1000).toISOString():null;
    const price=Number(meta.regularMarketPrice);
    const previous=Number(meta.chartPreviousClose??meta.previousClose);
    const changePct=Number.isFinite(price)&&Number.isFinite(previous)&&previous>0?(price/previous-1)*100:null;
    const marketState=String(meta.marketState||'UNKNOWN');
    const ageMs=timestamp?Date.now()-Date.parse(timestamp):Infinity;
    const delayed=!timestamp||!Number.isFinite(price)||ageMs>15*60*1000||ageMs< -60000||marketState!=='REGULAR';
    return {symbol,name:STOCKS.find(x=>x[0]===symbol)?.[1]||meta.longName||meta.shortName||symbol,exchange:meta.exchangeName||meta.fullExchangeName||'US',currency:meta.currency||'USD',price:Number.isFinite(price)?price:null,previousClose:Number.isFinite(previous)?previous:null,changePct,volume:Number(q.volume?.at(-1))||Number(meta.regularMarketVolume)||null,timestamp,marketState,delayed,quoteType:delayed?'delayed-or-closed':'timestamped-snapshot',source:'Yahoo Finance Chart（非官方公開端點；可能延遲／限流）',candles,meta:{fiftyTwoWeekHigh:meta.fiftyTwoWeekHigh,fiftyTwoWeekLow:meta.fiftyTwoWeekLow,exchangeTimezoneName:meta.exchangeTimezoneName}};
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
  const data={},indices=[];
  for(let i=0;i<items.length;i++){
    const row=rows[i];if(!row||row.error)continue;
    data[row.symbol]=row;
    if(INDICES.some(x=>x[0]===row.symbol))indices.push(row);
  }
  if(!Object.keys(data).length)throw new Error('美股資料來源暫時無法連線');
  let news=[];try{news=await getNews('US stock market');}catch(_){}
  const scanned=STOCKS.map(([symbol,name,sector])=>{
    const quote=data[symbol];if(!quote)return null;
    const ind=indicators(quote.candles);
    const last=quote.candles.at(-1);
    const scorecard=ind&&last?scoreStock({...ind,asOf:quote.timestamp||last.timestamp,maxAgeMs:5*24*60*60*1000,dailyChangePct:quote.changePct,priceVsEma20Pct:ind.ema20?(last.close/ind.ema20-1)*100:null,priceVsEma60Pct:ind.ema60?(last.close/ind.ema60-1)*100:null,return5dPct:quote.candles.length>=6?(last.close/quote.candles.at(-6).close-1)*100:null,return20dPct:quote.candles.length>=21?(last.close/quote.candles.at(-21).close-1)*100:null}):null;
    return {symbol,name,sector,...quote,indicators:ind,scorecard};
  }).filter(Boolean);
  return {data,indices,scan:scanned,news,source:'Yahoo Finance Chart 非官方端點；美股涵蓋清單 30 檔大型股／ETF，不代表全市場',timestamp:new Date().toISOString(),market:'US',coverage:{stocks:scanned.length,universe:STOCKS.length,indices:indices.length},disclaimer:'非官方免費端點，可能延遲、限流或中斷；不得作為券商即時報價或下單依據。'};
}

module.exports={STOCKS,INDICES,getChart,loadMarket,searchSymbols,getNews};
