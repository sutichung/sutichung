'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const colony = require('../lib/ant-colony');

test('ant colony fans out small independent tasks and reports progress', async () => {
  const rows = Array.from({length:3},(_,i)=>({symbol:'T'+i,price:100,asOf:new Date().toISOString(),source:'unit-test',scorecard:{status:'research-ready',fresh:true,direction:'中立觀望'},indicators:{rsi:55,macdHistogram:1,volumeRatio:1.2}}));
  const result = colony.enqueue('TEST',rows,'test-batch-'+Date.now());
  assert.equal(result.symbols,3);
  assert.equal(result.roles,6);
  assert.equal(result.accepted,18);
  await new Promise(resolve=>setTimeout(resolve,250));
  const status=colony.getStatus();
  assert.ok(status.enqueued>=18);
  assert.ok(status.completed>=18);
  assert.equal(status.byMarket.TEST.queued,0);
  assert.ok(status.consensus.some(x=>x.market==='TEST'&&x.symbol==='T0'));
  assert.equal(status.consensus.find(x=>x.symbol==='T0').verdict,'偏多觀察');
});
