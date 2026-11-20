'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { decodeEvent, ledgerRows, verifyPurchaseReceipt } = require('../jobs/ant-chain-indexer');

const cfg = {
  sale: '0x1111111111111111111111111111111111111111',
  usdt: '0x2222222222222222222222222222222222222222',
  ant: '0x3333333333333333333333333333333333333333',
  feeWallet: '0x4444444444444444444444444444444444444444',
  treasuryWallet: '0x5555555555555555555555555555555555555555',
  usdtDecimals: 18,
  antDecimals: 18
};
const abi = new ethers.Interface(['event AntPurchased(address indexed buyer,uint256 grossUsdt,uint256 feeUsdt,uint256 netUsdt,uint256 antOut,uint256 priceUsdtPerAnt)']);
const erc20 = new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const buyer = '0x6666666666666666666666666666666666666666';

function log(gross='1000', fee='50', net='950') {
  const encoded = abi.encodeEventLog(abi.getEvent('AntPurchased'), [buyer, gross, fee, net, '100000000000000000000', '100000000']);
  return { address: cfg.sale, topics: encoded.topics, data: encoded.data, transactionHash: '0x'+'a'.repeat(64), index: 2, blockNumber: 100, blockHash: '0x'+'b'.repeat(64) };
}
function transfer(token, from, to, amount) {
  const encoded = erc20.encodeEventLog(erc20.getEvent('Transfer'), [from, to, amount]);
  return { address: token, topics: encoded.topics, data: encoded.data, index: 3 };
}
function receiptFor(eventLog) {
  return {
    status: 1, to: cfg.sale, transactionHash: eventLog.transactionHash,
    blockNumber: eventLog.blockNumber, blockHash: eventLog.blockHash,
    logs: [
      { ...eventLog },
      transfer(cfg.usdt, buyer, cfg.feeWallet, 50),
      transfer(cfg.usdt, buyer, cfg.treasuryWallet, 950),
      transfer(cfg.ant, cfg.sale, buyer, '100000000000000000000')
    ]
  };
}

test('decodes a valid BSC testnet AntPurchased event with exact 5% fee split', () => {
  const event = decodeEvent(log(), cfg);
  assert.equal(event.chainId, 97);
  assert.equal(event.grossUsdtRaw, '1000');
  assert.equal(event.feeUsdtRaw, '50');
  assert.equal(event.netUsdtRaw, '950');
  assert.equal(event.buyer, buyer.toLowerCase());
  assert.equal(event.idempotencyKey, '97:0x'+'a'.repeat(64)+':2');
});
test('rejects event with incorrect fee split', () => {
  assert.throws(() => decodeEvent(log('1000','49','951'), cfg), /fee_split_mismatch/);
});
test('creates balanced ledger entries without writing zero-value fee rows', () => {
  const event = decodeEvent(log(), cfg);
  const rows = ledgerRows({id:'order-id'}, event, cfg);
  assert.deepEqual(rows.map(x=>x.entry_type), ['usdt_gross','usdt_fee','usdt_net','ant_delivery']);
  assert.equal(BigInt(rows[1].amount_raw)+BigInt(rows[2].amount_raw), BigInt(rows[0].amount_raw));
  assert.equal(rows[3].asset_symbol, 'ANT');
  assert.equal(rows[3].direction, 'out', 'ANT delivery is an outflow from the platform inventory');
  const zeroFee = { ...event, grossUsdtRaw:'19', feeUsdtRaw:'0', netUsdtRaw:'19' };
  assert.deepEqual(ledgerRows({id:'zero-fee'}, zeroFee, cfg).map(x=>x.entry_type), ['usdt_gross','usdt_net','ant_delivery']);
});
test('rejects a log emitted by a different sale contract', () => {
  const wrong = {...log(), address:'0x7777777777777777777777777777777777777777'};
  assert.throws(() => decodeEvent(wrong, cfg), /wrong_sale_contract/);
});
test('reconciles receipt event, USDT fee, net proceeds and ANT delivery', () => {
  const source = log();
  const event = decodeEvent(source, cfg);
  assert.equal(verifyPurchaseReceipt(receiptFor(source), source, event, cfg), true);
});
test('rejects receipt when fee transfer or ANT delivery is inconsistent', () => {
  const source = log();
  const event = decodeEvent(source, cfg);
  const wrongFee = receiptFor(source);
  wrongFee.logs[1] = transfer(cfg.usdt, buyer, cfg.feeWallet, 49);
  assert.throws(() => verifyPurchaseReceipt(wrongFee, source, event, cfg), /receipt_usdt_transfer_reconciliation_failed/);
  const wrongAnt = receiptFor(source);
  wrongAnt.logs[3] = transfer(cfg.ant, cfg.sale, buyer, 1);
  assert.throws(() => verifyPurchaseReceipt(wrongAnt, source, event, cfg), /receipt_ant_delivery_reconciliation_failed/);
});
