# Persistent signal journal

This feature adds a database-backed signal journal foundation; it is intentionally not an automatic trading system.

## Components
- `server/lib/signal-journal.js`: validates source-stamped signals, derives deterministic idempotency keys, records them through a PostgreSQL RPC, lists pending signals, settles only after the selected horizon using a later observed price, and builds daily/regime reviews.
- `supabase/migrations/202611190001_market_signal_journal.sql`: creates private service-role-only tables and an atomic PostgreSQL function for deduplication, cooldown and daily trigger caps.
- `server/test/signal-journal.test.js`: deterministic tests; no market data is simulated.

## Activation sequence
1. Apply the migration in the intended Supabase project's SQL Editor.
2. Run the backend test suite and deploy the code.
3. Integrate the recorder with verified official/licensed market-data adapters. The caller must pass the provider's actual observation timestamp and source.
4. Integrate the settlement worker with the same instrument/timeframe history service. Do not settle with random values, stale candles, incomplete bars, or a price observed before the configured horizon.
5. Run paper-only monitoring and compare net results after fees/slippage before any separate human-approved production decision.

The migration is not automatically applied by Render. Until it is applied and a real provider adapter is connected, this module is dormant and no new signal journal data is being collected. Existing autonomous-learning promotion remains paper-candidate-only; no live orders are enabled.
