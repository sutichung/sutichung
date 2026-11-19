'use strict';

function buildRuntimeHealth(options = {}) {
  const expected = Number(options.expectedInstances ?? process.env.EXPECTED_INSTANCE_COUNT);
  const expectedInstances = Number.isInteger(expected) && expected > 0 ? expected : null;
  return {
    ok: true,
    status: 'healthy',
    time: new Date().toISOString(),
    node: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    mode: options.mode || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    commit: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    deployment: {
      region: options.region || process.env.APP_REGION || process.env.RENDER_REGION || 'unknown',
      service: options.service || process.env.RENDER_SERVICE_NAME || process.env.RENDER_SERVICE_ID || null,
      instance: options.instance || process.env.RENDER_INSTANCE_ID || null,
      expectedInstances,
      topologyConfigured: expectedInstances !== null
    }
  };
}

function buildDependencyReadiness(env = process.env) {
  const configured = (name) => Boolean(String(env[name] || '').trim());
  const confirmed = (name) => String(env[name] || '').trim().toLowerCase() === 'true';
  const historical = [
    ['twse', 'TWSE_HISTORICAL_PROVIDER_URL', 'TWSE_HISTORICAL_LICENSE_CONFIRMED'],
    ['tpex', 'TPEX_HISTORICAL_PROVIDER_URL', 'TPEX_HISTORICAL_LICENSE_CONFIRMED'],
    ['us', 'US_HISTORICAL_PROVIDER_URL', 'US_HISTORICAL_LICENSE_CONFIRMED'],
    ['crypto', 'CRYPTO_HISTORICAL_PROVIDER_URL', 'CRYPTO_HISTORICAL_LICENSE_CONFIRMED'],
    ['other', 'OTHER_HISTORICAL_PROVIDER_URL', 'OTHER_HISTORICAL_LICENSE_CONFIRMED']
  ].map(([id, urlKey, licenseKey]) => {
    const endpointConfigured = configured(urlKey);
    const licenseConfirmed = confirmed(licenseKey);
    return {
      id,
      endpointConfigured,
      licenseConfirmed,
      configurationComplete: endpointConfigured && licenseConfirmed,
      connectivityVerified: false,
      coverageVerified: false,
      status: endpointConfigured && licenseConfirmed ? 'verification_required' : 'not_configured'
    };
  });
  const cryptoLicenses = [
    'BINANCE_MARKET_DATA_LICENSE_CONFIRMED',
    'BYBIT_MARKET_DATA_LICENSE_CONFIRMED',
    'OKX_MARKET_DATA_LICENSE_CONFIRMED',
    'COINBASE_MARKET_DATA_LICENSE_CONFIRMED',
    'KRAKEN_MARKET_DATA_LICENSE_CONFIRMED',
    'KRAKEN_FUTURES_MARKET_DATA_LICENSE_CONFIRMED'
  ];
  const checks = {
    httpServer: { status: 'ready', ready: true },
    supabaseAuth: { status: configured('SUPABASE_URL') && configured('SUPABASE_ANON_KEY') ? 'configured_unverified' : 'not_configured', configured: configured('SUPABASE_URL') && configured('SUPABASE_ANON_KEY'), connectivityVerified: false },
    adminMemberRecovery: { status: configured('SUPABASE_SERVICE_ROLE_KEY') && configured('SUPABASE_ADMIN_EMAIL') ? 'configured_unverified' : 'not_configured', configured: configured('SUPABASE_SERVICE_ROLE_KEY') && configured('SUPABASE_ADMIN_EMAIL'), connectivityVerified: false },
    realtimeMarket: { status: configured('FUGLE_API_KEY') || configured('MARKET_REALTIME_URL') ? 'configured_unverified' : 'not_configured', configured: configured('FUGLE_API_KEY') || configured('MARKET_REALTIME_URL'), connectivityVerified: false },
    historicalProviders: historical,
    cryptoRedistributionLicenses: {
      confirmed: cryptoLicenses.filter(confirmed).length,
      total: cryptoLicenses.length,
      status: cryptoLicenses.every(confirmed) ? 'confirmed' : 'review_required'
    }
  };
  const warnings = [];
  if (!checks.supabaseAuth.configured) warnings.push('Supabase Auth 尚未完整設定');
  else warnings.push('Supabase Auth 僅檢查設定，尚未驗證實際連線');
  if (!checks.adminMemberRecovery.configured) warnings.push('管理員會員復原功能尚未完整設定');
  if (!checks.realtimeMarket.configured) warnings.push('即時行情串流尚未設定；REST 備援不等於 WebSocket 即時行情');
  else warnings.push('行情來源僅檢查設定，尚未驗證即時連線與報價新鮮度');
  if (historical.some(x => !x.configurationComplete)) warnings.push('部分歷史資料來源或授權尚未完成；不可宣稱歷史 K 線完整');
  warnings.push('歷史資料來源尚未完成逐商品連線、日期覆蓋與缺漏稽核；設定完成不代表資料完整');
  if (checks.cryptoRedistributionLicenses.status !== 'confirmed') warnings.push('部分加密貨幣資料展示／再分發授權尚待確認');
  return {
    ready: true,
    status: 'degraded',
    connectivityVerified: false,
    coverageVerified: false,
    checks,
    warnings
  };
}

module.exports = { buildRuntimeHealth, buildDependencyReadiness };
