# ANT Creator Revenue & Fair-Launch Policy

**Status:** design and review specification; not a statement that a sale is live, deployed, audited, or legally approved.
**Network:** BSC Testnet first.
**Token baseline:** 200,000 ANT fixed initial supply, 18 decimals, burnable; current token contract has no owner, mint, pause, blacklist, transfer tax, or privileged controls.

## 1. Business objective
Ant Colony should earn sustainable, disclosed revenue from real product usage. It must not depend on trapping buyers, confiscating wallets, secretly changing sell rules, wash trading, artificial volume, or engineering losses for snipers.

## 2. Existing sale contract economics
The repository currently contains contracts/AntColonySale.sol with a fixed FEE_BPS = 500 (5%). For each successful purchase:
- Gross payment is the amount of USDT approved and spent by the buyer.
- 5% of gross USDT is transferred to the immutable feeRecipient (creator/platform revenue wallet).
- 95% is transferred to the immutable proceedsRecipient (treasury / sale proceeds wallet).
- ANT is delivered from the sale contract's pre-funded inventory.
- The oracle returns USDT per ANT with 8 decimals; quote rejects zero, future-dated, or stale prices.
- Buyer supplies minAntOut to enforce a slippage floor.

Example: for a 100 USDT purchase, 5 USDT goes to creator/platform fees and 95 USDT goes to net proceeds. ANT output is calculated from the 95 USDT net amount and valid oracle price. The 5% is a purchase fee, not an ANT transfer tax.
The fee is gross-based. Actual creator revenue is only the fee successfully received; it is not guaranteed income and depends on real completed purchases, fees, applicable costs, and legal availability.

## 3. Wallet and treasury separation
Use separate, publicly disclosed multisig-controlled addresses:
1. feeRecipient: creator/platform operating revenue.
2. proceedsRecipient: sale proceeds / treasury.
3. liquidityWallet: only if a liquidity strategy is approved and disclosed.
4. ecosystemWallet: grants, audits, development, and community programs.
Do not use one wallet for all purposes. Publish signer threshold, wallet addresses, treasury policy, reporting cadence, and material transfers. Never publish seed phrases or private keys. Do not promise buybacks, price support, guaranteed liquidity, or returns.

## 4. Revenue allocation (current proposal; not implemented)
The earlier 40/25/20/10/5 allocation in this document is superseded to avoid conflicting revenue projections. The current creator-first proposal is defined in [ZENTRAX Creator Economics](./ZENTRAX_CREATOR_ECONOMICS.md):
- 60% creator compensation / founder distribution
- 25% product development, infrastructure and customer support
- 10% security audits, bug bounty and compliance
- 5% contingency reserve

These percentages apply only to net, actually received fee revenue after required tax withholding and legally required reserves. They are a treasury-policy proposal, not an automatic on-chain split, not a guaranteed payout, and not proof that any fee wallet or sale is live. Publish actual amounts, dates, transaction hashes, taxes, transfers and variances.

## 5. Fair-launch / anti-sniper safeguards
Prefer transparent market-integrity controls over punitive hidden mechanics:
- Public launch schedule and published per-wallet / per-transaction caps if legally and technically appropriate.
- Optional allowlist or staged access with published eligibility rules.
- Monitoring for same-block clusters, repeated funding sources, extreme concentration, sandwiching, and abnormal sell/buy patterns.
- Public risk alerts and rate limits at the application / sale interface where possible.
- No secret blacklist, confiscation, honeypot, hidden sell restriction, owner-only drain, or discriminatory discretionary tax.
- Do not label a wallet a bot or attacker based solely on heuristics; publish confidence and evidence limits.
- Do not coordinate trades, fabricate demand, or invite users under false pretenses.
The existing ANT token contract deliberately has no blacklist, pause, or transfer tax. Preserve this trust property unless an independently reviewed, publicly disclosed governance process justifies a change.

## 6. Sale-contract review blockers
Before any public sale or real-money use, resolve and independently test:
- Oracle authenticity, manipulation resistance, decimals, heartbeat, and stale-price behavior. The current interface only checks timestamp and nonzero price; it does not itself prove oracle quality.
- USDT token address and decimals for the exact target chain.
- Sale inventory funding and recovery procedure. The current sale has no owner withdrawal, pause, or refund function; accidental funding and operational failures need a reviewed plan.
- Fee/proceeds recipient multisig addresses and control policy.
- Fee-on-transfer / non-standard token behavior assumptions.
- Slippage, minimum output, rounding, insufficient inventory, failed USDT transfer, and reentrancy tests.
- Event-based accounting reconciliation against actual token transfers.
- Independent security audit and legal review for every target jurisdiction.
- Consumer disclosures, terms, privacy, sanctions screening where applicable, support, and refund policy.
Do not deploy to mainnet, solicit purchases, or accept real USDT until all blockers are resolved and explicitly approved.

## 7. Required test matrix
- 100 USDT gross payment yields 5 USDT fee and 95 USDT proceeds (subject to token decimals).
- 0, tiny, and invalid amounts revert.
- Stale, zero, and future-dated oracle values revert.
- Price changes between quote and buy respect minAntOut.
- Insufficient ANT inventory reverts without taking USDT.
- Failed fee or proceeds transfer reverts atomically.
- Repeated / reentrant purchase attempts cannot double-spend.
- Fee and proceeds recipients receive exactly the expected amounts.
- Purchase event values reconcile with actual balances.
- Test USDT decimals 6 and 18; confirm all scaling and rounding behavior.

## 8. Public disclosure template
“ANT purchases through the official sale contract, if and when enabled, incur a 5% platform fee calculated on gross USDT paid. The fee is sent to the disclosed creator/platform revenue wallet; the remaining 95% is sent to the disclosed treasury/proceeds wallet. ANT delivery depends on available inventory and a valid, current oracle quote. This fee is separate from any network gas fee. ANT is volatile and may lose all value; no return, liquidity, listing, or price appreciation is promised. Testnet tokens have no monetary value.”

## 9. Release gates
- [ ] Confirm sale contract source and current test coverage.
- [ ] Add and pass the complete test matrix above.
- [ ] Review oracle implementation and exact supported network/token addresses.
- [ ] Confirm all recipient wallets are multisig and publish their policy.
- [ ] Publish token allocation, treasury budget, and insider vesting / disclosures.
- [ ] Independent audit and legal review complete.
- [ ] Testnet end-to-end purchase and accounting reconciliation complete.
- [ ] Mainnet deployment and public sale require a separate explicit approval after all gates pass.

**Current verified code observation:** the token contract has fixed supply and no privileged controls; the sale contract routes 5% of gross USDT to feeRecipient and 95% to proceedsRecipient. This document does not change contract behavior and does not establish deployment or readiness for a public sale.