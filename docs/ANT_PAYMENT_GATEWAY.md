# ZENTRAX / ANT Testnet Payment Gateway

## Current scope

The gateway is deliberately restricted to BNB Smart Chain Testnet (chain ID 97). The ANT token has a fixed 200,000 supply, 18 decimals, and no mint function. The sale contract charges an immutable 500 bps (5%) of gross USDT, routes the fee and net proceeds to separate immutable recipient wallets, and atomically transfers ANT from sale inventory to the buyer. Any failed transfer reverts the entire purchase.

**The testnet UI, wallet API and indexer are code-complete in this branch, but the service is not live until the migrations, environment variables and contracts are configured.** The existing Render web service deploys `main`, not this branch. Do not describe this as a live payment service.

## Implemented application flow

1. Member authenticates through Supabase Auth.
2. `POST /api/ant/wallet/nonce` creates a single-use, five-minute challenge bound to the configured domain, member, wallet and chain ID 97.
3. Browser wallet signs the challenge locally. `POST /api/ant/wallet/verify` recovers the signer, consumes the nonce once, and binds the wallet to the authenticated member. The server never receives a seed phrase or private key.
4. `POST /api/ant/orders` verifies the wallet link, reads the deployed sale contract's immutable USDT, ANT, fee and treasury addresses, and obtains the quote from the on-chain oracle. It stores raw integer units and a five-minute expiry.
5. Browser wallet approves only the quoted USDT amount and calls `buy(grossUsdt,minAntOut)`. The API never signs or submits the buyer's transaction.
6. `POST /api/ant/orders/:id/submit` checks the transaction sender, target and decoded calldata before attaching the transaction hash to the order.
7. The indexer checks two independent RPCs, chain ID, matching logs, successful receipts, canonical block hashes, exact 5% fee split, and all three ERC-20 Transfer logs (USDT fee, USDT proceeds, ANT delivery). It waits for 12 confirmations by default.
8. The worker writes idempotent chain events and four ledger entries (gross USDT, fee, net proceeds, ANT delivery), then marks the order delivered. If an event arrives before its order, the worker retains it unlinked and retries reconciliation. Any amount mismatch enters manual review.

The React gateway is `src/AntPayments.jsx`, mounted from the main app navigation. The admin finance endpoint is `GET /api/ant/admin/finance`; it is restricted to `SUPER_ADMIN` or `FINANCE_VIEWER` rows in `ant_admin_roles`. No browser-side role assignment is exposed.

## Supabase migrations

Apply migrations in timestamp order to the intended **test** Supabase project:

1. `supabase/migrations/202611200002_ant_payment_gateway.sql`
2. `supabase/migrations/202611210001_ant_platform_ledger.sql`
3. `supabase/migrations/202611220001_ant_indexer_state.sql`
4. `supabase/migrations/202611230001_ant_order_submission_and_ledger_totals.sql`

The earlier global-finance and market-journal migrations may already be part of the existing project; check migration history before applying. Do not apply blindly to production. The new tables use RLS and deny client writes; only the server/service role can ingest orders, chain events, ledgers and checkpoints. After applying, test member A, member B, support, finance viewer and super admin with separate identities. Seed the initial super-admin role through `supabase/manual/seed-ant-super-admin.example.sql` after replacing the owner email and verifying the project ref; do not expose a public bootstrap endpoint.

**No Supabase connector is currently available to this execution, so the SQL files have not been applied and RLS has not been runtime-tested.**

## Required backend configuration

Set these as server-side secrets/environment variables only; never commit values:

- Existing: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Wallet challenge: `ANT_WALLET_DOMAIN` (hostname only, e.g. your actual app domain)
- Chain: `BSC_TESTNET_RPC_URL`, `BSC_TESTNET_RPC_URL_SECONDARY`
- Contracts: `ANT_SALE_CONTRACT`, `ANT_USDT_CONTRACT`, `ANT_TOKEN_CONTRACT`, `ANT_ORACLE_CONTRACT`
- Recipients: `ANT_FEE_WALLET`, `ANT_TREASURY_WALLET`
- Decimals and safety: `ANT_USDT_DECIMALS` (must match the token's on-chain decimals), `ANT_MAX_ORACLE_AGE`, `ANT_INDEXER_START_BLOCK`
- Deployment signer, only when deploying testnet contracts: `DEPLOYER_PRIVATE_KEY` (store only in a secret manager; never in chat or GitHub source)

The API verifies the sale contract's immutable USDT, ANT, fee and treasury addresses before issuing a quote. The indexer repeats the same configuration check on both RPCs before processing logs.

## Indexer options and hosting cost

- `server/jobs/ant-chain-indexer.js` is a long-running dual-RPC worker. `deploy/render-ant-indexer.blueprint.yaml` defines a separate Render worker, but the Render plan could not be created because the workspace requires billing information for the Starter worker. No paid resource was approved or created.
- `.github/workflows/ant-indexer.yml` provides a no-cost scheduled fallback every five minutes and can also be manually dispatched. It is **not real-time** and GitHub scheduled runs are best-effort. Add the required GitHub Actions secrets listed in the workflow and set repository variable `ANT_INDEXER_ENABLED=true` before scheduled runs are enabled. Until then, scheduled runs remain gated; manual dispatch is available for configuration testing.
- The worker checkpoint is stored in `ant_indexer_state`; first start requires the actual sale deployment block. Do not guess this block.

## Testnet deployment and validation

- `npm run compile:token`
- `npm run test:token`
- `npm run test:server`
- `npm run build`
- `npm run deploy:ant:e2e:testnet` deploys a self-contained test suite using a freely mintable `tUSDT` mock and an ownerless test oracle. It spends test BNB for gas only. **tUSDT is not USDT, has no real value, and must never be advertised as a stablecoin.**
- `npm run deploy:sale:testnet` deploys the sale contract against explicitly configured testnet token/oracle addresses and checks immutable recipients. It requires verified testnet addresses and a fresh nonzero oracle.

The E2E suite requires a funded testnet deployer plus distinct `ANT_FEE_WALLET` and `ANT_TREASURY_WALLET` recipient addresses. It prints the test token, ANT, oracle and sale addresses and verifies 100 tUSDT gross = 5 fee + 95 proceeds and 95 ANT delivered.

## Important deployment blockers

- No ANT token or sale contract has been deployed from this branch yet.
- No verified testnet USDT, sale address, oracle address, recipient wallets, deployer signer or Supabase project credentials were supplied/configured in the connected deployment.
- Supabase migrations and RLS role tests remain unapplied.
- The GitHub Actions scheduled worker has no secrets configured yet.
- The Render worker plan is blocked by billing information; no paid service was created.
- The existing Render web service still runs `main`; ANT changes are on PR #39 and have not been merged or deployed.
- The included mock oracle and freely mintable mock USDT are test-only. A public mock setter is not a production price feed.
- The current sale contract has no owner pause switch, no owner withdrawal and immutable recipients. A wrong address cannot be repaired by an admin.
- Mainnet remains disabled until an independent contract audit, manipulation-resistant ANT/USDT TWAP with sufficient liquidity, official BSC USDT address/decimals verification, independent RPC and reorg tests, two 2-of-3 Safe wallets, legal/tax/AML/KYC and consumer-disclosure review, and a separate explicit release approval.

Never request or store wallet seed phrases or private keys. Never use testnet contract addresses or mock assets on mainnet.
