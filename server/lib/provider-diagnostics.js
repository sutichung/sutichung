'use strict';

const CHECK_TIMEOUT_MS = 7000;

function statusForHttp(status) {
  if (status >= 200 && status < 300) return 'connected';
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 404) return 'endpoint_error';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  return 'http_error';
}

function safeError(error) {
  const raw = String(error && error.message || error || 'unknown_error');
  if (/abort|timeout/i.test(raw)) return '連線逾時（7 秒）';
  const match = raw.match(/upstream_http_(\d{3})/i);
  if (match) {
    const status = Number(match[1]);
    if (status === 401) return 'API 金鑰驗證失敗（HTTP 401）';
    if (status === 403) return '服務拒絕存取或方案權限不足（HTTP 403）';
    if (status === 404) return 'API 路徑不存在（HTTP 404）';
    if (status === 429) return '呼叫頻率或額度受限（HTTP 429）';
    return '上游服務回應 HTTP ' + status;
  }
  return raw.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 180);
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(id, label, run) {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const result = await run();
    return {
      id, label, status: result.status || 'connected',
      httpStatus: result.httpStatus || null,
      latencyMs: Date.now() - started,
      checkedAt,
      message: result.message || '連線成功',
      dataCount: Number.isFinite(result.dataCount) ? result.dataCount : null,
      sourceTime: result.sourceTime || null
    };
  } catch (error) {
    const message = safeError(error);
    const http = String(error && error.message || '').match(/upstream_http_(\d{3})/i);
    return {
      id, label,
      status: /逾時/.test(message) ? 'timeout' :
        /401/.test(message) ? 'auth_error' :
        /403/.test(message) ? 'permission_error' :
        /429/.test(message) ? 'rate_limited' : 'error',
      httpStatus: http ? Number(http[1]) : null,
      latencyMs: Date.now() - started,
      checkedAt,
      message
    };
  }
}

function notConfigured(id, label, message) {
  return { id, label, status: 'not_configured', httpStatus: null, latencyMs: null, checkedAt: new Date().toISOString(), message };
}

