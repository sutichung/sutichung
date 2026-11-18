# Crypto market microstructure

## What is implemented

The existing Node service now exposes a read-only public-market microstructure endpoint:

`GET /api/crypto/microstructure/:symbol?exchange=Binance&type=perpetual&depth=10&whaleUsd=50000`

Supported public REST adapters:
- Binance spot and USDT-margined perpetual order book and recent trades.
- Bybit spot and linear order book and recent trades.
- OKX spot and swap order book and recent trades.

The response includes best bid/ask, spread percentage, summed visible depth, order-book imbalance (OBI), a recent trade tape, large-trade count, and aggressive buy/sell notional totals. Defaults are 10 levels and USD 50,000 per trade; depth is capped at 50 and the whale threshold is bounded server-side.

## Data and interpretation safeguards

- This endpoint uses public REST snapshots, not a persistent WebSocket stream. UI polling frequency is not exchange event frequency.
- Missing exchange timestamps remain null. Server receive time is shown separately.
- OBI measures visible resting quantity only. It can change due to cancellations, hidden liquidity, spoofing, and exchange-specific quantity units; it is not proof of intent.
- Large-trade notional is estimated as price × amount when the provider does not return quote cost. For derivatives, amount units can be contracts, so notional interpretation is exchange-specific; do not compare raw amounts across venues.
- Recent trade side is the aggressor side only where the upstream API exposes enough information to infer it.
- Unsupported symbols, unavailable providers, empty books, and invalid/crossed books fail closed rather than manufacturing a signal.
- The endpoint is read-only and cannot place, cancel, or amend orders.

## Not included in this release

The supplied Python sample uses CCXT Pro and private account streams. Those are intentionally not enabled in the production web process: CCXT Pro availability/licensing, exchange-specific market symbols, authenticated account permissions, secret management, persistent event storage, and an independently deployed worker must be validated first. Private API keys are not required for this public endpoint. Do not grant withdrawal or transfer permissions to any future market-data credential.

## Verification

Unit tests cover order-book spread/OBI, invalid books, missing timestamps, trade filtering, and whale threshold classification. Production provider connectivity and live symbol coverage still require deployment smoke tests against each upstream exchange.


## Additional order-flow diagnostics

The normalized order book now also exposes weighted OBI (near-touch levels receive higher weight), best-level sizes, microprice and microprice deviation in basis points, plus 5/10/20-level depth bands. The trade tape exposes known-side trade count, aggressive buy notional share, and normalized trade imbalance where quote notional is comparable. These are descriptive microstructure features, not standalone entry signals. A large displayed bid can be cancelled; trade-side inference and notional remain venue-specific. OKX perpetual contract notional remains unclassified when contract-value conversion is not verified. The endpoint remains public REST polling; no private keys, account streams, or order execution are enabled.
