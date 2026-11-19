'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildQuoteRow,mapLimit,normalizeKlines,getJsonFallback,getDerivatives,binanceMarkets,bybitCategory,timestampIso}=require('../lib/crypto-market');

test('crypto quote rows reject missing, zero and invalid prices',()=>{
  assert.equal(buildQuoteRow('Binance','spot','BTCUSDT','BTC','USDT',null,0,0),null);
  assert.equal(buildQuoteRow('Binance','spot','BTCUSDT','BTC','USDT',0,0,0),null);
  assert.equal(buildQuoteRow('Binance','spot','BTCUSDT','BTC','USDT','NaN',0,0),null);
});

test('crypto quote rows preserve valid exchange prices and metadata',()=>{
  const row=buildQuoteRow('Binance','spot','BTCUSDT','BTC','USDT','65000','1.5','1000000',{high24h:'66000',low24h:'64000'});
  assert.equal(row.price,65000);
  assert.equal(row.changePct,1.5);
  assert.equal(row.quoteVolume,1000000);
  assert.equal(row.exchange,'Binance');
  assert.equal(row.timestamp,null,'missing exchange timestamps must not be replaced by server time');
  assert.equal(row.sourceTimestamp,null);
  assert.ok(Number.isFinite(Date.parse(row.receivedAt)),'server receive time is kept separately');
});

test('limited quote requests tolerate an individual exchange ticker failure',async()=>{
  const result=await mapLimit([1,2,3],2,async n=>{if(n===2)throw new Error('rate limited');return n*10;});
  assert.deepEqual(result,[10,null,30]);
});

test('crypto quote rows preserve a valid exchange event timestamp separately from receive time',()=>{
  const sourceTimestamp='2026-11-18T15:00:00.000Z';
  const row=buildQuoteRow('Binance','spot','BTCUSDT','BTC','USDT',65000,1.5,1000000,{sourceTimestamp});
  assert.equal(row.timestamp,sourceTimestamp);
  assert.equal(row.sourceTimestamp,sourceTimestamp);
  assert.ok(Number.isFinite(Date.parse(row.receivedAt)));
  assert.notEqual(row.receivedAt,row.sourceTimestamp);
});

test('missing crypto quote fields remain null rather than being coerced to zero',()=>{
  const row=buildQuoteRow('Bybit','spot','ABCUSDT','ABC','USDT','1.25',null,null,{high24h:null,low24h:undefined,volume:null});
  assert.equal(row.price,1.25);
  assert.equal(row.changePct,null);
  assert.equal(row.quoteVolume,null);
  assert.equal(row.high24h,null);
  assert.equal(row.low24h,null);
  assert.equal(row.volume,null);
});

test('a genuine zero remains distinguishable from a missing value',()=>{
  const row=buildQuoteRow('Bybit','spot','ABCUSDT','ABC','USDT','1.25',0,0,{volume:0});
  assert.equal(row.changePct,0);
  assert.equal(row.quoteVolume,0);
  assert.equal(row.volume,0);
});

test('crypto candles reject missing timestamp and missing volume rather than creating epoch or zero values',()=>{
  const rows=[
    ['1700000000000','100','110','90','105',null],
    [null,'100','110','90','105','10'],
    ['1700000002000','100','110','90','105','10']
  ];
  const candles=normalizeKlines(rows,'Binance');
  assert.equal(candles.length,1);
  assert.equal(candles[0].time,new Date(1700000002000).toISOString());
  assert.equal(candles[0].volume,10);
});

test('crypto candle normalization preserves genuine zero volume while rejecting invalid OHLC',()=>{
  const rows=[
    ['1700000000000','100','110','90','105','0'],
    ['1700000001000','100','99','90','105','10']
  ];
  const candles=normalizeKlines(rows,'Binance');
  assert.equal(candles.length,1);
  assert.equal(candles[0].volume,0);
});

