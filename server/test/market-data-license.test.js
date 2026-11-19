'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDER_LICENSE_ENV, isMarketDataLicensed, licenseEnvName, requireMarketDataLicense, licenseStatus } = require('../lib/market-data-license');

test('every exchange has a separate explicit written redistribution license gate', () => {
  for (const provider of ['Binance','Bybit','OKX','Coinbase','Kraken','Kraken Futures']) {
    assert.ok(licenseEnvName(provider));
    assert.equal(isMarketDataLicensed(provider, {}), false);
    assert.equal(licenseStatus(provider, {}), 'not_configured');
    assert.throws(() => requireMarketDataLicense(provider, {}), /market_data_license_required/);
  }
});

test('a provider is enabled only by its own explicit true attestation', () => {
  const env = { [PROVIDER_LICENSE_ENV.Binance]: 'true' };
  assert.equal(isMarketDataLicensed('Binance', env), true);
  for (const provider of ['Bybit','OKX','Coinbase','Kraken','Kraken Futures']) assert.equal(isMarketDataLicensed(provider, env), false);
});
