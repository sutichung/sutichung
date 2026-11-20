'use strict';

const { validateSaleEvent } = require('../lib/ant-payment');

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const HEX32 = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const WORDS = 5;
let rpcId = 0;

function requiredAddress(value, name) {
  const v = String(value || '').trim().toLowerCase();
  if (!ADDRESS.test(v) || /^0x0{40}$/.test(v)) throw new Error('invalid_' + name);
  return v;
}
function parseConfig(env = process.env) {
  if (String(env.ANT_INDEXER_ENABLED || '').toLowerCase() !== 'true') throw new Error('ANT_INDEXER_ENABLED must be true before indexer writes are enabled');
  const chainId = Number(env.ANT_INDEXER_CHAIN_ID || 97);
  if (chainId !== 97) throw new Error('this indexer version is restricted to BSC testnet chainId 97');
  const topic0 = String(env.ANT_PURCHASED_TOPIC0 || '').toLowerCase();
  if (!HEX32.test(topic0)) throw new Error('ANT_PURCHASED_TOPIC0 must be a 32-byte event signature topic');
  const startBlock = Number(env.ANT_INDEXER_START_BLOCK);
  const confirmations = Number(env.ANT_INDEXER_CONFIRMATIONS || 12);
  const maxRange = Number(env.ANT_INDEXER_MAX_RANGE || 500);
  const reorgLookback = Number(env.ANT_INDEXER_REORG_LOOKBACK || 64);
  if (!Number.isSafeInteger(startBlock) || startBlock < 1) throw new Error('invalid_ANT_INDEXER_START_BLOCK');
  if (!Number.isSafeInteger(confirmations) || confirmations < 12) throw new Error('ANT_INDEXER_CONFIRMATIONS must be at least 12');
  if (!Number.isSafeInteger(maxRange) || maxRange < 1 || maxRange > 2000) throw new Error('ANT_INDEXER_MAX_RANGE must be between 1 and 2000');
  if (!Number.isSafeInteger(reorgLookback) || reorgLookback < confirmations || reorgLookback > 500) throw new Error('invalid_ANT_INDEXER_REORG_LOOKBACK');
  const rpcUrls = String(env.BSC_RPC_URLS || env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-dataseed.bnbchain.org').split(',').map(x => x.trim()).filter(Boolean);
  if (!rpcUrls.length) throw new Error('missing_BSC_RPC_URLS');
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!/^https:\/\//i.test(supabaseUrl) || !serviceRoleKey) throw new Error('missing_supabase_service_configuration');
  return {
    chainId, topic0, startBlock, confirmations, maxRange, reorgLookback, rpcUrls,
    saleContract: requiredAddress(env.ANT_SALE_CONTRACT_ADDRESS, 'ANT_SALE_CONTRACT_ADDRESS'),
    usdtContract: requiredAddress(env.ANT_USDT_CONTRACT_ADDRESS, 'ANT_USDT_CONTRACT_ADDRESS'),
    antContract: requiredAddress(env.ANT_TOKEN_CONTRACT_ADDRESS, 'ANT_TOKEN_CONTRACT_ADDRESS'),
    feeRecipient: requiredAddress(env.ANT_FEE_RECIPIENT_ADDRESS, 'ANT_FEE_RECIPIENT_ADDRESS'),
    proceedsRecipient: requiredAddress(env.ANT_PROCEEDS_RECIPIENT_ADDRESS, 'ANT_PROCEEDS_RECIPIENT_ADDRESS'),
    supabaseUrl, serviceRoleKey
  };
}
function hexNumber(value, field) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('invalid_' + field);
  const n = Number(BigInt(value));
  if (!Number.isSafeInteger(n)) throw new Error('unsafe_' + field);
  return n;
}
function topicAddress(topic, field) {
  if (!HEX32.test(String(topic || ''))) throw new Error('invalid_' + field);
  return '0x' + topic.slice(-40).toLowerCase();
}
function decodePurchaseLog(log, config) {
  if (!log || !Array.isArray(log.topics) || log.topics.length !== 2) throw new Error('invalid_ant_purchased_topics');
  if (String(log.topics[0]).toLowerCase() !== config.topic0) throw new Error('wrong_ant_purchased_topic');
  if (String(log.address || '').toLowerCase() !== config.saleContract) throw new Error('wrong_sale_contract');
  if (!/^0x(?:[0-9a-f]{64}){5}$/i.test(String(log.data || ''))) throw new Error('invalid_ant_purchased_data');
  const values = [];
  for (let i = 0; i < WORDS; i++) values.push(BigInt('0x' + log.data.slice(2 + i * 64, 2 + (i + 1) * 64)).toString());
  return {
    chainId: config.chainId,
    address: config.saleContract,
    eventName: 'AntPurchased',
    buyer: topicAddress(log.topics[1], 'buyer_topic'),
    transactionHash: String(log.transactionHash || '').toLowerCase(),
    logIndex: hexNumber(log.logIndex, 'log_index'),
    blockNumber: hexNumber(log.blockNumber, 'block_number'),
    grossUsdt: values[0],
    feeUsdt: values[1],
    netUsdt: values[2],
    antOut: values[3],
    priceUsdtPerAnt: values[4],
    blockHash: String(log.blockHash || '').toLowerCase()
  };
}
function decodeTransfer(log) {
  if (!log || !Array.isArray(log.topics) || log.topics.length !== 3) return null;
  if (String(log.topics[0]).toLowerCase() !== TRANSFER_TOPIC) return null;
  if (!/^0x[0-9a-f]{64}$/i.test(String(log.data || ''))) return null;
  return {
    token: String(log.address || '').toLowerCase(),
    from: topicAddress(log.topics[1], 'transfer_from'),
    to: topicAddress(log.topics[2], 'transfer_to'),
    value: BigInt(log.data).toString()
  };
}
function verifyPurchaseReceipt(receipt, event, config) {
  if (!receipt || String(receipt.status).toLowerCase() !== '0x1') throw new Error('purchase_receipt_not_successful');
  if (String(receipt.to || '').toLowerCase() !== config.saleContract) throw new Error('purchase_receipt_wrong_target');
  if (String(receipt.blockHash || '').toLowerCase() !== event.blockHash) throw new Error('purchase_receipt_block_hash_mismatch');
  if (String(receipt.transactionHash || '').toLowerCase() !== event.transactionHash) throw new Error('purchase_receipt_transaction_hash_mismatch');
  if (hexNumber(receipt.blockNumber, 'receipt_block_number') !== event.blockNumber) throw new Error('purchase_receipt_block_number_mismatch');
  const purchaseLogs = (receipt.logs || []).filter(log =>
    String(log.address || '').toLowerCase() === config.saleContract &&
    Array.isArray(log.topics) && String(log.topics[0] || '').toLowerCase() === config.topic0
  );
  if (purchaseLogs.length !== 1) throw new Error('purchase_event_missing_or_duplicated_in_receipt');
  const receiptEvent = decodePurchaseLog(purchaseLogs[0], config);
  for (const key of ['buyer','transactionHash','logIndex','blockNumber','grossUsdt','feeUsdt','netUsdt','antOut','priceUsdtPerAnt','blockHash']) {
    if (receiptEvent[key] !== event[key]) throw new Error('purchase_event_receipt_mismatch_' + key);
  }
  const transfers = (receipt.logs || []).map(decodeTransfer).filter(Boolean);
  const usdt = transfers.filter(x => x.token === config.usdtContract && x.from === event.buyer);
  const ant = transfers.filter(x => x.token === config.antContract && x.from === config.saleContract && x.to === event.buyer);
  const fee = usdt.filter(x => x.to === config.feeRecipient && x.value === event.feeUsdt);
  const proceeds = usdt.filter(x => x.to === config.proceedsRecipient && x.value === event.netUsdt);
  const delivery = ant.filter(x => x.value === event.antOut);
  if (usdt.length !== 2 || fee.length !== 1 || proceeds.length !== 1) throw new Error('usdt_transfer_reconciliation_failed');
  if (ant.length !== 1 || delivery.length !== 1) throw new Error('ant_delivery_reconciliation_failed');
  return true;
}

