'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {epochMilliseconds,isStaleTimestamp}=require('../lib/market-timestamps');

test('Fugle timestamps in seconds and milliseconds normalize to the same instant',()=>{
 const seconds=1795080000;
 assert.equal(epochMilliseconds(seconds),seconds*1000);
 assert.equal(epochMilliseconds(seconds*1000),seconds*1000);
});
test('quote freshness rejects missing, stale and implausibly future timestamps',()=>{
 const now=1795080000000;
 assert.equal(isStaleTimestamp(now-60000,now),false);
 assert.equal(isStaleTimestamp(now-600000,now),true);
 assert.equal(isStaleTimestamp(now+120000,now),true);
 assert.equal(isStaleTimestamp(null,now),true);
});