async function diagnoseProviders(env = process.env) {
  const checks = [];
  checks.push(probe('twse', '臺灣證交所公開行情 API', async () => {
    const { response, body } = await request('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('upstream_http_' + response.status);
    const rows = JSON.parse(body);
    if (!Array.isArray(rows) || !rows.length) throw new Error('TWSE 回應格式錯誤或沒有資料');
    return { httpStatus: response.status, dataCount: rows.length, message: '官方資料端點有回應；此端點不是盤中逐筆報價' };
  }));
  checks.push(probe('ecb', '歐洲央行每日外匯參考 API', async () => {
    const { response, body } = await request('https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&lastNObservations=1', { headers: { accept: 'text/csv' } });
    if (!response.ok) throw new Error('upstream_http_' + response.status);
    const lines = body.trim().split(/\r?\n/);
    if (lines.length < 2 || !lines[0].includes('OBS_VALUE')) throw new Error('ECB 回應格式錯誤或沒有觀測值');
    return { httpStatus: response.status, dataCount: lines.length - 1, message: '每日參考匯率端點正常；不是即時外匯報價' };
  }));
  if (env.FINMIND_TOKEN) {
    checks.push(probe('finmind', 'FinMind 資料 API', async () => {
      const url = new URL(env.FINMIND_BASE || 'https://api.finmindtrade.com/api/v4/data');
      url.searchParams.set('dataset', 'TaiwanStockInfo');
      const { response, body } = await request(url.toString(), { headers: { accept: 'application/json', Authorization: 'Bearer ' + env.FINMIND_TOKEN } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const payload = JSON.parse(body);
      if (payload.status !== 200) throw new Error('FinMind status ' + payload.status);
      return { httpStatus: response.status, dataCount: Array.isArray(payload.data) ? payload.data.length : 0, message: '金鑰驗證成功，資料端點有回應' };
    }));
  } else checks.push(notConfigured('finmind', 'FinMind 資料 API', 'Render 未設定 FINMIND_TOKEN；可使用公開資料備援'));
  if (env.FUGLE_API_KEY) {
    checks.push(probe('fugle', 'Fugle 股票行情 API', async () => {
      const base = (env.FUGLE_BASE_URL || 'https://api.fugle.tw/marketdata/v1.0/stock').replace(/\/+$/, '');
      const { response, body } = await request(base + '/snapshot/quotes/TSE', { headers: { accept: 'application/json', 'X-API-KEY': env.FUGLE_API_KEY } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const payload = JSON.parse(body);
      if (!Array.isArray(payload.data)) throw new Error('Fugle 回應缺少 data 陣列');
      return { httpStatus: response.status, dataCount: payload.data.length, message: '股票快照 API 有回應；請另看報價時間判斷即時性' };
    }));
  } else checks.push(notConfigured('fugle', 'Fugle 股票行情 API', 'Render 未設定 FUGLE_API_KEY；目前只能使用公開資料備援'));
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (supabaseUrl && env.SUPABASE_ANON_KEY) {
    checks.push(probe('supabase', 'Supabase Auth API', async () => {
      const { response } = await request(supabaseUrl + '/auth/v1/settings', { headers: { accept: 'application/json', apikey: env.SUPABASE_ANON_KEY } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      return { httpStatus: response.status, message: 'Auth 設定端點正常；使用者登入仍需有效帳號與 Token' };
    }));
  } else checks.push(notConfigured('supabase', 'Supabase Auth API', '缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY'));
  const ai = [
    ['openrouter', 'OpenRouter 模型目錄 API', env.OPENROUTER_API_KEY, 'https://openrouter.ai/api/v1/models'],
    ['gemini', 'Gemini 模型目錄 API', env.GEMINI_API_KEY, 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(env.GEMINI_API_KEY || '')],
    ['groq', 'Groq 模型目錄 API', env.GROQ_API_KEY, 'https://api.groq.com/openai/v1/models']
  ];
  for (const [id, label, key, endpoint] of ai) {
    if (!key) { checks.push(notConfigured(id, label, 'Render 尚未設定對應 API Key')); continue; }
    checks.push(probe(id, label, async () => {
      const headers = { accept: 'application/json' };
      if (id !== 'gemini') headers.Authorization = 'Bearer ' + key;
      const { response, body } = await request(endpoint, { headers });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const payload = JSON.parse(body);
      const count = Array.isArray(payload.data) ? payload.data.length : Array.isArray(payload.models) ? payload.models.length : null;
      return { httpStatus: response.status, dataCount: count, message: '模型目錄端點及 API Key 驗證成功；未呼叫生成服務、不產生推論費用' };
    }));
  }
  if (env.YOUTUBE_API_KEY) {
    checks.push(probe('youtube', 'YouTube Data API', async () => {
      const url = 'https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({ part: 'id', id: 'aqz-KE-bpKQ', key: env.YOUTUBE_API_KEY }).toString();
      const { response, body } = await request(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const payload = JSON.parse(body);
      return { httpStatus: response.status, dataCount: Array.isArray(payload.items) ? payload.items.length : 0, message: 'YouTube Data API 金鑰可用' };
    }));
  } else checks.push(notConfigured('youtube', 'YouTube Data API', 'Render 尚未設定 YOUTUBE_API_KEY；可使用官方頻道嵌入備援'));
  const results = await Promise.all(checks);
  const connected = results.filter(x => x.status === 'connected').length;
  const failed = results.filter(x => ['error','timeout','auth_error','permission_error','rate_limited'].includes(x.status)).length;
  const notSet = results.filter(x => x.status === 'not_configured').length;
  return {
    generatedAt: new Date().toISOString(),
    summary: { total: results.length, connected, failed, notConfigured: notSet },
    checks: results,
    policy: 'Connected means an actual non-billable GET request succeeded. Key presence alone is never reported as connected.'
  };
}

module.exports = { diagnoseProviders, statusForHttp, safeError };
