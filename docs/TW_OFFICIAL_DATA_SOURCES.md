# Taiwan Stock Hunter — Official Taiwan Market Data

## Source policy

Taiwan equity prices, issuer fundamentals, valuation and corporate disclosures must come from exchange / regulator / official filing sources. FinMind and third-party market-history mirrors are not used as fallback sources for Taiwan stock prices, K-lines, fundamentals, revenue, valuation, flows or market news.

## Current official adapters

| Data | Official source | Current coverage / limitation |
|---|---|---|
| TWSE daily market snapshot | TWSE OpenAPI `/exchangeReport/STOCK_DAY_ALL` | Latest official end-of-day snapshot; not an intraday tick feed. |
| TWSE individual daily candles | TWSE official RWD `/afterTrading/STOCK_DAY` | Monthly query; recent 12 months loaded for a symbol. The public endpoint has a historical floor; do not claim coverage back to 1990. |
| TPEx daily market snapshot | TPEx OpenAPI `/tpex_mainboard_daily_close_quotes` | Latest trading-day snapshot only; the documented OpenAPI does not expose a historical date query. |
| TPEx historical candles | Supabase `tw_market_daily_bars` | Accumulates daily official TPEx snapshots after the migration is applied and server-side service-role access is configured. At least 60 valid trading days are required for technical indicators. |
| TWSE monthly revenue | TWSE OpenAPI `/opendata/t187ap05_L` | Latest published reporting period snapshot; not a full monthly time series. |
| TPEx monthly revenue | TPEx OpenAPI `/mopsfin_t187ap05_O` | Latest published reporting period snapshot; not a full monthly time series. |
| TWSE financial statements | TWSE OpenAPI `/opendata/t187ap06_L_*` and `t187ap07_L_*` | Latest public statement snapshot by industry class. |
| TPEx financial statements | TPEx OpenAPI `/mopsfin_t187ap06_O_*` and `mopsfin_t187ap07_O_*` | Latest public statement snapshot by industry class. |
| TWSE valuation | TWSE OpenAPI `/exchangeReport/BWIBBU_ALL` | Latest published P/E, P/B and dividend-yield snapshot. |
| TPEx valuation | TPEx OpenAPI `/tpex_mainboard_peratio_analysis` | Latest published valuation snapshot. |
| TWSE institutional flows | TWSE official T86 daily report | TWSE only in this adapter; TPEx institutional flow and margin data are deliberately omitted until their documented official adapters are verified. |
| Shareholding distribution | TDCC official open data | Weekly holder-distribution snapshot. |
| Market news | TWSE OpenAPI `/news/newsList` | Official TWSE announcements/news feed. |
| Taiwan futures context | TAIFEX OpenAPI `/v1/DailyMarketReportFut` | Official daily report, not night-session real-time data. |

## Historical data and model safeguards

- End-of-day data is never labelled as intraday real-time.
- ROC dates are converted to Gregorian dates before storage and analysis.
- Missing or malformed OHLCV rows are rejected; no synthetic bars are generated.
- TPEx history is built only from dated official snapshots captured by this application. The snapshot collector requires the SQL migration `supabase/migrations/202611210001_official_tw_market_history.sql` and `SUPABASE_SERVICE_ROLE_KEY`.
- MOPS / exchange OpenAPI current-period snapshots are not silently represented as a complete history. A persistent monthly / quarterly point-in-time archive is still required for long-range fundamental backtests.
- Full-market technical scanning remains disabled until a verified official historical store has at least 60 valid trading days per symbol and at least 60% of the current listed/OTC universe. Once the Supabase migration is applied and snapshots accumulate enough sessions with sufficient universe coverage, the scanner reads the database aggregation function and can resume automatically. This is intentional: an unavailable score is safer than a score calculated from third-party or incomplete history.
- 1990 historical coverage is not claimed. TWSE public individual-stock query coverage is bounded by the exchange endpoint; TPEx historical downloads may require official historical data products / subscription.
- Corporate-action adjusted candles are not currently synthesized. Raw OHLCV across splits, capital changes and ex-dividend dates must not be interpreted as adjusted returns.

## Deployment prerequisites

1. Apply the SQL migration in the Supabase project.
2. Ensure Render has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
3. Call `/api/market/snapshot` after each trading day close (or schedule the existing trusted automation to do so).
4. Verify `historyPersistence.persisted=true` and the newest `trade_date` for both exchanges before enabling technical scans.
5. Verify source, as-of date, market coverage and staleness in production before describing any value as current.

## Official documentation

- TWSE OpenAPI: https://openapi.twse.com.tw/
- TPEx OpenAPI: https://www.tpex.org.tw/openapi/
- MOPS: https://mops.twse.com.tw/
- TDCC Open Data: https://opendata.tdcc.com.tw/
- TAIFEX OpenAPI: https://openapi.taifex.com.tw/
