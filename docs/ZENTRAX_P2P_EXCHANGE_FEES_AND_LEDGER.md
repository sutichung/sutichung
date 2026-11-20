# ZENTRAX Peer-to-Peer Prediction Exchange — Trading & Treasury Specification

Status: design specification only; not yet implemented or deployed.

## 1. Product model

Members trade YES and NO outcome shares with one another through a central limit order book (CLOB). ZENTRAX operates the matching engine and ledger; it is not the counterparty and does not take the opposite side of member trades.

Initial markets: BTC/USDT, ETH/USDT and BNB/USDT price-at-expiry questions. Each market must publish its exact question, strike, comparator, UTC expiry, resolution source, observation window, outage/dispute rules, tick size, lot size and fee schedule before opening.

YES/NO shares are quoted in USDT, normally 0.01–0.99. Limit orders match when best bid >= best ask, using price priority then FIFO time priority. Each match creates one immutable execution and two member-side accounting legs.

## 2. Fees: 5% buyer + 5% seller on every execution

The fee is 500 basis points for the buyer and 500 basis points for the seller, independently, calculated on each execution's quote notional. Applies to every buy and sell fill, including partial fills. No fee on placement, cancellation or unfilled quantity.

For each fill:
- notional = execution_price × filled_quantity;
- buyer_fee = floor(notional × 500 / 10,000) in USDT base units;
- seller_fee = floor(notional × 500 / 10,000) in USDT base units;
- buyer_debit = notional + buyer_fee;
- seller_credit = notional − seller_fee;
- platform_fee_revenue = buyer_fee + seller_fee.

Use integer USDT base units only, never floating-point arithmetic. The rounding rule and minimum notional must be explicit and consistent.

Example: 100 USDT notional => buyer pays 105 USDT; seller receives 95 USDT; platform records 10 USDT gross fee revenue. The 100 USDT principal moves from buyer to seller; the two 5 USDT fees are platform revenue.

Fee configuration is versioned and snapshotted on each execution. Rate changes apply only to future executions, require SUPER_ADMIN + MFA AAL2, reason, approval and audit record. No retroactive fee changes.

## 3. Order lifecycle and matching

MVP order types: limit buy YES/NO and limit sell YES/NO. Start with GTC and IOC only after tests; no market orders in first release.

Validate authentication, account eligibility, OPEN market state, cutoff, price/quantity tick and lot rules, unique idempotency key, risk limits and self-trade prevention. Same beneficial account must never match against itself.

Reservation:
- Buy limit: reserve limit_price × open_quantity plus maximum 5% buyer fee on that reserved notional.
- Sell limit: reserve the exact outcome-share quantity; reserved shares cannot be reused or withdrawn.
- On partial fill, atomically release excess reservation from price improvement and reduced open quantity.
- On cancel/expiry, release all remaining reservation.

A fill, both counterparties' balance/share changes, both fees, execution record and order remainder updates must commit in one serializable database transaction. Any failed leg rolls back the whole fill. Use deterministic FIFO sequence numbers, row locks in documented order, unique execution IDs and idempotent commands.

## 4. USDT double-entry ledger

Use immutable double-entry journal entries. A mutable balance field must never be the source of truth.

Member buckets: available, reserved_for_bids, and optionally compliance_locked. Platform buckets: market_escrow, buyer_fee_revenue, seller_fee_revenue, settlement_payable and reconciliation_suspense.

Every journal transaction must balance to zero across debit/credit lines, be idempotent, and record asset/network, actor, timestamp, market, order, execution, fee version and correlation ID.

Deposits and withdrawals are disabled in the first release. Before enabling real USDT, define supported chain(s), official token contract allowlist, confirmations, address screening, AML/sanctions checks, custody, multisig approvals, withdrawal limits, reconciliation and incident response. Never accept arbitrary tokens or trust a token symbol. Never store private keys in the app database or repository.

## 5. Share issuance, collateral and settlement

