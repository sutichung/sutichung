'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TRANSFER_TOPIC, parseConfig, decodePurchaseLog, decodeTransfer, verifyPurchaseReceipt } = require('../jobs/ant-sale-indexer');

const sale='0x1111111111111111111111111111111111111111';
const usdt='0x2222222222222222222222222222222222222222';
const ant='0x3333333333333333333333333333333333333333';
const buyer='0x4444444444444444444444444444444444444444';
const fee='0x5555555555555555555555555555555555555555';
const proceeds='0x6666666666666666666666666666666666666666';
const topic0='0x'+'a'.repeat(64);
const blockHash='0x'+'b'.repeat(64);
const txHash='0x'+'c'.repeat(64);
const topicAddress=address=>'0x'+address.slice(2).padStart(64,'0');
const word=value=>BigInt(value).toString(16).padStart(64,'0');
const config={chainId:97,topic0,saleContract:sale,usdtContract:usdt,antContract:ant,feeRecipient:fee,proceedsRecipient:proceeds};
function makeLog(){
  return {address:sale,topics:[topic0,topicAddress(buyer)],data:'0x'+[
    word(100000000),word(5000000),word(95000000),word('95000000000000000000'),word(100000000)
  ].join(''),transactionHash:txHash,logIndex:'0x2',blockNumber:'0x64',blockHash};
}
function transferLog(token,from,to,value){
  return {address:token,topics:[TRANSFER_TOPIC,topicAddress(from),topicAddress(to)],data:'0x'+word(value)};
}
function makeReceipt(){
  return {status:'0x1',to:sale,blockHash,transactionHash:txHash,blockNumber:'0x64',logs:[makeLog(),
    transferLog(usdt,buyer,fee,5000000),
    transferLog(usdt,buyer,proceeds,95000000),
    transferLog(ant,sale,buyer,'95000000000000000000')
  ]};
}

test('requires explicit testnet-only indexer configuration and all immutable sale addresses',()=>{
  const env={
    ANT_INDEXER_ENABLED:'true',ANT_INDEXER_CHAIN_ID:'97',ANT_PURCHASED_TOPIC0:topic0,
    ANT_INDEXER_START_BLOCK:'100',ANT_INDEXER_CONFIRMATIONS:'12',ANT_SALE_CONTRACT_ADDRESS:sale,
    ANT_USDT_CONTRACT_ADDRESS:usdt,ANT_TOKEN_CONTRACT_ADDRESS:ant,
    ANT_FEE_RECIPIENT_ADDRESS:fee,ANT_PROCEEDS_RECIPIENT_ADDRESS:proceeds,
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'
  };
  assert.equal(parseConfig(env).chainId,97);
  assert.throws(()=>parseConfig({...env,ANT_INDEXER_ENABLED:'false'}),/ANT_INDEXER_ENABLED/);
  assert.throws(()=>parseConfig({...env,ANT_INDEXER_CHAIN_ID:'56'}),/restricted/);
  assert.throws(()=>parseConfig({...env,ANT_INDEXER_CONFIRMATIONS:'3'}),/at least 12/);
});

test('decodes the AntPurchased event using raw integer amounts',()=>{
  const event=decodePurchaseLog(makeLog(),config);
  assert.equal(event.buyer,buyer);
  assert.equal(event.grossUsdt,'100000000');
  assert.equal(event.feeUsdt,'5000000');
  assert.equal(event.netUsdt,'95000000');
  assert.equal(event.antOut,'95000000000000000000');
  assert.equal(event.priceUsdtPerAnt,'100000000');
  assert.equal(event.logIndex,2);
  assert.equal(event.blockNumber,100);
});

test('rejects mismatched event signature, sale address and malformed event data',()=>{
  assert.throws(()=>decodePurchaseLog({...makeLog(),topics:['0x'+'d'.repeat(64),topicAddress(buyer)]},config),/wrong_ant_purchased_topic/);
  assert.throws(()=>decodePurchaseLog({...makeLog(),address:buyer},config),/wrong_sale_contract/);
  assert.throws(()=>decodePurchaseLog({...makeLog(),data:'0x1234'},config),/invalid_ant_purchased_data/);
});

test('decodes standard ERC20 Transfer logs',()=>{
  const transfer=decodeTransfer(transferLog(usdt,buyer,fee,5000000));
  assert.equal(transfer.from,buyer);
  assert.equal(transfer.to,fee);
  assert.equal(transfer.value,'5000000');
});

test('reconciles both USDT recipient transfers and ANT delivery in the transaction receipt',()=>{
  const event=decodePurchaseLog(makeLog(),config);
  assert.equal(verifyPurchaseReceipt(makeReceipt(),event,config),true);
});


test('rejects receipts that do not contain the exact purchase event',()=>{
  const event=decodePurchaseLog(makeLog(),config);
  const receipt=makeReceipt();
  receipt.logs[0]=makeLog();
  receipt.logs[0].data='0x'+[word(100000000),word(5000000),word(94000000),word('95000000000000000000'),word(100000000)].join('');
  assert.throws(()=>verifyPurchaseReceipt(receipt,event,config),/purchase_event_receipt_mismatch_netUsdt/);
});

test('rejects receipts with mismatched transaction or block identity',()=>{
  const event=decodePurchaseLog(makeLog(),config);
  const receipt=makeReceipt();
  receipt.transactionHash='0x'+'d'.repeat(64);
  assert.throws(()=>verifyPurchaseReceipt(receipt,event,config),/purchase_receipt_transaction_hash_mismatch/);
});

test('rejects a receipt if the 95 percent proceeds transfer is missing or wrong',()=>{
  const event=decodePurchaseLog(makeLog(),config);
  const receipt=makeReceipt();
  receipt.logs[1]=transferLog(usdt,buyer,proceeds,94000000);
  assert.throws(()=>verifyPurchaseReceipt(receipt,event,config),/usdt_transfer_reconciliation_failed/);
});

test('rejects a receipt if ANT delivery does not match the purchase event',()=>{
  const event=decodePurchaseLog(makeLog(),config);
  const receipt=makeReceipt();
  receipt.logs[2]=transferLog(ant,sale,buyer,1);
  assert.throws(()=>verifyPurchaseReceipt(receipt,event,config),/ant_delivery_reconciliation_failed/);
});
