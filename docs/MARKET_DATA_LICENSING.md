# Market data licensing gates

## OKX

OKX's API Agreement (Sections 9.3–9.4, last updated 28 July 2026) limits market data to personal, non-commercial use and prohibits third-party display, redistribution, commercial analytics/aggregators and commercial AI training without prior written consent. These restrictions apply to unauthenticated public endpoints as well as authenticated APIs.

This application serves member-facing features. Therefore OKX feeds are disabled by default for market lists, candles, derivatives, order books, trade tape, provider diagnostics and risk fallbacks.

Only after the operator has obtained and reviewed written permission covering this specific SaaS, downstream display/redistribution, storage, analytics and AI use may the Render environment variable be set:

`OKX_MARKET_DATA_LICENSE_CONFIRMED=true`

This flag is an operator attestation, not proof of a license. Keep the written agreement and permitted scope on file. Do not set the flag merely because public endpoints respond.

Without permission:
- OKX provider diagnostics report `not_configured`.
- OKX is excluded from customer-facing market data and fallback paths.
- Risk analysis must report unavailable licensed order-book/trade-tape coverage rather than silently using OKX.
- Other sources remain subject to their own terms and commercial redistribution rights.

## Other providers

A successful public endpoint probe confirms technical reachability only. It does not grant redistribution rights. Before serving market data to members, obtain written confirmation of each provider's display, redistribution, historical storage, derived analytics and AI/ML permissions.
