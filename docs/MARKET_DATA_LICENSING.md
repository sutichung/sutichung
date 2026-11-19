# Market data licensing gates

## Default policy

This application has member-facing features. A successful public API response is technical reachability, not permission to store, analyze, display, redistribute or provide derived signals to third parties.

All exchange market-data providers are disabled by default. The server must not call a provider or expose its data until the operator has obtained and reviewed written permission covering the specific product, member/end-user display, redistribution, historical storage, derived analytics, and AI/ML use.

Each flag below is an operator attestation, not proof of a license. Keep the executed agreement and its scope on file. Do not set a flag merely because an endpoint is public or does not require an API key.

| Provider | Required Render environment variable |
|---|---|
| Binance (spot and derivatives) | `BINANCE_MARKET_DATA_LICENSE_CONFIRMED=true` |
| Bybit | `BYBIT_MARKET_DATA_LICENSE_CONFIRMED=true` |
| OKX | `OKX_MARKET_DATA_LICENSE_CONFIRMED=true` |
| Coinbase | `COINBASE_MARKET_DATA_LICENSE_CONFIRMED=true` |
| Kraken Spot | `KRAKEN_MARKET_DATA_LICENSE_CONFIRMED=true` |
| Kraken Futures | `KRAKEN_FUTURES_MARKET_DATA_LICENSE_CONFIRMED=true` |

A flag applies only to its named provider. It does not authorize another exchange, another product class, historical datasets, AI training, or downstream redistribution beyond the agreement's scope.

## Provider-specific cautions

- **Coinbase:** Its Market Data Terms grant a limited personal/research license and prohibit building an application for other end users or redistributing/displaying data and derived works to third parties absent prior express written consent. See https://www.coinbase.com/legal/market_data
- **Kraken Spot and Futures:** Kraken states that certain uses require prior permission, including non-personal commercial use of data from publicly accessible endpoints. See https://docs-legacy.kraken.com/api/docs/guides/global-intro/
- **OKX:** Its API Agreement restricts third-party display, redistribution and commercial analytics/AI use absent prior written consent. Public endpoints are not automatically exempt.
- **Binance:** Binance Vision Dataset Terms grant a non-commercial license and require a separate written enterprise data license for commercial use. Binance's broader Terms of Use also restrict resale/commercial use of Services unless agreed in writing. The scope of live public market-data endpoints should be confirmed in writing before member distribution. See https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md and https://www.binance.com/en-JP/terms
- **Bybit:** Keep disabled until the current API terms and any redistribution permissions have been reviewed for this member-facing use.

## Runtime behavior without permission

- Provider diagnostics report `not_configured` without making exchange calls.
- Crypto market list reports `license_required` and no unlicensed markets.
- Crypto history, derivatives, orderbook and trade-tape requests fail closed.
- Risk analysis reports `license_required` rather than inventing data or silently switching to an unlicensed source.
- The production smoke test accepts this explicit compliance state as degraded service, not as successful market-data availability.
- Other official market sources (for example TWSE) remain subject to their own data terms and entitlements.


## Taiwan equity provider fallback

- **Fugle HTTP 403** means the current subscription plan does not support the requested feature according to Fugle's official error-code documentation. Check the subscribed plan and whether the selected endpoint (for example, snapshot quotes) is included. Do not treat every 403 as a bad API key or blindly retry. See https://developer.fugle.tw/docs/data/error_codes/ and https://developer.fugle.tw/docs/pricing/.
- **Shioaji** is a separate SinoPac API route, not a drop-in key-only REST provider. The official integration requires a SinoPac API account and certificate/configuration; streaming subscriptions should be used for intraday realtime data, not repeated polling of snapshots or historical K-bars. Subscription and connection limits apply. See https://sinotrade.github.io/zh/tutor/market_data/streaming/stocks/ and https://sinotrade.github.io/tutor/limit/.
- The Shioaji adapter is not deployed or connected yet. Do not show it as connected until an authenticated, authorized adapter reports live source timestamps and passes quote-quality checks.
