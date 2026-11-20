'use strict';
const zlib = require('node:zlib');

const BUCKET = 'crypto-realtime';
function createCryptoEventStorage({ env = process.env, fetchImpl = fetch } = {}) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  let bucketReady = false;
  async function ensureBucket() {
    if (!base || !key) throw new Error('crypto_storage_not_configured');
    if (bucketReady) return;
    const headers = { apikey: key, authorization: 'Bearer ' + key, accept: 'application/json' };
    const check = await fetchImpl(base + '/storage/v1/bucket/' + BUCKET, { headers, signal: AbortSignal.timeout(10000) });
    if (!check.ok && check.status !== 404) throw new Error('crypto_storage_bucket_check_http_' + check.status);
    if (check.status === 404) {
      const create = await fetchImpl(base + '/storage/v1/bucket', {
        method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 5242880, allowed_mime_types: ['application/gzip'] }),
        signal: AbortSignal.timeout(10000)
      });
      if (!create.ok && create.status !== 409) throw new Error('crypto_storage_bucket_create_http_' + create.status);
    }
    bucketReady = true;
  }
  async function saveMinuteBatch(batch) {
    if (!batch || !Array.isArray(batch.events) || !batch.events.length) return { stored: false, count: 0 };
    await ensureBucket();
    const body = batch.events.map(x => JSON.stringify(x)).join('\n') + '\n';
    const compressed = zlib.gzipSync(Buffer.from(body, 'utf8'));
    const safe = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
    const path = 'ticks/' + batch.minute.slice(0, 10) + '/' + batch.minute.slice(11, 16).replace(':', '') + '/' +
      safe(batch.exchange) + '_' + safe(batch.marketType) + '_' + safe(batch.symbol) + '_' + Date.now() + '.jsonl.gz';
    const response = await fetchImpl(base + '/storage/v1/object/' + BUCKET + '/' + path, {
      method: 'POST',
      headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/gzip', 'x-upsert': 'false' },
      body: compressed, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('crypto_storage_upload_http_' + response.status);
    return { stored: true, bucket: BUCKET, path, count: batch.events.length, bytes: compressed.length };
  }
  async function saveStatus(status) {
    await ensureBucket();
    const response = await fetchImpl(base + '/storage/v1/object/' + BUCKET + '/status/latest.json', {
      method: 'POST',
      headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json', 'x-upsert': 'true' },
      body: JSON.stringify(status), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('crypto_storage_status_http_' + response.status);
    return { stored: true };
  }
  async function readStatus() {
    if (!base || !key) return { configured: false, status: 'not_configured' };
    const response = await fetchImpl(base + '/storage/v1/object/authenticated/' + BUCKET + '/status/latest.json', {
      headers: { apikey: key, authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404) return { configured: true, status: 'not_started' };
    if (!response.ok) throw new Error('crypto_storage_status_read_http_' + response.status);
    return { configured: true, ...(await response.json()) };
  }
  return { ensureBucket, saveMinuteBatch, saveStatus, readStatus, configured: Boolean(base && key) };
}
module.exports = { createCryptoEventStorage, BUCKET };