async function rpc(config, method, params) {
  let lastError;
  for (const url of config.rpcUrls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error('rpc_http_' + response.status);
      const payload = await response.json();
      if (payload.error) throw new Error('rpc_' + method + ':' + String(payload.error.message || 'unknown').slice(0, 160));
      return payload.result;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('all_rpc_endpoints_failed');
}
async function supabase(config, path, options = {}) {
  const response = await fetch(config.supabaseUrl + path, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey,
      Accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(12000)
  });
  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch (_) { throw new Error('invalid_supabase_json'); }
  if (!response.ok) throw new Error('supabase_http_' + response.status + ':' + String(data.message || data.details || data.hint || '').slice(0, 180));
  return data;
}
async function walletOwner(config, buyer, cache) {
  if (cache.has(buyer)) return cache.get(buyer);
  const q = new URLSearchParams({ select: 'user_id', chain_id: 'eq.' + config.chainId, wallet_address: 'eq.' + buyer, limit: '1' });
  const rows = await supabase(config, '/rest/v1/ant_wallets?' + q.toString());
  const userId = rows[0]?.user_id || null;
  cache.set(buyer, userId);
  return userId;
}
async function reconcileRecent(config, head) {
  const from = Math.max(config.startBlock, head - config.reorgLookback);
  const q = new URLSearchParams({ select: 'id,block_number,block_hash', chain_id: 'eq.' + config.chainId, sale_contract: 'eq.' + config.saleContract, status: 'eq.confirmed', block_number: 'gte.' + from, limit: '500' });
  const rows = await supabase(config, '/rest/v1/ant_sale_events?' + q.toString());
  const blocks = new Map();
  for (const row of rows) {
    const number = Number(row.block_number);
    if (!blocks.has(number)) blocks.set(number, await rpc(config, 'eth_getBlockByNumber', ['0x' + number.toString(16), false]));
    const block = blocks.get(number);
    if (!block || String(block.hash || '').toLowerCase() !== String(row.block_hash || '').toLowerCase()) {
      const patch = new URLSearchParams({ id: 'eq.' + row.id });
      await supabase(config, '/rest/v1/ant_sale_events?' + patch.toString(), { method: 'PATCH', body: { status: 'orphaned', confirmations: 0 } });
    }
  }
  return { checked: rows.length, orphaned: rows.filter(row => !blocks.get(Number(row.block_number)) || String(blocks.get(Number(row.block_number)).hash || '').toLowerCase() !== String(row.block_hash || '').toLowerCase()).length };
}
async function readCursor(config) {
  const q = new URLSearchParams({ select: 'id,last_scanned_block,last_block_hash', chain_id: 'eq.' + config.chainId, sale_contract: 'eq.' + config.saleContract, limit: '1' });
  const rows = await supabase(config, '/rest/v1/ant_indexer_cursors?' + q.toString());
  return rows[0] || null;
}
async function saveCursor(config, lastBlock, blockHash) {
  await supabase(config, '/rest/v1/ant_indexer_cursors?on_conflict=chain_id,sale_contract', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ chain_id: config.chainId, sale_contract: config.saleContract, last_scanned_block: lastBlock, last_block_hash: blockHash, updated_at: new Date().toISOString() }]
  });
}
async function runOnce(env = process.env) {
  const config = parseConfig(env);
  const chainHex = await rpc(config, 'eth_chainId', []);
  if (Number(BigInt(chainHex)) !== config.chainId) throw new Error('rpc_chain_id_mismatch');
  const head = hexNumber(await rpc(config, 'eth_blockNumber', []), 'head_block');
  const safeHead = head - config.confirmations + 1;
  const reorg = await reconcileRecent(config, head);
  const cursor = await readCursor(config);
  let fromBlock = cursor ? Number(cursor.last_scanned_block) + 1 : config.startBlock;
  if (cursor) {
    const stored = await rpc(config, 'eth_getBlockByNumber', ['0x' + Number(cursor.last_scanned_block).toString(16), false]);
    if (!stored || String(stored.hash || '').toLowerCase() !== String(cursor.last_block_hash || '').toLowerCase()) {
      fromBlock = Math.max(config.startBlock, Number(cursor.last_scanned_block) - config.reorgLookback + 1);
    }
  }
  if (fromBlock > safeHead) return { status: 'idle', head, safeHead, fromBlock, reorg };
  const toBlock = Math.min(safeHead, fromBlock + config.maxRange - 1);
  const logs = await rpc(config, 'eth_getLogs', [{
    address: config.saleContract,
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: '0x' + toBlock.toString(16),
    topics: [config.topic0]
  }]);
  const ownerCache = new Map();
  let saved = 0;
  for (const log of logs || []) {
    const event = decodePurchaseLog(log, config);
    if (!HEX32.test(event.blockHash)) throw new Error('invalid_event_block_hash');
    const block = await rpc(config, 'eth_getBlockByNumber', [log.blockNumber, false]);
    if (!block || String(block.hash || '').toLowerCase() !== event.blockHash) throw new Error('event_block_hash_changed_retry_required');
    const normalized = validateSaleEvent(event, config);
    const receipt = await rpc(config, 'eth_getTransactionReceipt', [event.transactionHash]);
    verifyPurchaseReceipt(receipt, event, config);
    const userId = await walletOwner(config, event.buyer, ownerCache);
    const row = {
      user_id: userId,
      chain_id: config.chainId,
      tx_hash: normalized.transactionHash,
      log_index: normalized.logIndex,
      block_number: normalized.blockNumber,
      block_hash: event.blockHash,
      buyer_wallet: normalized.buyer,
      sale_contract: normalized.saleContract,
      usdt_contract: config.usdtContract,
      ant_contract: config.antContract,
      gross_usdt: normalized.grossUsdtRaw,
      fee_usdt: normalized.feeUsdtRaw,
      net_usdt: normalized.netUsdtRaw,
      ant_out: normalized.antOutRaw,
      oracle_price: normalized.oraclePriceRaw,
      status: 'confirmed',
      confirmations: head - normalized.blockNumber + 1,
      source: 'bsc-json-rpc-indexer',
      observed_at: block.timestamp ? new Date(hexNumber(block.timestamp, 'block_timestamp') * 1000).toISOString() : new Date().toISOString(),
      confirmed_at: new Date().toISOString()
    };
    await supabase(config, '/rest/v1/ant_sale_events?on_conflict=chain_id,tx_hash,log_index', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [row]
    });
    saved++;
  }
  const cursorBlock = await rpc(config, 'eth_getBlockByNumber', ['0x' + toBlock.toString(16), false]);
  if (!cursorBlock || !HEX32.test(String(cursorBlock.hash || ''))) throw new Error('cursor_block_unavailable');
  await saveCursor(config, toBlock, String(cursorBlock.hash).toLowerCase());
  return { status: 'ok', chainId: config.chainId, head, safeHead, fromBlock, toBlock, logs: (logs || []).length, saved, reorg };
}

if (require.main === module) {
  runOnce().then(result => {
    process.stdout.write(JSON.stringify(result) + '\\n');
  }).catch(error => {
    process.stderr.write('[ant-sale-indexer] ' + String(error.message || error).slice(0, 240) + '\\n');
    process.exitCode = 1;
  });
}
module.exports = { TRANSFER_TOPIC, parseConfig, decodePurchaseLog, decodeTransfer, verifyPurchaseReceipt, runOnce };
