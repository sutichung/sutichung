'use strict';

const fs = require('node:fs/promises');

const CACHE_MS = 30 * 60 * 1000;
const BATCH_SIZE = 100;

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index < 0) return null;
  const parts = lockPath.slice(index + marker.length).split('/');
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] || null;
}

function collectLockedPackages(lock, manifest = {}) {
  const directProduction = new Set(Object.keys(manifest.dependencies || {}));
  const directDevelopment = new Set(Object.keys(manifest.devDependencies || {}));
  const unique = new Map();
  for (const [lockPath, entry] of Object.entries(lock?.packages || {})) {
    if (!lockPath || !lockPath.includes('node_modules/') || !entry?.version || entry.link) continue;
    const name = entry.name || packageNameFromLockPath(lockPath);
    if (!name) continue;
    const key = name + '@' + entry.version;
    const scope = entry.dev === true && !directProduction.has(name) ? 'development' : 'production';
    const existing = unique.get(key);
    unique.set(key, {
      name,
      version: String(entry.version),
      direct: directProduction.has(name) || directDevelopment.has(name),
      scope: existing?.scope === 'production' || scope === 'production' ? 'production' : 'development'
    });
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function severityOf(vulnerability) {
  const raw = [
    vulnerability?.database_specific?.severity,
    vulnerability?.ecosystem_specific?.severity,
    ...(vulnerability?.severity || []).map(x => x?.score)
  ].filter(x => typeof x === 'string').join(' ').toLowerCase();
  if (/critical/.test(raw)) return 'critical';
  if (/high/.test(raw)) return 'high';
  if (/moderate|medium/.test(raw)) return 'moderate';
  if (/low/.test(raw)) return 'low';
  return 'unknown';
}

function fixedVersionsOf(vulnerability) {
  const values = [];
  for (const affected of vulnerability?.affected || []) {
    for (const range of affected.ranges || []) {
      for (const event of range.events || []) if (event.fixed) values.push(String(event.fixed));
    }
  }
  return [...new Set(values)];
}

function buildReport(packages, batchResults, failedBatches = 0, generatedAt = new Date().toISOString()) {
  const findings = [];
  let completedPackages = 0;
  for (const batch of batchResults) {
    if (!Array.isArray(batch)) continue;
    completedPackages += batch.length;
    batch.forEach((result, index) => {
      const pkg = packages[(batch.packageOffset || 0) + index];
      if (!pkg) return;
      for (const vuln of result?.vulns || []) {
        findings.push({
          package: pkg.name,
          version: pkg.version,
          scope: pkg.scope,
          direct: pkg.direct,
          id: vuln.id || 'OSV-UNKNOWN',
          aliases: Array.isArray(vuln.aliases) ? vuln.aliases.slice(0, 8) : [],
          summary: String(vuln.summary || vuln.details || '上游未提供摘要').slice(0, 500),
          severity: severityOf(vuln),
          published: vuln.published || null,
          modified: vuln.modified || null,
          fixedVersions: fixedVersionsOf(vuln),
          references: (vuln.references || []).map(x => x.url).filter(Boolean).slice(0, 3)
        });
      }
    });
  }
  const severityCounts = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  for (const finding of findings) severityCounts[finding.severity] += 1;
  const rank = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.package.localeCompare(b.package));
  const complete = failedBatches === 0 && completedPackages === packages.length;
  const vulnerablePackages = new Set(findings.map(x => x.package + '@' + x.version)).size;
  return {
    status: complete ? (findings.length ? 'vulnerable' : 'clean') : 'partial',
    label: !complete ? '掃描未完整，不能判定安全' : findings.length ? '發現已知套件漏洞' : '目前未查得已知套件漏洞',
    source: 'OSV.dev vulnerability database',
    generatedAt,
    scannedPackageCount: completedPackages,
    totalPackageCount: packages.length,
    vulnerablePackageCount: vulnerablePackages,
    vulnerabilityCount: findings.length,
    failedBatchCount: failedBatches,
    severityCounts,
    productionVulnerabilityCount: findings.filter(x => x.scope === 'production').length,
    developmentVulnerabilityCount: findings.filter(x => x.scope === 'development').length,
    findings
  };
}

function createDependencyVulnerabilityScanner({ lockPath, manifestPath, fetchImpl = fetch, clock = () => Date.now(), cacheMs = CACHE_MS } = {}) {
  let cached = null;
  let expiresAt = 0;
  let pending = null;
  return {
    async scan({ force = false } = {}) {
      const now = clock();
      if (!force && cached && now < expiresAt) return cached;
      if (!force && pending) return pending;
      pending = (async () => {
        try {
          const [lockText, manifestText] = await Promise.all([
            fs.readFile(lockPath, 'utf8'),
            manifestPath ? fs.readFile(manifestPath, 'utf8') : Promise.resolve('{}')
          ]);
          const packages = collectLockedPackages(JSON.parse(lockText), JSON.parse(manifestText));
          if (!packages.length) throw new Error('package-lock.json 沒有可掃描的鎖定套件');
          const batches = [];
          for (let i = 0; i < packages.length; i += BATCH_SIZE) batches.push({ offset: i, packages: packages.slice(i, i + BATCH_SIZE) });
          const settled = await Promise.allSettled(batches.map(async batch => {
            const response = await fetchImpl('https://api.osv.dev/v1/querybatch', {
              method: 'POST',
              headers: { accept: 'application/json', 'content-type': 'application/json' },
              body: JSON.stringify({ queries: batch.packages.map(pkg => ({ package: { name: pkg.name, ecosystem: 'npm' }, version: pkg.version })) }),
              signal: AbortSignal.timeout(15000)
            });
            if (!response.ok) throw new Error('OSV API HTTP ' + response.status);
            const payload = await response.json();
            if (!Array.isArray(payload.results) || payload.results.length !== batch.packages.length) throw new Error('OSV API 回傳筆數與查詢筆數不一致');
            return { offset: batch.offset, results: payload.results };
          }));
          const good = settled.filter(x => x.status === 'fulfilled').map(x => {
            const results = x.value.results;
            results.packageOffset = x.value.offset;
            return results;
          });
          const report = buildReport(packages, good, settled.length - good.length, new Date(clock()).toISOString());
          if (settled.some(x => x.status === 'rejected')) {
            report.error = settled.filter(x => x.status === 'rejected').map(x => String(x.reason?.message || 'OSV request failed')).join('; ').slice(0, 300);
          }
          cached = report;
          expiresAt = clock() + cacheMs;
          return report;
        } catch (error) {
          return {
            status: 'unavailable',
            label: '漏洞資料暫時無法取得',
            source: 'OSV.dev vulnerability database',
            generatedAt: new Date(clock()).toISOString(),
            scannedPackageCount: 0,
            totalPackageCount: 0,
            vulnerablePackageCount: 0,
            vulnerabilityCount: 0,
            severityCounts: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 },
            findings: [],
            error: String(error?.message || error).slice(0, 300)
          };
        } finally {
          pending = null;
        }
      })();
      return pending;
    }
  };
}

module.exports = { collectLockedPackages, severityOf, fixedVersionsOf, buildReport, createDependencyVulnerabilityScanner };
