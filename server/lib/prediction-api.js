'use strict';
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { SYMBOLS, validateMarketInput, validateOrderInput, parseBinanceKline, evaluateOutcome, quoteFromPools } = require('./prediction-market');
const { realMoneyReadiness } = require('./prediction-launch-gates');

function assuranceLevel(req) {
  try {
    const header = String(req?.headers?.authorization || '');
    const token = header.match(/^Bearer\s+(\S+)$/i)?.[1] || '';
    const payload = token.split('.')[1];
    if (!payload) return 'aal1';
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch (_) { return 'aal1'; }
}
function secureEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
function createPredictionApi({ supabaseUrl, anonKey, serviceKey, json, readJson }) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  async function db(table, { method = 'GET', query = '', body, prefer = 'return=representation' } = {}) {
    if (!base || !serviceKey) throw Object.assign(new Error('prediction_database_not_configured'), { status: 503 });
    const response = await fetch(base + '/rest/v1/' + table + (query ? '?' + query : ''), {
      method,
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: prefer },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!response.ok) throw Object.assign(new Error(data?.message || data?.hint || 'prediction_database_error'), { status: response.status >= 500 ? 503 : 400 });
    return data;
  }
  async function userFor(req) {
    const token = String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !base || !anonKey) return null;
    const response = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  }
  async function isSuperAdmin(user) {
    if (!user) return false;
    const configuredAdmin = String(process.env.SUPABASE_ADMIN_EMAIL || '').trim().toLowerCase();
    if (configuredAdmin && String(user.email || '').trim().toLowerCase() === configuredAdmin) return true;
    const rows = await db('ant_admin_roles', { query: 'select=role&user_id=eq.' + encodeURIComponent(user.id) + '&role=eq.SUPER_ADMIN&limit=1' });
    return Array.isArray(rows) && rows.length > 0;
  }
  async function binancePrice(symbol) {
    if (!Object.hasOwn(SYMBOLS, symbol)) throw new Error('unsupported_prediction_symbol');
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=' + encodeURIComponent(symbol), {
      headers: { Accept: 'application/json', 'User-Agent': 'ZENTRAX-Prediction/1.0' }, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('prediction_price_source_unavailable');
    const data = await response.json(), price = Number(data.price);
    if (data.symbol !== symbol || !Number.isFinite(price) || price <= 0) throw new Error('invalid_prediction_price_source_data');
    return { price, source: 'Binance Spot public ticker', asOf: new Date().toISOString() };
  }
  async function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/prediction/')) return false;
    try {
      if (path === '/api/prediction/status' && req.method === 'GET') {
        return json(res, 200, { enabled: true, mode: 'virtual-credits-only', realMoneyEnabled: false, databaseConfigured: !!(base && anonKey && serviceKey), resolverConfigured: !!process.env.ZENTRAX_PREDICTION_JOB_TOKEN, network: 'off-chain paper simulation', supportedSymbols: Object.keys(SYMBOLS), settlement: 'Binance Spot 1m kline close' }), true;
      }
      if (path === '/api/prediction/markets' && req.method === 'GET') {
        const rows = await db('prediction_markets', { query: 'select=id,slug,title,symbol,direction,strike_price,reference_price,reference_source,reference_as_of,close_at,resolve_after,status,yes_pool,no_pool,resolved_outcome,resolution_price,resolution_source,resolved_at,created_at&order=close_at.asc&limit=100' });
        const markets = (rows || []).map(m => ({ ...m, ...quoteFromPools(m.yes_pool, m.no_pool) }));
        return json(res, 200, { markets, timestamp: new Date().toISOString(), mode: 'virtual-credits-only' }), true;
      }
      if (path === '/api/prediction/account' && req.method === 'GET') {
        const user = await userFor(req);
        if (!user) return json(res, 401, { error: 'authentication_required' }), true;
        await db('rpc/ensure_prediction_paper_account', { method: 'POST', body: { p_user_id: user.id } });
        const [accounts, positions, orders, superAdmin] = await Promise.all([
          db('prediction_paper_accounts', { query: 'select=balance,created_at,updated_at&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1' }),
          db('prediction_paper_positions', { query: 'select=market_id,yes_shares,no_shares,yes_cost,no_cost,payout,updated_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=updated_at.desc&limit=100' }),
          db('prediction_paper_orders', { query: 'select=id,market_id,side,stake,shares,price,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc&limit=50' }),
          isSuperAdmin(user)
        ]);
        return json(res, 200, { account: accounts?.[0] || null, positions: positions || [], orders: orders || [], isSuperAdmin: superAdmin, assurance: assuranceLevel(req) }), true;
      }
      if (path === '/api/prediction/orders' && req.method === 'POST') {
        const user = await userFor(req);
        if (!user) return json(res, 401, { error: 'authentication_required' }), true;
        const body = await readJson(req, 8192), order = validateOrderInput(body);
        const result = await db('rpc/place_prediction_paper_order', { method: 'POST', body: {
          p_user_id: user.id, p_market_id: order.marketId, p_side: order.side, p_stake: order.amount, p_client_order_id: order.clientOrderId
        } });
        return json(res, 201, { order: result, mode: 'virtual-credits-only' }), true;
      }
      if (path === '/api/prediction/admin/markets' && req.method === 'POST') {
        const user = await userFor(req);
        if (!user) return json(res, 401, { error: 'authentication_required' }), true;
        if (assuranceLevel(req) !== 'aal2' || !await isSuperAdmin(user)) return json(res, 403, { error: 'super_admin_mfa_required' }), true;
        const input = validateMarketInput(await readJson(req, 8192));
        const reference = await binancePrice(input.symbol);
        const title = input.baseAsset + ' at ' + new Date(input.closeAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC: ' +
          (input.direction === 'ABOVE' ? 'at or above ' : 'below ') + input.strikePrice.toLocaleString('en-US') + ' USDT?';
        const slug = input.baseAsset.toLowerCase() + '-' + input.direction.toLowerCase() + '-' + Math.round(input.strikePrice) + '-' + Date.parse(input.closeAt);
        const rows = await db('prediction_markets', { method: 'POST', body: {
          slug, title, symbol: input.symbol, direction: input.direction, strike_price: input.strikePrice,
          reference_price: reference.price, reference_source: reference.source, reference_as_of: reference.asOf,
          close_at: input.closeAt, resolve_after: input.resolveAfter, created_by: user.id
        } });
        return json(res, 201, { market: rows?.[0] || null, reference, note: 'Market is virtual-credit-only. No USDT or real assets are accepted.' }), true;
      }
      if (path === '/api/prediction/jobs/resolve-due' && req.method === 'POST') {
        const expected = String(process.env.ZENTRAX_PREDICTION_JOB_TOKEN || '');
        const supplied = String(req.headers['x-prediction-job-token'] || '');
        if (!expected || !secureEqual(supplied, expected)) return json(res, 401, { error: 'prediction_job_authentication_required' }), true;
        const due = await db('prediction_markets', { query: 'select=id,symbol,direction,strike_price,close_at,resolve_after&status=eq.open&resolve_after=lte.' + encodeURIComponent(new Date().toISOString()) + '&order=resolve_after.asc&limit=50' });
        const results = [];
        for (const market of due || []) {
          const openTime = Date.parse(market.close_at);
          try {
            const endpoint = 'https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(market.symbol) + '&interval=1m&startTime=' + openTime + '&endTime=' + (openTime + 60000) + '&limit=1';
            const response = await fetch(endpoint, { headers: { Accept: 'application/json', 'User-Agent': 'ZENTRAX-Prediction/1.0' }, signal: AbortSignal.timeout(8000) });
            if (!response.ok) throw new Error('resolution_price_source_unavailable');
            const candle = parseBinanceKline(await response.json(), openTime);
            if (!candle) { results.push({ marketId: market.id, status: 'pending_candle' }); continue; }
            const outcome = evaluateOutcome(market.direction, market.strike_price, candle.close);
            const settled = await db('rpc/settle_prediction_market', { method: 'POST', body: {
              p_market_id: market.id, p_outcome: outcome, p_resolution_price: candle.close,
              p_source: 'Binance Spot 1m kline close', p_candle_open: new Date(candle.openTime).toISOString()
            } });
            results.push({ marketId: market.id, status: 'resolved', outcome, resolutionPrice: candle.close, settlement: settled });
          } catch (error) { results.push({ marketId: market.id, status: 'pending', error: error.message }); }
        }
        return json(res, 200, { checked: (due || []).length, results }), true;
      }
      return json(res, 404, { error: 'prediction_endpoint_not_found' }), true;
    } catch (error) {
      return json(res, error.status || 400, { error: error.message || 'prediction_request_failed' }), true;
    }
  }
  return handle;
}
module.exports = { createPredictionApi, assuranceLevel, secureEqual };
