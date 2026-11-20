'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCreatorAllocation } = require('../lib/ant-creator-revenue');

test('allocates net-of-tax fee income with integer arithmetic', () => {
  assert.deepEqual(calculateCreatorAllocation('500000', '50000'), {
    feeRaw: '500000', taxReserveRaw: '50000', distributableRaw: '450000',
    creatorRaw: '270000', productRaw: '112500', securityRaw: '45000', reserveRaw: '22500'
  });
});
test('rounding dust is deterministically assigned to reserve', () => {
  const a = calculateCreatorAllocation('101', '0');
  assert.equal(BigInt(a.creatorRaw)+BigInt(a.productRaw)+BigInt(a.securityRaw)+BigInt(a.reserveRaw), 101n);
  assert.equal(a.reserveRaw, '6');
});
test('rejects invalid raw units and tax reserves above fee income', () => {
  for (const value of ['', '0.1', '-1', '1e4', '9'.repeat(79)]) assert.throws(() => calculateCreatorAllocation(value));
  assert.throws(() => calculateCreatorAllocation('100', '101'), /tax_reserve_exceeds_fee/);
});
test('zero tax reserve is allowed and no floating point arithmetic is used', () => {
  const a = calculateCreatorAllocation('10000', '0');
  assert.equal(a.creatorRaw, '6000');
  assert.equal(a.productRaw, '2500');
  assert.equal(a.securityRaw, '1000');
  assert.equal(a.reserveRaw, '500');
});
