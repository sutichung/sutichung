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
- Add immutable sale start/end timestamps, a global gross-USDT hard cap, and a per-wallet gross-USDT cap. The contract updates sold counters atomically and enforces the limits even if the API or UI is bypassed.
- Add API-side checks for sale window and remaining per-wallet allowance; expose cap/sold status to the UI and disable quote creation when the sale is not active or the hard cap is reached.
- Require sale window and cap values as explicit testnet deployment inputs; document that they are immutable and require a new deployment to change.

## CI evidence

Latest verified contract/test commit: `3f778dcad762b0f26512c53e31cc8fc7bb863f02`. The subsequent UI/API code commit `38bf3581b0483f50f9da4aebc38166c11ca49930` also passed frontend and backend CI.

- ANT token CI: **passed**. 21 Solidity files compiled successfully and all 24 contract tests passed, including immutable sale window, global/per-wallet caps, expired-deadline, EOA dependency, recipient collision, zero-fee rounding, and minimum-fee-boundary cases. Run: [45009496194](https://github.com/sutichung/sutichung/actions/runs/45009496194).
- Backend checks: **passed**. Server tests, syntax checks, production build, and dependency checks completed successfully. Run: [45009505240](https://github.com/sutichung/sutichung/actions/runs/45009505240).
- ZENTRAX web CI: **passed**. Production frontend build, Docker image build, and static frontend smoke test completed successfully. Run: [45009505027](https://github.com/sutichung/sutichung/actions/runs/45009505027).
- Dependency audit: 11 low-severity findings across the full dependency tree; the production-runtime audit reported 0 vulnerabilities (0 low/moderate/high/critical). The low-severity development/transitive findings remain recorded and should be reviewed.
- Earlier testnet deployment attempt failed because the deployer had zero tBNB. This is a test-gas limitation, not evidence that a deployment occurred.


## Remaining release blockers

1. **No production oracle.** The included oracle is a freely configurable test mock. Production needs an independently reviewed, manipulation-resistant source (for example, a sufficiently liquid TWAP with minimum liquidity/observation coverage, freshness checks, deviation circuit breakers, and a fail-closed policy).
2. **No official production stablecoin verification.** Verify the exact official BSC USDT contract address and decimals from authoritative sources at deployment time. A token name or ticker is not proof.
3. **No independent smart-contract audit.** Review the exact source commit, compiler settings, deployed bytecode, and all findings before any public sale.
4. **Primary-sale mechanics remain incomplete.** Immutable sale start/end, global hard cap, and per-wallet cap are now implemented and tested. An allowlist/staged-access policy, cancellation process, and escrow/refund mechanism are still absent. The current contract immediately transfers USDT and ANT; a successful purchase cannot be refunded through it. Decide and publish the terms before implementation; do not imply these missing controls exist.
5. **Immutable destination risk.** Fee and proceeds recipients cannot be changed, and there is no owner pause or inventory recovery function. A wrong destination or broken production configuration cannot be repaired in place. Confirm all addresses and assess a reviewed emergency design before deployment.
6. **Safe and treasury evidence.** Independently verify both 2-of-3 Safe contracts, owner identities, signer independence, and wallet purpose. Do not rely only on environment-variable strings.
7. **Legal and compliance review.** Obtain jurisdiction-specific advice for issuer/operating locations and every target market, covering token classification, public offering/marketing, AML/KYC, sanctions, consumer disclosures, tax, licensing, and restrictions.
8. **Operational readiness.** Apply migrations only to the intended test environment, test RLS and member roles, verify dual-RPC indexer/reorg behavior, reconcile event and transfer logs, and test incident procedures.
9. **No deployment evidence.** No ANT token or sale contract has been verified as deployed on BSC Testnet from this branch. No mainnet contract is configured or deployed.

## Release rule

Do not accept real USDT, open public subscriptions, promise returns, or claim an exchange listing until all release blockers are resolved, the exact production release is independently reviewed, and the owner explicitly approves the release. Keep all test assets clearly labeled; mock tUSDT and tBNB are not money or revenue.

## Source branch

`ant-token-testnet`

