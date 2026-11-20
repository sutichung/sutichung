'use strict';

const { ethers } = require('ethers');
const { calculateUsdtSplit, validateSaleEvent } = require('../lib/ant-payment');

const CHAIN_ID = 97;
const WORKER_KEY = 'ant-bsc-testnet';
const POLL_MS = Number(process.env.ANT_INDEXER_POLL_MS || 15000);
const RANGE = Number(process.env.ANT_INDEXER_BLOCK_RANGE || 500);
if (!Number.isSafeInteger(POLL_MS) || POLL_MS < 5000 || POLL_MS > 300000) throw new Error('ANT_INDEXER_POLL_MS must be between 5000 and 300000');
if (!Number.isSafeInteger(RANGE) || RANGE < 1 || RANGE > 2000) throw new Error('ANT_INDEXER_BLOCK_RANGE must be between 1 and 2000');
const CONFIRMATIONS = Number(process.env.ANT_INDEXER_CONFIRMATIONS || 12);
const REORG_LOOKBACK = Number(process.env.ANT_INDEXER_REORG_LOOKBACK || 64);
if (!Number.isSafeInteger(CONFIRMATIONS) || CONFIRMATIONS < 12) throw new Error('ANT_INDEXER_CONFIRMATIONS must be an integer of at least 12');
if (!Number.isSafeInteger(REORG_LOOKBACK) || REORG_LOOKBACK < CONFIRMATIONS || REORG_LOOKBACK > 500) throw new Error('ANT_INDEXER_REORG_LOOKBACK must be between confirmations and 500');
const EVENT_ABI = ['event AntPurchased(address indexed buyer,uint256 grossUsdt,uint256 feeUsdt,uint256 netUsdt,uint256 antOut,uint256 priceUsdtPerAnt)'];
const iface = new ethers.Interface(EVENT_ABI);
const transferIface = new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const SALE_CONFIG_ABI = ['function usdt() view returns (address)', 'function ant() view returns (address)', 'function feeRecipient() view returns (address)', 'function proceedsRecipient() view returns (address)', 'function usdtDecimals() view returns (uint8)', 'function oracle() view returns (address)', 'function maxOracleAge() view returns (uint256)'];
const topic = iface.getEvent('AntPurchased').topicHash;