test('crypto history excludes the still-forming candle from research data',()=>{
  const start=Date.parse('2026-11-18T00:00:00.000Z');
  const rows=[
    [String(start-86400000),'100','110','90','105','12'],
    [String(start),'105','115','100','112','18']
  ];
  const candles=normalizeKlines(rows,'Binance','1d',Date.parse('2026-11-18T15:00:00.000Z'));
  assert.equal(candles.length,1);
  assert.equal(candles[0].time,new Date(start-86400000).toISOString());
});

test('official Binance market-data host is tried before alternate official REST hosts',async()=>{
 const original=global.fetch;const calls=[];
 global.fetch=async url=>{
  calls.push(String(url));
  if(String(url).includes('data-api.binance.vision'))return {ok:false,status:451,json:async()=>({})};
  return {ok:true,status:200,json:async()=>({serverTime:1})};
 };
 try{
  const result=await getJsonFallback(['https://data-api.binance.vision/api/v3/time','https://api.binance.com/api/v3/time']);
  assert.equal(result.base,'https://api.binance.com');
  assert.equal(result.data.serverTime,1);
  assert.equal(calls.length,2);
 }finally{global.fetch=original;}
});

test('OKX derivatives use official funding, mark-price and base-currency open-interest fields',async()=>{
 const original=global.fetch;
 const now=Date.parse('2026-11-18T00:00:00.000Z');
 global.fetch=async url=>{
  const u=String(url);
  const ok=(data)=>({ok:true,status:200,json:async()=>data});
  if(u.includes('api.bybit.com'))return {ok:false,status:403,json:async()=>({})};
  if(u.includes('api.bytick.com/v5/market/account-ratio'))return ok({retCode:0,result:{list:[{buyRatio:'0.55',sellRatio:'0.45'}]}});
  if(u.includes('api.bytick.com/v5/market/tickers'))return ok({retCode:0,time:now,result:{list:[{fundingRate:'0.0001',markPrice:'65000',openInterest:'2'}]}});
  if(u.includes('fapi.binance.com/futures/data/globalLongShortAccountRatio'))return ok([{longAccount:'0.6',shortAccount:'0.4',longShortRatio:'1.5'}]);
  if(u.includes('fapi.binance.com/fapi/v1/premiumIndex'))return ok({lastFundingRate:'0.0001',markPrice:'65000',indexPrice:'64990',time:now});
  if(u.includes('fapi.binance.com/fapi/v1/openInterest'))return ok({openInterest:'2'});
  if(u.includes('rubik/stat/contracts/long-short-account-ratio'))return ok({data:[['2026-11-18','1.2']]});
  if(u.includes('/public/funding-rate'))return ok({data:[{fundingRate:'0.0002',fundingTime:String(now)}]});
  if(u.includes('/public/open-interest'))return ok({data:[{oi:'100',oiCcy:'1.5'}]});
  if(u.includes('/public/mark-price'))return ok({data:[{markPx:'65010',idxPx:'65000',ts:String(now)}]});
  return {ok:false,status:404,json:async()=>({})};
 };
 try{
  const result=await getDerivatives('BTCUSDT','OKX');
  assert.equal(result.exchange,'OKX');
  assert.equal(result.fundingRate,0.0002);
  assert.equal(result.markPrice,65010);
  assert.equal(result.openInterest,1.5);
  assert.equal(result.openInterestAsset,'BTC');
  assert.equal(result.indexPrice,65000);
  assert.equal(result.sourceTime,'2026-11-18T00:00:00.000Z');
  assert.equal(result.liquidationMap.levels.length,16);
 }finally{global.fetch=original;}
});

