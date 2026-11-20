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
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('binance')?{bids:[['100','2']],asks:[['102','1']]}:String(url).includes('okx')?{data:[{bids:[['100','2']],asks:[['102','1']]}]}:String(url).includes('coinbase')?{bids:[['100','2']],asks:[['102','1']]}:{result:{XXBTZUSD:{bids:[['100','2']],asks:[['102','1']]}}}});
 try {const out=await loadOrderbooks(['BTCUSDT']);assert.equal(out.books.length,4);assert.equal(out.books[0].spread,2);assert.equal(out.books[0].imbalance,98/302);} finally {global.fetch=old;}
});
test('public Bitcoin mempool exposes large gross-output candidates without guessing wallet direction',async()=>{
 const old=global.fetch,oldUrl=process.env.WHALE_ALERT_API_URL,oldKey=process.env.WHALE_ALERT_API_KEY;
 delete process.env.WHALE_ALERT_API_URL;delete process.env.WHALE_ALERT_API_KEY;
 global.fetch=async()=>({ok:true,status:200,json:async()=>[{txid:'abc123',value:15000000000,fee:1000,vsize:200}]});
 try {
  const out=await loadWhales();
  assert.equal(out.status,'connected');
  assert.equal(out.items.length,1);
  assert.equal(out.items[0].amount,150);
  assert.equal(out.items[0].state,'unconfirmed_mempool');
  assert.equal(out.items[0].direction,'unknown');
  assert.equal(out.items[0].amountUsd,null);
 } finally {global.fetch=old;if(oldUrl!==undefined)process.env.WHALE_ALERT_API_URL=oldUrl;if(oldKey!==undefined)process.env.WHALE_ALERT_API_KEY=oldKey;}
});

test('Taiwan CBC macro source parser retains official rows and source identity',async()=>{
 const old=global.fetch, oldKey=process.env.FRED_API_KEY;
 delete process.env.FRED_API_KEY;
 global.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('worldbank')?[]:{data:{dataSets:[[['2026-01',32.1],['2026-02',32.2]]]}}});
 try {
   const {loadMacroOfficial}=require('../lib/market-intelligence');
   const out=await loadMacroOfficial();
   assert.equal(out.sources.find(x=>x.id==='taiwan-cbc').status,'connected');
   assert.ok(out.data.some(x=>x.country==='TWN'&&x.indicator==='BP01D01'&&x.value===32.1));
 } finally {global.fetch=old;if(oldKey!==undefined)process.env.FRED_API_KEY=oldKey;}
});

test('official central bank policy RSS sources are parsed and independently attributed',async()=>{
 const old=global.fetch,oldKey=process.env.FRED_API_KEY;
 delete process.env.FRED_API_KEY;
 global.fetch=async url=>({
  ok:true,status:200,
  json:async()=>String(url).includes('federalregister')?{results:[]}:String(url).includes('ey.gov.tw')?[]:[],
  text:async()=>'<rss><channel><item><guid>source-guid</guid><title>Central bank policy update</title><link>https://example.gov/policy</link><pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate><description>Official release</description></item></channel></rss>'
 });
 try {
  const {loadPolicy}=require('../lib/market-intelligence');
  const out=await loadPolicy();
  assert.equal(out.sources.find(x=>x.id==='boj').status,'connected');
  assert.equal(out.sources.find(x=>x.id==='boe').status,'connected');
  assert.ok(out.items.some(x=>x.sourceId==='boj'&&x.title==='Central bank policy update'));
  assert.ok(out.items.some(x=>x.sourceId==='boe'&&x.title==='Central bank policy update'));
 } finally {global.fetch=old;if(oldKey!==undefined)process.env.FRED_API_KEY=oldKey;}
});
