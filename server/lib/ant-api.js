'use strict';
const { ethers } = require('ethers');

const CHAIN_ID = 97;
const SALE_ABI = [
  'function quote(uint256 grossUsdt) view returns (uint256 antOut,uint256 feeUsdt,uint256 netUsdt,uint256 price)',
  'function usdt() view returns (address)', 'function ant() view returns (address)',
  'function feeRecipient() view returns (address)', 'function proceedsRecipient() view returns (address)', 'function usdtDecimals() view returns (uint8)',
  'function buy(uint256 grossUsdt,uint256 minAntOut) returns (uint256 antOut)'
];
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const RAW_RE = /^\d{1,78}$/;

function parseRaw(value, field) {
  const raw = String(value ?? '');
  if (!RAW_RE.test(raw) || BigInt(raw) <= 0n) throw new Error('invalid_' + field);
  return raw;
}
function buildWalletMessage({ domain, wallet, nonce, issuedAt, expiresAt }) {
  return `${domain} wants you to sign in with your BNB Smart Chain wallet:
${wallet}

Sign this one-time message to link your wallet to Ant Colony.

URI: https://${domain}
Version: 1
Chain ID: 97
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiresAt}`;
}
function createAntApi({ supabaseUrl, anonKey, serviceKey, json, readJson }) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  async function db(table, { method = 'GET', query = '', body, prefer = 'return=representation' } = {}) {
    if (!base || !serviceKey) throw new Error('ant_database_not_configured');
    const response = await fetch(base + '/rest/v1/' + table + (query ? '?' + query : ''), {
      method,
      headers: {
        apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        Accept: 'application/json', 'Content-Type': 'application/json', Prefer: prefer
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    const raw = await response.text();
    let data = [];
    try { data = raw ? JSON.parse(raw) : []; } catch (_) { throw new Error('ant_database_invalid_response'); }
    if (!response.ok) {
      const error = new Error(data.message || data.msg || data.error || 'ant_database_error');
      error.status = response.status; throw error;
    }
    return data;
  }
  function bearer(req) {
    const header = String(req.headers.authorization || '');
    return /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '') : '';
  }
  function assuranceLevel(req) {
    try {
      const token = bearer(req);
      const payload = token.split('.')[1];
      if (!payload) return 'aal1';
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return claims.aal === 'aal2' ? 'aal2' : 'aal1';
    } catch (_) { return 'aal1'; }
  }
  async function userFor(req) {
    const token = bearer(req);
    if (!token || !base || !anonKey) return null;
    const response = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
  }
  function domainConfig() {
    const domain = String(process.env.ANT_WALLET_DOMAIN || '').trim().toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new Error('ant_wallet_domain_not_configured');
    return domain;
  }
  function saleConfig() {
    const sale = String(process.env.ANT_SALE_CONTRACT || '');
    const usdt = String(process.env.ANT_USDT_CONTRACT || '');
    const ant = String(process.env.ANT_TOKEN_CONTRACT || '');
    const fee = String(process.env.ANT_FEE_WALLET || '');
    const treasury = String(process.env.ANT_TREASURY_WALLET || '');
    if (![sale, usdt, ant, fee, treasury].every(value => ADDRESS_RE.test(value) && value !== ethers.ZeroAddress)) throw new Error('ant_testnet_contracts_or_recipients_not_configured');
    return { sale: ethers.getAddress(sale), usdt: ethers.getAddress(usdt), ant: ethers.getAddress(ant), fee: ethers.getAddress(fee), treasury: ethers.getAddress(treasury) };
  }
  async function providerForTestnet() {
    const rpc = String(process.env.BSC_TESTNET_RPC_URL || '');
    if (!rpc) throw new Error('bsc_testnet_rpc_not_configured');
    const provider = new ethers.JsonRpcProvider(rpc, CHAIN_ID, { staticNetwork: true });
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) throw new Error('wrong_testnet_chain');
    return provider;
  }
  async function handle(req, res, url) {
    const pathname = url.pathname;
    if (pathname === '/api/ant/status' && req.method === 'GET') {
      return json(res, 200, {
        enabled: true, network: 'BSC Testnet', chainId: CHAIN_ID, feeBps: 500,
        walletLinkConfigured: !!(base && anonKey && serviceKey && process.env.ANT_WALLET_DOMAIN),
        saleConfigured: !!(process.env.ANT_SALE_CONTRACT && process.env.ANT_USDT_CONTRACT && process.env.ANT_TOKEN_CONTRACT && process.env.ANT_FEE_WALLET && process.env.ANT_TREASURY_WALLET),
        usdtDecimals: Number(process.env.ANT_USDT_DECIMALS || 18), mainnetEnabled: false
      }), true;
    }
    if (!pathname.startsWith('/api/ant/')) return false;
    const user = await userFor(req);
    if (!user) { json(res, 401, { error: 'authentication_required' }); return true; }
    if (pathname === '/api/ant/wallet/nonce' && req.method === 'POST') {
      try {
        const body = await readJson(req, 4096);
        const wallet = String(body.wallet || '');
        if (!ADDRESS_RE.test(wallet) || Number(body.chainId || CHAIN_ID) !== CHAIN_ID) { json(res, 400, { error: 'invalid_wallet_or_chain' }); return true; }
        const normalized = ethers.getAddress(wallet);
        const domain = domainConfig();
        const nonce = ethers.hexlify(ethers.randomBytes(24)).slice(2);
        const issuedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const message = buildWalletMessage({ domain, wallet: normalized, nonce, issuedAt, expiresAt });
        const saved = await db('ant_wallet_nonces', { method: 'POST', body: {
          user_id: user.id, chain_id: CHAIN_ID, wallet_address: normalized.toLowerCase(),
          nonce, domain, issued_at: issuedAt, expires_at: expiresAt
        } });
        const stored = saved[0];
        if (!stored) throw new Error('wallet_nonce_persistence_failed');
        const canonicalMessage = buildWalletMessage({ domain, wallet: normalized, nonce, issuedAt: stored.issued_at, expiresAt: stored.expires_at });
        json(res, 201, { nonce, message: canonicalMessage, expiresAt: stored.expires_at, chainId: CHAIN_ID });
      } catch (error) { json(res, error.status || 503, { error: error.message }); }
      return true;
    }
    if (pathname === '/api/ant/wallet/verify' && req.method === 'POST') {
      try {
        const body = await readJson(req, 8192);
        const wallet = String(body.wallet || '');
        const nonce = String(body.nonce || '');
        const signature = String(body.signature || '');
        if (!ADDRESS_RE.test(wallet) || !/^[a-fA-F0-9]{48}$/.test(nonce) || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
          json(res, 400, { error: 'invalid_wallet_signature_payload' }); return true;
        }
        const normalized = ethers.getAddress(wallet);
        const rows = await db('ant_wallet_nonces', {
          query: 'select=id,user_id,chain_id,wallet_address,nonce,domain,issued_at,expires_at,consumed_at&user_id=eq.' + encodeURIComponent(user.id) +
            '&nonce=eq.' + encodeURIComponent(nonce) + '&limit=1'
        });
        const challenge = rows[0];
        if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.now() ||
            Number(challenge.chain_id) !== CHAIN_ID || challenge.wallet_address !== normalized.toLowerCase() ||
            challenge.domain !== domainConfig()) {
          json(res, 409, { error: 'wallet_challenge_expired_or_invalid' }); return true;
        }
        const message = buildWalletMessage({
          domain: challenge.domain, wallet: normalized, nonce: challenge.nonce,
          issuedAt: challenge.issued_at, expiresAt: challenge.expires_at
        });
        const recovered = ethers.verifyMessage(message, signature);
        if (recovered.toLowerCase() !== normalized.toLowerCase()) { json(res, 401, { error: 'wallet_signature_mismatch' }); return true; }
        const consumed = await db('ant_wallet_nonces', {
          method: 'PATCH',
          query: 'id=eq.' + challenge.id + '&consumed_at=is.null',
          body: { consumed_at: new Date().toISOString() }
        });
        if (!consumed.length) { json(res, 409, { error: 'wallet_nonce_already_consumed' }); return true; }
        const linked = await db('ant_wallets', {
          query: 'select=id,user_id&chain_id=eq.97&wallet_address=eq.' + normalized.toLowerCase() + '&limit=1'
        });
        if (linked[0] && linked[0].user_id !== user.id) { json(res, 409, { error: 'wallet_already_linked_to_another_account' }); return true; }
        if (!linked.length) await db('ant_wallets', {
          method: 'POST',
          body: { user_id: user.id, chain_id: CHAIN_ID, wallet_address: normalized.toLowerCase(), verified_at: new Date().toISOString() },
          prefer: 'return=minimal'
        });
        json(res, 200, { ok: true, wallet: normalized, chainId: CHAIN_ID });
      } catch (error) { json(res, error.status || 400, { error: error.message }); }
      return true;
    }
    if (pathname === '/api/ant/orders' && req.method === 'GET') {
      try {
        const rows = await db('ant_payment_orders', {
          query: 'select=id,buyer_wallet,gross_usdt_raw,fee_usdt_raw,net_usdt_raw,quoted_ant_raw,min_ant_raw,status,tx_hash,block_number,confirmations,created_at,updated_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc&limit=100'
        });
        json(res, 200, { orders: rows });
      } catch (error) { json(res, error.status || 503, { error: error.message }); }
      return true;
    }
    if (pathname === '/api/ant/orders' && req.method === 'POST') {
      try {
        const body = await readJson(req, 4096);
        const wallet = String(body.wallet || '');
        if (!ADDRESS_RE.test(wallet)) { json(res, 400, { error: 'invalid_wallet' }); return true; }
        const normalized = ethers.getAddress(wallet).toLowerCase();
        const linked = await db('ant_wallets', {
          query: 'select=id&user_id=eq.' + encodeURIComponent(user.id) + '&chain_id=eq.97&wallet_address=eq.' + normalized + '&limit=1'
        });
        if (!linked.length) { json(res, 403, { error: 'wallet_not_verified' }); return true; }
        const gross = parseRaw(body.grossUsdtRaw, 'gross_usdt');
        if (BigInt(gross) * 500n / 10000n === 0n) { json(res, 400, { error: 'payment_below_minimum_fee_unit' }); return true; }
        const contracts = saleConfig();
        const provider = await providerForTestnet();
        try {
          const sale = new ethers.Contract(contracts.sale, SALE_ABI, provider);
          const [onchainUsdt, onchainAnt, onchainFee, onchainTreasury, onchainDecimals] = await Promise.all([
            sale.usdt(), sale.ant(), sale.feeRecipient(), sale.proceedsRecipient(), sale.usdtDecimals()
          ]);
          if (onchainUsdt.toLowerCase() !== contracts.usdt.toLowerCase() ||
              onchainAnt.toLowerCase() !== contracts.ant.toLowerCase() ||
              onchainFee.toLowerCase() !== contracts.fee.toLowerCase() ||
              onchainTreasury.toLowerCase() !== contracts.treasury.toLowerCase() || Number(onchainDecimals) !== Number(process.env.ANT_USDT_DECIMALS || 18)) {
            json(res, 503, { error: 'sale_contract_configuration_mismatch' }); return true;
          }
          const quote = await sale.quote(gross);
          const fee = quote.feeUsdt, net = quote.netUsdt, antOut = quote.antOut, price = quote.price;
          if (fee + net !== BigInt(gross) || antOut <= 0n) { json(res, 503, { error: 'invalid_onchain_quote' }); return true; }
          const minimum = body.minAntRaw === undefined ? antOut * 9900n / 10000n : BigInt(parseRaw(body.minAntRaw, 'min_ant'));
          if (minimum <= 0n || minimum > antOut) { json(res, 400, { error: 'invalid_min_ant_out' }); return true; }
          const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          const orders = await db('ant_payment_orders', {
            method: 'POST',
            body: {
              user_id: user.id, chain_id: CHAIN_ID, buyer_wallet: normalized,
              sale_contract: contracts.sale.toLowerCase(), usdt_contract: contracts.usdt.toLowerCase(), ant_contract: contracts.ant.toLowerCase(),
              gross_usdt_raw: gross, fee_usdt_raw: fee.toString(), net_usdt_raw: net.toString(),
              quoted_ant_raw: antOut.toString(), min_ant_raw: minimum.toString(), oracle_price_raw: price.toString(),
              quote_expires_at: expires, status: 'created'
            }
          });
          const order = orders[0];
          if (!order) throw new Error('order_persistence_failed');
          json(res, 201, {
            orderId: order.id, chainId: CHAIN_ID, saleContract: contracts.sale, usdtContract: contracts.usdt,
            antContract: contracts.ant, grossUsdtRaw: gross, feeUsdtRaw: fee.toString(), netUsdtRaw: net.toString(),
            quotedAntRaw: antOut.toString(), minAntRaw: minimum.toString(), oraclePriceRaw: price.toString(),
            expiresAt: expires, buyFunction: 'buy(uint256,uint256)', approvalAmountRaw: gross
          });
        } finally { await provider.destroy(); }
      } catch (error) { json(res, error.status || 400, { error: error.message }); }
      return true;
    }
    const submitMatch = pathname.match(/^\/api\/ant\/orders\/([0-9a-f-]{36})\/submit$/i);
    if (submitMatch && req.method === 'POST') {
      let provider;
      try {
        const body = await readJson(req, 4096);
        const txHash = String(body.txHash || '');
        if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) { json(res, 400, { error: 'invalid_transaction_hash' }); return true; }
        const orders = await db('ant_payment_orders', {
          query: 'select=id,user_id,buyer_wallet,gross_usdt_raw,min_ant_raw,sale_contract,quote_expires_at,status&user_id=eq.' + encodeURIComponent(user.id) +
            '&id=eq.' + submitMatch[1] + '&limit=1'
        });
        const order = orders[0];
        if (!order || order.status !== 'created' || Date.parse(order.quote_expires_at) <= Date.now()) { json(res, 409, { error: 'order_not_submittable' }); return true; }
        provider = await providerForTestnet();
        const tx = await provider.getTransaction(txHash);
        if (!tx || Number(tx.chainId) !== CHAIN_ID || tx.value !== 0n || tx.from.toLowerCase() !== order.buyer_wallet.toLowerCase() || !tx.to || tx.to.toLowerCase() !== order.sale_contract.toLowerCase()) {
          json(res, 400, { error: 'transaction_sender_or_target_mismatch' }); return true;
        }
        const iface = new ethers.Interface(SALE_ABI);
        const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
        if (!decoded || decoded.name !== 'buy' || decoded.args[0].toString() !== String(order.gross_usdt_raw) ||
            decoded.args[1].toString() !== String(order.min_ant_raw)) {
          json(res, 400, { error: 'transaction_call_data_mismatch' }); return true;
        }
        await db('ant_payment_orders', {
          method: 'PATCH', query: 'id=eq.' + order.id + '&status=eq.created',
          body: { status: 'submitted', tx_hash: txHash.toLowerCase(), updated_at: new Date().toISOString() },
          prefer: 'return=minimal'
        });
        json(res, 202, { ok: true, orderId: order.id, txHash: txHash.toLowerCase(), status: 'submitted' });
      } catch (error) { json(res, error.status || 400, { error: error.message }); }
      finally { if (provider) await provider.destroy(); }
      return true;
    }
    const orderMatch = pathname.match(/^\/api\/ant\/orders\/([0-9a-f-]{36})$/i);
    if (orderMatch && req.method === 'GET') {
      try {
        const rows = await db('ant_payment_orders', {
          query: 'select=id,chain_id,buyer_wallet,gross_usdt_raw,fee_usdt_raw,net_usdt_raw,quoted_ant_raw,min_ant_raw,status,tx_hash,block_number,confirmations,created_at,updated_at&user_id=eq.' + encodeURIComponent(user.id) +
            '&id=eq.' + orderMatch[1] + '&limit=1'
        });
        if (!rows.length) { json(res, 404, { error: 'order_not_found' }); return true; }
        json(res, 200, rows[0]);
      } catch (error) { json(res, error.status || 503, { error: error.message }); }
      return true;
    }
    if (pathname === '/api/ant/admin/finance' && req.method === 'GET') {
      try {
        const roles = await db('ant_admin_roles', {
          query: 'select=role&user_id=eq.' + encodeURIComponent(user.id)
        });
        if (!roles.some(row => ['SUPER_ADMIN', 'FINANCE_VIEWER'].includes(row.role))) { json(res, 403, { error: 'finance_role_required' }); return true; }\n        if (assuranceLevel(req) !== 'aal2') { json(res, 403, { error: 'mfa_required', requiredAssuranceLevel: 'aal2' }); return true; }
        const [orders, ledger, totalsRows] = await Promise.all([
          db('ant_payment_orders', { query: 'select=id,buyer_wallet,gross_usdt_raw,fee_usdt_raw,net_usdt_raw,quoted_ant_raw,status,tx_hash,created_at&order=created_at.desc&limit=200' }),
          db('ant_financial_ledger', { query: 'select=entry_type,asset_symbol,amount_raw,direction,wallet,tx_hash,created_at&canonical=eq.true&order=created_at.desc&limit=500' }),
          db('ant_financial_ledger_totals', { query: 'select=entry_type,amount_raw,entry_count' })
        ]);
        const sum = (type) => String(totalsRows.find(row => row.entry_type === type)?.amount_raw || '0');
        json(res, 200, { network: 'BSC Testnet', chainId: CHAIN_ID, orders, ledger, totals: {
          grossUsdtRaw: sum('usdt_gross'), feeUsdtRaw: sum('usdt_fee'),
          netUsdtRaw: sum('usdt_net'), antDeliveredRaw: sum('ant_delivery')
        } });
      } catch (error) { json(res, error.status || 503, { error: error.message }); }
      return true;
    }
    json(res, 404, { error: 'ant_endpoint_not_found' });
    return true;
  }
  return false;
}
module.exports = { createAntApi, buildWalletMessage, parseRaw, assuranceLevel };
