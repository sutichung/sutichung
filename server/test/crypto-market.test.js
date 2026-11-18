'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildQuoteRow,mapLimit}=require('../lib/crypto-market');

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
