'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scoreStock}=require('../lib/scoring');
const fresh=new Date().toISOString();
test('score refuses a directional label when factor coverage is too low',()=>{
 const x=scoreStock({trend:'bullish',asOf:fresh});
 assert.equal(x.status,'insufficient-data');
 assert.equal(x.direction,'觀望');
});
test('score is deterministic and distinguishes bullish and bearish inputs',()=>{
 const bull=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:100,marginChange:-10,shortChange:10,fearGreed:15,advanceDecline:1.5,futuresChangePct:1,adx:30,plusDi:30,minusDi:10,mfi:70,cci:120,priceVsVwap20Pct:1,asOf:fresh});
 const bear=scoreStock({trend:'bearish',macd:1,signal:2,rsi:40,volumeRatio:2,institutionalNet:-100,marginChange:10,shortChange:-10,fearGreed:90,advanceDecline:.5,futuresChangePct:-1,adx:30,plusDi:10,minusDi:30,mfi:30,cci:-120,priceVsVwap20Pct:-1,asOf:fresh});
 assert.ok(bull.score>bear.score);
 assert.ok(bull.confidence<=100,'confidence must never exceed 100%');
 const fullyCovered=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:1,trustFlowPct5d:4,foreignFlowPct5d:6,pe:10,pb:1,dividendYield:5,marginChange:-1,shortChange:1,fearGreed:10,largeHolderChangePct:1,retailBias:10,advanceDecline:2,futuresChangePct:1,adx:30,plusDi:30,minusDi:10,mfi:70,cci:120,priceVsVwap20Pct:1,k:60,priceVsEma20Pct:1,priceVsEma60Pct:1,return5dPct:1,return20dPct:1,asOf:fresh});
 assert.equal(fullyCovered.confidence,100,'all available factors must total exactly 100% coverage');
 assert.equal(bull.direction,'偏向買進');
 assert.equal(bear.direction,'偏向賣出／避險');
});
test('missing timestamps fail closed',()=>{
 const x=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:100,fearGreed:15,advanceDecline:1.5,futuresChangePct:1});
 assert.equal(x.fresh,false);
 assert.equal(x.direction,'觀望');
});

test('valuation and five-day institutional factors affect research score only when valid data exists',()=>{
 const neutral=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:100,asOf:fresh});
 const enriched=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:100,pe:12,pb:1.2,dividendYield:4.5,trustFlowPct5d:4,foreignFlowPct5d:6,asOf:fresh});
 assert.ok(enriched.score>neutral.score);
 assert.ok(enriched.confidence>neutral.confidence);
 assert.ok(enriched.reasons.some(x=>x.includes('估值')));
 assert.ok(enriched.reasons.some(x=>x.includes('近五日法人')));
});
test('invalid valuation fields do not become cheap-stock signals',()=>{
 const x=scoreStock({pe:0,pb:-1,dividendYield:-1,asOf:fresh});
 assert.equal(x.score,50);
 assert.equal(x.confidence,0);
 assert.equal(x.direction,'觀望');
});