function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error('missing_' + name);
  return value;
}
function address(name) {
  const value = required(name);
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error('invalid_' + name);
  return ethers.getAddress(value);
}
function config() {
  const cfg = {
    rpcA: required('BSC_TESTNET_RPC_URL'),
    rpcB: required('BSC_TESTNET_RPC_URL_SECONDARY'),
    supabaseUrl: required('SUPABASE_URL').replace(/\/+$/, ''),
    serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    sale: address('ANT_SALE_CONTRACT'),
    usdt: address('ANT_USDT_CONTRACT'),
    ant: address('ANT_TOKEN_CONTRACT'),
    oracle: address('ANT_ORACLE_CONTRACT'),
    feeWallet: address('ANT_FEE_WALLET'),
    treasuryWallet: address('ANT_TREASURY_WALLET'),
    maxOracleAge: Math.max(60, Number(process.env.ANT_MAX_ORACLE_AGE || 3600)),
    usdtDecimals: Number(required('ANT_USDT_DECIMALS')),
    antDecimals: 18
  };
  if (!Number.isInteger(cfg.usdtDecimals) || cfg.usdtDecimals < 0 || cfg.usdtDecimals > 18) throw new Error('invalid_ANT_USDT_DECIMALS');
  if (!Number.isSafeInteger(cfg.maxOracleAge) || cfg.maxOracleAge < 60) throw new Error('invalid_ANT_MAX_ORACLE_AGE');
  if (!Number.isSafeInteger(cfg.maxOracleAge) || cfg.maxOracleAge < 60) throw new Error('invalid_ANT_MAX_ORACLE_AGE');
  return cfg;
}
async function db(cfg, table, { method = 'GET', query = '', body, prefer } = {}) {
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: 'Bearer ' + cfg.serviceKey,
    Accept: 'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(cfg.supabaseUrl + '/rest/v1/' + table + (query ? '?' + query : ''), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  let data = [];
  try { data = raw ? JSON.parse(raw) : []; } catch (_) { throw new Error('supabase_invalid_json_' + table); }
  if (!response.ok) throw new Error('supabase_' + response.status + '_' + table + ':' + raw.slice(0, 300));
  return data;
}
async function verifyContractConfiguration(provider, cfg) {
  const sale = new ethers.Contract(cfg.sale, SALE_CONFIG_ABI, provider);
  const [usdt, ant, fee, treasury, decimals, oracle, maxAge] = await Promise.all([
    sale.usdt(), sale.ant(), sale.feeRecipient(), sale.proceedsRecipient(), sale.usdtDecimals(), sale.oracle(), sale.maxOracleAge()
  ]);
  if (usdt.toLowerCase() !== cfg.usdt.toLowerCase() || ant.toLowerCase() !== cfg.ant.toLowerCase() ||
      fee.toLowerCase() !== cfg.feeWallet.toLowerCase() || treasury.toLowerCase() !== cfg.treasuryWallet.toLowerCase() || Number(decimals) !== cfg.usdtDecimals || oracle.toLowerCase() !== cfg.oracle.toLowerCase() || Number(maxAge) !== cfg.maxOracleAge) {
    throw new Error('sale_contract_configuration_mismatch');
  }
  return true;
}
function decodeEvent(log, cfg) {
  if (String(log.address).toLowerCase() !== cfg.sale.toLowerCase()) throw new Error('wrong_sale_contract');
  const parsed = iface.parseLog({ topics: log.topics, data: log.data });
  if (!parsed || parsed.name !== 'AntPurchased') throw new Error('wrong_event');
  const event = {
    chainId: CHAIN_ID, address: log.address, eventName: parsed.name,
    buyer: parsed.args.buyer, transactionHash: log.transactionHash,
    logIndex: log.index, blockNumber: log.blockNumber,
    grossUsdt: parsed.args.grossUsdt.toString(), feeUsdt: parsed.args.feeUsdt.toString(),
    netUsdt: parsed.args.netUsdt.toString(), antOut: parsed.args.antOut.toString(),
    priceUsdtPerAnt: parsed.args.priceUsdtPerAnt.toString()
  };
  const verified = validateSaleEvent(event, { chainId: CHAIN_ID, saleContract: cfg.sale, usdtContract: cfg.usdt, antContract: cfg.ant });
  return { ...verified, blockHash: log.blockHash, raw: { topics: log.topics, data: log.data } };
}
function ledgerRows(order, event, cfg) {
  const base = { order_id: order.id, chain_id: CHAIN_ID, tx_hash: event.transactionHash, log_index: event.logIndex, canonical: true };
  const rows = [
    { ...base, entry_type: 'usdt_gross', asset_symbol: 'USDT', asset_contract: cfg.usdt.toLowerCase(), asset_decimals: cfg.usdtDecimals, amount_raw: event.grossUsdtRaw, direction: 'in', wallet: event.buyer },
    { ...base, entry_type: 'usdt_net', asset_symbol: 'USDT', asset_contract: cfg.usdt.toLowerCase(), asset_decimals: cfg.usdtDecimals, amount_raw: event.netUsdtRaw, direction: 'out', wallet: cfg.treasuryWallet.toLowerCase() },
    { ...base, entry_type: 'ant_delivery', asset_symbol: 'ANT', asset_contract: cfg.ant.toLowerCase(), asset_decimals: cfg.antDecimals, amount_raw: event.antOutRaw, direction: 'in', wallet: event.buyer }
  ];
  if (BigInt(event.feeUsdtRaw) > 0n) rows.splice(1, 0,
    { ...base, entry_type: 'usdt_fee', asset_symbol: 'USDT', asset_contract: cfg.usdt.toLowerCase(), asset_decimals: cfg.usdtDecimals, amount_raw: event.feeUsdtRaw, direction: 'out', wallet: cfg.feeWallet.toLowerCase() }
  );
  return rows;
}
function verifyPurchaseReceipt(receipt, log, event, cfg) {
  if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== cfg.sale.toLowerCase()) throw new Error('receipt_not_successful_or_wrong_target');
  if (receipt.transactionHash?.toLowerCase() !== event.transactionHash || receipt.blockNumber !== log.blockNumber || receipt.blockHash !== log.blockHash) {
    throw new Error('receipt_identity_mismatch');
  }
  const purchaseLogs = (receipt.logs || []).filter(item =>
    item.address.toLowerCase() === cfg.sale.toLowerCase() &&
    String(item.topics?.[0] || '').toLowerCase() === topic.toLowerCase()
  );
  if (purchaseLogs.length !== 1 || purchaseLogs[0].index !== log.index ||
      purchaseLogs[0].data.toLowerCase() !== log.data.toLowerCase() ||
      purchaseLogs[0].topics.map(x => x.toLowerCase()).join(':') !== log.topics.map(x => x.toLowerCase()).join(':')) throw new Error('receipt_purchase_event_mismatch');
  const transfers = (receipt.logs || []).flatMap(item => {
    try {
      if (item.address.toLowerCase() !== cfg.usdt.toLowerCase() && item.address.toLowerCase() !== cfg.ant.toLowerCase()) return [];
      const parsed = transferIface.parseLog({ topics: item.topics, data: item.data });
      return parsed ? [{ token: item.address.toLowerCase(), from: parsed.args.from.toLowerCase(), to: parsed.args.to.toLowerCase(), value: parsed.args.value.toString() }] : [];
    } catch (_) { return []; }
  });
  const usdtTransfers = transfers.filter(item => item.token === cfg.usdt.toLowerCase() && item.from === event.buyer);
  const antTransfers = transfers.filter(item => item.token === cfg.ant.toLowerCase() && item.from === cfg.sale.toLowerCase() && item.to === event.buyer);
  const feeMatches = usdtTransfers.filter(item => item.to === cfg.feeWallet.toLowerCase() && item.value === event.feeUsdtRaw);
  const netMatches = usdtTransfers.filter(item => item.to === cfg.treasuryWallet.toLowerCase() && item.value === event.netUsdtRaw);
  const antMatches = antTransfers.filter(item => item.value === event.antOutRaw);
  const expectedUsdtCount = BigInt(event.feeUsdtRaw) > 0n ? 2 : 2;
  if (usdtTransfers.length !== expectedUsdtCount || feeMatches.length !== 1 || netMatches.length !== 1) throw new Error('receipt_usdt_transfer_reconciliation_failed');
  if (antTransfers.length !== 1 || antMatches.length !== 1) throw new Error('receipt_ant_delivery_reconciliation_failed');
  return true;
}
async function recordFinalEvent(cfg, providers, log, head) {
  const [blockA, blockB, receiptA, receiptB] = await Promise.all([
    providers[0].getBlock(log.blockNumber), providers[1].getBlock(log.blockNumber),
    providers[0].getTransactionReceipt(log.transactionHash), providers[1].getTransactionReceipt(log.transactionHash)
  ]);
  if (!blockA || !blockB || blockA.hash !== blockB.hash || blockA.hash !== log.blockHash) throw new Error('rpc_canonical_block_disagreement');
  if (!receiptA || !receiptB || receiptA.status !== 1 || receiptB.status !== 1 ||
      receiptA.blockHash !== blockA.hash || receiptB.blockHash !== blockA.hash) throw new Error('receipt_not_canonical_success');
  const receiptFingerprint = receipt => (receipt.logs || []).map(item => [item.address, ...(item.topics || []), item.data].join(':')).join('|');
  if (receiptFingerprint(receiptA) !== receiptFingerprint(receiptB)) throw new Error('rpc_receipt_log_disagreement');
  const event = decodeEvent(log, cfg);
  verifyPurchaseReceipt(receiptA, log, event, cfg);
  const confirmationCount = head - log.blockNumber + 1;
  if (confirmationCount < CONFIRMATIONS) throw new Error('insufficient_confirmations');
  const matches = await db(cfg, 'ant_payment_orders', {
    query: 'select=id,user_id,buyer_wallet,gross_usdt_raw,fee_usdt_raw,net_usdt_raw,quoted_ant_raw,min_ant_raw,status&chain_id=eq.97&tx_hash=eq.' + event.transactionHash + '&limit=2'
  });
  const order = matches.find(row => String(row.buyer_wallet).toLowerCase() === event.buyer);
  const row = {
    order_id: order?.id || null, chain_id: CHAIN_ID, tx_hash: event.transactionHash, log_index: event.logIndex,
    block_number: log.blockNumber, block_hash: blockA.hash, event_name: 'AntPurchased', buyer_wallet: event.buyer,
    gross_usdt_raw: event.grossUsdtRaw, fee_usdt_raw: event.feeUsdtRaw, net_usdt_raw: event.netUsdtRaw,
    ant_out_raw: event.antOutRaw, oracle_price_raw: event.oraclePriceRaw, canonical: true,
    raw_event: event.raw
  };
  await db(cfg, 'ant_payment_chain_events', {
    method: 'POST', query: 'on_conflict=chain_id,tx_hash,log_index',
    body: row, prefer: 'resolution=merge-duplicates,return=minimal'
  });
  if (!order) {
    process.stdout.write('ANT event stored without matching order; manual reconciliation required: ' + event.idempotencyKey + '\n');
    return;
  }
  const expected = calculateUsdtSplit(order.gross_usdt_raw);
  if (expected.grossRaw !== event.grossUsdtRaw || expected.feeRaw !== event.feeUsdtRaw ||
      expected.netRaw !== event.netUsdtRaw || BigInt(event.antOutRaw) < BigInt(order.min_ant_raw)) {
    await db(cfg, 'ant_payment_orders', { method: 'PATCH', query: 'id=eq.' + order.id, body: { status: 'manual_review', failure_code: 'chain_order_amount_mismatch', updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
    throw new Error('chain_order_amount_mismatch');
  }
  await db(cfg, 'ant_payment_chain_events', {
    method: 'PATCH', query: 'chain_id=eq.97&tx_hash=eq.' + event.transactionHash + '&log_index=eq.' + event.logIndex,
    body: { order_id: order.id }, prefer: 'return=minimal'
  });
  await db(cfg, 'ant_financial_ledger', {
    method: 'POST', query: 'on_conflict=chain_id,tx_hash,log_index,entry_type',
    body: ledgerRows(order, event, cfg), prefer: 'resolution=merge-duplicates,return=minimal'
  });
  await db(cfg, 'ant_payment_orders', {
    method: 'PATCH', query: 'id=eq.' + order.id,
    body: {
      status: 'delivered', tx_log_index: event.logIndex, block_number: log.blockNumber, block_hash: blockA.hash,
      confirmations: confirmationCount, failure_code: null, updated_at: new Date().toISOString()
    }, prefer: 'return=minimal'
  });
  await db(cfg, 'ant_payment_audit_log', {
    method: 'POST',
    body: { actor_type: 'worker', action: 'ant_chain_event_confirmed_and_reconciled', order_id: order.id, outcome: 'success', metadata: { chain_id: CHAIN_ID, tx_hash: event.transactionHash, log_index: event.logIndex, confirmations: confirmationCount } },
    prefer: 'return=minimal'
  });
  process.stdout.write('ANT order delivered and reconciled: ' + event.idempotencyKey + '\n');
}
async function getCheckpoint(cfg, providers) {
  const rows = await db(cfg, 'ant_indexer_state', {
    query: 'select=last_block,last_block_hash&worker_key=eq.' + WORKER_KEY + '&limit=1'
  });
  const start = Number(required('ANT_INDEXER_START_BLOCK'));
  if (!Number.isSafeInteger(start) || start < 1) throw new Error('invalid_ANT_INDEXER_START_BLOCK');
  if (!rows.length) {
    await db(cfg, 'ant_indexer_state', {
      method: 'POST',
      body: { worker_key: WORKER_KEY, chain_id: CHAIN_ID, last_block: start - 1, last_block_hash: null },
      prefer: 'resolution=ignore-duplicates,return=minimal'
    });
    return start - 1;
  }
  let lastBlock = Number(rows[0].last_block);
  const savedHash = rows[0].last_block_hash;
  if (savedHash && lastBlock >= start) {
    const [a,b] = await Promise.all([providers[0].getBlock(lastBlock), providers[1].getBlock(lastBlock)]);
    if (!a || !b || a.hash !== b.hash || a.hash !== savedHash) {
      lastBlock = Math.max(start - 1, lastBlock - REORG_LOOKBACK);
      let rewindHash = null;
      if (lastBlock >= start) {
        const [ra,rb] = await Promise.all([providers[0].getBlock(lastBlock), providers[1].getBlock(lastBlock)]);
        if (!ra || !rb || ra.hash !== rb.hash) throw new Error('rpc_reorg_rewind_block_disagreement');
        rewindHash = ra.hash;
      }
      await setCheckpoint(cfg, lastBlock, rewindHash);
      process.stderr.write('ANT indexer checkpoint rewound after canonical block hash mismatch to ' + lastBlock + '\n');
    }
  }
  return lastBlock;
}
async function setCheckpoint(cfg, block, blockHash) {
  await db(cfg, 'ant_indexer_state', {
    method: 'PATCH', query: 'worker_key=eq.' + WORKER_KEY,
    body: { last_block: block, last_block_hash: blockHash || null, updated_at: new Date().toISOString() },
    prefer: 'return=minimal'
  });
}
async function reconcileUnlinked(cfg, providers, head) {
  const pending = await db(cfg, 'ant_payment_chain_events', {
    query: 'select=id,chain_id,tx_hash,log_index,block_number,block_hash,buyer_wallet,gross_usdt_raw,fee_usdt_raw,net_usdt_raw,ant_out_raw,oracle_price_raw,raw_event&order_id=is.null&canonical=eq.true&limit=100'
  });
  for (const row of pending) {
    const [orders, blockA, blockB] = await Promise.all([
      db(cfg, 'ant_payment_orders', {
        query: 'select=id,user_id,buyer_wallet,gross_usdt_raw,fee_usdt_raw,net_usdt_raw,quoted_ant_raw,min_ant_raw,status&chain_id=eq.97&tx_hash=eq.' + row.tx_hash + '&limit=2'
      }),
      providers[0].getBlock(Number(row.block_number)), providers[1].getBlock(Number(row.block_number))
    ]);
    if (!blockA || !blockB || blockA.hash !== blockB.hash || blockA.hash !== row.block_hash) {
      await db(cfg, 'ant_payment_chain_events', { method: 'PATCH', query: 'id=eq.' + row.id, body: { canonical: false }, prefer: 'return=minimal' });
      continue;
    }
    const order = orders.find(item => String(item.buyer_wallet).toLowerCase() === String(row.buyer_wallet).toLowerCase());
    if (!order) continue;
    const split = calculateUsdtSplit(order.gross_usdt_raw);
    if (split.grossRaw !== String(row.gross_usdt_raw) || split.feeRaw !== String(row.fee_usdt_raw) ||
        split.netRaw !== String(row.net_usdt_raw) || BigInt(row.ant_out_raw) < BigInt(order.min_ant_raw)) {
      await db(cfg, 'ant_payment_orders', { method: 'PATCH', query: 'id=eq.' + order.id, body: { status: 'manual_review', failure_code: 'chain_order_amount_mismatch', updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
      continue;
    }
    const event = {
      transactionHash: row.tx_hash, logIndex: Number(row.log_index), buyer: String(row.buyer_wallet).toLowerCase(),
      grossUsdtRaw: String(row.gross_usdt_raw), feeUsdtRaw: String(row.fee_usdt_raw),
      netUsdtRaw: String(row.net_usdt_raw), antOutRaw: String(row.ant_out_raw)
    };
    await db(cfg, 'ant_payment_chain_events', { method: 'PATCH', query: 'id=eq.' + row.id, body: { order_id: order.id }, prefer: 'return=minimal' });
    await db(cfg, 'ant_financial_ledger', {
      method: 'POST', query: 'on_conflict=chain_id,tx_hash,log_index,entry_type',
      body: ledgerRows(order, event, cfg), prefer: 'resolution=ignore-duplicates,return=minimal'
    });
    const confirmations = head - Number(row.block_number) + 1;
    if (confirmations >= CONFIRMATIONS) {
      await db(cfg, 'ant_payment_orders', {
        method: 'PATCH', query: 'id=eq.' + order.id,
        body: { status: 'delivered', tx_log_index: Number(row.log_index), block_number: Number(row.block_number), block_hash: blockA.hash, confirmations, failure_code: null, updated_at: new Date().toISOString() },
        prefer: 'return=minimal'
      });
      await db(cfg, 'ant_payment_audit_log', {
        method: 'POST',
        body: { actor_type: 'worker', action: 'ant_unlinked_event_reconciled', order_id: order.id, outcome: 'success', metadata: { chain_id: CHAIN_ID, tx_hash: row.tx_hash, log_index: Number(row.log_index), confirmations } },
        prefer: 'return=minimal'
      });
    }
  }
}
async function reconcileRecentCanonical(cfg, providers, head) {
  const fromBlock = Math.max(Number(required('ANT_INDEXER_START_BLOCK')), head - REORG_LOOKBACK);
  const rows = await db(cfg, 'ant_payment_chain_events', {
    query: 'select=id,order_id,tx_hash,log_index,block_number,block_hash&canonical=eq.true&block_number=gte.' + fromBlock + '&limit=500'
  });
  const cache = new Map();
  let orphaned = 0;
  for (const row of rows) {
    const blockNumber = Number(row.block_number);
    if (!cache.has(blockNumber)) {
      cache.set(blockNumber, await Promise.all([
        providers[0].getBlock(blockNumber), providers[1].getBlock(blockNumber)
      ]));
    }
    const [a,b] = cache.get(blockNumber);
    if (!a || !b || a.hash !== b.hash) throw new Error('rpc_canonical_block_unavailable_or_disagreement');
    if (a.hash === row.block_hash) continue;
    await db(cfg, 'ant_payment_chain_events', {
      method: 'PATCH', query: 'id=eq.' + row.id,
      body: { canonical: false }, prefer: 'return=minimal'
    });
    await db(cfg, 'ant_financial_ledger', {
      method: 'PATCH', query: 'chain_id=eq.97&tx_hash=eq.' + row.tx_hash + '&log_index=eq.' + row.log_index,
      body: { canonical: false }, prefer: 'return=minimal'
    });
    if (row.order_id) {
      await db(cfg, 'ant_payment_orders', {
        method: 'PATCH', query: 'id=eq.' + row.order_id,
        body: { status: 'reorged', failure_code: 'chain_reorg', confirmations: 0, updated_at: new Date().toISOString() },
        prefer: 'return=minimal'
      });
      await db(cfg, 'ant_payment_audit_log', {
        method: 'POST',
        body: { actor_type: 'worker', action: 'ant_chain_event_reorged', order_id: row.order_id, outcome: 'warning', metadata: { chain_id: CHAIN_ID, tx_hash: row.tx_hash, log_index: Number(row.log_index), block_number: blockNumber } },
        prefer: 'return=minimal'
      });
    }
    orphaned++;
  }
  return { checked: rows.length, orphaned, fromBlock };
}
async function cycle(cfg, providers, cursor) {
  const [networkA, networkB, headA, headB] = await Promise.all([
    providers[0].getNetwork(), providers[1].getNetwork(), providers[0].getBlockNumber(), providers[1].getBlockNumber()
  ]);
  if (Number(networkA.chainId) !== CHAIN_ID || Number(networkB.chainId) !== CHAIN_ID) throw new Error('wrong_rpc_chain');
  if (Math.abs(headA - headB) > 2) throw new Error('rpc_head_disagreement');
  const safeHead = Math.min(headA, headB) - CONFIRMATIONS + 1;
  if (safeHead <= cursor) return cursor;
  const fromBlock = cursor + 1;
  const toBlock = Math.min(safeHead, fromBlock + RANGE - 1);
  const filter = { address: cfg.sale, topics: [topic], fromBlock, toBlock };
  const [logsA, logsB] = await Promise.all([providers[0].getLogs(filter), providers[1].getLogs(filter)]);
  const fingerprint = logs => logs.map(x => [x.address, x.transactionHash, x.index, x.blockHash, ...(x.topics || []), x.data].join(':')).sort().join('|');
  if (fingerprint(logsA) !== fingerprint(logsB)) throw new Error('rpc_log_disagreement');
  for (const log of logsA) await recordFinalEvent(cfg, providers, log, Math.min(headA, headB));
  const [checkpointA, checkpointB] = await Promise.all([providers[0].getBlock(toBlock), providers[1].getBlock(toBlock)]);
  if (!checkpointA || !checkpointB || checkpointA.hash !== checkpointB.hash) throw new Error('rpc_checkpoint_block_disagreement');
  await setCheckpoint(cfg, toBlock, checkpointA.hash);
  process.stdout.write('ANT indexer checkpoint ' + toBlock + ', logs ' + logsA.length + '\n');
  return toBlock;
}
async function main() {
  const cfg = config();
  const providers = [
    new ethers.JsonRpcProvider(cfg.rpcA, CHAIN_ID, { staticNetwork: true }),
    new ethers.JsonRpcProvider(cfg.rpcB, CHAIN_ID, { staticNetwork: true })
  ];
  try {
    await verifyContractConfiguration(providers[0], cfg);
    await verifyContractConfiguration(providers[1], cfg);
    let cursor = await getCheckpoint(cfg, providers);
    process.stdout.write('ANT BSC testnet indexer starting at ' + (cursor + 1) + '\n');
    if (process.env.ANT_INDEXER_ONESHOT === 'true') {
      cursor = await cycle(cfg, providers, cursor);
      const head = Math.min(await providers[0].getBlockNumber(), await providers[1].getBlockNumber());
      await reconcileRecentCanonical(cfg, providers, head);
      await reconcileUnlinked(cfg, providers, head);
      return;
    }
    let stopping = false;
    const stop = () => { stopping = true; };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
    while (!stopping) {
      try {
        cursor = await cycle(cfg, providers, cursor);
        const head = Math.min(await providers[0].getBlockNumber(), await providers[1].getBlockNumber());
        await reconcileRecentCanonical(cfg, providers, head);
        await reconcileUnlinked(cfg, providers, head);
      } catch (error) {
        process.stderr.write('ANT indexer fail-closed: ' + error.message + '\n');
      }
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
  } finally {
    await Promise.all(providers.map(provider => provider.destroy()));
  }
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack || String(error)); process.exitCode = 1; });
module.exports = { config, decodeEvent, ledgerRows, verifyPurchaseReceipt, verifyContractConfiguration, cycle, recordFinalEvent, reconcileRecentCanonical, reconcileUnlinked, getCheckpoint, setCheckpoint };
