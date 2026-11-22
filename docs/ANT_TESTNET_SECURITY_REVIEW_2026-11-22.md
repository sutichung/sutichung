# ANT Testnet Security Review — 2026-11-22

**Status: TESTNET ENGINEERING ONLY — NOT APPROVED FOR PUBLIC SALE OR MAINNET**

This review records source-level changes made on `ant-token-testnet`. It is not an independent audit, legal opinion, deployment confirmation, or guarantee of safety. No mainnet deployment, sale activation, wallet transaction, or collection of real funds was performed.

## Changes committed

- Reject externally owned accounts as the USDT, ANT, or oracle dependency at sale-contract construction time.
- Reject fee/proceeds recipients that collide with the USDT, ANT, or oracle dependency; fee and proceeds recipients must remain distinct.
- Add an on-chain quote deadline to `buy(grossUsdt,minAntOut,deadline)`. The sale contract rejects a transaction after the deadline, rather than relying only on an API-side expiry.
- Bind the order API's transaction decoder to the exact deadline stored with the order, and pass that deadline from the payment UI.
- Enforce a minimum 99% of quoted ANT output in the API so callers cannot weaken the default 1% slippage protection by supplying an arbitrarily low minimum.
- Reject purchases whose 5% fee rounds down to zero, preventing direct on-chain callers from bypassing the configured fee with dust-sized purchases.
- Remove a duplicate, unreachable GET order-history route.
- Add adversarial tests for EOA dependencies, recipient/dependency collisions, expired on-chain quotes, fee rounding, and slippage-floor enforcement.

## CI evidence

- Commit `e59eb765be1279a7e2530dbcb1090b60208750e8`: ANT token CI completed successfully; 21 Solidity files compiled and 20 tests passed after the dependency-address validation changes.
- Subsequent commits add the on-chain deadline, API/UI integration, fee-rounding protection, and API slippage floor. Their latest CI result must be checked against the current branch head before claiming the complete revision is green.
- Earlier testnet deployment attempt failed because the deployer had zero tBNB. This is a test-gas limitation, not evidence that a deployment occurred.

## Remaining release blockers

1. **No production oracle.** The included oracle is a freely configurable test mock. Production needs an independently reviewed, manipulation-resistant source (for example, a sufficiently liquid TWAP with minimum liquidity/observation coverage, freshness checks, deviation circuit breakers, and a fail-closed policy).
2. **No official production stablecoin verification.** Verify the exact official BSC USDT contract address and decimals from authoritative sources at deployment time. A token name or ticker is not proof.
3. **No independent smart-contract audit.** Review the exact source commit, compiler settings, deployed bytecode, and all findings before any public sale.
4. **Primary-sale mechanics are incomplete.** The current sale contract has no sale start/end window, hard cap, per-wallet limit, allowlist, cancellation process, or refund escrow. Decide and publish the terms before implementation; do not imply these controls exist.
5. **Immutable destination risk.** Fee and proceeds recipients cannot be changed, and there is no owner pause or inventory recovery function. A wrong destination or broken production configuration cannot be repaired in place. Confirm all addresses and assess a reviewed emergency design before deployment.
6. **Safe and treasury evidence.** Independently verify both 2-of-3 Safe contracts, owner identities, signer independence, and wallet purpose. Do not rely only on environment-variable strings.
7. **Legal and compliance review.** Obtain jurisdiction-specific advice for issuer/operating locations and every target market, covering token classification, public offering/marketing, AML/KYC, sanctions, consumer disclosures, tax, licensing, and restrictions.
8. **Operational readiness.** Apply migrations only to the intended test environment, test RLS and member roles, verify dual-RPC indexer/reorg behavior, reconcile event and transfer logs, and test incident procedures.
9. **No deployment evidence.** No ANT token or sale contract has been verified as deployed on BSC Testnet from this branch. No mainnet contract is configured or deployed.

## Release rule

Do not accept real USDT, open public subscriptions, promise returns, or claim an exchange listing until all release blockers are resolved, the exact production release is independently reviewed, and the owner explicitly approves the release. Keep all test assets clearly labeled; mock tUSDT and tBNB are not money or revenue.

## Source branch

`ant-token-testnet`