test('exchange quote freshness explicitly marks stale and missing source timestamps',()=>{
  const originalNow=Date.now;
  Date.now=()=>Date.parse('2026-11-19T00:00:00.000Z');
  try{
    const fresh=buildQuoteRow('OKX','spot','BTC-USDT','BTC','USDT',65000,1,1000,{sourceTimestamp:'2026-11-18T23:59:00.000Z'});
    const stale=buildQuoteRow('Coinbase','spot','BTC-USD','BTC','USD',65000,1,1000,{sourceTimestamp:'2026-11-18T23:54:00.000Z'});
    const unknown=buildQuoteRow('Kraken','spot','BTCUSD','BTC','USD',65000,1,1000);
    assert.equal(fresh.freshnessStatus,'fresh');
    assert.equal(fresh.delayed,false);
    assert.equal(stale.freshnessStatus,'stale');
    assert.equal(stale.delayed,true);
    assert.equal(unknown.freshnessStatus,'unverified');
    assert.equal(unknown.delayed,true);
    assert.equal(unknown.sourceAgeMs,null);
  }finally{Date.now=originalNow;}
});

test('exchange timestamp normalization rejects missing and invalid source times',()=>{
  assert.equal(timestampIso(null),null);
  assert.equal(timestampIso(''),null);
  assert.equal(timestampIso('not-a-time'),null);
  assert.equal(timestampIso(0),null);
  const stamp=Date.parse('2026-11-19T00:00:00.000Z');
  assert.equal(timestampIso(stamp),'2026-11-19T00:00:00.000Z');
});

test('Binance spot and perpetual tickers preserve exchange closeTime timestamps',async()=>{
  const original=global.fetch,closeTime=Date.now()-1000;
  const ok=data=>({ok:true,status:200,json:async()=>data});
  global.fetch=async url=>{
    const u=String(url);
    if(u.includes('data-api.binance.vision/api/v3/exchangeInfo'))return ok({symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]});
    if(u.includes('data-api.binance.vision/api/v3/ticker/24hr'))return ok([{symbol:'BTCUSDT',lastPrice:'65000',priceChangePercent:'1',quoteVolume:'1000',closeTime}]);
    if(u.includes('fapi.binance.com/fapi/v1/exchangeInfo'))return ok({symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT'}]});
    if(u.includes('fapi.binance.com/fapi/v1/ticker/24hr'))return ok([{symbol:'BTCUSDT',lastPrice:'65000',priceChangePercent:'1',quoteVolume:'1000',closeTime}]);
    return {ok:false,status:404,json:async()=>({})};
  };
  try{
    const rows=await binanceMarkets();
    const expected=new Date(closeTime).toISOString();
    assert.equal(rows.find(x=>x.marketType==='spot').sourceTimestamp,expected);
    assert.equal(rows.find(x=>x.marketType==='perpetual').sourceTimestamp,expected);
    assert.equal(rows.every(x=>x.freshnessStatus==='fresh'),true);
  }finally{global.fetch=original;}
});

test('Bybit ticker response timestamp is preserved as source time',async()=>{
  const original=global.fetch,sourceTime=Date.now()-1000;
  const ok=data=>({ok:true,status:200,json:async()=>data});
  global.fetch=async url=>{
    const u=String(url);
    if(u.includes('/v5/market/instruments-info?'))return ok({retCode:0,result:{list:[{symbol:'BTCUSDT',baseCoin:'BTC',quoteCoin:'USDT',status:'Trading'}],nextPageCursor:''}});
    if(u.includes('/v5/market/tickers?category=spot'))return ok({retCode:0,time:sourceTime,result:{list:[{symbol:'BTCUSDT',lastPrice:'65000',price24hPcnt:'0.01',turnover24h:'1000',highPrice24h:'66000',lowPrice24h:'64000',volume24h:'10'}]}});
    return {ok:false,status:404,json:async()=>({})};
  };
  try{
    const rows=await bybitCategory('spot');
    assert.equal(rows[0].sourceTimestamp,new Date(sourceTime).toISOString());
    assert.equal(rows[0].freshnessStatus,'fresh');
  }finally{global.fetch=original;}
});
