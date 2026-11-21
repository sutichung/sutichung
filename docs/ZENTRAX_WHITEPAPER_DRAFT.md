# ZENTRAX / ANT — Whitepaper

**Draft:** v0.1  
**Date:** 2026-11-21  
**Project:** ZENTRAX  
**Token:** Ant Colony (ANT)  
**Public creator identity:** ZENTRAX Creator (pseudonym)  
**Governance:** Hybrid  
**Status:** Discussion draft — not an offer to sell securities or other financial products.

> **Important status notice:** This document describes the intended design and current engineering plan. It does not claim that ANT is deployed on BNB Smart Chain mainnet, audited, listed, liquid, or available for public purchase. The mainnet token contract address is not yet deployed/verified. Testnet code, proposed economics, and future modules must not be represented as live products.

## 1. Executive summary

ZENTRAX is an EVM-oriented digital-asset and application ecosystem being developed around Ant Colony (ANT). Its intended initial deployment network is BNB Smart Chain (BSC). The project aims to provide transparent token rules, auditable payment accounting, creator-led product development with bounded community governance, and future market-information and prediction-market applications subject to technical and jurisdictional controls.

The public creator identity is **ZENTRAX Creator**. The project may operate publicly under a pseudonym while providing accurate confidential identity and control-person information to exchanges, service providers, and authorities when required.

ZENTRAX is not Bitcoin and does not claim to be a new independent proof-of-work or proof-of-stake blockchain. ANT is intended to be an EVM-compatible token on an existing network. The project should be evaluated by its verified contracts, security, governance, disclosures, real usage, and market integrity—not by claims of guaranteed appreciation or similarity to Bitcoin's history.

## 2. Problem and design goals

Digital-asset projects often make it difficult for users to verify token supply, fee routing, treasury movements, privileged controls, and the difference between a roadmap and a working product.

ZENTRAX's design goals are:
1. **Verifiability:** publish source code, verified contract addresses, token supply, treasury addresses, and transaction records.
2. **Predictability:** disclose fees, token allocations, vesting, and governance powers before users transact.
3. **Security:** minimize privileged contract functions, use independent reviews, multisig controls, monitoring, and incident procedures.
4. **Accountable pseudonymity:** separate the creator's public pseudonym from confidential legal/KYC obligations.
5. **Fair markets:** prohibit fake volume, wash trading, misleading listing claims, hidden transfer taxes, and punishment of ordinary selling.
6. **Clear status:** distinguish proposed, testnet, audited, deployed, and live features.

## 3. Token overview (intended design)

| Field | Intended specification | Status |
|---|---|---|
| Project | ZENTRAX | Brand selected |
| Token name | Ant Colony | Design |
| Ticker | ANT | Design |
| Network | BNB Smart Chain (BEP-20 / EVM) | Intended; mainnet not deployed |
| Initial supply | 200,000 ANT | Intended; confirm against final deployment |
| Decimals | 18 | Intended |
| Supply model | Fixed supply; no mint function | Intended; verify final bytecode |
| Mainnet contract | None | Not deployed |
| Independent audit | None | Not completed |

The final token contract must be source-verified and independently checked to confirm supply, decimals, ownership/privileges, and the absence or presence of mint, pause, blacklist, upgrade, or transfer-control functions. Do not rely on this draft as proof of deployed behavior.

## 4. Proposed sale mechanics

The current testnet engineering design describes a sale contract that routes 5% of gross USDT purchase value as a disclosed sale fee and 95% to the operating treasury, with ANT delivered atomically to the buyer. This is a **sale-contract fee only**; it is not a proposed tax on ordinary exchange trades or wallet transfers.

Illustration: for 100 USDT gross purchase value, 5 USDT is routed to the disclosed fee recipient and 95 USDT to the disclosed treasury, subject to the actual deployed contract's exact rules. The ANT amount must be determined by a published, verifiable pricing mechanism and displayed before confirmation. No guaranteed price, return, buyback, or liquidity is promised.

Before any public sale, publish:
- official token and sale contract addresses;
- supported network and official stablecoin contract address;
- exact fee basis and pricing/oracle methodology;
- treasury and fee-recipient addresses;
- sale cap, start/end conditions, user limits, and refund/incident rules;
- legal eligibility and geographic restrictions.

## 5. Supply allocation and vesting

A final allocation schedule has not been approved or verified. Before mainnet, publish a complete table for creator, liquidity, ecosystem, community, treasury/reserve, and any other allocation, with wallet addresses and vesting/lock contracts.

No founder allocation, circulating supply, float, market capitalization, or unlock schedule should be invented. Any vesting promise must be enforced by a verifiable lock/vesting contract or clearly labelled as a non-binding policy commitment. Publish unlock dates and on-chain balances.

## 6. Creator revenue and treasury

A draft creator-economics policy proposes allocating **net fee revenue after taxes and mandatory reserves** as follows:
- 60% creator compensation;
- 25% product development, infrastructure and support;
- 10% security, audit, bug bounty and compliance;
- 5% contingency reserve.

This is a proposal, not a deployed automatic split, earned balance, or guarantee. Gross customer payments are not profit. Publish periodic financial statements that distinguish gross receipts, fee receipts, taxes, refunds, expenses, reserves, actual creator payments, and remaining treasury balances.

Treasury design should use separate creator-fee and operating wallets, independent signers, hardware security, multisig approval, and public reconciliation. User deposits must not be commingled with discretionary creator funds.

## 7. Governance

ZENTRAX proposes a **hybrid governance model**:
- The pseudonymous creator proposes product direction and coordinates ordinary product work.
- The community participates in material decisions about future token economics, treasury policy, ecosystem grants, and governance changes.
- A 2-of-3 or stronger independent multisig executes treasury actions.
- Material economic or contract changes require public proposal, technical/legal review, a disclosed vote, a timelock, and a public transaction record.

