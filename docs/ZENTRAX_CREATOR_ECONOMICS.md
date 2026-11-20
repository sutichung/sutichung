# ZENTRAX / ANT — Creator Economics & Revenue Plan

**Status: proposal and implementation specification; not a statement that any revenue stream is live.** This plan preserves the current ANT testnet contract design: fixed 200,000 ANT supply, 18 decimals, no mint function, and a 5% immutable USDT sale fee. Do not change deployed contract economics silently.

## 1. Creator value capture without changing buyer terms

The current sale contract routes:
- 5% of gross USDT to the immutable fee recipient;
- 95% of gross USDT to the immutable treasury recipient;
- ANT inventory to the buyer atomically.

For creator benefit, configure the fee recipient as a creator-controlled, disclosed wallet or a creator-controlled Safe multisig, and the treasury recipient as a separate company/operating Safe. This is a configuration choice, not a claim that either wallet is currently configured. Publish both addresses and the exact fee split before any public sale. Do not describe the full 5% as personal profit if it is used for expenses, tax, refunds, or reserves.

**Illustration only:** on 1,000 USDT gross sales, the current contract routes 50 USDT to the fee recipient and 950 USDT to treasury. This is gross revenue routing, not net profit; network fees, taxes, operating costs, refunds and legal obligations remain payable.

## 2. Recommended treasury policy

Use two independent 2-of-3 Safe multisig wallets:
1. **Creator / protocol-fee Safe:** receives the disclosed 5% sale fee and any separately disclosed protocol fees.
2. **Operating treasury Safe:** receives 95% sale proceeds and pays audited project expenses, liquidity provisioning and ecosystem costs under a published budget.

Keep signers independent. Use hardware wallets. Never place seed phrases or private keys in source code, chat, GitHub Actions logs, or a browser. Publish wallet addresses and reconcile inflows/outflows in a public dashboard. Do not give a single person unilateral ability to move all user funds.

## 3. Additional sustainable creator revenue (future modules)

These are proposed products and must not be advertised as active until implemented, tested, legally reviewed and disclosed:
- **Membership tiers:** recurring subscription for research tools and analytics; free core access remains available. Price and cancellation terms must be clear.
- **B2B analytics/API:** paid data exports, dashboards and integration plans, with data licensing and rate limits respected.
- **Launchpad services:** fixed, disclosed project review/integration fees; no paid ranking disguised as independent endorsement.
- **Prediction-market platform fee:** a clearly displayed fee on settled markets only, with market rules, dispute resolution and jurisdiction controls. Do not take the other side of customer positions or promise returns.
- **Enterprise integrations:** setup and support contracts with transparent scope and service levels.

Do not introduce hidden spreads, undisclosed transfer taxes, surprise wallet deductions, or guaranteed-yield / buyback claims.

## 4. ANT supply and founder alignment

The current supply is fixed at 200,000 ANT and cannot be increased under the no-mint design. Do not promise a founder allocation or vesting schedule that the deployed contract does not enforce. Before mainnet, publish a signed allocation table covering founder, liquidity, ecosystem, community and reserve wallets; disclose vesting/lock contracts and unlock dates; and verify the on-chain balances. A time-locked founder allocation with a public vesting schedule is more credible than unrestricted insider inventory and reduces sudden-supply concerns.

Any change to token allocations, sale price/oracle, fee basis points, recipient addresses, or lockups requires a new reviewed deployment or a separately audited migration plan. It must never be changed secretly after buyers have committed.

## 5. Anti-dump and market-integrity controls

Use transparent, contract-enforced measures only:
- disclose insider allocations and vesting;
- publish liquidity lock terms and unlock dates;
- monitor concentration, abnormal transfers, liquidity depth and oracle deviation;
- pause new sales on oracle/RPC/indexer anomalies, if a reviewed pause mechanism is added;
- publish incident notices and allow a fair, documented dispute process.

Do not freeze, seize, threaten, dox, or retaliate against holders for selling. A market sale is not grounds for punishment. Avoid wash trading, spoofing, coordinated pump campaigns, fake volume, or misleading claims about listings and price support.

## 6. Revenue reporting and guardrails

The finance dashboard should separately report:
- gross USDT sales;
- 5% protocol fee received;
- 95% treasury proceeds;
- refunds/chargebacks (where applicable);
- operating expenses and taxes;
- net operating surplus;
- membership/API/enterprise revenue by product;
- liquidity positions and realized/unrealized treasury asset values.

Show both token units and USDT units, source transaction links, reporting period, and reconciliation status. Never label gross inflows as profit. Require dual approval for treasury transfers and maintain an append-only audit trail.

## 7. Release gates

Before any public sale or mainnet deployment:
1. independent smart-contract and oracle audit;
2. verified official USDT contract address and decimals for the target chain;
3. creator and treasury Safe deployment, signer verification and recovery plan;
4. public token allocation, vesting, fee and wallet disclosures;
5. legal review for token sale, financial promotion, AML/KYC, sanctions, consumer protection, tax and prediction-market jurisdiction;
6. testnet end-to-end purchase, fee split, ANT delivery, reorg handling and accounting reconciliation;
7. explicit release approval from the project owner.

## 8. Current implementation status

This file is a policy/specification proposal only. The existing testnet branch documents a 5% immutable fee and 95% proceeds split, but no live fee recipient, treasury Safe, paid subscription, B2B API billing, launchpad fee or prediction-market settlement fee is confirmed here. Supabase migrations and real testnet contracts still need configuration/deployment. Mainnet remains disabled.