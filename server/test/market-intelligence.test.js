'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sentiment,loadOrderbooks,loadWhales}=require('../lib/market-intelligence');
test('social lexical sentiment is explicit proxy and neutral on unknown language',()=>{
 assert.equal(sentiment('市場消息').classification,'neutral_or_unclassified');
 assert.equal(sentiment('bullish breakout').classification,'positive_language');
 assert.equal(sentiment('panic crash').classification,'negative_language');
});
test('orderbook connector validates levels and computes spread and imbalance',async()=>{
 const old=global.fetch;
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('binance')?{bids:[['100','2']],asks:[['102','1']]}:String(url).includes('okx')?{data:[{bids:[['100','2']],asks:[['102','1']]}]}:{result:{XXBTZUSD:{bids:[['100','2']],asks:[['102','1']]}}}});
 try {const out=await loadOrderbooks(['BTCUSDT']);assert.equal(out.books.length,3);assert.equal(out.books[0].spread,2);assert.equal(out.books[0].imbalance,98/302);} finally {global.fetch=old;}
});
test('whale data is explicitly unavailable without a configured licensed provider',async()=>{
 const oldUrl=process.env.WHALE_ALERT_API_URL,oldKey=process.env.WHALE_ALERT_API_KEY;
 delete process.env.WHALE_ALERT_API_URL;delete process.env.WHALE_ALERT_API_KEY;
 try {const out=await loadWhales();assert.equal(out.status,'not_configured');assert.deepEqual(out.items,[]);} finally {if(oldUrl!==undefined)process.env.WHALE_ALERT_API_URL=oldUrl;if(oldKey!==undefined)process.env.WHALE_ALERT_API_KEY=oldKey;}
});
