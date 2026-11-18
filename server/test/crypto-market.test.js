'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildQuoteRow,mapLimit,normalizeKlines}=require('../lib/crypto-market');

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
