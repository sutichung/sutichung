# ZENTRAX / Ant Colony (ANT) — Master Completion & Acceptance Checklist

**Purpose:** one master register for delivering primary issuance, secondary spot markets, and tertiary institutional / OTC / derivatives capabilities, plus all supporting company, legal, technical, financial, security and operational work.

**Truth rule:** a document or code commit is not proof of a live service. Every item must be marked `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `READY FOR REVIEW`, or `VERIFIED LIVE`, with a named owner, timestamp and evidence link. `VERIFIED LIVE` requires independent evidence. No testnet, mock, simulated balance, placeholder approval or application submission may be described as production approval or live trading.

## 0. Current baseline and scope

- Brand: ZENTRAX. Token: Ant Colony (ANT). Intended initial chain in existing project: BNB Smart Chain (BEP-20).
- Existing project notes describe 200,000 fixed supply and a 5% sale commission. Treat these as draft parameters until verified against the actual source, deployed bytecode, issuer approvals and final disclosures. A sale commission is not automatically a secondary-market trading fee.
- USDT is the intended quote / collateral asset for relevant products; ANT remains the ecosystem token unless a separately approved change is documented.
- Three market workstreams are distinct: (1) primary issuance / subscription, (2) secondary spot trading, (3) tertiary institutional block / OTC and derivatives. Derivatives are not merely another spot pair.
- Launch jurisdiction(s) must be approved product-by-product. Do not assume that a token sale, spot exchange, custody, brokerage, OTC desk, prediction market and derivatives product share the same permissions.
- No real-money launch is authorized by this checklist. Default all real-money features, deposits, withdrawals, public offers and leverage to OFF until the applicable gates are evidenced.

## 1. Issuer, company and governance

- [ ] Identify the legal issuer, registered office, company number, beneficial owners, directors, authorized representatives and decision-making jurisdiction.
- [ ] Verify authority to issue ANT and sign exchange, banking, custody, audit and vendor contracts.
- [ ] Adopt board resolutions for token issuance, treasury policy, sale parameters, market launches, related-party transactions and emergency powers.
- [ ] Define governance: board / founders / token holders / independent oversight; clearly state what token holders do and do not control.
- [ ] Establish conflict-of-interest register, insider-trading policy, gifts policy, whistleblowing channel and related-party disclosure.
- [ ] Establish segregation of duties: no single person can propose, approve and execute treasury transfers or production releases alone.
- [ ] Define key-person succession, authorized signers, emergency contacts and delegated authority limits.
- [ ] Maintain corporate records, cap table, IP ownership, contractor assignments, trademark rights and open-source license inventory.
- [ ] Prepare audited or reviewed financial statements when required; establish accounting policies for token issuance, treasury assets, fees, liabilities and customer assets.

## 2. Legal, regulatory and jurisdiction controls

- [ ] Obtain written legal analysis for every target jurisdiction and each product: token issuance, marketing, sale, exchange, brokerage, custody, payment services, OTC, derivatives, prediction markets and staking if any.
- [ ] Classify ANT under applicable securities, commodities, payment, e-money, collective-investment, consumer and virtual-asset rules; reassess if rights or functionality change.
- [ ] Determine issuer registration, exchange/operator licensing, broker/intermediary, custody, money-transmission, payment and derivatives permissions as applicable.
- [ ] Review public-offer prospectus / disclosure exemptions, private placement limits, investor categorization, cooling-off, cancellation and refund rights.
- [ ] Review cryptoasset financial-promotion rules, advertising approvals, influencer/affiliate rules, risk warnings and geofencing obligations.
- [ ] Build a jurisdiction matrix: permitted / restricted / prohibited, product-specific, customer type, residency checks, IP/device signals, VPN handling and escalation.
- [ ] Implement sanctions screening, AML/CFT risk assessment, customer due diligence, enhanced due diligence, source-of-funds / wealth checks and suspicious activity escalation where legally required.
- [ ] Define transaction monitoring, wallet screening, Travel Rule applicability, record retention and regulator / law-enforcement response process.
- [ ] Complete privacy impact assessment, data controller / processor mapping, lawful basis, retention schedule, cross-border transfer review and data-subject request workflow.
- [ ] Review consumer rights, complaints handling, dispute resolution, accessibility, unfair terms, refunds, errors, service interruptions and insolvency disclosures.
- [ ] Review tax obligations for issuer, employees, token holders, sale proceeds, fees, treasury, withholding, VAT/GST and reporting in each jurisdiction.
- [ ] Obtain external counsel sign-off and keep dated opinions with explicit scope, assumptions, exclusions and jurisdictions.
- [ ] Never claim that an entity, token, platform or product is licensed, approved, insured or regulator-endorsed unless the exact claim is independently verified.

## 3. Token design and tokenomics

- [ ] Freeze token specification: chain ID, contract address, symbol, name, decimals, total supply, allocation, mint/burn policy and transfer rules.
- [ ] Reconcile tokenomics across contract code, whitepaper, website, sale UI, exchange forms, analytics and public announcements.
- [ ] Publish allocation table: community, sale, liquidity, team, advisors, ecosystem, treasury, incentives and reserve; disclose recipient wallets where appropriate.
- [ ] Publish vesting cliffs, linear unlock schedules, lock contracts, beneficiaries, revocation rules and on-chain proof.
- [ ] Disclose insider, team, market-maker, treasury and related-party holdings; publish material changes promptly.
- [ ] Specify utility with concrete product rights; do not imply profit, dividends, guaranteed buybacks, price floors or guaranteed listing unless legally valid and contractually enforceable.
- [ ] Define treasury spending policy, reserve ratio, signer threshold, transfer limits, timelocks and public reporting.
- [ ] Define supply change controls and prohibit undocumented minting or privileged supply changes.
- [ ] Define token migration, chain outage, bridge failure, lost-key, fork, reorg, exploit and emergency pause / recovery policies.
- [ ] Test token behavior for zero address, max allowance, fee-on-transfer incompatibility, non-standard tokens, decimals, dust, reentrancy and integer boundaries.

## 4. Smart contracts, chain and wallet engineering

- [ ] Maintain reproducible builds, pinned compiler/toolchain versions, dependency lockfiles and deterministic deployment scripts.
- [ ] Review token, sale, vesting, treasury, liquidity-lock, staking (if any), escrow and settlement contracts separately.
- [ ] Verify deployed bytecode against audited source and publish chain ID, deployment transaction, verified source and constructor arguments.
- [ ] Use multisig custody for treasury and privileged roles; hardware-backed signers, independent signers, threshold policy and tested recovery.
- [ ] Remove unnecessary owner privileges; document every remaining role, permission, timelock and revocation procedure.
- [ ] Complete independent audit by a qualified firm; publish scope, commit hash, deployed address, findings, remediation and retest evidence.
- [ ] Run static analysis, fuzzing, invariant tests, property-based tests, fork tests, adversarial tests and manual review.
- [ ] Add pause / circuit-breaker only where justified, with narrow scope, timelock, multisig, public disclosure and unpause policy.
- [ ] Protect against reentrancy, access-control errors, oracle manipulation, sandwich / MEV exposure, flash-loan attacks, replay, signature malleability and chain-specific hazards.
- [ ] Test RPC failover, archive access, chain reorg handling, nonce management, gas estimation, stuck transactions and event indexing.
- [ ] Provide wallet connection safety: chain verification, clear signing prompts, transaction simulation where possible, revoke-approval guidance and phishing warnings.
- [ ] Never request seed phrases or private keys. Keep secrets in managed secret stores; rotate credentials and audit access.

## 5. Market 1 — Primary issuance / subscription

- [ ] Select lawful issuance route: direct issuer sale, approved launchpad, regulated placement or other counsel-approved structure.
- [ ] Prepare final whitepaper / offering document, token rights, tokenomics, issuer disclosures, risk factors, conflicts, use of proceeds and refund policy.
- [ ] Design sale stages, caps, minimum / maximum subscriptions, eligibility, allocation method, oversubscription, whitelist and anti-bot controls.
- [ ] Define price source, quote currency, accepted networks, conversion timestamp, decimals, slippage, fees and failed-payment handling.
- [ ] Build identity / eligibility / sanctions / wallet screening before subscription when required.
- [ ] Make purchase confirmation explicit: token amount, total cost, fee, chain, recipient, vesting, refund terms and risks.
- [ ] Implement idempotent payment processing, confirmation thresholds, chain reorg handling, underpayment / overpayment and duplicate-payment reconciliation.
- [ ] Provide refund path for rejected, cancelled, failed or legally rescinded transactions; publish processing times and fees.
- [ ] Publish allocation events and reconcile sold tokens, remaining inventory, treasury receipts and vesting balances.
- [ ] Prevent sale start unless legal approval, audit, multisig, monitoring, support and emergency response gates all pass.
- [ ] No misleading scarcity, fake countdown, fake demand, hidden allocation, undisclosed insider discount or fabricated participation metrics.

## 6. Market 2 — Secondary spot trading

### DEX
- [ ] Choose supported DEX and chain only after contract and chain risk review.
- [ ] Approve pool pair, fee tier, initial liquidity amount, treasury source, LP ownership, lock duration and unlock disclosure.
- [ ] Publish pool contract, token contract, quote asset, chain ID, LP custody, liquidity depth and risks.
- [ ] Monitor pool depth, spread, price impact, concentration, abnormal swaps, MEV and liquidity removal.
- [ ] Define who may add/remove liquidity and require multi-party approval for treasury-funded liquidity.
- [ ] Do not wash trade, spoof, self-trade to inflate volume, fabricate holders or promise price support.

### CEX
- [ ] Prepare exchange due-diligence pack: issuer, ownership, legal opinion, tokenomics, audit, contract, chain, liquidity, holders, roadmap, security, market integrity and compliance.
- [ ] Submit only through each exchange's official listing portal and verify all follow-up contacts against the exchange's official domain.
- [ ] Track application, diligence, conditional approval, wallet integration, deposit enablement, withdrawal enablement, trading enablement and delisting status separately.
- [ ] Verify exact ANT contract address, supported chain, ticker collision, quote pair, minimum deposit, withdrawal fee and maintenance status.
- [ ] Negotiate market-maker arrangements transparently; disclose conflicts and prohibit wash trading or guaranteed-volume commitments.
- [ ] Never pay unofficial listing agents, personal wallets or guaranteed-listing brokers.
- [ ] Publish only official exchange announcement and live market URL after deposits and trading are actually enabled.

### Market quality
- [ ] Define price integrity, market surveillance, suspicious activity escalation, concentration limits and incident halts.
- [ ] Establish reliable reference prices across independent venues; exclude stale, thin or manipulated sources.
- [ ] Disclose spread, depth, slippage and volatility; do not describe thin liquidity as deep or stable.

## 7. Market 3 — Institutional, OTC and derivatives

### Institutional / OTC / block execution
- [ ] Decide whether service is principal, agency, RFQ matching, brokered, or merely a software tool; obtain legal approval for the actual role.
- [ ] Verify counterparties, beneficial owners, authority, sanctions, source of funds and risk limits.
- [ ] Define quote expiry, firm / indicative quote status, minimum size, settlement asset, settlement chain, fees and cancellation conditions.
- [ ] Use delivery-versus-payment or controlled escrow where lawful; define counterparty default and failed-settlement process.
- [ ] Record RFQ, quotes, acceptances, confirmations, settlement, fees and disputes in tamper-evident audit logs.
- [ ] Set exposure limits per counterparty, daily limits, concentration limits, credit policy and escalation thresholds.
- [ ] Do not custody, transmit or intermediate customer assets without required permissions and controls.

### Perpetuals / futures / options
- [ ] Use an eligible licensed derivatives venue; do not self-label a product as listed or regulated without written evidence.
- [ ] Obtain jurisdiction-specific permissions and customer categorization / suitability controls.
- [ ] Define index constituents, weighting, outlier filters, source availability, fallback, stale-price handling and manipulation controls.
- [ ] Define mark price, funding, margin tiers, maintenance margin, liquidation, insurance fund, ADL / backstop and settlement.
- [ ] Implement position / open-interest caps, leverage caps, concentration limits, circuit breakers and stress testing.
- [ ] Model gap risk, oracle failure, exchange outage, chain congestion, extreme volatility, negative equity and insolvency waterfall.
- [ ] Independent review of risk engine, liquidation engine, oracle, index and market surveillance before launch.
- [ ] Provide clear disclosures that leverage can cause rapid loss; no guaranteed returns or risk-free claims.
- [ ] Keep derivatives disabled until venue approval, legal permissions, liquidity and risk-engine gates are all verified.

## 8. ZENTRAX prediction market — separate product boundary

- [ ] Keep prediction-market YES / NO shares, order book, settlement, fees and user ledger separate from ANT token issuance and ANT spot markets.
- [ ] Define event rules, source hierarchy, resolution timestamp, dispute window, invalidation, cancellation, edge cases and appeal path.
- [ ] Use objective, independently verifiable resolution sources; log source snapshots and resolution decisions.
- [ ] Separate user collateral, platform fees, treasury and operational funds in ledger and custody.
- [ ] Enforce jurisdiction, age, product eligibility, AML and responsible-use restrictions based on legal review.
- [ ] Do not activate real-money prediction trading until the product's classification and permissions are confirmed; virtual credits must be unmistakably non-redeemable and non-transferable if used for demo.

## 9. Ledger, payments, treasury and accounting

- [ ] Implement immutable double-entry ledger with balanced journal entries, unique idempotency keys and append-only audit trail.
- [ ] Reconcile every deposit, withdrawal, trade, fee, refund, token allocation, custody balance and chain event.
- [ ] Maintain separate customer asset, issuer treasury, platform revenue, operating expense and liquidity accounts.
- [ ] Define settlement finality, confirmation count, pending / available / locked balances and reversal policy.
- [ ] Implement daily reconciliation, exception queues, aging reports and escalation for any unexplained difference.
- [ ] Never allow negative balances or silently overwrite historical balances; corrections must be compensating entries.
- [ ] Define hot / warm / cold wallet limits, withdrawal allowlists, velocity controls, dual approval and cooling-off for address changes.
- [ ] Publish proof-of-reserves only with clearly stated scope, liabilities, exclusions, date and independent attestation; do not equate wallet balances with solvency.
- [ ] Create accounting treatment for customer assets, fees, token inventory, sale proceeds, market-making inventory and treasury gains / losses.
- [ ] Plan bank / payment-provider onboarding, chargebacks, fiat rails, stablecoin depeg, issuer redemption and banking termination scenarios.

## 10. Security, privacy and fraud prevention

- [ ] Threat-model web, API, mobile, admin, CI/CD, cloud, smart contracts, wallets, vendors, RPC and market-data ingestion.
- [ ] Enforce MFA, least privilege, short-lived credentials, device controls, session expiry and admin IP / risk controls.
- [ ] Use secure SDLC: code review, dependency scanning, SAST, DAST, secret scanning, container scanning, SBOM and signed releases.
- [ ] Conduct independent penetration test and remediate critical / high findings before production.
- [ ] Add rate limits, bot detection, credential-stuffing defense, anti-phishing controls, CSRF / XSS / SSRF / injection protections and abuse monitoring.
- [ ] Encrypt data in transit and at rest; manage keys separately; rotate secrets; prevent PII in logs and analytics.
- [ ] Define data minimization, retention, deletion, access requests, breach notification and vendor data-processing agreements.
- [ ] Run bug bounty / vulnerability disclosure with safe-harbor scope and response SLA.
- [ ] Monitor wallet drainer, fake token, fake support, domain spoof, social account takeover and impersonation campaigns.
- [ ] Create incident severity matrix, on-call rotation, containment authority, evidence preservation, customer communications and postmortems.

## 11. Market data, oracle and analytics integrity

- [ ] For each feed store provider, instrument, market, venue, timestamp, received_at, sequence, license, latency and quality status.
- [ ] Prefer official / licensed market sources; record redistribution rights and exchange attribution requirements.
- [ ] Separate real-time, delayed, indicative, derived, simulated and test data in schema and UI; never blend without labels.
- [ ] Enforce freshness TTL, sequence-gap detection, duplicate suppression, outlier rejection and source quorum.
- [ ] If source is stale, unavailable, unlicensed or inconsistent, display unavailable / delayed and block price-sensitive execution rather than inventing values.
- [ ] Build oracle manipulation defenses: TWAP / median where appropriate, liquidity minimums, independent sources, deviation bounds and fallback policy.
- [ ] Store immutable market snapshots for audit, execution reconstruction, settlement and performance calculations.
- [ ] Backtest without look-ahead bias, survivorship bias or synthetic fills; label assumptions, fees, slippage and missing data.
- [ ] Show data provenance and last-updated time in every market view; alert when data quality degrades.

## 12. Platform engineering, deployment and reliability

- [ ] Separate local, test, staging and production environments; use distinct chain IDs, credentials, databases and wallet keys.
- [ ] Document architecture, service ownership, API contracts, schema migrations, dependencies and data-flow diagrams.
- [ ] Add health, readiness and liveness endpoints; dependency checks; structured logs; trace IDs and error budgets.
- [ ] Use database backups, point-in-time recovery, tested restore drills, migration rollback and data retention.
- [ ] Define SLOs for uptime, API latency, quote freshness, order acceptance, settlement and support response.
- [ ] Load test normal, peak, burst and adversarial traffic; test queue backlogs, database exhaustion and provider rate limits.
- [ ] Use queues / workers for background jobs with retries, dead-letter queues, idempotency and poison-message handling.
- [ ] Configure autoscaling and capacity alerts; avoid single-instance assumptions for critical stateful services.
- [ ] Use CDN / WAF / DDoS protection, DNS redundancy, TLS, secure headers and domain / certificate renewal monitoring.
- [ ] Test deployment rollback, blue-green / canary release, feature flags and database compatibility.
- [ ] Ensure background market updates do not depend on a user keeping a browser or phone open.
- [ ] Publish status page and incident history; do not hide degraded service states.
- [ ] Reconcile the intended Git branch, deployed commit, build artifact, environment variables and migrations before claiming a deployment.

## 13. Web, mobile, accessibility and customer experience

- [ ] Verify desktop, iOS Safari, Android Chrome, common screen sizes, slow networks and in-app browsers.
- [ ] Test first load, refresh, deep links, authentication redirects, session expiry, cached assets, service worker and offline recovery.
- [ ] Provide accessible contrast, keyboard navigation, screen-reader labels, scalable text, localization and clear error messages.
- [ ] Show chain, network, asset, amount, fees, execution state and risk before confirmation.
- [ ] Provide transaction history, export, statements, fee breakdown, status tracking and support ticket references.
- [ ] Prevent misleading dark patterns, hidden fees, fake urgency and confusing demo/real-money presentation.
- [ ] Support language, timezone, currency display, number formatting and regional disclosures.
- [ ] Maintain help center, status page, FAQs, onboarding, complaint handling and account recovery.

## 14. Customer operations and business continuity

- [ ] Establish customer support hours, severity routing, response targets, escalation and complaint ownership.
- [ ] Create procedures for account takeover, lost device, mistaken deposit, wrong network, delayed withdrawal and disputed trade.
- [ ] Define customer asset recovery limits honestly; never promise recovery where keys or chain finality make it impossible.
- [ ] Maintain business continuity plan, disaster recovery plan, recovery time objective and recovery point objective.
- [ ] Run tabletop exercises for key compromise, chain halt, stablecoin depeg, exchange failure, oracle attack, data breach and insolvency.
- [ ] Maintain vendor inventory, criticality tier, SLA, data access, subcontractors, exit plan and concentration-risk review.
- [ ] Prepare staff training for AML, privacy, security, market abuse, customer vulnerability and incident reporting.

## 15. Listing and market-data provider workflow

- [ ] Maintain a single source of truth for issuer details, token contract, decimals, supply, chain, official website, explorer and social accounts.
- [ ] Apply to exchanges only through official portals; store receipt IDs, dates, requested documents, contacts and decision status.
- [ ] Treat CEX application, conditional approval, wallet integration, deposits, withdrawals and active trading as separate states.
- [ ] Apply to CoinGecko / CoinMarketCap and terminal providers separately; data-page inclusion is not an exchange listing.
- [ ] Confirm exact contract address and chain on every public data page; report impersonator tokens.
- [ ] Track market-maker contracts, fee disclosures, inventory ownership, performance and conflicts.
- [ ] Keep a public delisting / suspension response plan and customer notice process.

## 16. Communications, brand and growth

- [ ] Publish a factual website, whitepaper, docs, roadmap, tokenomics, risk disclosures, team / issuer details and contact channels.
- [ ] Verify domains, social handles, email domain security (SPF, DKIM, DMARC) and official announcement channels.
- [ ] Use approved, substantiated claims only; disclose paid promotions, affiliates, sponsorships and conflicts.
- [ ] Prohibit fake endorsements, fake partnerships, fake user counts, fake volume, misleading screenshots and fabricated exchange logos.
- [ ] Maintain public changelog, security advisories, treasury reports, unlock calendar and incident notices.
- [ ] Create crisis communications templates for exploit, listing delay, market halt, regulatory inquiry and service outage.

## 17. Metrics, audit and ongoing governance

- [ ] Define operational KPIs: availability, quote freshness, failed transactions, settlement time, reconciliation breaks, withdrawal queue, support backlog and incident MTTR.
- [ ] Define market integrity KPIs: spread, depth, concentration, volatility, abnormal trading, venue divergence and oracle deviation.
- [ ] Define financial KPIs with source and methodology: revenue, costs, treasury exposure, liquidity runway and liabilities.
- [ ] Do not publish vanity metrics as proof of adoption; distinguish holders, active users, funded accounts, trading users and unique wallets.
- [ ] Schedule smart-contract re-audits after material changes; repeat penetration tests and vendor reviews.
- [ ] Conduct quarterly access review, treasury review, incident review, disaster recovery test and compliance control testing.
- [ ] Preserve evidence for audits, regulators, tax, exchange diligence and disputes.

## 18. Exit, suspension and wind-down

- [ ] Define conditions for stopping sales, suspending deposits / withdrawals, halting trading and disabling products.
- [ ] Publish emergency authority, notice channels, customer treatment and restart criteria.
- [ ] Define insolvency, issuer closure, key-person loss, vendor termination, chain abandonment and token migration plans.
- [ ] Define treatment of remaining sale inventory, treasury, locked tokens, LP positions, customer claims and unclaimed balances.
- [ ] Maintain data export, records retention, customer communications and legal obligations after shutdown.

## 19. Stage gates — no skipping

| Gate | Evidence required | Current state |
|---|---|---|
| G0 — Website / identity | Reproducible mobile and desktop smoke tests; exact deployed commit | BLOCKED: mobile failure report / reproduction still needed |
| G1 — Testnet baseline | Chain ID, deployment tx, verified source, test wallets, test report | NOT VERIFIED in this register |
| G2 — Issuer readiness | Entity, authority, ownership, governance, counsel scope | BLOCKED: issuer evidence needed |
| G3 — Security readiness | Independent audit, penetration test, remediation and retest | BLOCKED |
| G4 — Primary market | Approved offer, disclosures, eligibility, sale tests, refund and reconciliation | BLOCKED |
| G5 — Secondary DEX | Mainnet contract, liquidity policy, pool, monitoring and legal review | BLOCKED |
| G6 — Secondary CEX | Individual exchange approval and official active market | NOT SUBMITTED / NOT APPROVED |
| G7 — Tertiary OTC | Permission, counterparty framework, settlement and operational controls | NOT IMPLEMENTED |
| G8 — Derivatives | Venue approval, permissions, oracle/index, risk engine and stress tests | NOT IMPLEMENTED |
| G9 — Production operations | SLOs, monitoring, backups, restore drill, incident response and support | NOT VERIFIED |

## 20. Evidence format and completion discipline

For each checklist item record:

- Unique ID and exact requirement.
- Status from the five allowed statuses.
- Responsible owner and independent reviewer.
- Jurisdiction / product / environment scope.
- Commit SHA, CI run, deployment ID, chain ID, transaction hash, contract / pool address, audit report, legal opinion, application receipt or official listing URL as applicable.
- Test steps, expected result, actual result, timestamp and failure notes.
- Expiry / re-review date for legal, security, vendor and exchange evidence.

Never mark a task complete because a document exists. Never deploy to production merely because CI passed. Never open real-money functionality merely because a smart contract compiles. Never claim a market is live until an independent user-facing test and authoritative external evidence confirm it.

## 21. Immediate next actions

1. Reproduce the website load failure on the exact failing URL and device; capture HTTP status, browser console, request ID and Render request / application logs.
2. Confirm the deployed service branch and commit match the intended ZENTRAX application branch; review migrations and secrets before any branch switch or deployment.
3. Verify the actual ANT token contract source and testnet deployment evidence; reconcile all tokenomics against code.
4. Create a requirements-to-code map and implement only the next safe testnet milestone; do not add real-money switches without legal and security approvals.
5. Prepare issuer, legal, audit and exchange due-diligence data room with truthful documents and evidence.
6. Run the stage gates in order: primary issuance, secondary spot, then OTC / derivatives; parallelize documentation and vendor diligence where safe.

**Current document status:** planning / requirements only. This file does not certify that any audit, license, deployment, sale, liquidity pool, exchange listing, OTC service or derivatives product exists or is approved.