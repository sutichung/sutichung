'use strict';

const DEFAULT_SYMBOLS = ['BTCUSDT','ETHUSDT'];
const SOURCES = {
  policy: [
    {id:'us-federal-register',label:'US Federal Register',url:'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE'},
    {id:'eu-commission',label:'European Commission press releases',url:'https://ec.europa.eu/commission/presscorner/api/rss?language=en'}
  ],
  social: [
    {id:'reddit-cryptocurrency',label:'Reddit r/CryptoCurrency public feed',url:'https://www.reddit.com/r/CryptoCurrency/hot.json?limit=50'},
    {id:'reddit-investing',label:'Reddit r/investing public feed',url:'https://www.reddit.com/r/investing/hot.json?limit=50'}
  ]
};
const POSITIVE = ['bullish','breakout','buy','adoption','growth','利多','看多','突破','買進','成長'];
const NEGATIVE = ['bearish','crash','sell','fear','panic','hack','利空','看空','崩盤','賣出','恐慌','駭客'];
async function get(url, headers={}) {
  const response = await fetch(url,{headers:{'user-agent':'GlobalMarketIntelligence/1.0 (public-data research)','accept':'application/json, application/rss+xml, application/xml, text/xml',...headers},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('HTTP '+response.status);
  return response;
}
function validUrl(raw) { try { const u=new URL(String(raw||'')); return ['http:','https:'].includes(u.protocol)?u.toString():''; } catch (_) { return ''; } }
function sentiment(text) {
  const s=String(text||'').toLowerCase();
  const positive=POSITIVE.filter(k=>s.includes(k)).length, negative=NEGATIVE.filter(k=>s.includes(k)).length;
  const total=positive+negative;
  return {positive,negative,score:total?(positive-negative)/total:0,classification:!total?'neutral_or_unclassified':positive>negative?'positive_language':negative>positive?'negative_language':'mixed_language'};
}
async function loadPolicy() {
  const results=await Promise.allSettled(SOURCES.policy.map(async source=>{
    const response=await get(source.url);
    if(source.id==='us-federal-register') {
      const payload=await response.json();
      return (payload.results||[]).map(x=>({id:String(x.document_number||x.html_url),title:x.title||'',summary:x.abstract||'',url:validUrl(x.html_url),source:source.label,sourceId:source.id,publishedAt:x.publication_date||null,documentType:x.type||null,jurisdiction:'United States',evidenceType:'official_primary_document',verification:'official_source_not_independently_interpreted'}));
    }
    const xml=await response.text();
    const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,20);
    return items.map(m=>{const field=n=>m[1].match(new RegExp('<'+n+'[^>]*>([\\s\\S]*?)</'+n+'>','i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').trim()||'';return {id:field('guid')||field('link'),title:field('title'),summary:field('description').replace(/<[^>]+>/g,'').slice(0,1000),url:validUrl(field('link')),source:source.label,sourceId:source.id,publishedAt:field('pubDate')||null,jurisdiction:'European Union',evidenceType:'official_press_release',verification:'official_source_not_independently_interpreted'};}).filter(x=>x.title);
  }));
  const items=[],sources=[];
  results.forEach((r,i)=>{const source=SOURCES.policy[i];if(r.status==='fulfilled'){items.push(...r.value);sources.push({id:source.id,label:source.label,status:r.value.length?'connected':'empty',items:r.value.length});}else sources.push({id:source.id,label:source.label,status:'unavailable',items:0,error:String(r.reason?.message||r.reason)});});
  return {items:items.sort((a,b)=>Date.parse(b.publishedAt||'')-Date.parse(a.publishedAt||'')).slice(0,40),sources,fetchedAt:new Date().toISOString(),note:'僅涵蓋已設定的官方司法管轄區來源；不是全球政府政策全集。'};
}
async function loadSocial() {
  const results=await Promise.allSettled(SOURCES.social.map(async source=>{
    const response=await get(source.url,{'accept':'application/json','user-agent':'Mozilla/5.0 GlobalMarketIntelligence/1.0'});
    const payload=await response.json();
    const posts=(payload?.data?.children||[]).map(({data:x})=>({id:String(x.id),title:String(x.title||'').slice(0,300),summary:String(x.selftext||'').slice(0,800),url:validUrl(x.permalink?'https://www.reddit.com'+x.permalink:x.url),source:source.label,sourceId:source.id,publishedAt:x.created_utc?new Date(x.created_utc*1000).toISOString():null,score:Number(x.score)||0,comments:Number(x.num_comments)||0,engagement:Number(x.score||0)+Number(x.num_comments||0),sentiment:sentiment((x.title||'')+' '+(x.selftext||'')),evidenceType:'public_social_post',verification:'unverified_user_generated_content'}));
    return posts;
  }));
  const items=[],sources=[];
  results.forEach((r,i)=>{const source=SOURCES.social[i];if(r.status==='fulfilled'){items.push(...r.value);sources.push({id:source.id,label:source.label,status:r.value.length?'connected':'empty',items:r.value.length});}else sources.push({id:source.id,label:source.label,status:'unavailable',items:0,error:String(r.reason?.message||r.reason)});});
  const counts=items.reduce((a,x)=>{a[x.sentiment.classification]=(a[x.sentiment.classification]||0)+1;return a;},{});
  return {items:items.sort((a,b)=>b.engagement-a.engagement).slice(0,60),sources,summary:{posts:items.length,languageCounts:counts,meanLexicalScore:items.length?items.reduce((n,x)=>n+x.sentiment.score,0)/items.length:0},fetchedAt:new Date().toISOString(),note:'僅為公開貼文的詞彙情緒與互動量代理指標；不是民意民調、人口代表性樣本或個人心理診斷。'};
}
async function loadOrderbooks(symbols=DEFAULT_SYMBOLS) {
  const targets=[...new Set((Array.isArray(symbols)?symbols:DEFAULT_SYMBOLS).map(x=>String(x).toUpperCase()).filter(x=>/^[A-Z0-9-]{3,20}$/.test(x)))].slice(0,5);
  const jobs=[];
  for(const symbol of targets) {
    const base=symbol.replace(/USDT$/,'-USDT');
    jobs.push({id:'binance',symbol,url:'https://api.binance.com/api/v3/depth?symbol='+encodeURIComponent(symbol)+'&limit=20',parse:p=>({bids:p.bids,asks:p.asks})});
    jobs.push({id:'okx',symbol,url:'https://www.okx.com/api/v5/market/books?instId='+encodeURIComponent(base)+'&sz=20',parse:p=>({bids:p.data?.[0]?.bids,asks:p.data?.[0]?.asks})});
    jobs.push({id:'kraken',symbol,url:'https://api.kraken.com/0/public/Depth?pair='+encodeURIComponent(symbol.replace('USDT','USD'))+'&count=20',parse:p=>{const key=Object.keys(p.result||{})[0];return {bids:p.result?.[key]?.bids,asks:p.result?.[key]?.asks};}});
  }
  const results=await Promise.allSettled(jobs.map(async job=>{
    const payload=await (await get(job.url)).json(), book=job.parse(payload);
    const bids=(book.bids||[]).map(x=>({price:Number(x[0]),size:Number(x[1])})).filter(x=>x.price>0&&x.size>0);
    const asks=(book.asks||[]).map(x=>({price:Number(x[0]),size:Number(x[1])})).filter(x=>x.price>0&&x.size>0);
    if(!bids.length||!asks.length)throw new Error('empty_or_unsupported_book');
    const bid=bids[0].price,ask=asks[0].price,mid=(bid+ask)/2;
    const bidDepth=bids.reduce((n,x)=>n+x.price*x.size,0),askDepth=asks.reduce((n,x)=>n+x.price*x.size,0);
    return {exchange:job.id,symbol:job.symbol,bids:bids.slice(0,20),asks:asks.slice(0,20),bestBid:bid,bestAsk:ask,mid,spread:ask-bid,spreadBps:(ask-bid)/mid*10000,bidDepthQuote:bidDepth,askDepthQuote:askDepth,imbalance:(bidDepth-askDepth)/(bidDepth+askDepth),fetchedAt:new Date().toISOString(),evidenceType:'exchange_public_orderbook',verification:'exchange_snapshot_not_consolidated'};
  }));
  const books=[],sources=[];
  results.forEach((r,i)=>{if(r.status==='fulfilled')books.push(r.value);else sources.push({id:jobs[i].id,symbol:jobs[i].symbol,status:'unavailable',error:String(r.reason?.message||r.reason)});});
  const connected=[...new Set(books.map(x=>x.exchange))];
  return {books,sources:connected.map(id=>({id,status:'connected',items:books.filter(x=>x.exchange===id).length})).concat(sources),fetchedAt:new Date().toISOString(),note:'各交易所獨立快照，非全市場合併深度；不同商品代碼與市場類型不可直接比較。'};
}
async function loadWhales() {
  const url=process.env.WHALE_ALERT_API_URL, key=process.env.WHALE_ALERT_API_KEY;
  if(!url||!key) return {status:'not_configured',items:[],source:'Whale Alert-compatible API',fetchedAt:new Date().toISOString(),note:'需設定合法取得的鏈上資料供應商 API；目前不猜測錢包身份、不以單筆大額轉帳推斷買賣方向。'};
  try {
    const u=new URL(url);u.searchParams.set('api_key',key);
    const payload=await (await get(u.toString())).json();
    const items=(payload.transactions||payload.data||[]).slice(0,50).map(x=>({id:String(x.id||x.hash||''),asset:String(x.symbol||x.asset||''),amount:Number(x.amount),amountUsd:Number(x.amount_usd||x.amountUsd),from:String(x.from?.owner_type||x.from?.owner||'unknown'),to:String(x.to?.owner_type||x.to?.owner||'unknown'),hash:validUrl(x.transaction_url||x.url),timestamp:x.timestamp?new Date(Number(x.timestamp)*1000).toISOString():null,source:'Configured on-chain provider',evidenceType:'on_chain_transfer',verification:'transaction_observed_wallet_identity_unverified',direction:'unknown'})).filter(x=>x.id&&Number.isFinite(x.amount));
    return {status:'connected',items,fetchedAt:new Date().toISOString(),note:'鏈上轉帳可觀測不代表交易所買賣；錢包標籤可能由供應商推定，方向預設 unknown。'};
  } catch(error) {return {status:'unavailable',items:[],fetchedAt:new Date().toISOString(),error:String(error.message||error)};}
}
async function loadMacroOfficial() {
  const [world,fred]=await Promise.allSettled([
    (async()=>{const ids=['NY.GDP.MKTP.KD.ZG','FP.CPI.TOTL.ZG','SL.UEM.TOTL.ZS'];const countries='USA;CHN;JPN;GBR;DEU;IND;BRA;CAN;AUS;KOR;TWN';const all=await Promise.all(ids.map(async id=>{const url='https://api.worldbank.org/v2/country/'+countries+'/indicator/'+id+'?format=json&per_page=1000&date=2021:2026';const p=await(await get(url)).json();return {indicator:id,rows:p?.[1]||[]};}));return all.flatMap(x=>x.rows.filter(r=>r.value!==null).map(r=>({country:r.countryiso3code,indicator:x.indicator,value:Number(r.value),period:r.date,source:'World Bank Open Data',url:'https://data.worldbank.org/indicator/'+x.indicator,evidenceType:'official_macro_observation'})));})(),
    (async()=>{if(!process.env.FRED_API_KEY)throw new Error('FRED_API_KEY_not_configured');const series=['FEDFUNDS','CPIAUCSL','UNRATE','DGS10'];const all=await Promise.all(series.map(async id=>{const u=new URL('https://api.stlouisfed.org/fred/series/observations');u.searchParams.set('series_id',id);u.searchParams.set('api_key',process.env.FRED_API_KEY);u.searchParams.set('file_type','json');u.searchParams.set('sort_order','desc');u.searchParams.set('limit','5');const p=await(await get(u.toString())).json();return (p.observations||[]).filter(x=>x.value!=='.').map(x=>({country:'USA',indicator:id,value:Number(x.value),period:x.date,source:'Federal Reserve Bank of St. Louis FRED',url:'https://fred.stlouisfed.org/series/'+id,evidenceType:'official_macro_observation'}));}));return all.flat();})()
  ]);
  const data=world.status==='fulfilled'?world.value:[],fredData=fred.status==='fulfilled'?fred.value:[];
  return {data:[...data,...fredData],sources:[{id:'world-bank',status:world.status==='fulfilled'?(data.length?'connected':'empty'):'unavailable',items:data.length,error:world.status==='rejected'?String(world.reason?.message||world.reason):undefined},{id:'fred',status:fred.status==='fulfilled'?'connected':'not_configured',items:fredData.length,error:fred.status==='rejected'?String(fred.reason?.message||fred.reason):undefined}],fetchedAt:new Date().toISOString(),note:'宏觀資料多為月／季／年頻率，發布有滯後；FRED API key 未設定時不會假裝已連線。'};
}
async function loadAll(options={}) {
  const [policy,social,orderbooks,whales,macro]=await Promise.all([loadPolicy(),loadSocial(),loadOrderbooks(options.symbols),loadWhales(),loadMacroOfficial()]);
  return {generatedAt:new Date().toISOString(),policy,social,orderbooks,whales,macro,policyRules:['官方公告與法規原文優先；新聞摘要不能取代原文。','社群情緒只代表已觀測平台貼文，不代表整體投資人或民意。','委託簿快照不是成交，可能撤單、分層或跨場套利。','鏈上轉帳不等於買入／賣出；未知錢包不貼身份標籤。','任何來源中斷均顯示狀態，不以合成數據補值。']};
}
module.exports={loadAll,loadPolicy,loadSocial,loadOrderbooks,loadWhales,loadMacroOfficial,sentiment};
