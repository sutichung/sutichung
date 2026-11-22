# ANT International Exchange Listing Pack — Readiness Gate

Status date: 2026-11-22  
Project: ZENTRAX / Ant Colony (ANT)  
Target: international spot-market discovery and exchange applications  
Network under evaluation: BNB Smart Chain (BSC); mainnet chain ID 56  
Status: PREPARATION ONLY — NOT APPROVED FOR SALE OR LISTING

This pack prepares verifiable materials for legitimate DEX, centralized exchange (CEX), and market-data aggregator applications. It is not an exchange application, listing approval, token deployment, legal opinion, or promise of liquidity.

## 1. Current verified position

- ANT token and sale source code are being maintained on the dedicated `ant-token-testnet` branch.
- The inspected Hardhat configuration defines BSC Testnet (chain ID 97); a production BSC mainnet deployment has not been verified.
- No verified BSC mainnet ANT contract address, deployment transaction, or explorer verification URL is currently recorded.
- The primary-sale price model has not been approved by the issuer.
- The sale contract has no native cancellation/refund/escrow path; do not promise refunds until a reviewed mechanism and enforceable policy exist.
- Independent smart-contract audit and jurisdiction-specific legal review are not complete.
- No DEX pool, CEX listing, market-maker agreement, or aggregator listing approval is verified.
- A testnet contract, mock USDT, mock oracle, testnet transaction, or CI pass is not evidence of a live market.

## 2. Listing routes and prerequisites

### A. DEX spot pool

Before any mainnet pool creation:
- [ ] Mainnet token contract is deployed only after all release gates pass.
- [ ] Source code, compiler settings, constructor values, supply and privileged roles are independently verified.
- [ ] Token allocation, circulating supply, vesting, treasury and holder concentration are publicly reconciled.
- [ ] Legal review covers issuance, liquidity provision, market-making, promotion and target jurisdictions.
- [ ] Independent audit is complete and all critical/high findings are resolved.
- [ ] A treasury-controlled, multisig-approved liquidity budget and loss limit are documented.
- [ ] Pool pair, venue, initial price methodology, liquidity amount, LP custody/lock policy, rebalancing and incident response are disclosed.
- [ ] Slippage, price impact, MEV, oracle manipulation and liquidity-withdrawal risks are reviewed.
- [ ] A public launch notice identifies the exact chain, token contract, pool address and verified transaction hashes.

DEX pool creation is permissionless on many protocols; that does not mean a token has passed a quality review or gained exchange endorsement. Do not seed a thin pool merely to claim a market price or listing.

### B. Centralized exchange (CEX) spot application

Prepare the following evidence pack before contacting any exchange:
- [ ] Issuer legal name, registration jurisdiction, registered address, directors/beneficial ownership and authorized contact.
- [ ] Official website, domain-controlled email, whitepaper, product demo, roadmap and support/incident contacts.
- [ ] Token name, ticker, chain, decimals, fixed/max supply, contract address, explorer link and verified source.
- [ ] Tokenomics: allocations, vesting schedules, unlock calendar, treasury policy, circulating-supply methodology and holder concentration.
- [ ] Utility/product evidence, active users and wallet metrics with collection methods and timestamps.
- [ ] Security audit report, remediation evidence, bug-bounty/incident process and contract admin-role disclosures.
- [ ] Legal memorandum/registration/exemption analysis for issuer and relevant distribution markets; AML/KYC, sanctions and restricted-jurisdiction controls where applicable.
- [ ] Market and liquidity data from independently verifiable venues; disclose market-maker arrangements and conflicts.
- [ ] Listing operations: supported chain integration, deposit/withdrawal tests, confirmations, token decimals, RPC/indexer reliability, custody compatibility and emergency contacts.
- [ ] Clear risk disclosures; no guaranteed returns, price targets, guaranteed liquidity or misleading partnership claims.

Submit only through each exchange's official listing channel. Verify the domain and recipient independently. Never pay an intermediary claiming guaranteed listing, never share private keys or seed phrases, and do not sign blank or unexplained transactions. Exchange review, fees, timelines and acceptance are controlled by the exchange and may change.

### C. Market-data aggregators

CoinGecko/ CoinMarketCap-style market-data submissions are separate from exchange listings:
- [ ] Live mainnet token contract and public explorer record.
- [ ] Publicly accessible official website, documentation and tokenomics.
- [ ] Verifiable circulating/max supply and update methodology.
- [ ] Live eligible market venue/pair and independently verifiable trading data, where required by the provider.
- [ ] Official project social channels and contact information.
- [ ] Consistent token name, ticker, logo and contract metadata across official sources.

Do not claim aggregator inclusion before the provider approves and publishes the asset page. Do not fabricate trading activity or holder counts.

## 3. Canonical listing facts — issuer confirmation required

| Field | Current state |
|---|---|
| Project / token name | ZENTRAX / Ant Colony (ANT) — confirm final legal and public naming |
| Ticker | ANT — ticker collision check still required |
| Network | BNB Smart Chain intended |
| Mainnet chain ID | 56 — target only, not deployed |
| Testnet chain ID | 97 |
| Decimals | 18 in repository design |
| Initial supply | 200,000 ANT in repository deployment script; verify actual deployed supply later |
| Mainnet contract address | NOT DEPLOYED / NOT VERIFIED |
| Mainnet explorer URL | NOT AVAILABLE |
| Official website / domain email | Issuer must confirm canonical URLs and controlled email |
| Whitepaper / legal entity | NOT COMPLETE / NOT VERIFIED |
| Audit | NOT COMPLETE |
| Sale price / unlocks | Issuer decision and review pending |
| DEX liquidity | NOT CREATED |
| CEX approval | NONE VERIFIED |
| Market-data aggregator pages | NONE VERIFIED |

## 4. Hard release blockers

The following items must remain closed until evidenced:
1. Issuer identity, token naming/ticker clearance, tokenomics and vesting disclosures.
2. Independent legal review for issuer and each actively targeted market.
3. Final primary-sale price model, eligibility, proceeds custody, cancellation/refund policy and reviewed contract implementation.
4. Independent contract/security audit and remediation.
5. Testnet end-to-end evidence including purchase, event reconciliation, refund/cancellation design, recovery and multisig operations.
6. Mainnet deployment authorization with exact reviewed parameters and independently controlled multisig.
7. Live market launch authorization, liquidity risk budget and public disclosure.

No production mainnet deployment, public sale, DEX liquidity seeding, exchange application submission, or listing-fee payment is authorized by this engineering document.

## 5. Evidence ledger template

For every claim submitted to an exchange or aggregator, retain:
- Claim and exact value
- Source URL / contract / transaction hash
- Collection timestamp (UTC)
- Raw evidence or response hash
- Methodology and calculation
- Responsible reviewer
- Expiry / refresh date
- Known limitations

Never invent users, holders, volume, liquidity, partnerships, audits, exchange interest or approvals. Exclude wash trading, self-trading, fake followers, undisclosed paid promotion and coordinated price manipulation.

## 6. Next engineering sequence

1. Repair and pass the latest ANT branch CI after the inventory-readiness helper change.
2. Complete testnet deployment evidence and reconcile token supply/ownership on-chain.
3. Finalize issuer-controlled tokenomics, vesting and public disclosures.
4. Design and independently review fixed-price sale plus escrow/refund/cancellation flow; do not reuse a mock oracle for production.
5. Build an evidence-backed listing dossier and only then prepare applications through official exchange channels.

**Current decision: NOT READY FOR MAINNET, DEX LAUNCH, PUBLIC SALE OR CEX LISTING.**
