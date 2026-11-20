# Global market intelligence connectors

This module collects four distinct evidence classes without conflating them:

- Government and policy: Federal Register API and European Commission press-corner RSS. Coverage is intentionally bounded; not a claim of all-country coverage.
- Public social signals: public Reddit feeds. Lexical sentiment is a weak aggregate proxy, not a poll or a claim about investor psychology.
- Order books: independent public snapshots from Binance, OKX and Kraken. Snapshots are not trades and are not a consolidated market.
- On-chain whale transfers: disabled until a compatible, authorized provider URL and API key are configured. A transfer does not establish buy/sell direction or wallet identity.
- Macro/central banks: World Bank public indicators and FRED observations when FRED_API_KEY is configured. Data frequencies and publication lags are preserved.

Endpoint: GET /api/intelligence/market-signals
Optional query: symbols=BTCUSDT,ETHUSDT (maximum five).
Environment: FRED_API_KEY, WHALE_ALERT_API_URL, WHALE_ALERT_API_KEY.
All records retain source, URL, observed/published time and evidence class where available. Failures remain visible; no synthetic observations are generated.
