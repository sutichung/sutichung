# Historical K-line coverage policy (1990 baseline)

## Requirement
All equity daily OHLCV history is targeted from **1990-01-01**, or from the instrument's first actual trading date when it listed later. Weekly and monthly bars are derived only from validated daily bars. Intraday bars have separate, provider-specific coverage and are not promised back to 1990.

Crypto, futures, FX and other instruments must start at the first verifiable exchange/listing/contract trading date. Never synthesize candles to fill pre-listing periods.

## Coverage evidence and constraints

| Market | Required baseline | Evidence / current constraint |
|---|---|---|
| Taiwan TWSE | 1990-01-01 | The Taiwan Economic Journal historical databank describes STOCK90 as daily TWSE trading statistics from 1990 onward, updated daily. This is a data product, not a free public API; obtain delivery details, license and permitted storage/display rights before ingestion. |
| Taiwan TPEx | 1990-01-01 target, earliest real date per security | Available dataset evidence reports daily coverage from 1994-01-05. This does not establish 1990-1993 coverage; verify direct TPEx archive/licensing before use. |
| US equities | 1990-01-01 | S&P Global Marketplace describes global EOD packages including a 1990s package (1990-1999) and current history. Commercial subscription and security-level coverage validation are required. |
| Crypto | Per instrument listing start | Exchange historical candle APIs return data within each exchange's actual listing/trading history. Do not assume BTC or any coin existed in 1990. |
| Other markets | Per instrument first trading date | Use the relevant exchange or licensed official distributor; store each instrument's verified coverage start. |

## Current codebase gap
- TWSE stock history currently fetches only a short recent window from the public STOCK_DAY endpoint; it is not a 1990 backfill.
- TPEx archive fallback returns a limited recent archive slice; it is not a full historical warehouse.
- US history currently uses a non-official Yahoo Finance chart endpoint and requests only a short range; this does not meet the official/licensed-source requirement or 1990 coverage.
- Crypto history is exchange-specific and must be backfilled per symbol from the earliest available listing candle; it cannot be extended to 1990.
- The chart component currently limits visible history to a small number of candles. A longer-history backend and paginated chart query are required.

## Required ingestion design
1. Instrument master: immutable instrument ID, exchange, ticker history, listing/delisting dates, currency, timezone, asset type, corporate-action identifiers.
2. Historical provider adapters: one adapter per approved source/product; credentials remain server-side. Do not treat a URL/key being configured as proof of license or data coverage.
3. Backfill worker: resumable cursor by instrument/time interval, bounded concurrency, rate-limit aware, idempotent upsert, retry with jitter, dead-letter/error ledger.
4. Canonical candle key: instrument_id + interval + candle_start_utc + source/product + adjustment_mode. Preserve raw and adjusted bars separately.
5. Data quality: validate OHLCV, exchange calendar, duplicate/missing sessions, timezone, splits/dividends, symbol changes, delisted securities and out-of-order corrections.
6. Provenance: source ID, product, license status, event/period timestamp, received timestamp, adjustment mode, ingestion run, revision.
7. Backtest safety: point-in-time universe and delisted instruments; never use current constituents for a 1990 universe. Avoid look-ahead and survivorship bias.
8. Analytics: recompute indicators from complete history; incremental updates must be reconciled against full recalculation. Daily history supports long-term indicators, while minute history remains separate.
9. UI: date range and timeframe selector, history coverage start/end, data completeness, source/license tier and last update. Show gaps; never silently truncate.

## Environment gates
The new `server/lib/historical-coverage.js` reports historical coverage as not ready until a provider endpoint and license confirmation flag are present. Even then it returns `verification_required`, not `verified`; a real provider probe and per-instrument coverage audit must pass before enabling signals.

- TWSE: `TWSE_HISTORICAL_PROVIDER_URL`, `TWSE_HISTORICAL_LICENSE_CONFIRMED=true`
- TPEx: `TPEX_HISTORICAL_PROVIDER_URL`, `TPEX_HISTORICAL_LICENSE_CONFIRMED=true`
- US: `US_HISTORICAL_PROVIDER_URL`, `US_HISTORICAL_LICENSE_CONFIRMED=true`
- Crypto: `CRYPTO_HISTORICAL_PROVIDER_URL`, `CRYPTO_HISTORICAL_LICENSE_CONFIRMED=true`
- Other: `OTHER_HISTORICAL_PROVIDER_URL`, `OTHER_HISTORICAL_LICENSE_CONFIRMED=true`

These are gates for future adapters, not currently supported endpoint contracts. Do not add placeholder URLs or set confirmation flags without an executed contract review.

## Acceptance criteria
- Each listed/delisted instrument reports its own earliest verified date.
- TWSE daily data reaches 1990 where source records exist; TPEx and US coverage are reported honestly per instrument.
- Missing days are reconciled against the exchange calendar; non-trading days are not treated as missing.
- Corporate actions and symbol changes are handled; raw and adjusted OHLCV are distinguishable.
- 1990-01-01 to current data can be paged efficiently without loading the entire history into browser memory.
- Backtests include delisted securities and point-in-time constituents.
- No market is labeled 1990-complete until all relevant symbols have coverage reports and gap audits.
