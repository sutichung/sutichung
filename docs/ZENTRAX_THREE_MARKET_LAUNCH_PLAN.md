# ZENTRAX / Ant Colony (ANT) — Three-Market Delivery Plan

**Status: engineering and launch plan only. No public sale, exchange listing, derivatives market, audit, or regulatory approval is represented as live.**
**Working interpretation:** for this project, "Level 1 / Level 2 / Level 3 markets" means (1) primary issuance, (2) secondary spot markets, and (3) tertiary institutional / OTC and derivatives markets. These are product workstreams, not a claim that every jurisdiction uses the same formal market classification.

## Product architecture

- Brand: ZENTRAX
- Asset: Ant Colony (ANT)
- Planned chain: BNB Smart Chain (BEP-20)
- Current engineering baseline: fixed initial supply 200,000 ANT, 18 decimals, no mint/owner/pause/blacklist/transfer tax or privileged transfer controls.
- USDT is the intended quote/collateral asset for sale and trading products; ANT is not to be silently substituted as prediction-market collateral.
- No real-money feature is enabled by this document. All launch gates are deny-by-default.

## Market 1 — Primary issuance / launchpad

### Scope
- Publish issuer identity, token whitepaper, tokenomics, distribution, vesting, treasury addresses, risk factors and legal disclosures.
- A subscription / sale interface with explicit quote, fee, slippage, wallet confirmation, chain/network check, receipts, refund/failed-transaction handling and support process.
- Maintain a public, append-only allocation and treasury record.
- Use the current 5% sale fee only if it is explicitly approved, accurately disclosed, legally reviewed and consistent with the deployed contract. The sale contract's 5% is not an exchange-trading fee.

### Acceptance gates
- [ ] Issuer legal entity and authorized signatory confirmed.
- [ ] Jurisdiction-by-jurisdiction offer, promotion, AML/KYC, sanctions, tax and consumer-law review completed.
- [ ] Independent token and sale-contract audits completed; critical/high findings remediated.
- [ ] Final Safe multisig addresses and signer threshold independently verified.
- [ ] Final token allocation and vesting schedule published and enforced by reviewed contracts where applicable.
- [ ] Oracle and pricing methodology independently validated; stale/low-liquidity conditions fail closed.
- [ ] End-to-end testnet buy, fee split, ANT delivery, event indexing, reconciliation, refund/error and recovery tests pass.
- [ ] Mainnet release explicitly approved by issuer after all gates.

## Market 2 — Secondary spot trading

### DEX
- Deploy and verify the final mainnet token contract only after Gate 1.
- Create a pool on a supported DEX (e.g., PancakeSwap on BNB Chain) only after treasury/liquidity policy, impermanent-loss risk, LP ownership/lock disclosure and market surveillance are ready.
- Publish pool address, chain, quote asset, initial liquidity, fee tier, LP custody and unlock/withdrawal rules.
- Never manufacture volume, wash trade, spoof orders, or promise price support.

### CEX
- Prepare a single consistent due-diligence package and apply through each exchange's official listing portal.
- Track each venue independently: application submitted, diligence, approved, deposits enabled, withdrawals enabled, spot trading enabled, supported chain/pair and official announcement.
- Initial target list includes Binance, Coinbase, Kraken, OKX, Bybit, Gate.io, KuCoin, Bitget, MEXC, Crypto.com, BitMart and Upbit. This is a target list, not an indication of eligibility or approval.
- Do not claim a listing until the exchange's official asset page/announcement confirms the exact ANT contract and trading pair.

### Acceptance gates
- [ ] Mainnet contract verified and independent audit published.
- [ ] Legal opinion, issuer KYC/UBO, disclosures and exchange application package complete.
- [ ] Real liquidity and market-quality thresholds defined and met.
- [ ] DEX pool verified; token/pool tracked by market-data providers where eligible.
- [ ] Exchange-by-exchange approval and enabled deposit/withdrawal/trading states evidenced.

## Market 3 — Tertiary institutional / OTC and derivatives

This market must not be treated as a simple extension of spot trading.

