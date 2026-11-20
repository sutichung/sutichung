# Global market intelligence connectors

## Source coverage

- **Government/policy originals:** US Federal Register API; US Federal Reserve Board press-release RSS; European Commission press releases; Taiwan Executive Yuan primary JSON feed; Taiwan Presidential Office news-release RSS. This is a multi-jurisdiction starter set, not complete global legal coverage. Each source may be unavailable independently.
- **Public social signals:** Reddit r/CryptoCurrency and r/investing plus public Bluesky search API. This is platform-limited public content, not a representative poll, not a measure of the whole population, and not a personal-psychology assessment. X/Twitter and some other platforms require paid/authorized API access and are not scraped around access controls.
- **Order books:** Binance, OKX, Kraken and Coinbase Exchange public REST depth snapshots. These are per-venue snapshots, not a consolidated order book or executed trades. REST snapshots are not WebSocket streaming.
- **On-chain whale transfers:** disabled until an authorized provider URL and key are configured. Blockchain explorers alone do not reliably identify whale owners; unknown wallets remain unknown and transfer direction remains unknown.
- **Macro/central banks:** World Bank public country indicators; Taiwan Central Bank Statistical Database API (exchange rates, central-bank rates, money/financial indicators, FX and balance-of-payments series); FRED observations when FRED_API_KEY is configured. The central-bank policy/news feeds above are source documents, not numeric time series. More country-specific numeric series can be added only against each central bank's documented public API and terms.

## Runtime

Endpoint: GET /api/intelligence/market-signals
Optional query: symbols=BTCUSDT,ETHUSDT (maximum five; Coinbase/Kraken use USD pairs where available).
Environment: FRED_API_KEY, WHALE_ALERT_API_URL, WHALE_ALERT_API_KEY.

All observations preserve source identity and publication/observation time where the provider supplies it. Failures remain visible; no synthetic observations or inferred wallet identities are generated. The server caches the aggregate endpoint for 60 seconds; exchange REST snapshots therefore have polling cadence and should not be labelled tick-level real-time.

## Known access boundaries

- Taiwan Executive Yuan open-data dataset is published free under the Open Government Data License 1.0; preserve attribution and source link.
- Bluesky public read endpoints are available without authentication for public AppView GET requests; platform availability/rate limits still apply.
- FRED requires an API key. Whale-alert-compatible services require a valid provider subscription/API key.
- No API key or paid subscription is created by this code. Configure secrets only in Render environment settings, never in Git.
