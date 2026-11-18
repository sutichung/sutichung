'use strict';
const { indicators } = require('./indicators');
const { createAsyncCache } = require('./market-cache');
const marketCache=createAsyncCache({maxEntries:500});
const now=()=>new Date().toISOString();
async function getJson(url,timeout=14000){
 const r=await fetch(url,{headers:{accept:'application/json','user-agent':'TaiwanStockHunter/1.0'},signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw new Error('HTTP '+r.status+' '+url);
 return r.json();
}
async function cached(key,ttl,loader){return marketCache.get(key,ttl,loader);}
const n=v=>Number.isFinite(Number(v))?Number(v):null;
function row(exchange,marketType,symbol,baseAsset,quoteAsset,price,changePct,quoteVolume,extra={}){const p=n(price);if(!(p>0))return null;return {id:exchange+':'+marketType+':'+symbol,exchange,marketType,symbol,baseAsset,quoteAsset,price:p,changePct:n(changePct),quoteVolume:n(quoteVolume)||0,high24h:n(extra.high24h),low24h:n(extra.low24h),volume:n(extra.volume),timestamp:extra.timestamp||now(),sourceTimestamp:extra.sourceTimestamp||null,nativeSymbol:extra.nativeSymbol||symbol,nativeType:extra.nativeType||marketType};}
async function mapLimit(items,limit,worker){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;try{out[i]=await worker(items[i],i);}catch(_){out[i]=null;}}}));return out;}
async function binanceMarkets(){
 const jobs=await Promise.allSettled([getJson('https://api.binance.com/api/v3/exchangeInfo'),getJson('https://api.binance.com/api/v3/ticker/24hr'),getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),getJson('https://fapi.binance.com/fapi/v1/ticker/24hr')]);
 const [si,st,fi,ft]=jobs.map(x=>x.status==='fulfilled'?x.value:null);
 const out=[];
 if(si&&st){const sm=new Map(st.map(x=>[x.symbol,x]));out.push(...si.symbols.filter(x=>x.status==='TRADING'&&x.isSpotTradingAllowed!==false).map(x=>{const q=sm.get(x.symbol)||{};return row('Binance','spot',x.symbol,x.baseAsset,x.quoteAsset,q.lastPrice,q.priceChangePercent,q.quoteVolume,{high24h:q.highPrice,low24h:q.lowPrice,volume:q.volume});}));}
 if(fi&&ft){const fm=new Map(ft.map(x=>[x.symbol,x]));out.push(...fi.symbols.filter(x=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT').map(x=>{const q=fm.get(x.symbol)||{};return row('Binance','perpetual',x.symbol,x.baseAsset,x.quoteAsset,q.lastPrice,q.priceChangePercent,q.quoteVolume,{high24h:q.highPrice,low24h:q.lowPrice,volume:q.volume});}));}
 const valid=out.filter(Boolean);if(!valid.length)throw new Error(jobs.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Binance API error').join('; ')||'Binance 未回傳有效報價');return valid;
}
async function bybitCategory(category){
 let cursor='',items=[];
 for(let page=0;page<8;page++){
  const q=new URLSearchParams({category,limit:'1000'});if(cursor)q.set('cursor',cursor);
  const x=await getJson('https://api.bybit.com/v5/market/instruments-info?'+q);
  if(x.retCode!==0)throw new Error(x.retMsg||'Bybit instruments error');
  items.push(...(x.result?.list||[]));cursor=x.result?.nextPageCursor||'';if(!cursor)break;
 }
 const t=await getJson('https://api.bybit.com/v5/market/tickers?category='+category);
 if(t.retCode!==0)throw new Error(t.retMsg||'Bybit tickers error');
 const map=new Map((t.result?.list||[]).map(x=>[x.symbol,x]));
 return items.filter(x=>x.status==='Trading').map(x=>{const q=map.get(x.symbol)||{};return row('Bybit',category==='spot'?'spot':'perpetual',x.symbol,x.baseCoin,x.quoteCoin,q.lastPrice,Number(q.price24hPcnt)*100,q.turnover24h,{high24h:q.highPrice24h,low24h:q.lowPrice24h,volume:q.volume24h,nativeSymbol:x.symbol,nativeType:category});});
}
async function bybitMarkets(){const r=await Promise.allSettled([bybitCategory('spot'),bybitCategory('linear')]);const out=r.flatMap(x=>x.status==='fulfilled'?x.value:[]);if(!out.length)throw new Error(r.filter(x=>x.status==='rejected').map(x=>x.reason.message).join('; '));return out;}
async function okxCategory(instType,marketType){
 const [ins,ticks]=await Promise.all([getJson('https://www.okx.com/api/v5/public/instruments?instType='+instType),getJson('https://www.okx.com/api/v5/market/tickers?instType='+instType)]);
 if(ins.code!=='0'||ticks.code!=='0')throw new Error('OKX public API error');
 const map=new Map(ticks.data.map(x=>[x.instId,x]));
 return ins.data.filter(x=>x.state==='live').map(x=>{const q=map.get(x.instId)||{};const base=x.ctValCcy||x.baseCcy||x.instId.split('-')[0],quote=x.settleCcy||x.quoteCcy||'USDT';return row('OKX',marketType,x.instId.replace(/-/g,''),base,quote,q.last,Number(q.open24h)>0?(Number(q.last)/Number(q.open24h)-1)*100:null,q.volCcyQuote||q.volCcy24h,{high24h:q.high24h,low24h:q.low24h,volume:q.vol24h,nativeSymbol:x.instId,nativeType:instType});});
}
async function okxMarkets(){const r=await Promise.allSettled([okxCategory('SPOT','spot'),okxCategory('SWAP','perpetual')]);const out=r.flatMap(x=>x.status==='fulfilled'?x.value:[]);if(!out.length)throw new Error(r.filter(x=>x.status==='rejected').map(x=>x.reason.message).join('; '));return out;}
async function coinbaseMarkets(){
 const products=await getJson('https://api.exchange.coinbase.com/products');
 const active=products.filter(x=>x.status==='online'&&!x.trading_disabled);
 const top=active.slice(0,100);
 const quotes=await mapLimit(top,6,async product=>getJson('https://api.exchange.coinbase.com/products/'+encodeURIComponent(product.id)+'/ticker',9000));
 return top.map((x,i)=>{const q=quotes[i]||{};const price=n(q.price),baseVolume=n(q.volume),sourceTimestamp=q.time&&Number.isFinite(Date.parse(q.time))?new Date(q.time).toISOString():null;return row('Coinbase','spot',x.id.replace('-',''),x.base_currency,x.quote_currency,price,null,price!==null&&baseVolume!==null?price*baseVolume:0,{volume:baseVolume,sourceTimestamp,nativeSymbol:x.id,nativeType:'spot'});}).filter(Boolean);
}
async function krakenMarkets(){
 const pairs=await getJson('https://api.kraken.com/0/public/AssetPairs');
 if(pairs.error?.length)throw new Error(pairs.error.join(','));
 const entries=Object.entries(pairs.result||{}).filter(([k,x])=>x.status==='online'&&x.wsname&&x.wsname.includes('/'));
 const shortlist=entries.slice(0,100),names=shortlist.map(([k,x])=>x.altname||k);
 const tick=await getJson('https://api.kraken.com/0/public/Ticker?pair='+encodeURIComponent(names.join(',')));
 if(tick.error?.length)throw new Error(tick.error.join(','));
 const tmap=tick.result||{};
 return shortlist.map(([key,x])=>{const base=(x.wsname.split('/')[0]||'').replace(/^XBT$/,'BTC'),quote=(x.wsname.split('/')[1]||'').replace(/^XBT$/,'BTC'),native=x.altname||key,q=tmap[native]||tmap[key]||{};return row('Kraken','spot',(base+quote).replace(/[^A-Z0-9]/g,''),base,quote,q.c?.[0],q.o&&Number(q.o)>0?(Number(q.c?.[0])/Number(q.o)-1)*100:null,Number(q.v?.[1])&&Number(q.c?.[0])?Number(q.v[1])*Number(q.c[0]):0,{high24h:q.h?.[1],low24h:q.l?.[1],volume:q.v?.[1],nativeSymbol:native,nativeType:'spot'});}).filter(Boolean);
}
async function loadMarket(){
 return cached('market-multi',60000,async()=>{
  const jobs=[['Binance',binanceMarkets],['Bybit',bybitMarkets],['OKX',okxMarkets],['Coinbase',coinbaseMarkets],['Kraken',krakenMarkets]];
  const settled=await Promise.allSettled(jobs.map(x=>x[1]()));
  const markets=settled.flatMap((x)=>x.status==='fulfilled'?x.value:[]).filter(x=>x&&Number.isFinite(x.price)&&x.price>0);
  if(!markets.length)throw new Error('所有交易所公開市場 API 均無法連線');
  const exchanges=jobs.map((j,i)=>{const count=settled[i].status==='fulfilled'?settled[i].value.filter(x=>x&&x.price>0).length:0;return {name:j[0],status:count?'connected':'unavailable',markets:count,error:count?null:settled[i].status==='rejected'?String(settled[i].reason?.message||'API error'):'上游未回傳有效價格'};});
  markets.sort((a,b)=>b.quoteVolume-a.quoteVolume);
  return {markets,summary:{total:markets.length,spot:markets.filter(x=>x.marketType==='spot').length,perpetual:markets.filter(x=>x.marketType==='perpetual').length,exchanges:exchanges.filter(x=>x.status==='connected').map(x=>x.name)},exchanges,source:'Binance／Bybit／OKX／Coinbase／Kraken 公開市場 API；各交易所涵蓋商品依公開清單',timestamp:now()};
 });
}
function normalizeKlines(rows,exchange){
 let candles=[];
 if(exchange==='Bybit')candles=rows.map(x=>({time:new Date(Number(x[0])).toISOString(),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));
 if(exchange==='OKX')candles=rows.map(x=>({time:new Date(Number(x[0])).toISOString(),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));
 if(exchange==='Coinbase')candles=rows.map(x=>({time:new Date(Number(x[0])*1000).toISOString(),low:+x[1],high:+x[2],open:+x[3],close:+x[4],volume:+x[5]}));
 if(exchange==='Kraken')candles=rows.map(x=>({time:new Date(Number(x[0])*1000).toISOString(),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[6]}));
 if(exchange==='Binance')candles=rows.map(x=>({time:new Date(Number(x[0])).toISOString(),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));
 return candles.filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}
async function getHistory(symbol,marketType='spot',interval='1d',exchange='Binance',nativeSymbol=''){
 const clean=String(nativeSymbol||symbol||'').toUpperCase();
 return cached('history:'+exchange+':'+marketType+':'+clean+':'+interval,300000,async()=>{
  let rows=[],source=exchange+' public candles';
  const iv=interval==='1d'?'1d':interval;
  if(exchange==='Binance'){const base=marketType==='perpetual'?'https://fapi.binance.com':'https://api.binance.com',path=marketType==='perpetual'?'/fapi/v1/klines':'/api/v3/klines';rows=await getJson(base+path+'?'+new URLSearchParams({symbol:clean,interval:iv,limit:'240'}));}
  else if(exchange==='Bybit'){const category=marketType==='perpetual'?'linear':'spot',intervalMap={'1d':'D','1h':'60','4h':'240','15m':'15'};const x=await getJson('https://api.bybit.com/v5/market/kline?'+new URLSearchParams({category,symbol:clean,interval:intervalMap[iv]||'D',limit:'240'}));if(x.retCode!==0)throw new Error(x.retMsg);rows=x.result.list;}
  else if(exchange==='OKX'){const inst=clean.includes('-')?clean:clean.replace(/(USDT|USDC|USD)$/,'-$1')+(marketType==='perpetual'?'-SWAP':'');const x=await getJson('https://www.okx.com/api/v5/market/candles?'+new URLSearchParams({instId:inst,bar:iv==='1d'?'1D':iv,limit:'240'}));if(x.code!=='0')throw new Error(x.msg);rows=x.data;}
  else if(exchange==='Coinbase'){const product=clean.includes('-')?clean:clean.replace(/(USDT|USDC|USD)$/,'-$1');rows=await getJson('https://api.exchange.coinbase.com/products/'+encodeURIComponent(product)+'/candles?granularity=86400');}
  else if(exchange==='Kraken'){const x=await getJson('https://api.kraken.com/0/public/OHLC?'+new URLSearchParams({pair:clean,interval:'1440'}));if(x.error?.length)throw new Error(x.error.join(','));const key=Object.keys(x.result||{}).find(k=>k!=='last');rows=x.result?.[key]||[];}
  const candles=normalizeKlines(rows,exchange);
  if(!candles.length)throw new Error(exchange+' 此市場沒有可用 K 線');
  return {symbol,marketType,exchange,interval,data:candles,indicators:indicators(candles),asOf:candles.at(-1).time,source,timestamp:now()};
 });
}
async function ratioFor(exchange,base){
 try{
  if(exchange==='Binance'){const x=await getJson('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol='+base+'USDT&period=1h&limit=1');const q=x[0];return q?{exchange,longPct:Number(q.longAccount)*100,shortPct:Number(q.shortAccount)*100,ratio:Number(q.longShortRatio),source:'Binance global account ratio'}:null;}
  if(exchange==='Bybit'){const x=await getJson('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol='+base+'USDT&period=1h&limit=1');const q=x.result?.list?.[0];return q?{exchange,longPct:Number(q.buyRatio)*100,shortPct:Number(q.sellRatio)*100,ratio:Number(q.buyRatio)/Number(q.sellRatio),source:'Bybit account ratio'}:null;}
  if(exchange==='OKX'){const x=await getJson('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy='+base+'&period=1H');const q=x.data?.[0];return q?{exchange,longPct:Number(q[1])/(1+Number(q[1]))*100,shortPct:100-Number(q[1])/(1+Number(q[1]))*100,ratio:Number(q[1]),source:'OKX contracts long/short ratio'}:null;}
 }catch(e){return {exchange,error:e.message};}
 return {exchange,unavailable:true};
}
async function getDerivatives(symbol,exchange='Binance',nativeSymbol=''){
 const base=String(symbol).toUpperCase().replace(/(USDT|USDC|USD)$/,'');
 const [battle,binance,binanceOi,bybit,okx]=await Promise.all([
  Promise.all(['Binance','Bybit','OKX'].map(x=>ratioFor(x,base))),
  getJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+base+'USDT').catch(()=>null),
  getJson('https://fapi.binance.com/fapi/v1/openInterest?symbol='+base+'USDT').catch(()=>null),
  getJson('https://api.bybit.com/v5/market/tickers?category=linear&symbol='+base+'USDT').catch(()=>null),
  getJson('https://www.okx.com/api/v5/market/ticker?instId='+base+'-USDT-SWAP').catch(()=>null)
 ]);
 const bq=bybit?.result?.list?.[0],oq=okx?.data?.[0];
 const rows=[
  {exchange:'Binance',fundingRate:n(binance?.lastFundingRate),markPrice:n(binance?.markPrice),openInterest:n(binanceOi?.openInterest)},
  {exchange:'Bybit',fundingRate:n(bq?.fundingRate),markPrice:n(bq?.markPrice),openInterest:n(bq?.openInterest)},
  {exchange:'OKX',fundingRate:n(oq?.fundingRate),markPrice:n(oq?.last),openInterest:n(oq?.oi)}
 ];
 const ratios=battle.filter(x=>x&&Number.isFinite(x.longPct)&&Number.isFinite(x.shortPct));
 const longPct=ratios.length?ratios.reduce((s,x)=>s+x.longPct,0)/ratios.length:null;
 const selected=rows.find(x=>x.exchange===exchange)||rows[0];
 return {exchange,openInterest:selected?.openInterest??null,fundingRate:selected?.fundingRate??null,markPrice:selected?.markPrice??null,indexPrice:n(binance?.indexPrice),source:'各交易所公開衍生品 API',timestamp:now(),battle:{exchanges:battle,validExchanges:ratios.length,longPct,shortPct:longPct===null?null:100-longPct,stance:longPct===null?'資料不足':longPct>55?'多方佔優':longPct<45?'空方佔優':'多空拉鋸'},liquidationMap:liquidationMap(selected?.markPrice,selected?.openInterest,base)};
}
function liquidationMap(price,openInterest,baseAsset){
 if(!(price>0)||!(openInterest>0))return {levels:[],method:'資料不足',note:'缺少未平倉量或標記價格'};
 const notion=price*openInterest,levs=[3,5,10,20,25,50,75,100];
 const levels=levs.flatMap(leverage=>{const move=1/leverage;return [{side:'long',leverage,price:price*(1-move*0.9),estimatedNotional:notion/leverage*0.9},{side:'short',leverage,price:price*(1+move*0.9),estimatedNotional:notion/leverage*0.9}];}).sort((a,b)=>a.price-b.price);
 return {levels,method:'槓桿倍數情境推估',note:'非交易所實際清算價或真實清算委託分布；未計維持保證金、手續費、逐倉／全倉及帳戶抵押品差異。',baseAsset};
}
async function loadNews(){
 return cached('news',300000,async()=>{
  const urls=['https://www.coindesk.com/arc/outboundfeeds/rss/','https://cointelegraph.com/rss'];
  const feeds=await Promise.allSettled(urls.map(url=>fetch(url,{headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text();})));
  const data=[];
  for(let i=0;i<feeds.length;i++)if(feeds[i].status==='fulfilled'){const xml=feeds[i].value,items=xml.match(/<item[\s\S]*?<\/item>/g)||[];for(const item of items.slice(0,20)){const get=tag=>{const m=item.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim():'';};const title=get('title'),link=get('link'),date=get('pubDate');if(title&&link)data.push({title,link,publishedAt:date,source:i===0?'CoinDesk':'Cointelegraph'});}}
  return {data:data.sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,30),source:'CoinDesk／Cointelegraph RSS',timestamp:now(),errors:feeds.filter(x=>x.status==='rejected').length};
 });
}
module.exports={loadMarket,getHistory,getDerivatives,liquidationMap,loadNews,buildQuoteRow:row,mapLimit};
