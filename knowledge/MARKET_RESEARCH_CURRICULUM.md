# Taiwan Stock Hunter — Market Research & Quant Validation Curriculum

Purpose: reproducible research for Taiwan equities, US equities and crypto, with source-specific rules. Research and paper-trading only; live execution remains disabled unless separately authorized and fully audited.

## 1. Source hierarchy and market-data rules

### Taiwan equities
Prefer exchange, regulator and issuer primary sources:
- TWSE OpenAPI: https://openapi.twse.com.tw/
- TPEx OpenAPI: https://www.tpex.org.tw/openapi/
- TAIFEX OpenAPI: https://openapi.taifex.com.tw/
- MOPS: https://mops.twse.com.tw/
- FSC: https://www.fsc.gov.tw/

Use official exchange/issuer data for quotes, trading status, corporate actions and filings wherever available. Label daily close, delayed and intraday data distinctly. Never relabel end-of-day data as real-time. If a paid/authorized feed is required, report that requirement rather than substituting an unofficial feed while calling it official.

### US equities
- SEC EDGAR: https://www.sec.gov/edgar
- Nasdaq Trader: https://www.nasdaqtrader.com/
- NYSE: https://www.nyse.com/
- FINRA: https://www.finra.org/
- Cboe: https://www.cboe.com/

Distinguish consolidated real-time, delayed, exchange-specific and derived data. Unofficial chart endpoints may be used only when clearly labeled non-official and not represented as exchange-authoritative.

### Crypto
Use exchange-native documentation and market feeds; record venue and contract type. Never blend spot, linear perpetual and inverse perpetual observations without explicit normalization.

## 2. Knowledge tracks
- Market mechanics: trading sessions, tick/lot sizes, board lots, auction rules, price limits, halts, settlement, corporate actions.
- Financial statements: revenue, margins, cash flow, leverage, working capital, earnings quality, accounting notes and filing dates.
- Valuation: PER/PBR/EV metrics and dividend yield with as-of dates and sector context.
- Technical research: trend, momentum, volatility, breadth, volume, support/resistance and regime filters.
- Flows: foreign/investment-trust/dealer activity, margin/short balances and futures positioning; respect actual publication time and data granularity.
- Macro: rates, FX, inflation, central-bank releases and event calendars from primary sources.
- Risk: position sizing, concentration, correlation, liquidity, gap risk and drawdown.

## 3. Every factor must carry provenance
Store source, canonical URL or dataset identifier, retrieval time UTC, source as-of time, symbol, market, interval, unit, currency, data mode, freshness, transformation and missing-field reason. Preserve raw snapshots and version all derived features.

Reject stale data, impossible OHLC values, unadjusted split/dividend discontinuities, mismatched currencies, duplicate bars and insufficient history. Missing data is null/unknown, never zero or a guessed estimate.

## 4. Strategy practice
For each hypothesis:
1. State the economic/market rationale and falsifiable trigger before tuning.
2. Use chronological train/validation/test splits; no random shuffling.
3. Include fees, taxes, spread, slippage, borrow costs and funding where applicable.
4. Adjust corporate actions and delisted/survivorship effects.
5. Compare against cash, buy-and-hold and a simple baseline.
6. Run walk-forward tests, parameter sensitivity and regime breakdowns.
7. Keep a complete trade ledger, including rejected signals and losing outcomes.

Report sample count, data coverage, net return, expectancy, win rate, profit factor, max drawdown, volatility, turnover, exposure and confidence intervals. Report Taiwan/US/crypto separately. A score is not a probability. Require at least 100 out-of-sample completed trades and multiple regimes before promotion; small samples remain exploratory.

## 5. Daily learning
During market hours, refresh only at the cadence supported by the source. On every refresh validate timestamps, exchange calendar, trading status and data completeness. At close, save a source-stamped snapshot. After delayed institutional data is actually published, run a separate update rather than pretending it was available at the close. Review forecast misses and data failures, retain immutable history, and publish a versioned research report.

## 6. Promotion and safety
No strategy is promoted without reproducible code/data hashes, out-of-sample net-of-cost performance, robustness checks, documented failure modes and paper-trading review. Live brokerage execution remains disabled until broker authorization, order/fill reconciliation, audit retention, hard loss limits and emergency stop are independently tested.
