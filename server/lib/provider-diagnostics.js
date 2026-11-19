'use strict';
const { isMarketDataLicensed, licenseEnvName } = require('./market-data-license');

const CHECK_TIMEOUT_MS = 12000;

function statusForHttp(status) {
  if (status >= 200 && status < 300) return 'connected';
  if (status === 401) return 'auth_error';
  if (status === 403) return 'permission_error';
  if (status === 451) return 'region_restricted';
  if (status === 404) return 'endpoint_error';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  return 'http_error';
}

function safeError(error) {
  const raw = String(error && error.message || error || 'unknown_error');
  if (/abort|timeout/i.test(raw)) {
    const timeoutMs = Number(error && error.timeoutMs);
    const seconds = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.ceil(timeoutMs / 1000) : 12;
    return '連線逾時（' + seconds + ' 秒）';
  }
  const match = raw.match(/upstream_http_(\d{3})/i);
  if (match) {
    const status = Number(match[1]);
    if (status === 401) return 'API 金鑰驗證失敗（HTTP 401）';
    if (status === 403) return '服務拒絕存取；請檢查 API Key、方案權限及來源 IP 白名單（HTTP 403）';
    if (status === 404) return 'API 路徑不存在（HTTP 404）';
    if (status === 429) return '呼叫頻率或額度受限（HTTP 429）';
    if (status === 451) return '上游服務因地區或法規限制拒絕此請求（HTTP 451）；不可用代理或偽裝地區繞過';
    return '上游服務回應 HTTP ' + status;
  }
  return raw.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 180);
}

