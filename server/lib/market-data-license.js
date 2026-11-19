'use strict';

const PROVIDER_LICENSE_ENV = Object.freeze({
  Binance: 'BINANCE_MARKET_DATA_LICENSE_CONFIRMED',
  Bybit: 'BYBIT_MARKET_DATA_LICENSE_CONFIRMED',
  OKX: 'OKX_MARKET_DATA_LICENSE_CONFIRMED',
  Coinbase: 'COINBASE_MARKET_DATA_LICENSE_CONFIRMED',
  Kraken: 'KRAKEN_MARKET_DATA_LICENSE_CONFIRMED',
  'Kraken Futures': 'KRAKEN_FUTURES_MARKET_DATA_LICENSE_CONFIRMED'
});

function licenseEnvName(provider) {
  return PROVIDER_LICENSE_ENV[provider] || null;
}

function isMarketDataLicensed(provider, env = process.env) {
  const key = licenseEnvName(provider);
  return !!key && env[key] === 'true';
}

function requireMarketDataLicense(provider, env = process.env) {
  if (!isMarketDataLicensed(provider, env)) {
    throw new Error('market_data_license_required:' + provider + ':' + (licenseEnvName(provider) || 'unknown_provider'));
  }
}

function licenseStatus(provider, env = process.env) {
  return isMarketDataLicensed(provider, env) ? 'licensed' : 'not_configured';
}

module.exports = { PROVIDER_LICENSE_ENV, licenseEnvName, isMarketDataLicensed, requireMarketDataLicense, licenseStatus };
