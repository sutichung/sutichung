# ANT Exchange Listing Playbook

> Status: research and readiness specification only. This document is not an exchange offer, listing approval, legal opinion, or authorization to issue or sell tokens. Every venue decides independently and may change its rules.

## 1. What "listing" actually means

Do not treat these destinations as interchangeable:

| Route | What it provides | What it does not prove |
|---|---|---|
| DEX pool (e.g. PancakeSwap on BNB Chain) | Permissionless on-chain swap access once a valid pool and liquidity exist | CEX approval, sustainable liquidity, fair price discovery, or aggregator tracking |
| Wallet / discovery surfaces (e.g. Binance Alpha) | Early-stage discovery and possible exposure | Binance Spot or Futures listing |
| CEX spot | Custodial order-book market and exchange-specific due diligence | Perpetual futures approval |
| CEX derivatives | Separate derivatives-market review, risk and liquidity requirements | Spot listing or guaranteed leverage availability |
| Data aggregators (CoinGecko / CoinMarketCap) | Market-data discovery, asset identity and tracking | Exchange listing, endorsement, or investment quality |
| Launchpad / launchpool | A venue-specific token distribution or discovery program | Automatic spot or futures listing |

A DEX pool can be created without a CEX listing decision, but it must not be used to simulate demand. Do not seed fake volume, wash trade, coordinate pump campaigns, or describe thin liquidity as a mature market.

## 2. Common due-diligence pattern across venues

Build one evidence room that can answer these review areas:

1. **Project reality:** working product/MVP, public demo, shipped releases, uptime, users who perform real utility actions, support process and roadmap delivery.
2. **Issuer and governance:** accountable legal entity where required, authorized representative, beneficial ownership / team verification as requested, governance process, treasury controls, conflicts and related-party disclosures.
3. **Token identity:** name, symbol, chain ID, verified contract address, decimals, total and circulating supply, allocations, vesting/unlock schedule, burn/mint/admin permissions, holder concentration, treasury wallets and migration history.
4. **Security:** independent audit tied to exact source commit and deployed bytecode, remediation evidence, bug bounty/contact, incident history, multisig/key management, RPC/oracle/bridge threat model and monitoring.
5. **Legal/compliance:** jurisdiction matrix, legal classification analysis, marketing restrictions, AML/KYC/sanctions obligations where applicable, consumer disclosures, tax and licensing advice. Requirements differ by venue and customer geography.
6. **Market quality:** genuine unique traders, organic volume, spread, depth at defined bands, slippage for representative order sizes, venue concentration, liquidity ownership/lock terms and market-maker conflict disclosures.
7. **Community and communications:** verifiable active users, retention, moderation, transparent token disclosures, official domain/social links, anti-impersonation controls and incident communications.
8. **Operations:** API / explorer reliability, chain finality, deposit/withdrawal testing, chain reorg response, customer support, incident escalation, listing-day staffing and post-listing reporting.

For every metric store source, collection time, timezone, raw evidence hash, methodology, freshness, sample window and limitations. Never invent TVL, holders, volume, users, partnerships, audit status or exchange interest.

## 3. Practical route sequence (not a guaranteed ranking)

### Stage A — prove the asset exists and is safe to inspect
- Finalize token specification and allocation / unlock disclosures.
- Deploy only to a testnet first; publish verified source and explorer links after the deployment is actually confirmed.
- Complete contract tests, independent audit planning, multisig verification and incident-response runbook.
- Do not activate sales, mainnet issuance, or custody while the issuer's legal capacity and jurisdictional requirements are unresolved.

### Stage B — public technical transparency
- Publish a functional website, documentation, whitepaper / technical paper, tokenomics, risk disclosures, official contract and explorer links, security contact and changelog.
- Provide a public status page and reproducible release notes.
- Make chain, supply, decimals, admin rights, vesting, treasury and liquidity disclosures consistent across every page.

