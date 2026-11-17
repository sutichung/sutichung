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
 const bull=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:100,marginChange:-10,shortChange:10,fearGreed:15,advanceDecline:1.5,futuresChangePct:1,asOf:fresh});
 const bear=scoreStock({trend:'bearish',macd:1,signal:2,rsi:40,volumeRatio:2,institutionalNet:-100,marginChange:10,shortChange:-10,fearGreed:90,advanceDecline:.5,futuresChangePct:-1,asOf:fresh});
 assert.ok(bull.score>bear.score);
 assert.equal(bull.direction,'偏向買進');
 assert.equal(bear.direction,'偏向賣出／避險');
});
test('missing timestamps fail closed',()=>{
 const x=scoreStock({trend:'bullish',macd:2,signal:1,rsi:60,volumeRatio:2,institutionalNet:100,fearGreed:15,advanceDecline:1.5,futuresChangePct:1});
 assert.equal(x.fresh,false);
 assert.equal(x.direction,'觀望');
});
