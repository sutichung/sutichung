# ZENTRAX Crypto Prediction Market — Phase 1

## Scope and release gate

Phase 1 is an **off-chain, virtual-credit-only simulation**. It does not accept USDT, ANT, BNB, wallet deposits, withdrawals, leverage, or real-money wagers. Virtual credits have no cash value and cannot be transferred or redeemed.

The first market types are:
- BTC/USDT, ETH/USDT and BNB/USDT spot-price events.
- A market asks whether the Binance Spot 1-minute candle close at a published UTC minute will be at/above (YES) or below (NO) a published strike.
- The market creator captures and stores the Binance Spot reference ticker and timestamp when publishing.
- The exact 1-minute candle whose open time equals `close_at` is the resolution evidence. A market is not resolved until that candle is available. No fallback or guessed price is allowed.
- YES/NO indicative prices are driven by the virtual-credit pools, start at 50/50, and are bounded to 5%–95%. They are community pool indications, not calibrated probabilities or exchange prices.
- Winning virtual positions split the virtual stakes pool pro rata. There is no guaranteed payout, no real asset and no cash value.

## Implemented routes

- `GET /api/prediction/status`: reports virtual-only mode.
- `GET /api/prediction/markets`: published markets and pool-derived indicative prices.
- `GET /api/prediction/account`: requires a signed-in Supabase user; creates a 10,000-credit paper account once and returns positions/history.
- `POST /api/prediction/orders`: requires login; atomic database RPC, 1–1,000 virtual credits per order, UUID idempotency key.
- `POST /api/prediction/admin/markets`: requires `SUPER_ADMIN` plus Supabase MFA assurance level AAL2; only BTC/ETH/BNB USDT spot pairs; expiry 1 hour–30 days; UTC minute boundary.
- `POST /api/prediction/jobs/resolve-due`: requires the `x-prediction-job-token` header and resolves only when the exact Binance 1-minute candle is available.

## Database and admin setup

1. Review and apply `supabase/migrations/202611240001_zentrax_prediction_market.sql` to the intended Supabase project. It is not applied automatically by a Git commit.
2. Confirm the existing `ant_admin_roles` table is present from the ANT platform migration.
3. The server also recognizes the exact `SUPABASE_ADMIN_EMAIL` allowlist already used by the platform. Otherwise, assign `SUPER_ADMIN` to the correct authenticated user using the Supabase SQL editor. Do not guess the user ID or email:

```sql
-- Replace with the exact auth.users.id of the intended administrator.
insert into public.ant_admin_roles(user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'SUPER_ADMIN')
on conflict (user_id, role) do nothing;
```

4. Enable Supabase MFA for that account and sign in with an AAL2 token before creating markets.
5. Set Render environment variable `ZENTRAX_PREDICTION_JOB_TOKEN` to a long random secret. Never commit the token.

## Resolver scheduling

The resolver endpoint is designed for a scheduler. A GitHub Actions schedule is best-effort and runs no more frequently than every five minutes; it is not a guaranteed real-time settlement service. Configure repository variable `ZENTRAX_PREDICTION_API_URL` and repository secret `ZENTRAX_PREDICTION_JOB_TOKEN` before enabling the scheduled workflow. A missed run leaves markets pending rather than inventing a result.

## Security and operational limits

- Service-role credentials stay server-side; browser direct table access is revoked and RLS is enabled.
- Order creation and balance debiting are performed in one PostgreSQL function transaction; client order UUIDs prevent duplicate retries.
- Market settlement is idempotent by locking and transitioning the market from open to resolved in one database transaction.
- Binance Spot public API is a centralized reference source for this prototype. It is not an independent decentralized oracle, can be unavailable or regionally restricted, and is not suitable by itself for a real-money derivatives product.
- Production requires jurisdiction-specific legal advice, independent oracle design (e.g. audited multi-source/TWAP design), smart-contract and economic security audits, dispute process, monitoring, privacy review and explicit release approval.
- Taiwan access to real-money prediction markets is not enabled by this code. Do not add deposits, withdrawals, USDT settlement, ANT staking or cash-equivalent rewards without a documented legal approval.
- Binance integration or listing is not implied by this implementation. Binance's current Wallet Prediction product aggregates third-party providers and has separate API eligibility and regional restrictions.

## Verification

Run:
- `node --check server/lib/prediction-market.js`
- `node --check server/lib/prediction-api.js`
- `node --test server/test/prediction-market.test.js`
- `npm run test:server`
- `npm run build`

A green CI run does not prove the migration is applied, the administrator is configured, the resolver secret is set, or any market is live.