### Stage C — DEX readiness (only after legal and security gates)
- Confirm the chain and token contract are supported by the intended DEX.
- Independently verify token address and decimals; test add/remove liquidity, swaps, approvals and slippage controls on testnet first.
- Disclose pool address, LP ownership, lock or vesting terms, initial liquidity source and concentration risks.
- Monitor pool depth, price impact, failed transactions, abnormal liquidity removal and contract events.
- A pool is not proof of CEX readiness. Never manufacture volume or promise price support.

### Stage D — data aggregator applications
- Apply separately to CoinGecko and CoinMarketCap using their official forms and evidence requirements.
- CoinMarketCap's tracked listing guidance includes a functional website and block explorer, public trading on at least one CMC-tracked exchange with material volume, and a project contact. Preview / untracked status is not tracked market data.
- Supply correct contract, chain, ticker, decimals, circulating supply methodology, markets, official links and transparent volume evidence.
- Aggregator inclusion is a separate data review, not an exchange endorsement or a substitute for liquidity.

### Stage E — CEX spot applications
Prepare one complete application dossier and then tailor it to each venue. Do not spam multiple applications or ask influencers / community members to pressure listing teams.

- **Binance:** official spot listing application; distinguish Binance Alpha, Launchpool / Megadrop, Spot and Futures. Binance says a working MVP and user adoption matter; it performs due diligence and ongoing review. Alpha exposure is not Spot approval.
- **Coinbase:** official asset listing application; business evaluation plus Legal, Compliance and Technical Security reviews.
- **OKX:** official listing application; provide project overview and substantiated ecosystem metrics such as TVL, market share and user growth.
- **Kraken:** one application per asset; team, tokenomics, on-chain metrics, utility, governance, legal/compliance and engineering review. Provisional roadmap inclusion is not a listing guarantee; liquidity is monitored after launch.
- **Bybit:** official Spot listing application; separate project and listing information; shortlisted projects proceed to further review.
- **Gate:** official asset listing application; project, tokenomics, technical, legal/compliance and market due diligence followed by onboarding and ongoing monitoring.

Use only each exchange's own domain and application portal. Verify any inbound contact through the exchange's official verification process. Do not pay brokers, agents or individuals who promise guaranteed approval. A fee for optional services, if any, must be separately verified with the exchange and reviewed by counsel.

### Stage F — derivatives / perpetuals (a later, separate gate)
- Do not apply for Futures as if it follows automatically from Spot.
- Build a longer, independently verifiable spot-market history and demonstrate reliable order-book depth, orderly price discovery, robust token custody/deposits/withdrawals and operational incident response.
- Prepare contract risk disclosures, funding / index methodology if requested, market-maker identity and conflicts, token unlock calendar, and stress scenarios.
- Binance Futures has its own application path and decision. No public metric or timeline guarantees approval.

### Stage G — post-listing operations
- Assign named owners for security, market quality, treasury disclosures, compliance, support and exchange communications.
- Monitor spread, depth, slippage, cross-venue price divergence, organic volume, holder concentration, token unlocks, contract events, chain health, deposit/withdrawal status and incidents.
- Publish material tokenomics, treasury, security and governance changes promptly and consistently with exchange rules.
- Maintain weekly/monthly evidence packs and answer due-diligence requests quickly.
- Treat warnings, market-quality deterioration, security incidents and delisting reviews as operational incidents with documented response.

## 4. Venue-specific official references

- Binance listing requirements and official application routes: https://www.binance.com/en/support/announcement/detail/d378c2176ac841bb8eae68f63d4c4845
- Binance listing FAQ: https://www.binance.com/en/support/faq/how-to-get-your-coin-listed-on-binance-com-053e4bdc48364343b863d1833618d8ba
- Coinbase asset listing process: https://www.coinbase.com/exchange-asset-listings
- Coinbase listing process explainer: https://www.coinbase.com/blog/A-Guide-to-the-Digital-Asset-Listing-Process-at-Coinbase
- OKX listing guide: https://www.okx.com/help/how-can-i-get-my-project-listed-on-okx
- Kraken listing process: https://blog.kraken.com/product/asset-listings/5-simple-steps-how-to-get-listed-on-kraken
- Kraken listing requests: https://support.kraken.com/au/articles/360001388206-new-asset-listing-requests
- Bybit Spot listing application: https://www.bybit.com/en/trade/spot/listing-apply
- Gate listing application: https://www.gate.com/en-us/listing
- CoinMarketCap listing criteria: https://support.coinmarketcap.com/hc/en-us/articles/360043659351-Listings-Criteria/

