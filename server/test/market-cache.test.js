'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAsyncCache} = require('../lib/market-cache');

test('concurrent cache misses share one upstream request', async () => {
  const cache=createAsyncCache();
  let calls=0;
  const loader=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,15));return {price:100};};
  const [a,b,c]=await Promise.all([cache.get('quote',1000,loader),cache.get('quote',1000,loader),cache.get('quote',1000,loader)]);
  assert.equal(calls,1);
  assert.deepEqual(a,b);
  assert.deepEqual(b,c);
  assert.equal((await cache.get('quote',1000,loader)).price,100);
  assert.equal(calls,1);
});

test('failed refresh returns explicitly marked stale data', async () => {
  const cache=createAsyncCache();
  await cache.get('quote',0,async()=>({price:100}));
  const stale=await cache.get('quote',0,async()=>{throw new Error('upstream timeout');});
  assert.equal(stale.price,100);
  assert.equal(stale.stale,true);
  assert.match(stale.warning,/舊快取/);
  assert.match(stale.refreshError,/timeout/);
});

test('cache bounds retained keys', async () => {
  const cache=createAsyncCache({maxEntries:2});
  await cache.get('a',1000,async()=>1);
  await cache.get('b',1000,async()=>2);
  await cache.get('c',1000,async()=>3);
  assert.equal(cache.size,2);
});
