'use strict';
const { indicators } = require('./indicators');
const { createAsyncCache } = require('./market-cache');
const { isMarketDataLicensed, requireMarketDataLicense } = require('./market-data-license');
const { CryptoLiveScorer } = require('./crypto-live-scorer');
const liveScorer = new CryptoLiveScorer();
const marketCache=createAsyncCache({maxEntries:500});
const now=()=>new Date().toISOString();
async function getJson(url,timeout=14000){
 const r=await fetch(url,{headers:{accept:'application/json','user-agent':'TaiwanStockHunter/1.0'},signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw new Error('HTTP '+r.status+' '+url);
 return r.json();
}
async function getJsonFallback(urls,timeout=14000){
 const errors=[];
 for(const url of urls){
  try{return {data:await getJson(url,timeout),base:new URL(url).origin};}
  catch(error){errors.push(String(error.message||error));}
 }
 throw new Error(errors.join('; ')||'all_official_endpoints_unavailable');
}
async function cached(key,ttl,loader){return marketCache.get(key,ttl,loader);}
const n=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
function row(exchange,marketType,symbol,baseAsset,quoteAsset,price,changePct,quoteVolume,extra={}){const p=n(price);if(!(p>0))return null;const sourceTimestamp=extra.sourceTimestamp&&Number.isFinite(Date.parse(extra.sourceTimestamp))?new Date(extra.sourceTimestamp).toISOString():null;const sourceTimeMs=sourceTimestamp?Date.parse(sourceTimestamp):NaN;const sourceAgeMs=Number.isFinite(sourceTimeMs)?Date.now()-sourceTimeMs:null;const freshnessStatus=sourceAgeMs===null?'unverified':sourceAgeMs>300000||sourceAgeMs< -60000?'stale':'fresh';return {id:exchange+':'+marketType+':'+symbol,exchange,marketType,symbol,baseAsset,quoteAsset,price:p,changePct:n(changePct),quoteVolume:n(quoteVolume),high24h:n(extra.high24h),low24h:n(extra.low24h),volume:n(extra.volume),timestamp:sourceTimestamp,sourceTimestamp,sourceAgeMs,freshnessStatus,signalEligible:freshnessStatus==='fresh',delayed:freshnessStatus!=='fresh',receivedAt:now(),nativeSymbol:extra.nativeSymbol||symbol,nativeType:extra.nativeType||marketType,endpointBase:extra.endpointBase||null};}
async function mapLimit(items,limit,worker){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;try{out[i]=await worker(items[i],i);}catch(_){out[i]=null;}}}));return out;}
async function binanceMarkets(){
 requireMarketDataLicense('Binance');
 const spotBases=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com','https://api4.binance.com'];
 const spotInfoUrls=spotBases.map(base=>base+'/api/v3/exchangeInfo');
 const spotTickerUrls=spotBases.map(base=>base+'/api/v3/ticker/24hr');
 const jobs=await Promise.allSettled([getJsonFallback(spotInfoUrls),getJsonFallback(spotTickerUrls),getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),getJson('https://fapi.binance.com/fapi/v1/ticker/24hr')]);
 const [spotInfo,spotTicker,fi,ft]=jobs.map(x=>x.status==='fulfilled'?x.value:null);
 const si=spotInfo?.data,st=spotTicker?.data,out=[];
 if(si&&st){const sm=new Map(st.map(x=>[x.symbol,x]));out.push(...si.symbols.filter(x=>x.status==='TRADING'&&x.isSpotTradingAllowed!==false).map(x=>{const q=sm.get(x.symbol)||{};return row('Binance','spot',x.symbol,x.baseAsset,x.quoteAsset,q.lastPrice,q.priceChangePercent,q.quoteVolume,{high24h:q.highPrice,low24h:q.lowPrice,volume:q.volume,sourceTimestamp:timestampIso(q.closeTime),endpointBase:spotInfo.base});}));}
 if(fi&&ft){const fm=new Map(ft.map(x=>[x.symbol,x]));out.push(...fi.symbols.filter(x=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT').map(x=>{const q=fm.get(x.symbol)||{};return row('Binance','perpetual',x.symbol,x.baseAsset,x.quoteAsset,q.lastPrice,q.priceChangePercent,q.quoteVolume,{high24h:q.highPrice,low24h:q.lowPrice,volume:q.volume,sourceTimestamp:timestampIso(q.closeTime),endpointBase:'https://fapi.binance.com'});}));}
 const valid=out.filter(Boolean);if(!valid.length)throw new Error(jobs.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Binance API error').join('; ')||'Binance 未回傳有效報價');return valid;
}
async function bybitCategory(category){
 let cursor='',items=[];
 for(let page=0;page<8;page++){
  const q=new URLSearchParams({category,limit:'1000'});if(cursor)q.set('cursor',cursor);
  const result=await getJsonFallback(['https://api.bybit.com','https://api.bytick.com'].map(base=>base+'/v5/market/instruments-info?'+q));
  const x=result.data;if(x.retCode!==0)throw new Error(x.retMsg||'Bybit instruments error');
  items.push(...(x.result?.list||[]));cursor=x.result?.nextPageCursor||'';if(!cursor)break;
 }
 const tickerResult=await getJsonFallback(['https://api.bybit.com','https://api.bytick.com'].map(base=>base+'/v5/market/tickers?category='+category));
 const t=tickerResult.data;if(t.retCode!==0)throw new Error(t.retMsg||'Bybit tickers error');
 const map=new Map((t.result?.list||[]).map(x=>[x.symbol,x]));
 return items.filter(x=>x.status==='Trading').map(x=>{const q=map.get(x.symbol)||{};return row('Bybit',category==='spot'?'spot':'perpetual',x.symbol,x.baseCoin,x.quoteCoin,q.lastPrice,Number(q.price24hPcnt)*100,q.turnover24h,{high24h:q.highPrice24h,low24h:q.lowPrice24h,volume:q.volume24h,sourceTimestamp:timestampIso(t.time),nativeSymbol:x.symbol,nativeType:category});});
}
async function bybitMarkets(){
 requireMarketDataLicense('Bybit');const r=await Promise.allSettled([bybitCategory('spot'),bybitCategory('linear')]);const out=r.flatMap(x=>x.status==='fulfilled'?x.value:[]);if(!out.length)throw new Error(r.filter(x=>x.status==='rejected').map(x=>x.reason.message).join('; '));return out;}
async function okxCategory(instType,marketType){
 const [ins,ticks]=await Promise.all([getJson('https://www.okx.com/api/v5/public/instruments?instType='+instType),getJson('https://www.okx.com/api/v5/market/tickers?instType='+instType)]);
 if(ins.code!=='0'||ticks.code!=='0')throw new Error('OKX public API error');
 const map=new Map(ticks.data.map(x=>[x.instId,x]));
 return ins.data.filter(x=>x.state==='live').map(x=>{const q=map.get(x.instId)||{};const base=x.ctValCcy||x.baseCcy||x.instId.split('-')[0],quote=x.settleCcy||x.quoteCcy||'USDT';return row('OKX',marketType,x.instId.replace(/-/g,''),base,quote,q.last,Number(q.open24h)>0?(Number(q.last)/Number(q.open24h)-1)*100:null,q.volCcyQuote||q.volCcy24h,{high24h:q.high24h,low24h:q.low24h,volume:q.vol24h,sourceTimestamp:timestampIso(q.ts),nativeSymbol:x.instId,nativeType:instType});});
}
async function okxMarkets(){requireMarketDataLicense('OKX');const r=await Promise.allSettled([okxCategory('SPOT','spot'),okxCategory('SWAP','perpetual')]);const out=r.flatMap(x=>x.status==='fulfilled'?x.value:[]);if(!out.length)throw new Error(r.filter(x=>x.status==='rejected').map(x=>x.reason.message).join('; '));return out;}
async function coinbaseMarkets(){
 requireMarketDataLicense('Coinbase');
 const products=await getJson('https://api.exchange.coinbase.com/products');
 const active=products.filter(x=>x.status==='online'&&!x.trading_disabled);
 const top=active.slice(0,100);
 const quotes=await mapLimit(top,6,async product=>getJson('https://api.exchange.coinbase.com/products/'+encodeURIComponent(product.id)+'/ticker',9000));
 return top.map((x,i)=>{const q=quotes[i]||{};const price=n(q.price),baseVolume=n(q.volume),sourceTimestamp=q.time&&Number.isFinite(Date.parse(q.time))?new Date(q.time).toISOString():null;return row('Coinbase','spot',x.id.replace('-',''),x.base_currency,x.quote_currency,price,null,price!==null&&baseVolume!==null?price*baseVolume:null,{volume:baseVolume,sourceTimestamp,nativeSymbol:x.id,nativeType:'spot'});}).filter(Boolean);
}
async function krakenMarkets(){
 requireMarketDataLicense('Kraken');
 const pairs=await getJson('https://api.kraken.com/0/public/AssetPairs');
 if(pairs.error?.length)throw new Error(pairs.error.join(','));
 const entries=Object.entries(pairs.result||{}).filter(([k,x])=>x.status==='online'&&x.wsname&&x.wsname.includes('/'));
 const shortlist=entries.slice(0,100),names=shortlist.map(([k,x])=>x.altname||k);
 const tick=await getJson('https://api.kraken.com/0/public/Ticker?pair='+encodeURIComponent(names.join(',')));
 if(tick.error?.length)throw new Error(tick.error.join(','));
 const tmap=tick.result||{};
 return shortlist.map(([key,x])=>{const base=(x.wsname.split('/')[0]||'').replace(/^XBT$/,'BTC'),quote=(x.wsname.split('/')[1]||'').replace(/^XBT$/,'BTC'),native=x.altname||key,q=tmap[native]||tmap[key]||{},last=n(q.c?.[0]),baseVolume=n(q.v?.[1]),quoteVolume=last!==null&&baseVolume!==null?last*baseVolume:null;return row('Kraken','spot',(base+quote).replace(/[^A-Z0-9]/g,''),base,quote,last,q.o&&Number(q.o)>0?(last/Number(q.o)-1)*100:null,quoteVolume,{high24h:q.h?.[1],low24h:q.l?.[1],volume:baseVolume,nativeSymbol:native,nativeType:'spot'});}).filter(Boolean);
}
async function loadMarket(){
 return cached('market-multi',15000,async()=>{
  const jobs=[['Binance',binanceMarkets],['Bybit',bybitMarkets],['OKX',okxMarkets],['Coinbase',coinbaseMarkets],['Kraken',krakenMarkets]];
  const settled=await Promise.allSettled(jobs.map(async([name,loader])=>{const started=Date.now();const data=await loader();return {data,updatedAt:now(),latencyMs:Date.now()-started};}));
  const markets=settled.flatMap(x=>x.status==='fulfilled'?x.value.data:[]).filter(x=>x&&Number.isFinite(x.price)&&x.price>0);
  
  const coverageNotes={Binance:'公開現貨與 USDT 永續商品清單；不含所有交易所衍生商品類型',Bybit:'商品清單最多讀取 8 頁、每頁最多 1,000 筆；若尚有 nextPageCursor，結果可能截斷',OKX:'讀取公開 SPOT 與 SWAP 商品清單',Coinbase:'目前僅掃描商品清單前 100 個可交易產品，非全商品覆蓋',Kraken:'目前僅掃描商品清單前 100 個可交易交易對，非全商品覆蓋'};
  const exchanges=jobs.map((j,i)=>{const result=settled[i].status==='fulfilled'?settled[i].value:null;const rows=result?.data||[];const count=rows.filter(x=>x&&x.price>0).length;return {name:j[0],status:count?'connected':String(settled[i].reason?.message||'').startsWith('market_data_license_required:')?'not_configured':'unavailable',markets:count,updatedAt:result?.updatedAt||null,latencyMs:result?.latencyMs??null,quoteMode:'REST snapshot polling',sourceTimestampCount:rows.filter(x=>x.sourceTimestamp).length,freshQuoteCount:rows.filter(x=>x.freshnessStatus==='fresh').length,staleQuoteCount:rows.filter(x=>x.freshnessStatus==='stale').length,unverifiedQuoteCount:rows.filter(x=>x.freshnessStatus==='unverified').length,coverageNote:coverageNotes[j[0]],error:count?null:settled[i].status==='rejected'?String(settled[i].reason?.message||'API error'):'上游未回傳有效價格'};});
  // REST snapshots feed the same validated scorer interface used by a future WebSocket adapter.
  // Only source-timestamp-verified updates can produce an eligible live score.
  for (const market of markets) {
   const sourceMs = market.sourceTimestamp ? Date.parse(market.sourceTimestamp) : NaN;
   market.liveSignal = Number.isFinite(sourceMs) && market.freshnessStatus === 'fresh'
    ? liveScorer.update({
      exchange: market.exchange, marketType: market.marketType, symbol: market.symbol,
      timestamp: sourceMs, last: market.price, bid: market.bid, ask: market.ask,
      changePct: market.changePct, quoteVolume: market.quoteVolume
     })
    : { eligible: false, status: 'unverified_source_time', score: null, reasons: ['缺少可驗證的即時來源時間戳'] };
  }
  markets.sort((a,b)=>b.quoteVolume-a.quoteVolume);
  const receivedAt=now(),sourceTimestampCount=markets.filter(x=>x.sourceTimestamp).length,freshQuoteCount=markets.filter(x=>x.freshnessStatus==='fresh').length,staleQuoteCount=markets.filter(x=>x.freshnessStatus==='stale').length,unverifiedQuoteCount=markets.filter(x=>x.freshnessStatus==='unverified').length;
  return {markets,status:markets.length?'ok':exchanges.every(x=>x.status==='not_configured')?'license_required':'degraded',licenseRequiredProviders:exchanges.filter(x=>x.status==='not_configured').map(x=>x.name),summary:{total:markets.length,spot:markets.filter(x=>x.marketType==='spot').length,perpetual:markets.filter(x=>x.marketType==='perpetual').length,exchanges:exchanges.filter(x=>x.status==='connected').map(x=>x.name),connectedExchangeCount:exchanges.filter(x=>x.status==='connected').length,sourceTimestampCount,sourceTimestampCoveragePct:markets.length?Math.round(sourceTimestampCount/markets.length*100):0,freshQuoteCount,staleQuoteCount,unverifiedQuoteCount},exchanges,coverage:{scope:'僅涵蓋下列五家交易所公開 API 可取得的商品；不代表全世界所有交易所或所有商品',partialProviders:exchanges.filter(x=>x.coverageNote).map(x=>x.name),timestampLimit:'來源時間戳依交易所欄位可能是最後成交或回應時間；超過 5 分鐘標示過期，缺少時間戳標示未驗證'},source:markets.length?'已授權交易所各自行情 API；價格不跨交易所混合':'未取得交易所會員展示／再分發書面授權，未啟用加密貨幣行情',quoteMode:'REST snapshot polling；非 WebSocket 逐筆推送',refreshIntervalMs:15000,receivedAt,timestamp:null};
 });
}
function timestampIso(value,multiplier=1){
 if(value===null||value===undefined||value==='')return null;
 const ms=Number(value)*multiplier;
 return Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():null;
}
function normalizeKlines(rows,exchange,interval='1d',asOf=Date.now(),includeCurrent=false){
 let candles=[];
 if(exchange==='Bybit')candles=rows.map(x=>({time:timestampIso(x[0]),open:n(x[1]),high:n(x[2]),low:n(x[3]),close:n(x[4]),volume:n(x[5])}));
 if(exchange==='OKX')candles=rows.map(x=>({time:timestampIso(x[0]),open:n(x[1]),high:n(x[2]),low:n(x[3]),close:n(x[4]),volume:n(x[5])}));
 if(exchange==='Coinbase')candles=rows.map(x=>({time:timestampIso(x[0],1000),low:n(x[1]),high:n(x[2]),open:n(x[3]),close:n(x[4]),volume:n(x[5])}));
 if(exchange==='Kraken')candles=rows.map(x=>({time:timestampIso(x[0],1000),open:n(x[1]),high:n(x[2]),low:n(x[3]),close:n(x[4]),volume:n(x[6])}));
 if(exchange==='Kraken Futures')candles=rows.map(x=>({time:timestampIso(x.time),open:n(x.open),high:n(x.high),low:n(x.low),close:n(x.close),volume:n(x.volume)}));
 if(exchange==='Binance')candles=rows.map(x=>({time:timestampIso(x[0]),open:n(x[1]),high:n(x[2]),low:n(x[3]),close:n(x[4]),volume:n(x[5])}));
 const duration=({'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000}[interval]||86400000);
 const valid=candles.filter(x=>{
  if(!x.time||!Number.isFinite(Date.parse(x.time))||![x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)||x.open<=0||x.high<=0||x.low<=0||x.close<=0||x.volume<0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high))return false;
  const closed=Date.parse(x.time)+duration<=asOf;
  return includeCurrent||closed;
 }).map(x=>({...x,closed:Date.parse(x.time)+duration<=asOf}));
 const unique=new Map();for(const candle of valid)unique.set(candle.time,candle);
 return [...unique.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}

async function getHistory(symbol,marketType='spot',interval='1d',exchange='Binance',nativeSymbol='',requestedLimit=240){
 const clean=String(nativeSymbol||symbol||'').toUpperCase();
 requireMarketDataLicense(exchange);
 const cap=exchange==='OKX'?300:exchange==='Coinbase'?300:exchange==='Kraken'?720:1000;
 const limit=Math.max(1,Math.min(cap,Math.floor(Number(requestedLimit)||240)));
 const cacheTtl=interval==='1m'||interval==='5m'?5000:interval==='15m'?10000:interval==='30m'||interval==='1h'?20000:interval==='4h'?60000:300000;
 return cached('history:'+exchange+':'+marketType+':'+clean+':'+interval+':'+limit,cacheTtl,async()=>{
  let rows=[],source=exchange+' public candles';
  const iv=interval==='1d'?'1d':interval;
  if(exchange==='Binance'){const path=marketType==='perpetual'?'/fapi/v1/klines':'/api/v3/klines',query=new URLSearchParams({symbol:clean,interval:iv,limit:String(limit)});if(marketType==='perpetual'){rows=await getJson('https://fapi.binance.com'+path+'?'+query);}else{const bases=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com','https://api4.binance.com'];const result=await getJsonFallback(bases.map(base=>base+path+'?'+query));rows=result.data;source='Binance official spot market-data API ('+result.base+')';}}
  else if(exchange==='Bybit'){const category=marketType==='perpetual'?'linear':'spot',intervalMap={'1m':'1','5m':'5','15m':'15','30m':'30','1d':'D','1h':'60','4h':'240'},query=new URLSearchParams({category,symbol:clean,interval:intervalMap[iv]||'D',limit:String(limit)});const result=await getJsonFallback(['https://api.bybit.com','https://api.bytick.com'].map(base=>base+'/v5/market/kline?'+query));const x=result.data;if(x.retCode!==0)throw new Error(x.retMsg);rows=x.result.list;source='Bybit official V5 market data ('+result.base+')';}
  else if(exchange==='OKX'){const inst=clean.includes('-')?clean:clean.replace(/(USDT|USDC|USD)$/,'-$1')+(marketType==='perpetual'?'-SWAP':'');const x=await getJson('https://www.okx.com/api/v5/market/candles?'+new URLSearchParams({instId:inst,bar:iv==='1d'?'1D':iv,limit:String(Math.min(limit,300))}));if(x.code!=='0')throw new Error(x.msg);rows=x.data;}
  else if(exchange==='Coinbase'){const product=clean.includes('-')?clean:clean.replace(/(USDT|USDC|USD)$/,'-$1');const granularity=({'1m':60,'5m':300,'15m':900,'1h':3600,'1d':86400}[iv]||86400);rows=await getJson('https://api.exchange.coinbase.com/products/'+encodeURIComponent(product)+'/candles?granularity='+granularity);}
  else if(exchange==='Kraken'){const x=await getJson('https://api.kraken.com/0/public/OHLC?'+new URLSearchParams({pair:clean,interval:iv==='4h'?'240':iv==='1h'?'60':iv==='30m'?'30':iv==='15m'?'15':iv==='5m'?'5':iv==='1m'?'1':'1440'}));if(x.error?.length)throw new Error(x.error.join(','));const key=Object.keys(x.result||{}).find(k=>k!=='last');rows=x.result?.[key]||[];}
  else if(exchange==='Kraken Futures'){const base=clean.replace(/(USDT|USDC|USD)$/,'').replace(/^BTC$/,'XBT');const resolution=({'1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','4h':'4h','1d':'1d'}[iv]||'1d');const tickerPayload=await getJson('https://futures.kraken.com/derivatives/api/v3/tickers');const tickers=Array.isArray(tickerPayload.tickers)?tickerPayload.tickers:Array.isArray(tickerPayload.result)?tickerPayload.result:[];const ticker=tickers.find(x=>{if(!x||x.tag!=='perpetual')return false;const pair=String(x.pair||'').toUpperCase().split(/[:/]/);const pairBase=(pair[0]||'').replace(/^XBT$/,'BTC');const pairQuote=pair[1]||'';const targetBase=base.replace(/^XBT$/,'BTC');return pairBase===targetBase&&pairQuote==='USD';});const product=String(ticker?.symbol||'').toUpperCase();if(!product)throw new Error('Kraken Futures 找不到對應的官方永續商品代碼');const x=await getJson('https://futures.kraken.com/api/charts/v1/trade/'+encodeURIComponent(product)+'/'+resolution+'?count='+String(limit));rows=Array.isArray(x.candles)?x.candles:[];source='Kraken Futures official public '+product+' candles';}
  const candles=normalizeKlines(rows,exchange,iv,Date.now(),true);
  if(!candles.length)throw new Error(exchange+' 此市場沒有可用 K 線');
  return {symbol,marketType,exchange,interval,data:candles,indicators:indicators(candles),asOf:candles.at(-1).time,source,timestamp:now()};
 });
}
async function ratioFor(exchange,base){
 try{
  if(exchange==='Binance'){const x=await getJson('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol='+base+'USDT&period=1h&limit=1');const q=x[0];return q?{exchange,longPct:Number(q.longAccount)*100,shortPct:Number(q.shortAccount)*100,ratio:Number(q.longShortRatio),source:'Binance global account ratio'}:null;}
  if(exchange==='Bybit'){const result=await getJsonFallback(['https://api.bybit.com','https://api.bytick.com'].map(host=>host+'/v5/market/account-ratio?category=linear&symbol='+base+'USDT&period=1h&limit=1'));const x=result.data;const q=x.result?.list?.[0];return q?{exchange,longPct:Number(q.buyRatio)*100,shortPct:Number(q.sellRatio)*100,ratio:Number(q.buyRatio)/Number(q.sellRatio),source:'Bybit account ratio'}:null;}
  if(exchange==='OKX'&&process.env.OKX_MARKET_DATA_LICENSE_CONFIRMED!=='true')return {exchange,unavailable:true,reason:'license_required'};
  if(exchange==='OKX'){const x=await getJson('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy='+base+'&period=1H');const q=x.data?.[0];return q?{exchange,longPct:Number(q[1])/(1+Number(q[1]))*100,shortPct:100-Number(q[1])/(1+Number(q[1]))*100,ratio:Number(q[1]),source:'OKX contracts long/short ratio'}:null;}
 }catch(e){return {exchange,error:e.message};}
 return {exchange,unavailable:true};
}
async function getDerivatives(symbol,exchange='Binance',nativeSymbol=''){
 const licensedDerivatives=['Binance','Bybit','OKX','Kraken Futures'].filter(provider=>isMarketDataLicensed(provider));
 if(!licensedDerivatives.length)return {status:'license_required',exchange,requestedExchange:exchange,fallbackUsed:false,openInterest:null,fundingRate:null,markPrice:null,indexPrice:null,source:null,timestamp:now(),sourceTime:null,battle:{exchanges:[],validExchanges:0,longPct:null,shortPct:null,stance:'資料不足'},liquidationMap:null};
 const base=String(symbol).toUpperCase().replace(/(USDT|USDC|USD)$/,'');
 const binanceAllowed=isMarketDataLicensed('Binance'),bybitAllowed=isMarketDataLicensed('Bybit'),okxAllowed=isMarketDataLicensed('OKX'),krakenFuturesAllowed=isMarketDataLicensed('Kraken Futures');
 const okxInst=base+'-USDT-SWAP';
 const [battle,binance,binanceOi,bybit,okxFunding,okxOi,okxMark,krakenFutures]=await Promise.all([
  Promise.all(['Binance','Bybit',...(okxAllowed?['OKX']:[]),...(krakenFuturesAllowed?['Kraken Futures']:[])].filter(x=>isMarketDataLicensed(x)).map(x=>ratioFor(x,base))),
  binanceAllowed?getJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+base+'USDT').catch(()=>null):Promise.resolve(null),
  binanceAllowed?getJson('https://fapi.binance.com/fapi/v1/openInterest?symbol='+base+'USDT').catch(()=>null):Promise.resolve(null),
  bybitAllowed?getJsonFallback(['https://api.bybit.com','https://api.bytick.com'].map(host=>host+'/v5/market/tickers?category=linear&symbol='+base+'USDT')).then(x=>x.data).catch(()=>null):Promise.resolve(null),
  okxAllowed?getJson('https://www.okx.com/api/v5/public/funding-rate?instId='+okxInst).catch(()=>null):Promise.resolve(null),
  okxAllowed?getJson('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId='+okxInst).catch(()=>null):Promise.resolve(null),
  okxAllowed?getJson('https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId='+okxInst).catch(()=>null):Promise.resolve(null),
  krakenFuturesAllowed?getJson('https://futures.kraken.com/derivatives/api/v3/tickers').catch(()=>null):Promise.resolve(null)
 ]);
 const bq=bybit?.result?.list?.[0],of=okxFunding?.data?.[0],oi=okxOi?.data?.[0],om=okxMark?.data?.[0];
 const toIso=value=>{if(value===null||value===undefined||value==='')return null;const numeric=Number(value);const ms=Number.isFinite(numeric)&&numeric>0?numeric:Date.parse(String(value));return Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():null;};
 const rows=[
  {exchange:'Binance',fundingRate:n(binance?.lastFundingRate),markPrice:n(binance?.markPrice),indexPrice:n(binance?.indexPrice),openInterest:n(binanceOi?.openInterest),sourceTime:toIso(binance?.time)},
  {exchange:'Bybit',fundingRate:n(bq?.fundingRate),markPrice:n(bq?.markPrice),indexPrice:n(bq?.indexPrice),openInterest:n(bq?.openInterest),sourceTime:toIso(bybit?.time)},
  {exchange:'OKX',fundingRate:n(of?.fundingRate),markPrice:n(om?.markPx),indexPrice:n(om?.idxPx),openInterest:n(oi?.oiCcy),sourceTime:toIso(om?.ts)||toIso(of?.fundingTime)},
  ...((Array.isArray(krakenFutures?.tickers)?krakenFutures.tickers:Array.isArray(krakenFutures?.result)?krakenFutures.result:[]).filter(x=>x&&x.tag==='perpetual'&&String(x.pair||'').replace(':','').replace(/^XBT/,'BTC').startsWith(base+'USD')).slice(0,1).map(x=>({exchange:'Kraken Futures',fundingRate:n(x.fundingRate??x.funding_rate),markPrice:n(x.markPrice),indexPrice:n(x.indexPrice??x.index),openInterest:null,sourceTime:toIso(x.time)||toIso(x.lastTime)})))
 ];
 const ratios=battle.filter(x=>x&&Number.isFinite(x.longPct)&&Number.isFinite(x.shortPct));
 const longPct=ratios.length?ratios.reduce((sum,x)=>sum+x.longPct,0)/ratios.length:null;
 const requested=rows.find(x=>x.exchange===exchange)||null;
 const usable=x=>x&&Number.isFinite(x.markPrice)&&x.markPrice>0&&(x.exchange==='Kraken Futures'||(Number.isFinite(x.openInterest)&&x.openInterest>0));
 const selected=usable(requested)?requested:(rows.find(usable)||requested||rows[0]);
 const fallbackUsed=!!(selected&&selected.exchange!==exchange);
 const sourceByExchange={Binance:'Binance official USD-M Futures premiumIndex/openInterest',Bybit:'Bybit official V5 linear tickers',OKX:'OKX official public funding-rate/mark-price/open-interest','Kraken Futures':'Kraken official Futures public tickers'};
 const receivedAt=now();
 return {status:selected?.markPrice?'ok':'unavailable',exchange:selected?.exchange||exchange,requestedExchange:exchange,fallbackUsed,openInterest:selected?.openInterest??null,openInterestAsset:base,fundingRate:selected?.fundingRate??null,markPrice:selected?.markPrice??null,indexPrice:selected?.indexPrice??null,source:sourceByExchange[selected?.exchange]||'官方衍生品 API',timestamp:receivedAt,receivedAt,sourceTime:selected?.sourceTime??null,battle:{exchanges:battle,validExchanges:ratios.length,longPct,shortPct:longPct===null?null:100-longPct,stance:longPct===null?'資料不足':longPct>55?'多方佔優':longPct<45?'空方佔優':'多空拉鋸'},liquidationMap:liquidationMap(selected?.markPrice,selected?.openInterest,base)};
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
module.exports={loadMarket,getHistory,getDerivatives,liquidationMap,loadNews,buildQuoteRow:row,mapLimit,normalizeKlines,getJsonFallback,binanceMarkets,bybitCategory,timestampIso};
