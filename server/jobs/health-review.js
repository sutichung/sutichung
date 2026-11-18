'use strict';
const fs = require('node:fs');
const path = require('node:path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function buildHealthReport(health, diagnostics) {
  const checks = Array.isArray(diagnostics.checks) ? diagnostics.checks : [];
  const failing = checks.filter(x => ['auth_error','permission_error','rate_limited','timeout','error','upstream_error','http_error','endpoint_error'].includes(x.status));
  const counts = checks.reduce((out, item) => {
    out[item.status] = (out[item.status] || 0) + 1;
    return out;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    application: {
      ok: health.ok === true,
      mode: health.mode || 'unknown',
      node: health.node || null,
      tradingReadiness: health.trading || null
    },
    providerSummary: {
      total: checks.length,
      connected: counts.connected || 0,
      notConfigured: counts.not_configured || 0,
      failing: failing.length,
      statuses: counts
    },
    providers: checks.map(x => ({
      id: x.id, label: x.label, status: x.status,
      httpStatus: x.httpStatus ?? null, latencyMs: x.latencyMs ?? null,
      checkedAt: x.checkedAt || null, dataCount: x.dataCount ?? null,
      sourceTime: x.sourceTime || null, message: x.message || ''
    })),
    failures: failing.map(x => ({ id: x.id, status: x.status, message: x.message || '' }))
  };
}
if (require.main === module) {
  const health = readJson(process.argv[2] || '/tmp/health.json');
  const diagnostics = readJson(process.argv[3] || '/tmp/providers.json');
  const report = buildHealthReport(health, diagnostics);
  fs.mkdirSync('reports', { recursive: true });
  const output = path.join('reports', 'daily-system-health.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    applicationOk: report.application.ok,
    connected: report.providerSummary.connected,
    notConfigured: report.providerSummary.notConfigured,
    failing: report.providerSummary.failing,
    output
  }));
  if (!report.application.ok || report.providerSummary.failing > 0) process.exitCode = 1;
}
module.exports = { buildHealthReport };
