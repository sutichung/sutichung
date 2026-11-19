# Autonomous research and strategy learning

## Learning loop
1. Collect official/licensed market data with source, timestamp, adjustment and coverage metadata.
2. Validate OHLCV, trading calendar, corporate actions, symbol history, gaps and duplicate revisions.
3. Build features separately by asset class, exchange, instrument and timeframe.
4. Generate candidate strategies/parameters in research only.
5. Run chronological walk-forward validation with a final untouched out-of-sample segment; include fees, spread, slippage, taxes, funding and borrow costs where applicable.
6. Compare challengers to a versioned champion. Reject unstable or underperforming candidates.
7. Eligible challengers become paper-trading candidates only. Production/live deployment requires a separate explicit human approval and risk review.
8. Monitor realized outcomes by horizon and regime; detect drift, pause stale strategies and roll back to last approved champion.

## Current implementation
`server/lib/autonomous-learning.js` provides a deterministic walk-forward promotion gate. It requires at least three explicitly leakage-free folds, minimum out-of-sample trade count, positive median net return, profit-factor and Sharpe thresholds, drawdown limits, fold consistency and optional improvement over the champion. It can return only `paper_candidate`, never live promotion.

Tests: `server/test/autonomous-learning.test.js`.

## Critical safeguards
- No future leakage: signal on completed bar, execution no earlier than next tradable bar.
- Split data chronologically; fit normalization/feature selection only on training folds.
- Include delisted securities and point-in-time constituents to reduce survivorship bias.
- Keep raw and adjusted OHLCV separate; account for splits, dividends and ticker changes.
- No synthetic candles to fill pre-listing periods or market closures.
- A provider URL or API key does not prove license, completeness or freshness.
- Store immutable experiment config, code/version hash, data snapshot IDs and metrics for reproducibility.
- Never let AI-generated commentary override deterministic risk limits or execute orders.
- A model update must be reproducible, reversible and independently monitored.
