'use strict';
const { indicators } = require('./indicators');
const CACHE=new Map();
const now=()=>new Date().toISOString();
async function getJson(url,timeout=12000){
 const r=await fetch(url,{headers:{accept:'application/json','user-agent':'MarketResearchDashboard/1.0'},signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw new Error('upstream_http_'+r.status);
 return r.json();
}
async function cached(key,ttl,loader){const x=CACHE.get(key);if(x&&Date.now()-x.at<ttl)return x.value;const value=await loader();CACHE.set(key,{at:Date.now(),value});return value;}
async function loadExchange(exchange,base){
 const [info,tickers]=await Promise.all([getJson(base+'/api/v3/exchangeInfo'),getJson(base+'/api/v3/ticker/24hr')]);
 const map=new Map((tickers||[]).map(x=>[x.symbol,x]));
 const markets=(info.symbols||[]).filter(x=>x.status==='TRADING'&&x.isSpotTradingAllowed!==false).map(x=>{
  const q=map.get(x.symbol)||{};
  return {id:exchange+':'+x.symbol,exchange,marketType:'spot',symbol:x.symbol,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset,price:Number(q.lastPrice)||null,changePct:Number(q.priceChangePercent)||null,quoteVolume:Number(q.quoteVolume)||0,high24h:Number(q.highPrice)||null,low24h:Number(q.lowPrice)||null,volume:Number(q.volume)||0,timestamp:q.closeTime?new Date(Number(q.closeTime)).toISOString():null};
 });
 return markets;
}
async function loadFutures(){
 const base='https://fapi.binance.com';
 const [info,tickers]=await Promise.all([getJson(base+'/fapi/v1/exchangeInfo'),getJson(base+'/fapi/v1/ticker/24hr')]);
 const map=new Map((tickers||[]).map(x=>[x.symbol,x]));
 return (info.symbols||[]).filter(x=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT').map(x=>{
  const q=map.get(x.symbol)||{};
  return {id:'Binance Futures:'+x.symbol,exchange:'Binance',marketType:'perpetual',symbol:x.symbol,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset,price:Number(q.lastPrice)||null,changePct:Number(q.priceChangePercent)||null,quoteVolume:Number(q.quoteVolume)||0,high24h:Number(q.highPrice)||null,low24h:Number(q.lowPrice)||null,volume:Number(q.volume)||0,timestamp:q.closeTime?new Date(Number(q.closeTime)).toISOString():null};
 });
}
async function loadMarket(){
 return cached('market',60000,async()=>{
  const results=await Promise.allSettled([loadExchange('Binance','https://api.binance.com'),loadFutures()]);
  const markets=results.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  if(!markets.length)throw new Error('Binance 現貨及 USDT 永續公開市場清單均無法取得');
  markets.sort((a,b)=>b.quoteVolume-a.quoteVolume);
  const failed=results.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||'upstream error'));
  return {markets,summary:{total:markets.length,spot:markets.filter(x=>x.marketType==='spot').length,perpetual:markets.filter(x=>x.marketType==='perpetual').length,exchanges:[...new Set(markets.map(x=>x.exchange))]},source:'Binance 公開交易所 API（現貨 + USDT 永續；非所有全球交易所）',timestamp:now(),errors:failed};
 });
}
async function getHistory(symbol,marketType='spot',interval='1d'){
 const clean=String(symbol||'').toUpperCase();
 if(!/^[A-Z0-9]{2,30}$/.test(clean))throw new Error('invalid_symbol');
 const base=marketType==='perpetual'?'https://fapi.binance.com':'https://api.binance.com';
 return cached('history:'+marketType+':'+clean+':'+interval,300000,async()=>{
  const path=marketType==='perpetual'?'/fapi/v1/klines':'/api/v3/klines';
  const rows=await getJson(base+path+'?'+new URLSearchParams({symbol:clean,interval,limit:'240'}).toString(),15000);
  const candles=(rows||[]).map(x=>({time:new Date(Number(x[0])).toISOString(),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])})).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite));
  if(!candles.length)throw new Error('此市場代號沒有 K 線資料');
  return {symbol:clean,marketType,interval,data:candles,indicators:indicators(candles),asOf:candles.at(-1).time,source:'Binance 公開 K 線 API',timestamp:now()};
 });
}
async function getDerivatives(symbol){
 const [oi,funding,book]=await Promise.allSettled([
  getJson('https://fapi.binance.com/fapi/v1/openInterest?symbol='+encodeURIComponent(symbol)),
  getJson('https://fapi.binance.com/fapi/v1/fundingRate?symbol='+encodeURIComponent(symbol)+'&limit=1'),
  getJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+encodeURIComponent(symbol))
 ]);
 return {openInterest:oi.status==='fulfilled'?Number(oi.value.openInterest):null,fundingRate:funding.status==='fulfilled'?Number(funding.value[0]?.fundingRate):null,markPrice:book.status==='fulfilled'?Number(book.value.markPrice):null,indexPrice:book.status==='fulfilled'?Number(book.value.indexPrice):null,nextFundingTime:book.status==='fulfilled'?book.value.nextFundingTime:null,source:'Binance Futures 公開衍生品 API',timestamp:now(),errors:[oi,funding,book].filter(x=>x.status==='rejected').map(x=>x.reason?.message)};
}
function liquidationMap(price,openInterest,baseAsset){
 if(!(price>0)||!(openInterest>0))return {levels:[],method:'資料不足',note:'缺少未平倉量或標記價格'};
 const notion=price*openInterest;
 const levs=[3,5,10,20,25,50,75,100];
 const levels=levs.flatMap(leverage=>{
  const move=1/leverage;
  return [{side:'long',leverage,price:price*(1-move*0.9),estimatedNotional:notion/leverage*0.9},{side:'short',leverage,price:price*(1+move*0.9),estimatedNotional:notion/leverage*0.9}];
 }).sort((a,b)=>a.price-b.price);
 return {levels,method:'槓桿倍數情境推估',note:'非交易所實際清算價或真實清算委託分布；假設倉位以目前標記價建立，未計維持保證金、手續費、逐倉／全倉與帳戶抵押品差異。',baseAsset};
}
async function loadNews(){
 return cached('news',300000,async()=>{
  const urls=['https://www.coindesk.com/arc/outboundfeeds/rss/','https://cointelegraph.com/rss'];
  const feeds=await Promise.allSettled(urls.map(url=>fetch(url,{headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(10000)})).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text();})));
  const data=[];
  for(let i=0;i<feeds.length;i++)if(feeds[i].status==='fulfilled'){
   const xml=feeds[i].value,items=xml.match(/<item[\s\S]*?<\/item>/g)||[];
   for(const item of items.slice(0,20)){
    const get=tag=>{const m=item.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim():'';};
    const title=get('title'),link=get('link'),date=get('pubDate');
    if(title&&link)data.push({title,link,publishedAt:date,source:i===0?'CoinDesk':'Cointelegraph'});
   }
  }
  return {data:data.sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,30),source:'CoinDesk／Cointelegraph RSS',timestamp:now(),errors:feeds.filter(x=>x.status==='rejected').length};
 });
}
module.exports={loadMarket,getHistory,getDerivatives,liquidationMap,loadNews};