The creator must not have undisclosed unilateral powers to mint, confiscate, blacklist, freeze ordinary holders, change settled transactions, or redirect user deposits. The final governance contracts and voting parameters are not yet deployed. Token-weighted governance has concentration and Sybil risks and must disclose them.

## 8. Technical architecture

The intended architecture is modular:

1. **ANT token contract:** fixed-supply EVM token; exact implementation and privileges to be verified from deployed bytecode.
2. **Sale contract:** testnet design for USDT payment, fee routing, and atomic ANT delivery.
3. **Backend API:** authenticated wallet/session and order-history services; authorization derived from verified identity/JWT rather than client-supplied user IDs.
4. **Database:** Supabase/Postgres for orders, chain events, accounting ledger, audit logs, and indexer checkpoints. Database migrations must be applied and verified before production use.
5. **Chain indexer:** reads canonical finalized events, validates receipts and token transfers, handles RPC failover and chain reorganizations, and writes append-only accounting records.
6. **Web application:** ZENTRAX black-and-gold interface; clear testnet/mainnet network indicators and explicit transaction confirmation.
7. **Governance and treasury:** independent multisig and timelock; governance execution is disabled until contracts, signers, and policies are reviewed.
8. **Monitoring:** health checks, RPC/indexer lag, oracle freshness, failed transactions, database health, reconciliation, and security incident alerts.

The testnet app currently has external configuration dependencies. A Render service being live does not prove that Supabase authentication, payments, database migrations, or chain contracts are operational.

## 9. Security model

Before mainnet:
- independent token, sale, oracle, and governance contract audits;
- verified official USDT contract and decimals on the target network;
- RPC failover, chain-ID checks, confirmation/finality thresholds, and reorg recovery tests;
- strict server-side authentication and role checks, MFA for privileged finance actions, and append-only audit trails;
- multisig treasury controls, signer independence, hardware wallets, recovery drills, and key-rotation plan;
- rate limits, anti-bot controls, input validation, dependency scanning, secrets scanning, monitoring, incident response, and bug bounty;
- end-to-end tests covering payment, fee split, token delivery, duplicate events, reorgs, refunds where supported, and ledger reconciliation.

No private keys, seed phrases, service-role keys, database URLs, or API secrets belong in this document, repository, browser, or chat.

## 10. Product roadmap

| Phase | Deliverables | Release condition |
|---|---|---|
| 0 — Testnet hardening | Stable web app, Supabase migrations, token/sale deployment, indexer, payment E2E, monitoring | Reproducible tests and verified testnet addresses |
| 1 — Independent review | Contract/oracle audit, remediation, threat model, legal review, governance review | Critical/high findings resolved and reports publishable |
| 2 — Mainnet readiness | Final allocation/vesting, multisig, legal issuer/representative, verified contracts, operational support | Explicit release approval and all launch gates passed |
| 3 — Controlled launch | Limited rollout, transparent disclosures, incident monitoring, public reporting | Operational metrics and reconciliation meet published thresholds |
| 4 — Ecosystem expansion | Analytics, membership/API, grants, and prediction-market modules | Each module separately tested and legally reviewed |

Roadmap dates are intentionally not promised until dependencies and responsible parties are confirmed.

## 11. Market integrity and risk disclosures

ANT may lose some or all of its value. It may be illiquid, volatile, unsupported in certain jurisdictions, or unavailable on exchanges. There is no guarantee of exchange listing, market-maker support, liquidity, price appreciation, revenue, or profit.

Users may lose funds through smart-contract vulnerabilities, wallet compromise, phishing, stablecoin depegs/freezes, RPC/indexer failures, governance attacks, market manipulation, or regulatory changes. Users are responsible for wallet security and should not transact funds they cannot afford to lose.

The project will not fabricate users, volume, partnerships, audits, listings, endorsements, or market data. It will not coordinate pump-and-dump activity, wash trading, spoofing, or retaliatory action against holders who sell.

## 12. Legal and geographic considerations

Token classification, public offering rules, financial promotions, exchange eligibility, AML/CFT, sanctions, consumer protection, privacy, tax, and prediction-market restrictions vary by jurisdiction and product. The project must obtain qualified legal and tax advice for each intended market before offering tokens or services. Geographic access controls must reflect legal analysis, not be treated as a substitute for it.

The public pseudonym ZENTRAX Creator does not replace a legal issuer, accountable applicant, or confidential KYC/beneficial-owner disclosure where required by an exchange or law.

## 13. Current status and evidence

As of this draft:
- Project name and ANT ticker are selected.
- BNB Smart Chain is the intended network.
- The repository contains testnet-oriented payment, accounting, API, and indexer implementation work.
- The current branch is not evidence of a production deployment.
- Supabase migrations have not been confirmed as applied to the user's project.
- Mainnet token and sale contracts are not deployed/verified.
- Independent audit and legal opinion are not available.
- Final allocation/vesting, legal issuer/applicant, KYC/UBO pack, market history, and exchange approvals are not established.
- No exchange listing application is confirmed submitted by this draft.

## 14. Contact and official resources

**Public project identity:** ZENTRAX Creator  
**Official website:** https://zentrax-ant-testnet.onrender.com (testnet preview only; not a production token website)  
**Source repository:** https://github.com/sutichung/sutichung  
**Exchange dossier:** docs/ZENTRAX_EXCHANGE_LISTING_READINESS.md

Replace this contact section with verified official project email, support channels, explorer links, and legal notices before public circulation.