Always re-open the official venue page before applying; forms, eligibility, supported jurisdictions and criteria can change.

## 5. ANT evidence pack — current gaps

The repository's existing ANT roadmap is a useful starting point, but the following are still not verified as live facts:

| Evidence item | Current state | Required evidence before marking complete |
|---|---|---|
| Functional ANT product / active users | Not independently measured | Production demo, analytics methodology, real utility events and uptime history |
| Legal issuer and eligibility | Not verified | Counsel-approved entity / issuer and jurisdiction matrix; authorized representative |
| Mainnet contract | Not deployed | Approved audited source, transaction hash, contract address, explorer verification and post-deploy reads |
| Testnet ANT deployment | Not verified | Testnet transaction, address, source verification and supply / Safe balance reads |
| Independent audit | Not performed | Published report tied to exact source commit and bytecode; findings remediated |
| Tokenomics / vesting | Specification incomplete for public disclosure | Allocation table, treasury wallets, vesting contracts / schedules, circulating supply method |
| Oracle / sale | Production oracle not approved; sale disabled | Independent oracle review, manipulation resistance, liquidity and fail-closed tests |
| DEX liquidity | Not established | Verified pool address, genuine liquidity evidence, LP ownership / lock disclosures |
| CEX market history | Not established | Independent venue data and market-quality history |
| Market maker | Not appointed / verified | Legal entity, mandate, conflicts, inventory and wallet disclosures; no volume guarantees |
| Aggregator tracking | Not verified | Official application receipts and tracked status confirmed by each aggregator |
| CEX Spot approval | Not applied / approved | Official written approval and exchange announcement |
| Futures approval | Preparation only | Separate written approval and official exchange announcement |
| Post-listing monitoring | Metrics design only | Running monitoring, named operators, alert tests and incident drills |

## 6. Evidence-based readiness gates

A gate passes only when the evidence is independently checkable. Do not convert a plan, draft, CI pass, application receipt, private conversation or roadmap appearance into an approval claim.

- [ ] Working product and genuine utility usage demonstrated.
- [ ] Issuer / legal / jurisdiction review complete for the relevant activity.
- [ ] Token contract deployed to the intended network, verified and independently audited.
- [ ] Supply, allocations, vesting, treasury and admin rights fully disclosed.
- [ ] Security findings remediated and incident-response process tested.
- [ ] DEX pool and liquidity are real, independently verifiable and transparently disclosed (if using DEX route).
- [ ] Organic market activity and order-book quality are measured without wash trading.
- [ ] Aggregator data is correct and official tracked status is verified (if applying).
- [ ] Each CEX application is complete, submitted by an eligible authorized representative, and tracked separately.
- [ ] Spot and derivatives approvals are independently evidenced; never infer one from the other.
- [ ] Post-listing market, security, legal and communications monitoring is staffed and tested.

## 7. Non-negotiable integrity rules

- No fake volume, wash trading, fake holders, fake users, undisclosed paid endorsements or market manipulation.
- No guaranteed listing, guaranteed return, price target or claim of exchange partnership without verifiable public authorization.
- No hidden mint, blacklist, sell-block, confiscation or arbitrary privileged transfer controls.
- No private keys, seed phrases, exchange passwords or API secrets in chat, source code, browser storage or public issues.
- No real-money sale, custody, exchange application or production token issuance until legal capacity, authorized signatory, jurisdictional review and independent security gates are satisfied.
- Testnet and documentation work may continue while production gates remain closed.