async function request(url, options = {}, timeoutMs = CHECK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('request timeout');
      timeoutError.timeoutMs = timeoutMs;
      throw timeoutError;
    }
    throw error;
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
    const message = providerErrorMessage(id, error);
    const http = String(error && error.message || '').match(/upstream_http_(\d{3})/i);
    return {
      id, label,
      status: /逾時/.test(message) ? 'timeout' :
        http ? statusForHttp(Number(http[1])) :
        'error',
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

function providerErrorMessage(id, error) {
  const raw = String(error && error.message || error || 'unknown_error');
  const match = raw.match(/upstream_http_(\d{3})/i);
  return safeError(error);
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
  checks.push(probe('tpex', '櫃買中心官方日行情 OpenAPI', async () => {
    const { response, body } = await request('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('upstream_http_' + response.status);
    const rows = JSON.parse(body);
    if (!Array.isArray(rows) || !rows.length) throw new Error('TPEx 回應格式錯誤或沒有資料');
    return { httpStatus: response.status, dataCount: rows.length, message: 'TPEx 官方日收盤資料端點有回應；不是盤中逐筆報價' };
  }));
  checks.push(probe('ecb', '歐洲央行每日外匯參考 API', async () => {
    let primaryError = null;
    try {
      const { response, body } = await request('https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&lastNObservations=1', { headers: { accept: 'text/csv' } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const lines = body.trim().split(/\r?\n/);
      if (lines.length < 2 || !lines[0].includes('OBS_VALUE')) throw new Error('ECB CSV 回應格式錯誤或沒有觀測值');
      const columns = lines[0].split(',');
      const valueIndex = columns.indexOf('OBS_VALUE');
      const dateIndex = columns.indexOf('TIME_PERIOD');
      const row = lines[lines.length - 1].split(',');
      if (valueIndex < 0 || !(Number(row[valueIndex]) > 0)) throw new Error('ECB CSV 沒有有效匯率觀測值');
      return { httpStatus: response.status, dataCount: 1, sourceTime: dateIndex >= 0 ? row[dateIndex] : null, message: 'ECB 官方每日參考匯率 API 正常；不是即時外匯報價' };
    } catch (error) { primaryError = error; }
    const { response, body } = await request('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { headers: { accept: 'application/xml,text/xml' } });
    if (!response.ok) throw new Error('ECB primary unavailable (' + safeError(primaryError) + '); official XML fallback HTTP ' + response.status);
    const dateMatch = body.match(/<Cube\s+time="(\d{4}-\d{2}-\d{2})"/);
    const usdMatch = body.match(/<Cube\s+currency="USD"\s+rate="([0-9.]+)"\s*\/?>/);
    if (!dateMatch || !(Number(usdMatch?.[1]) > 0)) throw new Error('ECB 官方 XML 備援缺少有效 USD 匯率觀測值');
    return { httpStatus: response.status, dataCount: 1, sourceTime: dateMatch[1], message: 'ECB 官方每日 XML 備援正常（主 API 暫時不可用）；不是即時外匯報價' };
  }));
  checks.push(probe('bank-of-canada', '加拿大央行 Valet CAD/USD 每日平均匯率', async () => {
    const { response, body } = await request('https://www.bankofcanada.ca/valet/observations/FXCADUSD/json?recent=1', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('upstream_http_' + response.status);
    const payload = JSON.parse(body);
    const observation = (payload.observations || []).find(x => x && x.FXCADUSD && x.FXCADUSD.v !== null && x.FXCADUSD.v !== undefined);
    if (!observation || !observation.d || !(Number(observation.FXCADUSD.v) > 0)) throw new Error('Bank of Canada 回應缺少有效 CAD/USD 觀測值');
    return { httpStatus: response.status, dataCount: 1, sourceTime: observation.d, message: '每日平均指示性匯率端點正常；非即時報價或收盤價' };
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
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (supabaseUrl && env.SUPABASE_ANON_KEY) {
    checks.push(probe('supabase', 'Supabase Auth API', async () => {
      const { response } = await request(supabaseUrl + '/auth/v1/settings', { headers: { accept: 'application/json', apikey: env.SUPABASE_ANON_KEY } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      return { httpStatus: response.status, message: 'Auth 設定端點正常；使用者登入仍需有效帳號與 Token' };
    }));
  } else checks.push(notConfigured('supabase', 'Supabase Auth API', '缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY'));
  const ai = [
    ['openrouter', 'OpenRouter 模型目錄 API', env.OPENROUTER_API_KEY, 'https://openrouter.ai/api/v1/models', 'bearer'],
    ['gemini', 'Gemini 模型目錄 API', env.GEMINI_API_KEY, 'https://generativelanguage.googleapis.com/v1beta/models', 'google'],
    ['groq', 'Groq 模型目錄 API', env.GROQ_API_KEY, 'https://api.groq.com/openai/v1/models', 'bearer'],
    ['openai', 'OpenAI 模型目錄 API', env.OPENAI_API_KEY, 'https://api.openai.com/v1/models', 'bearer'],
    ['xai', 'xAI Grok 模型目錄 API', env.XAI_API_KEY, 'https://api.x.ai/v1/models', 'bearer'],
    ['deepseek', 'DeepSeek 模型目錄 API', env.DEEPSEEK_API_KEY, 'https://api.deepseek.com/models', 'bearer'],
    ['cloudflare', 'Cloudflare Workers AI 模型目錄 API', env.CLOUDFLARE_API_TOKEN, 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID || '') + '/ai/models/search', 'cloudflare']
  ];
  for (const [id, label, key, endpoint, authType] of ai) {
    if (!key || (id === 'cloudflare' && !env.CLOUDFLARE_ACCOUNT_ID)) { checks.push(notConfigured(id, label, 'Render 缺少此服務所需的 API Key 或 Account ID')); continue; }
    checks.push(probe(id, label, async () => {
      const headers = { accept: 'application/json' };
      if (authType === 'google') headers['x-goog-api-key'] = key;
      else headers.Authorization = 'Bearer ' + key;
      const { response, body } = await request(endpoint, { headers });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const payload = JSON.parse(body);
      const count = Array.isArray(payload.data) ? payload.data.length : Array.isArray(payload.models) ? payload.models.length : null;
      if (id === 'cloudflare' && payload.success === false) throw new Error(String(payload.errors?.[0]?.message || 'Cloudflare API 回報失敗'));
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

  const cryptoQuotes = [
    ['binance', 'Binance 官方 Spot 市場資料 API', 'https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT', payload => payload.symbol === 'BTCUSDT' && Number(payload.price) > 0, 'Binance 官方 data-only Spot API 成功；不代表 USDⓈ-M 永續 API 可用'],
    ['binance-futures', 'Binance 官方 USDⓈ-M 永續 API', 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', payload => payload.symbol === 'BTCUSDT' && Number(payload.markPrice) > 0, 'BTCUSDT 永續標記價格端點成功'],
    ['bybit', 'Bybit 官方 V5 BTC/USDT 現貨 API（api.bybit.com／api.bytick.com 備援）', 'https://api.bytick.com/v5/market/tickers?category=spot&symbol=BTCUSDT', payload => payload.retCode === 0 && Number(payload.result?.list?.[0]?.lastPrice) > 0, 'Bybit 官方 alternate mainnet host 回應成功；美國 IP 仍受地區限制'],
    ['okx', 'OKX 官方 BTC-USDT 現貨報價', 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT', payload => payload.code === '0' && Number(payload.data?.[0]?.last) > 0, 'BTC-USDT 公開現貨報價端點成功；僅驗證單一商品連線'],
    ['okx-swap', 'OKX 官方 BTC-USDT 永續合約報價', 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP', payload => payload.code === '0' && Number(payload.data?.[0]?.last) > 0, 'BTC-USDT-SWAP 公開永續合約報價端點成功；可作為其他衍生品來源受限時的獨立資料源'],
    ['coinbase', 'Coinbase Exchange 官方 BTC-USD 報價', 'https://api.exchange.coinbase.com/products/BTC-USD/ticker', payload => Number(payload.price) > 0, 'BTC-USD 公開現貨報價端點成功；僅驗證單一商品連線'],
    ['kraken', 'Kraken 官方 XBT/USD 報價', 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', payload => !payload.error?.length && Number(Object.values(payload.result || {})[0]?.c?.[0]) > 0, 'XBT/USD 公開現貨報價端點成功；僅驗證單一商品連線']
  ];
  for (const [id, label, endpoint, valid, message] of cryptoQuotes) {
    const provider = id.startsWith('binance') ? 'Binance' : id === 'bybit' ? 'Bybit' : id.startsWith('okx') ? 'OKX' : id === 'coinbase' ? 'Coinbase' : id === 'kraken' ? 'Kraken' : id === 'kraken-futures' ? 'Kraken Futures' : null;
    if (provider && !isMarketDataLicensed(provider, env)) { checks.push(notConfigured(id, label, '未取得或未設定此來源的會員展示／再分發書面授權；請先確認條款並設定 ' + licenseEnvName(provider) + '=true')); continue; }
    checks.push(probe(id, label, async () => {
      const candidates = id === 'bybit'
        ? ['https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT', 'https://api.bytick.com/v5/market/tickers?category=spot&symbol=BTCUSDT']
        : id === 'binance'
          ? ['https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT', 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', 'https://api1.binance.com/api/v3/ticker/price?symbol=BTCUSDT']
          : [endpoint];
      const errors = [];
      for (const candidate of candidates) {
        try {
          const { response, body } = await request(candidate, { headers: { accept: 'application/json' } }, 5000);
          if (!response.ok) throw new Error('upstream_http_' + response.status);
          const payload = JSON.parse(body);
          if (!valid(payload)) throw new Error(id + ' 報價回應格式錯誤或價格無效');
          const host = new URL(candidate).host;
          return { httpStatus: response.status, dataCount: 1, message: message + '（實際端點：' + host + '）' };
        } catch (error) { errors.push(error); }
      }
      throw errors[errors.length - 1] || new Error(id + ' 所有官方端點均無回應');
    }));
  }
  if (!isMarketDataLicensed('Kraken Futures', env)) {
    checks.push(notConfigured('kraken-futures', 'Kraken Futures 官方永續行情 API', '未取得或未設定此來源的會員展示／再分發書面授權；請先確認條款並設定 ' + licenseEnvName('Kraken Futures') + '=true'));
  } else {
    checks.push(probe('kraken-futures', 'Kraken Futures 官方永續行情 API', async () => {
      const { response, body } = await request('https://futures.kraken.com/derivatives/api/v3/tickers', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('upstream_http_' + response.status);
      const payload = JSON.parse(body);
      const tickers = Array.isArray(payload.tickers) ? payload.tickers : Array.isArray(payload.result) ? payload.result : [];
      const perpetuals = tickers.filter(x => x && x.tag === 'perpetual' && Number(x.last) > 0 && Number(x.markPrice) > 0);
      if (!perpetuals.length) throw new Error('Kraken Futures 回應缺少有效永續商品報價');
      const btc = perpetuals.find(x => /XBT:USD|BTC:USD/i.test(String(x.pair || '')));
      return { httpStatus: response.status, dataCount: perpetuals.length, sourceTime: btc && Number.isFinite(Number(btc.time)) ? new Date(Number(btc.time)).toISOString() : null, message: '官方公開永續商品報價有效；實際可用商品依帳戶與地區資格而異' };
    }));
  }
  checks.push(notConfigured(
    'us-equities-official',
    '美股官方行情授權來源',
    '尚未設定 Nasdaq／NYSE／CTA／UTP 或其授權資料商的有效行情 API；Yahoo Finance 僅為非官方備援，不列為官方行情連線。'
  ));

  checks.push(notConfigured('shioaji', '永豐 Shioaji 官方行情串流', '尚未部署 Shioaji 串流轉接服務；需要永豐證券 API 帳戶、憑證及行情權限。完成接入前不會宣稱已取得即時行情。'));

  const results = await Promise.all(checks);
  const connected = results.filter(x => x.status === 'connected').length;
  const failed = results.filter(x => ['error','timeout','auth_error','permission_error','region_restricted','rate_limited','upstream_error','http_error','endpoint_error'].includes(x.status)).length;
  const regionRestricted = results.filter(x => x.status === 'region_restricted').length;
  const notSet = results.filter(x => x.status === 'not_configured').length;
  return {
    generatedAt: new Date().toISOString(),
    summary: { total: results.length, connected, failed, regionRestricted, notConfigured: notSet },
    checks: results,
    policy: 'Connected means an actual non-billable GET request succeeded. Key presence alone is never reported as connected.'
  };
}

module.exports = { diagnoseProviders, statusForHttp, safeError, providerErrorMessage };
