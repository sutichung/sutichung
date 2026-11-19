'use strict';

function epochMilliseconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function isStaleTimestamp(value, now = Date.now(), maxAgeMs = 300000, futureToleranceMs = 60000) {
  const ms = typeof value === 'number' ? value : epochMilliseconds(value);
  return !Number.isFinite(ms) || now - ms > maxAgeMs || ms - now > futureToleranceMs;
}

module.exports = { epochMilliseconds, isStaleTimestamp };
