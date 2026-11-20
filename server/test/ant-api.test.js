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