### OTC / block trading
- Start with an RFQ workflow: verified counterparties, quote expiry, size limits, settlement asset/network, counterparty risk, compliance screening, signed trade confirmation and auditable settlement.
- Do not custody customer assets or intermediate regulated trades unless the relevant legal permissions, custody controls and operational controls are confirmed.
- Set minimum trade sizes and credit/counterparty limits only after legal, liquidity and operational review.

### Perpetual futures / options
- ANT derivatives may be pursued only through a licensed/eligible derivatives venue after the spot asset has sufficient market integrity, reliable index/oracle sources and robust liquidity.
- A derivatives risk engine must include mark/index price methodology, funding, initial/maintenance margin, liquidation, ADL/backstop, insurance fund, position/open-interest limits, circuit breakers, manipulation surveillance, stress testing and incident handling.
- Do not self-list or advertise ANT perpetuals as live without the venue's written approval and a public contract specification.
- No leverage, margin lending, synthetic volume, or retail derivatives activation before jurisdictional product permission and suitability checks.

### Acceptance gates
- [ ] Legal classification and permissions for OTC, brokerage, custody and derivatives in each target market.
- [ ] Independent market-integrity and oracle review; sufficient spot depth and reliable index components.
- [ ] Counterparty, credit, settlement and custody framework tested.
- [ ] Derivatives risk engine independently reviewed and stress-tested.
- [ ] Venue approval, product specification, supported jurisdictions and public launch announcement confirmed.

## Shared platform controls

- Separate issuer/treasury funds from customer funds. Use independently controlled multisigs, least privilege, MFA and hardware-backed signers.
- Keep private keys, seed phrases, service-role keys and exchange API secrets out of chat, source code, client bundles and logs.
- Use an append-only double-entry ledger. Reconcile every on-chain transfer and every exchange/OTC settlement against authoritative records.
- Keep a full audit trail for admin actions, token allocations, listing submissions, treasury movement, market surveillance and incident response.
- Separate testnet, staging and production. Never expose testnet balances or simulated prices as real assets or market data.
- Market data must carry venue, pair, timestamp, freshness, source and licensing status. Fail closed when stale or unavailable.
- No wash trading, spoofing, fake holders, paid undisclosed promotion, guaranteed returns, or manipulation of ANT price.
- Build operational runbooks for security incidents, chain reorgs, RPC outages, compromised keys, halted withdrawals, oracle failure and customer complaints.

## Release sequence and status

| Stage | Required evidence | Current state |
|---|---|---|
| Repository / CI | Reproducible builds and passing tests | Some CI checks observed passing; verify each current commit |
| Testnet token | Deployment tx, contract address, verified source, balances | Not evidenced in this dossier |
| Testnet sale | Real testnet token/oracle and end-to-end reconciliation | Not evidenced in this dossier |
| Mainnet token | Legal sign-off, audit, multisig, deployment evidence | Blocked |
| Primary issuance | Approved offer, compliant disclosures, sale controls | Blocked |
| DEX spot | Mainnet pool, liquidity and monitoring | Blocked |
| CEX spot | Individual exchange approvals and official market pairs | Not submitted / not approved |
| OTC | Legal permission, counterparties and settlement operations | Not implemented |
| Derivatives | Venue approval, index, risk engine and permissions | Not implemented |

## Evidence register

Every claim of progress must include an evidence reference: Git commit / CI run, audit report and scope, legal opinion date and jurisdiction, deployment transaction and chain ID, verified contract address, pool address, exchange application receipt, official listing URL, or OTC/derivatives venue approval. A checklist alone is not evidence of completion.

## Immediate engineering order

1. Fix the mobile/browser website load issue using a reproducible failing URL, HTTP status, request ID and Render logs; do not infer client accessibility from Render service status alone.
2. Reconcile the current Render production branch with the intended ZENTRAX feature branch; deploy only after reviewing migrations, secrets, tests and rollback.
3. Run full CI on the latest ANT and ZENTRAX commits; remediate failures rather than suppressing them.
4. Verify testnet token and sale deployments, oracle source, Safe balances and end-to-end accounting.
5. Complete independent audit and legal issuer package.
6. Only then schedule mainnet issuance and primary-market opening.
7. Build DEX/CEX spot, then OTC and derivatives as separate approved products.

**No continuous background work is implied. Each stage must be executed, evidenced and rechecked; unresolved external approvals or user-provided credentials cannot be fabricated or bypassed.**
