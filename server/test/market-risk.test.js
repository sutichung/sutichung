'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessMarketRisk}=require('../lib/market-risk');

function history(n=30){
 let price=100;
 const data=Array.from({length:n},(_,i)=>{
  const open=price;
  price=100+Math.sin(i/3)*0.4;
  return {time:new Date(Date.UTC(2026,0,1+i)).toISOString(),open,high:Math.max(open,price)+0.6,low:Math.min(open,price)-0.6,close:price,volume:100+i};
 });
 return {data,source:'test candles',asOf:data.at(-1).time};
}
function microstructure(overrides={}){
 return {
  source:'Binance public REST order book + recent trades',
  receivedAt:new Date().toISOString(),
  book:{bids:[[100,1]],asks:[[101,3]],obi:-0.5,weightedObi:-0.45,obiNotional:-0.4,spreadPct:0.995,microPriceDeviationBps:-12},
  tape:{count:20,knownSideCount:20,largeTradeCount:3,largeTrades:[{side:'sell'},{side:'sell'},{side:'buy'}],tradeImbalance:-0.6,aggressiveBuyPct:20,whaleClassificationAvailable:true},
  ...overrides
 };
}

test('market risk integrates real order-book and recent-trade evidence when available',()=>{
 const baseline=assessMarketRisk(history(),null);
 const result=assessMarketRisk(history(),null,microstructure());
 assert.equal(result.coverage.orderBook,true);
 assert.equal(result.coverage.tradeTape,true);
 assert.equal(result.microstructureStatus,'connected');
 assert.equal(result.microstructureSource,'Binance public REST order book + recent trades');
 assert.ok(result.metrics.orderBookImbalance<0);
 assert.ok(result.metrics.tradeImbalance<0);
 assert.ok(result.scenarios.find(x=>x.id==='sell_pressure').score>baseline.scenarios.find(x=>x.id==='sell_pressure').score);
 assert.ok(result.scenarios.find(x=>x.id==='liquidity_stress').score>baseline.scenarios.find(x=>x.id==='liquidity_stress').score);
 assert.ok(result.missing.some(x=>x.includes('強平')));
 assert.ok(result.missing.some(x=>x.includes('鏈上')));
});

test('missing microstructure stays explicitly unavailable and never becomes a zero reading',()=>{
 const result=assessMarketRisk(history(),{fundingRate:null,battle:{longPct:null}});
 assert.equal(result.coverage.orderBook,false);
 assert.equal(result.coverage.tradeTape,false);
 assert.equal(result.coverage.derivatives,false);
 assert.equal(result.metrics.orderBookImbalance,null);
 assert.equal(result.metrics.tradeImbalance,null);
 assert.equal(result.metrics.fundingRate,null);
 assert.equal(result.microstructureStatus,'unavailable');
});

test('empty trade samples do not count as connected tape coverage',()=>{
 const result=assessMarketRisk(history(),null,microstructure({tape:{count:0,knownSideCount:0,largeTradeCount:0,largeTrades:[],tradeImbalance:null,aggressiveBuyPct:null}}));
 assert.equal(result.coverage.orderBook,true);
 assert.equal(result.coverage.tradeTape,false);
 assert.equal(result.microstructureStatus,'book_only');
 assert.equal(result.metrics.tradeImbalance,null);
});

test('invalid OHLC candles are excluded and insufficient history fails closed',()=>{
 const h=history(24);h.data[5].high=1;
 const result=assessMarketRisk(h,null);
 assert.equal(result.candleCount,23);
 const short=assessMarketRisk(history(10),null,microstructure());
 assert.equal(short.status,'insufficient_data');
 assert.equal(short.coverage.orderBook,true);
 assert.equal(short.coverage.tradeTape,true);
});
