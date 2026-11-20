# Ant Colony payment gateway

## Scope
This first data and validation layer is BSC Testnet only (chain ID 97). It preserves the fixed 200,000 ANT supply, 18 decimals, no minting, and the existing sale contract's 5% gross-USDT fee split. The sale contract sends the fee to the fee Safe, net proceeds to the treasury Safe, and transfers ANT atomically from its inventory to the buyer.

## Required lifecycle
1. Supabase Auth member session; prove wallet ownership with a one-time nonce, domain, chain ID 97, expiry and signature verification. Consume nonce once.
2. Backend creates a short-lived quote/order from the deployed sale contract. Store integer raw units, expiry, minimum ANT output, oracle price and verified contract addresses.
3. Buyer approves only the exact USDT amount and calls buy(grossUsdt,minAntOut) from their own wallet.
4. A backend worker independently reads receipts from two BSC RPC endpoints. Verify chain, successful receipt, sale contract, AntPurchased event, buyer, amounts, token configuration and log index.
5. Compare receipt block hash with canonical block; wait for configured confirmations. On reorg, mark reorged and never credit.
6. Insert event with unique chain/tx/log key; retries must be idempotent. Only a verified confirmed event can mark an order delivered. Do not send a second ANT transfer: sale contract already delivers atomically.
7. Reconcile gross = fee + net, chain events = ledger, ANT delivery = event totals, Safe balances and remaining sale inventory. Mismatch => manual review.

## Security
- Never request/store seed phrases or private keys. Wallet signing remains client-side.
- Separate 2-of-3 Safe fee and treasury wallets. Deployer EOA is separate and low-balance.
- Supabase service-role key only in Render secrets, never frontend or Git.
- Rate-limit nonce, quote, order and status endpoints; validate input and request sizes.
- Require MFA, short admin sessions, least-privilege roles and append-only audit facts. No self-assigned admin; support cannot change roles or treasury.
- Immutable sale recipients/configuration; changes require reviewed redeployment.
- Mainnet requires a manipulation-resistant ANT/USDT TWAP with liquidity, observation window, stale/future/zero checks and circuit breakers. No spot-price oracle or fabricated fallback.
- Stop on RPC disagreement, stale oracle, insufficient inventory, reorg or reconciliation mismatch.
- Monitor RPC lag, duplicate events, failed receipts, reorgs, low inventory and unusual purchases.
- Current sale contract has no owner pause switch; do not imply an on-chain emergency pause exists.

## Data and code
Migration 202611200002_ant_payment_gateway.sql adds orders, canonical chain events, append-only raw-unit ledger and audit log. RLS permits members to read only their own records; browser clients have no write grants. Backend service-role writes are required.
server/lib/ant-payment.js adds exact BigInt 5% split, event-shape checks, idempotency key, confirmation-depth and order-state helpers. This is not yet a live payment API or chain indexer: trusted receipt acquisition, signature verification, canonical block checks, authenticated HTTP routes and background worker remain required before accepting real payments.

## Tests
node --test server/test/ant-payment.test.js
npm run compile:token
npm run test:token
npm run test:server
npm run build

The migration must be applied to Supabase. No contract deployment, migration application, mainnet payment, production oracle, live RPC indexer or live payment API is enabled by this commit.

## Mainnet blockers
Independent contract audit; verified official BSC USDT contract and decimals; production TWAP; RPC redundancy/reorg worker; two 2-of-3 Safe wallets; RLS tests for all roles; end-to-end testnet payment and daily reconciliation; jurisdiction-specific legal, tax, consumer disclosure, sanctions and AML/KYC review. Never reuse testnet addresses on mainnet.
