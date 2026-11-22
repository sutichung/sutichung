'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { buildWalletMessage, parseRaw } = require('../lib/ant-api');

test('wallet challenge is domain, nonce, expiry and chain bound', () => {
  const args = { domain:'ant.example.com', wallet:'0x1111111111111111111111111111111111111111', nonce:'a'.repeat(48), issuedAt:'2026-11-20T00:00:00.000Z', expiresAt:'2026-11-20T00:05:00.000Z' };
  const message = buildWalletMessage(args);
  assert.match(message, /Chain ID: 97/);
  assert.match(message, /Nonce: a{48}/);
  assert.match(message, /Expiration Time:/);
});
test('wallet signature recovers the exact wallet message signer', async () => {
  const wallet = ethers.Wallet.createRandom();
  const args = { domain:'ant.example.com', wallet:wallet.address, nonce:'b'.repeat(48), issuedAt:'2026-11-20T00:00:00.000Z', expiresAt:'2026-11-20T00:05:00.000Z' };
  const message = buildWalletMessage(args);
  const signature = await wallet.signMessage(message);
  assert.equal(ethers.verifyMessage(message, signature), wallet.address);
});
test('raw token amounts reject floats, signs, empty and oversized inputs', () => {
  assert.equal(parseRaw('123456789','gross'), '123456789');
  for (const value of ['','0','-1','1.5','1e8','9'.repeat(79)]) assert.throws(() => parseRaw(value,'gross'));
});

test('finance assurance requires an MFA aal2 token claim', () => {
  const { assuranceLevel } = require('../lib/ant-api');
  const token = payload => 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';
  assert.equal(assuranceLevel({headers:{authorization:'Bearer '+token({aal:'aal2'})}}),'aal2');
  assert.equal(assuranceLevel({headers:{authorization:'Bearer '+token({aal:'aal1'})}}),'aal1');
  assert.equal(assuranceLevel({headers:{authorization:'Bearer not-a-jwt'}}),'aal1');
});

test('conditional order submission rejects a lost race instead of claiming success', () => {
  const { requireConditionalUpdate } = require('../lib/ant-api');
  const row = { id: 'order-1', status: 'submitted' };
  assert.equal(requireConditionalUpdate([row], 'order_already_submitted'), row);
  assert.throws(
    () => requireConditionalUpdate([], 'order_already_submitted'),
    error => error.status === 409 && error.message === 'order_already_submitted'
  );
  assert.throws(
    () => requireConditionalUpdate(null, 'order_already_submitted'),
    error => error.status === 409
  );
});

test('finance access accepts only an assigned finance role or exact configured admin email', () => {
  const { hasFinanceAccess } = require('../lib/ant-api');
  assert.equal(hasFinanceAccess({email:'OWNER@example.com'}, [], 'owner@example.com'), true);
  assert.equal(hasFinanceAccess({email:'owner@example.com'}, [], 'other@example.com'), false);
  assert.equal(hasFinanceAccess({email:'member@example.com'}, [{role:'FINANCE_VIEWER'}], ''), true);
  assert.equal(hasFinanceAccess({email:'member@example.com'}, [{role:'SUPPORT'}], ''), false);
  assert.equal(hasFinanceAccess({}, [], 'owner@example.com'), false);
});

test('order history query is scoped to the authenticated user and bounded', () => {
  const { buildOrderHistoryQuery } = require('../lib/ant-api');
  const query = buildOrderHistoryQuery('user@example.com/id');
  assert.match(query, /user_id=eq\.user%40example\.com%2Fid/);
  assert.match(query, /order=created_at\.desc/);
  assert.match(query, /limit=100/);
  assert.doesNotMatch(query, /user_id=eq\.undefined/);
});
test('ANT API factory returns a callable handler and passes through unrelated routes', async () => {
  const { createAntApi } = require('../lib/ant-api');
  const handler = createAntApi({
    supabaseUrl: '',
    anonKey: '',
    serviceKey: '',
    json: () => { throw new Error('unexpected_response'); },
    readJson: async () => ({})
  });
  assert.equal(typeof handler, 'function');
  const handled = await handler(
    { method: 'GET', headers: {} },
    {},
    new URL('http://localhost/api/health')
  );
  assert.equal(handled, false);
});

test('ANT quote minimum output cannot be weakened below the 1% slippage floor', () => {
  const { resolveMinimumAntOut } = require('../lib/ant-api');
  const quoted = 1000000n;
  assert.equal(resolveMinimumAntOut(quoted), 990000n);
  assert.equal(resolveMinimumAntOut(quoted, '995000'), 995000n);
  assert.throws(() => resolveMinimumAntOut(quoted, '989999'), /invalid_min_ant_out/);
  assert.throws(() => resolveMinimumAntOut(quoted, '1000001'), /invalid_min_ant_out/);
  assert.throws(() => resolveMinimumAntOut(quoted, '0'), /invalid_min_ant_out/);
});

test('ANT quote expiry never extends beyond the immutable sale end', () => {
  const { resolveQuoteExpiry } = require('../lib/ant-api');
  const now = Date.parse('2026-11-22T10:00:00.000Z');
  assert.equal(resolveQuoteExpiry(now, Math.floor(now / 1000) + 600), new Date(now + 300000).toISOString());
  assert.equal(resolveQuoteExpiry(now, Math.floor(now / 1000) + 120), new Date(now + 120000).toISOString());
  assert.throws(() => resolveQuoteExpiry(now, Math.floor(now / 1000)), /sale_ended/);
});
