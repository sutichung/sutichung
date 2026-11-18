'use strict';
const fs = require('node:fs');
const path = require('node:path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const finiteOrNull = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function buildHealthReport(health, diagnostics, marketDiagnostics = null, cryptoMarket = null) {
  const checks = Array.isArray(diagnostics.checks) ? diagnostics.checks : [];
  const providerFailures = checks.filter(x => ['auth_error','permission_error','rate_limited','timeout','error','upstream_error','http_error','endpoint_error'].includes(x.status));
  const counts = checks.reduce((out, item) => {
    out[item.status] = (out[item.status] || 0) + 1;
    return out;
  }, {});
  const dataFailures = [];
  const warnings = [];
  let taiwan = { status: 'not_checked' };
  if (marketDiagnostics) {
    const listedCount = finiteOrNull(marketDiagnostics.listedCount);
    const liveQuoteCount = finiteOrNull(marketDiagnostics.quoteCount);
    const connected = marketDiagnostics.ok === true && listedCount !== null && listedCount > 0;
    taiwan = {
      status: connected ? 'connected' : 'unavailable',
      source: marketDiagnostics.source || null,
      listedCount,
      liveQuoteCount,
      checkedAt: marketDiagnostics.serverTime || null,
      note: liveQuoteCount === 0 ? '來源連線正常但此刻沒有即時報價；可能是休市或非交易時段' : null
    };
    if (!connected) dataFailures.push({
      id: 'twse-market-data',
      status: 'unavailable',
      message: marketDiagnostics.error || 'TWSE listing/snapshot diagnostics did not confirm a usable official market source'
    });
  }
  let crypto = { status: 'not_checked' };
  if (cryptoMarket) {
    const marketCount = Array.isArray(cryptoMarket.markets) ? cryptoMarket.markets.length : 0;
    const connectedCount = finiteOrNull(cryptoMarket.summary?.connectedExchangeCount) ?? 0;
    const exchanges = Array.isArray(cryptoMarket.exchanges) ? cryptoMarket.exchanges : [];
    const unavailableExchanges = exchanges.filter(x => x.status !== 'connected').map(x => ({
      name: x.name, status: x.status || 'unknown', error: x.error || null
    }));
    const connected = marketCount > 0 && connectedCount > 0;
    crypto = {
      status: connected ? (unavailableExchanges.length ? 'partial' : 'connected') : 'unavailable',
      marketCount,
      connectedExchangeCount: connectedCount,
      sourceTimestampCoveragePct: finiteOrNull(cryptoMarket.summary?.sourceTimestampCoveragePct),
      receivedAt: cryptoMarket.receivedAt || null,
      exchanges: exchanges.map(x => ({
        name: x.name, status: x.status || 'unknown', marketCount: finiteOrNull(x.markets),
        latencyMs: finiteOrNull(x.latencyMs), sourceTimestampCount: finiteOrNull(x.sourceTimestampCount),
        coverageNote: x.coverageNote || null, error: x.error || null
      })),
      unavailableExchanges
    };
    if (!connected) dataFailures.push({
      id: 'crypto-market-data',
      status: 'unavailable',
      message: cryptoMarket.error || 'No usable public exchange market data returned'
    });
    else if (unavailableExchanges.length) warnings.push('some_crypto_exchanges_unavailable');
  }
  const rawSecurity = diagnostics.security && typeof diagnostics.security === 'object' ? diagnostics.security : null;
  const security = rawSecurity ? {
    status: 'observed', requests: finiteOrNull(rawSecurity.requests) ?? 0,
    blocked: finiteOrNull(rawSecurity.blocked) ?? 0, probes: finiteOrNull(rawSecurity.probes) ?? 0,
    rateLimited: finiteOrNull(rawSecurity.rateLimited) ?? 0,
    blockedRatePct: Number(rawSecurity.requests) > 0 ? Math.round((Number(rawSecurity.blocked) || 0) / Number(rawSecurity.requests) * 10000) / 100 : null,
    byRule: rawSecurity.byRule && typeof rawSecurity.byRule === 'object' ? rawSecurity.byRule : {},
    lastEventAt: rawSecurity.lastEventAt || null, scope: rawSecurity.scope || 'unknown'
  } : { status: 'unavailable', reason: 'firewall_telemetry_not_returned' };
  const securityWarnings = [];
  if (security.status === 'observed' && security.rateLimited >= 10) securityWarnings.push('elevated_rate_limiting');
  if (security.status === 'observed' && security.probes >= 50) securityWarnings.push('elevated_probe_activity');
  warnings.push(...securityWarnings);
  const failures = [
    ...providerFailures.map(x => ({ id: x.id, status: x.status, message: x.message || '' })),
    ...dataFailures
  ];
  const application = {
    ok: health.ok === true,
    mode: health.mode || 'unknown',
    node: health.node || null,
    commit: health.commit || null,
    branch: health.branch || null,
    tradingReadiness: health.trading || null
  };
  const overallStatus = !application.ok || failures.length ? 'degraded' : warnings.length ? 'partial' : 'healthy';
  return {
    generatedAt: new Date().toISOString(),
    overallStatus,
    application,
    marketData: { taiwan, crypto },
    security: { ...security, warnings: securityWarnings },
    warnings,
    providerSummary: {
      total: checks.length,
      connected: counts.connected || 0,
      notConfigured: counts.not_configured || 0,
      failing: providerFailures.length,
      statuses: counts
    },
    providers: checks.map(x => ({
      id: x.id, label: x.label, status: x.status,
      httpStatus: x.httpStatus ?? null, latencyMs: x.latencyMs ?? null,
      checkedAt: x.checkedAt || null, dataCount: x.dataCount ?? null,
      sourceTime: x.sourceTime || null, message: x.message || ''
    })),
    failures
  };
}
if (require.main === module) {
  const health = readJson(process.argv[2] || '/tmp/health.json');
  const diagnostics = readJson(process.argv[3] || '/tmp/providers.json');
  const market = process.argv[4] ? readJson(process.argv[4]) : null;
  const crypto = process.argv[5] ? readJson(process.argv[5]) : null;
  const report = buildHealthReport(health, diagnostics, market, crypto);
  fs.mkdirSync('reports', { recursive: true });
  const output = path.join('reports', process.env.HEALTH_REPORT_NAME || 'daily-system-health.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    overallStatus: report.overallStatus,
    applicationOk: report.application.ok,
    commit: report.application.commit,
    taiwanMarket: report.marketData.taiwan.status,
    cryptoMarket: report.marketData.crypto.status,
    connected: report.providerSummary.connected,
    notConfigured: report.providerSummary.notConfigured,
    failing: report.failures.length,
    output
  }));
  if (!report.application.ok || report.failures.length > 0) process.exitCode = 1;
}
module.exports = { buildHealthReport };