A real-money binary market needs fully specified collateral. Preferred fully collateralized model:
- Lock 1 USDT to mint one complete set: 1 YES + 1 NO share.
- Burn one YES + one NO share together to release 1 USDT.
- Trades transfer shares between member accounts; no unbacked shares.
- At resolution, each winning share redeems for 1 USDT and each losing share for 0.
- Locked collateral must cover all winning redemptions. Reconcile outstanding shares and collateral before payout.
- Settlement is idempotent. Disputed/unavailable evidence pauses settlement; never guess a price or allow one admin to overwrite a result.

The earlier virtual-credit pool prototype does not implement this CLOB or collateral model.

## 6. Administration console

Least-privilege roles with MFA AAL2:
- SUPER_ADMIN: roles and emergency controls; cannot edit immutable executions or journals.
- MARKET_MANAGER: draft/publish/pause/close markets; high-impact changes need dual approval.
- RISK_COMPLIANCE: restrictions, limits, case review; no treasury withdrawal.
- FINANCE: ledger, fee and reconciliation reports; cannot alter markets or fee rules.
- SUPPORT: read-only member/order lookup with sensitive fields masked.
- AUDITOR: read-only append-only audit trail and financial reports.

Console modules:
1. Live market/order-book monitor: depth, spread, exposure, cutoff.
2. Orders/executions: partial fills and cancellation reasons; no editing/deletion.
3. Member accounts: eligibility, limits, restrictions, balance buckets, MFA state.
4. Fee settings: buyer 5% + seller 5%, version history, approvals and effective time.
5. USDT ledger: journal drill-down, reconciliation; deposits/withdrawals disabled until approved.
6. Resolution: source evidence, timestamp, price, resolver logs and dispute status.
7. Risk controls: account/market limits, self-trade prevention, rate limits and pause switch.
8. Audit/compliance: immutable admin actions, exports, alerts and incident log.

Emergency pause stops new orders and matching but cannot confiscate funds or rewrite settled executions. Open orders must be frozen or cancelled under a published deterministic policy, with reservations accounted for.

## 7. Reporting and surveillance

Track gross matched notional, buyer fee revenue, seller fee revenue, total gross fees, execution count, average fee, active markets, depth, spread, concentration, collateral, liabilities, reserved balances, reconciliation differences, settlement latency and disputes.

Distinguish gross fee revenue from costs, refunds, taxes and net profit. Detect and prohibit wash trading, self-dealing, collusion and artificial volume. Never fabricate volume or users.

## 8. Data model and API outline

Core tables: prediction_markets, prediction_orders, prediction_executions, prediction_positions, usdt_accounts, usdt_journals, usdt_journal_lines, fee_schedule_versions, market_collateral, market_resolution_evidence, admin_audit_log, compliance_cases and account_limits.

Critical constraints: unique (account_id, idempotency_key), unique execution_id, integer USDT base units, nonnegative available/reserved balances, immutable execution/journal/audit records, DB transaction boundary per fill, RLS and server-only privileged ledger operations.

Suggested endpoints:
- GET /api/prediction/markets/:id/orderbook
- POST /api/prediction/orders
- DELETE /api/prediction/orders/:id
- GET /api/prediction/orders and /api/prediction/executions
- GET /api/prediction/account/ledger
- GET /api/admin/prediction/fees
- POST /api/admin/prediction/fees (MFA + approval + audit)
- GET /api/admin/prediction/reconciliation

## 9. Phased delivery and release gates

Phase A: simulation CLOB and double-entry ledger using non-redeemable test credits; test both-side fees, partial fills, cancellations, concurrency, idempotency, settlement and admin audit.

Phase B: testnet contracts/test tokens only; verify escrow and share-collateral invariants, event indexing and chain-to-ledger reconciliation. No real USDT.

Phase C: real-value readiness requires independent smart-contract and matching-engine audits, jurisdiction-specific legal opinions, KYC/AML/sanctions program, custody and incident response, oracle/dispute governance, penetration test, proof of reserves/liabilities and explicit release approval.

Taiwan access and real-money deposits/trading remain disabled until qualified counsel confirms product classification and all required registrations/permissions. Technical implementation is not legal authorization. No Binance listing, Wallet integration or provider acceptance is implied.
