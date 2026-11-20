# Crypto real-time stream, alerts and persistence

## What runs

The API process starts `server/lib/crypto-stream-engine.js` when it listens. A standalone long-running entry point is also available:

```bash
npm run crypto:worker
```

The engine uses the official public WebSocket protocols of Binance, Bybit and OKX, plus official REST fallback requests for ticker, order-book and closed one-minute candle snapshots. Perpetual funding rates are polled separately. It does not depend on the paid CCXT Pro package.

The default market set is BTCUSDT, ETHUSDT and SOLUSDT. Spot is enabled; perpetual streams are enabled unless `CRYPTO_WS_ENABLE_FUTURES=false`.

## Features

- Independent spot/perpetual connections for each licensed provider.
- Exponential reconnect backoff with jitter.
- REST fallback for ticker, top-of-book/depth and closed 1m candles.
- Source timestamps and received timestamps are kept separately; stale/future-dated events are excluded from eligible scoring.
- Rolling momentum, spread, 24h change, closed-candle turnover anomaly, top-20 book imbalance and large-trade observations.
- Funding-rate, mark-price and next-funding-time polling.
- Per-market alert cooldown and optional Telegram delivery.
- Compressed JSONL minute batches in a private Supabase Storage bucket.
- SIGTERM/SIGINT drains pending event batches before exit.
- No order placement; all signals are research/alert outputs.

## Required configuration

Set these only in the Render service environment; never commit credentials:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Storage write credential |
| `BINANCE_MARKET_DATA_LICENSE_CONFIRMED=true` | Confirmed Binance display/redistribution permission |
| `BYBIT_MARKET_DATA_LICENSE_CONFIRMED=true` | Confirmed Bybit display/redistribution permission |
| `OKX_MARKET_DATA_LICENSE_CONFIRMED=true` | Confirmed OKX display/redistribution permission |
| `CRYPTO_WS_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT` | Comma-separated symbols, max 30 |
| `CRYPTO_WS_EXCHANGES=Binance,Bybit,OKX` | Providers to consider |
| `CRYPTO_WS_ENABLE_FUTURES=true` | Enable perpetual market streams |
| `CRYPTO_WS_STALE_MS=30000` | Maximum source/receive age for freshness |
| `CRYPTO_WHALE_THRESHOLD_USD=50000` | Large-trade notional threshold |
| `CRYPTO_ALERT_SCORE=2` | Minimum score for a price/microstructure alert |
| `CRYPTO_ALERT_COOLDOWN_MS=900000` | Per-market alert cooldown |
| `CRYPTO_FUNDING_ALERT_ABS=0.001` | Absolute funding-rate alert threshold (0.1% when set to 0.001) |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram bot token |
| `TELEGRAM_CHAT_ID` | Optional Telegram destination |
| `CRYPTO_STREAM_EMBEDDED=false` | Disable WebSockets in web process when a separate worker is deployed |

A provider is not connected unless its corresponding license confirmation is set to `true`. This is an operator attestation, not legal advice or proof that a specific display, storage or redistribution use is allowed. Confirm the applicable exchange terms and account permissions first. Region restrictions such as HTTP 451 are reported; the service does not evade them.

## Persistence format

The worker creates a private Supabase Storage bucket named `crypto-realtime` on first write. It writes gzip-compressed newline-delimited JSON batches under `ticks/YYYY-MM-DD/HHmm/`. Each event contains provider, market type, symbol, event type, source time and receive time. A `status/latest.json` object is refreshed for operational checks.

This is object storage, not a relational time-series database. Do not query it as if it were SQL. Apply a retention/lifecycle policy in Supabase for the bucket to control storage growth. If Supabase Storage is not configured, live analysis and Telegram alerts can still run, but event persistence is explicitly unavailable; no ephemeral local file is represented as durable storage.

## API checks

- `GET /api/crypto/realtime/status` — local stream status, connection counts, freshness, funding and persistence counters.
- `GET /api/crypto/realtime/quotes` — normalized latest quote set.
- `GET /api/crypto/worker/status` — latest persisted worker heartbeat/status.
- `GET /api/health` — summarizes actual local WebSocket state and storage/Telegram configuration.

## Deployment and uptime constraints

The current production web service is on Render Free, one Oregon instance. The embedded stream is active only while that web process is running; Free-instance sleep/restart behavior means this is not a guarantee of 24/7 collection. The standalone worker command is ready for a dedicated Render Background Worker, but creating that resource requires a paid worker plan and an explicit infrastructure approval. Do not create a paid service or change the user's plan automatically. If a separate worker is deployed, set `CRYPTO_STREAM_EMBEDDED=false` on the web service to avoid duplicate exchange subscriptions.

The current engine does not guarantee tick-by-tick completeness during upstream outages, region restrictions, restarts or rate limits. REST snapshots are fallback observations, not WebSocket-equivalent tick history. No historical gap is silently filled with synthetic data.

## Operational cautions

- Funding rates are periodic snapshots; exchanges may publish different funding intervals and instrument conventions.
- Large-trade notional calculations depend on exchange contract size conventions; treat them as estimates where contract multiplier metadata is not available.
- Order-book imbalance is a shallow-depth indicator, not proof of hidden liquidity or intent.
- Signal thresholds are heuristics and require out-of-sample validation before use in paper trading.
- Telegram delivery requires both variables; tokens must remain server-side.
