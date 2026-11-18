'use strict';

// Lightweight application-layer firewall for the Render web service.
// Limits are per client IP and held in memory per instance; use an edge WAF
// for distributed enforcement and volumetric DDoS protection.
const buckets = new Map();
let calls = 0;
const telemetry = { requests:0, blocked:0, probes:0, rateLimited:0, byRule:{}, lastEventAt:null };

const RULES = [
  { match: p => /^\/api\/auth\/phone\/start$/.test(p), limit: 3, windowMs: 10 * 60 * 1000, name: 'phone_otp_start' },
  { match: p => /^\/api\/auth\/phone\/verify$/.test(p), limit: 8, windowMs: 10 * 60 * 1000, name: 'phone_otp_verify' },
  { match: p => /^\/api\/auth\/(login|signup|password)$/.test(p), limit: 10, windowMs: 10 * 60 * 1000, name: 'authentication' },
  { match: p => /^\/api\/auth\/oauth\/(apple|facebook)$/.test(p), limit: 20, windowMs: 10 * 60 * 1000, name: 'oauth' },
  { match: p => /^\/api\/admin\//.test(p), limit: 60, windowMs: 60 * 1000, name: 'admin_api' },
  { match: p => /^\/api\/market\/agents\//.test(p), limit: 12, windowMs: 60 * 1000, name: 'ai_analysis' },
  { match: p => /^\/api\/market\/scan$/.test(p), limit: 30, windowMs: 60 * 1000, name: 'market_scan' },
  { match: p => /^\/api\//.test(p), limit: 240, windowMs: 60 * 1000, name: 'api' },
  { match: () => true, limit: 360, windowMs: 60 * 1000, name: 'site' }
];

function clientIp(req) {
  // Render terminates TLS at its proxy and supplies X-Forwarded-For.
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 96);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
}

function reject(res, status, error, retryAfterSeconds) {
  telemetry.blocked += 1;
  if (error === 'rate_limited') telemetry.rateLimited += 1;
  telemetry.lastEventAt = new Date().toISOString();
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (retryAfterSeconds) headers['retry-after'] = String(retryAfterSeconds);
  res.writeHead(status, headers);
  res.end(JSON.stringify({ error, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) }));
}

function consume(key, limit, windowMs, now) {
  let entry = buckets.get(key);
  if (!entry || now - entry.startedAt >= windowMs) entry = { startedAt: now, count: 0 };
  entry.count += 1;
  buckets.set(key, entry);
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryMs: Math.max(1000, windowMs - (now - entry.startedAt)) };
}

function applyFirewall(req, res) {
  telemetry.requests += 1;
  setSecurityHeaders(res);

  const rawUrl = String(req.url || '');
  if (rawUrl.length > 4096 || /[\u0000-\u001f\u007f]/.test(rawUrl)) {
    reject(res, 400, 'invalid_request');
    return false;
  }

  let pathname;
  try { pathname = new URL(rawUrl, 'http://localhost').pathname; }
  catch (_) { reject(res, 400, 'invalid_request'); return false; }

  // Common automated probes have no valid route in this application.
  if (/\/(?:\.env|\.git|wp-admin|wp-login\.php|phpmyadmin|vendor\/phpunit)(?:\/|$)/i.test(pathname)) {
    telemetry.probes += 1;
    reject(res, 404, 'not_found');
    return false;
  }

  if (['TRACE', 'CONNECT', 'TRACK'].includes(String(req.method || '').toUpperCase())) {
    reject(res, 405, 'method_not_allowed');
    return false;
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    reject(res, 413, 'request_too_large');
    return false;
  }

  const rule = RULES.find(item => item.match(pathname)) || RULES[RULES.length - 1];
  const now = Date.now();
  const key = clientIp(req) + ':' + rule.name;
  const result = consume(key, rule.limit, rule.windowMs, now);
  telemetry.byRule[rule.name] = (telemetry.byRule[rule.name] || 0) + 1;

  // Keep the in-memory limiter bounded on long-lived instances.
  if ((++calls % 1024) === 0 || buckets.size > 20000) {
    for (const [bucketKey, value] of buckets) {
      const matchingRule = RULES.find(item => item.name === bucketKey.slice(bucketKey.lastIndexOf(':') + 1));
      if (!matchingRule || now - value.startedAt >= matchingRule.windowMs) buckets.delete(bucketKey);
    }
    if (buckets.size > 20000) {
      const excess = buckets.size - 16000;
      let removed = 0;
      for (const bucketKey of buckets.keys()) {
        buckets.delete(bucketKey);
        if (++removed >= excess) break;
      }
    }
  }

  res.setHeader('X-RateLimit-Limit', String(rule.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    reject(res, 429, 'rate_limited', Math.ceil(result.retryMs / 1000));
    return false;
  }
  return true;
}

function getTelemetry() { return { ...telemetry, byRule:{...telemetry.byRule}, scope:'per-instance in-memory counters; resets on restart; not a distributed WAF' }; }

module.exports = { applyFirewall, getTelemetry };
