# Ant Colony (ANT) — Operations, Launch and Binance Futures Readiness

> Status: engineering plan and acceptance criteria. This document is not evidence of deployment, audit, exchange approval, legal clearance, market liquidity, or sales availability.

## Product baseline

- Token: Ant Colony (ANT), fixed initial supply 200,000, 18 decimals, BNB Smart Chain.
- Token contract: burnable, no mint, owner, pause, blacklist, tax, or privileged transfer controls.
- Distribution: initial supply to a separately verified Safe multisig.
- Sale economics: 5% of gross BSC USDT payment to fee Safe; 95% net payment determines ANT output; ANT delivery and both USDT transfers must settle atomically.
- Sale contract configuration (USDT, ANT, oracle, fee Safe, proceeds Safe, max oracle age) is immutable. Changing configuration requires a new reviewed deployment and public migration notice.
- No market price is promised. If an independently verifiable, sufficiently liquid ANT/USDT price source is unavailable or stale, the sale must fail closed.

## Delivery gates

### Gate 0 — repository and build integrity

- Keep all changes on the dedicated ANT testnet branch and in a draft PR until tests and reviews pass.
- CI must compile all Solidity contracts and execute every test file under `test/**`.
- CI must separately run backend tests and production frontend build.
- Pin dependencies with a committed lockfile; review dependency audit findings rather than suppressing them.
- A green CI run is necessary, not a smart-contract security audit.

### Gate 1 — token and sale contract verification

- Verify fixed supply, 18 decimals, burn semantics, no privileged token functions, and exact initial Safe recipient.
- Verify sale constructor rejects zero addresses, unsupported USDT decimals, and invalid oracle age.
- Cover 6-decimal and 18-decimal USDT, fee rounding, zero-output rounding, stale/future/zero oracle data, slippage, insufficient inventory, failed ERC-20 transfers, and atomic rollback.
- Confirm fee and proceeds destinations are separate, immutable Safe addresses controlled by the project.
- Test with a fork or independently configured BSC testnet token contracts where possible. Mock tokens and mock oracles are test-only.
- Record compiler version, optimizer settings, source commit, bytecode, deployment transaction, chain ID, contract addresses, verification URLs, and post-deployment reads.

### Gate 2 — testnet operation

- Verify BSC testnet Safe addresses and signer threshold independently.
- Use a separate deployer EOA funded only with testnet tBNB. Never use a Safe signer key as the deployer.
- Deploy ANT to BSC testnet, verify source, and prove total supply and Safe balance on chain.
- Deploy sale only after a testnet oracle adapter is explicitly configured and validated. Do not use a mock price feed outside tests.
- Exercise purchase end-to-end with test tokens: approve, quote, buy, verify buyer ANT balance, verify 5% and 95% USDT recipients, and reconcile emitted logs.
- Test RPC failover, transaction replacement, duplicate event ingestion, confirmation depth, chain reorg handling, and recovery after worker restart.

### Gate 3 — production oracle and liquidity

- A production oracle must be manipulation-resistant and independently reviewed. Preferred design is a sufficiently liquid AMM TWAP with a defined observation window, minimum liquidity/observation coverage, bounded update age, and circuit breakers.
- Do not use a single spot swap, thin-pool last trade, arbitrary admin-entered price, or mock oracle as the production sale price.
- Validate price units (USDT per ANT, 8-decimal oracle answer), USDT decimals, token decimals, and rounding with independent test vectors.
- If liquidity, TWAP observations, or oracle health are inadequate, disable sales. No manual price override.
- Publish the price source, methodology, observation window, freshness and failure policy.

### Gate 4 — member and finance operations

- Supabase Auth remains the identity provider. Keep service-role credentials server-side only.
- Bootstrap SUPER_ADMIN using a one-time controlled allowlist process; verify account ownership and MFA before granting the role. Do not allow public self-assignment or trust a browser-supplied role.
- Roles: SUPER_ADMIN, FINANCE_VIEWER, SUPPORT, MEMBER. SUPPORT cannot change roles, move treasury funds, or view secrets. FINANCE_VIEWER is read-only.
- Wallet connection must use a signed nonce with domain, chain ID, expiry and one-time consumption; never request private keys or seed phrases.
- Store an append-only transaction ledger keyed uniquely by (chain_id, tx_hash, log_index). Treat browser callbacks as untrusted; only verified on-chain logs count as paid.
- Record gross USDT, fee, net, ANT output, oracle price, token addresses, buyer wallet, block number, confirmation state and reconciliation status.
- Reconcile sale events against USDT Transfer events and balances. Alert on missing, duplicate, reverted, orphaned or mismatched events.
- Provide member transaction history, finance exports, role audit trail, security events, rate limits, session expiry and MFA.

### Gate 5 — production security and legal review

- Independent smart-contract audit and remediation; publish report and commit/bytecode correspondence.
- Threat-model wallet signatures, nonce replay, CSRF, XSS, admin takeover, service-role leakage, RPC spoofing, oracle manipulation, reorgs, event duplication and denial of service.
- Verify official BSC USDT contract address and decimals from authoritative sources at deployment time; never accept a lookalike token.
- Complete jurisdiction-specific legal review for token sale, custody, marketing, AML/KYC, sanctions, consumer disclosures, tax and licensing before accepting real funds.
- Production deployment requires an explicit founder approval after all gates. No private key or seed phrase may be sent in chat, stored in GitHub, or placed in frontend variables.

## Listing Readiness Center — measurable, evidence-backed metrics

Collect and retain timestamped evidence, not promotional estimates:

- On-chain: circulating and total supply, holders, holder concentration, active holders, transfer count, burn amount, contract age, verified contract links.
- Market: independently sourced 24h/7d/30d volume, unique trades, venue coverage, bid/ask spread, depth at fixed price bands, slippage for representative order sizes, liquidity-pool TVL and concentration.
- Community: verified members, weekly/monthly active members, retention cohorts, organic referral sources, moderation incidents and bot/spam filtering.
- Product: releases, uptime, API error rate, incident history, active wallets, completed utility actions and support response time.
- Security/compliance: audit status, unresolved findings, bug bounty status, incident disclosures, legal review status and jurisdiction restrictions.
- Evidence: source URL/provider, collection timestamp, time zone, raw response hash, methodology, freshness, and confidence/limitations.

Never fabricate volume, holders, users, partnerships, audits, exchange interest, or token utility. Exclude wash trading, self-trading, paid fake followers and coordinated price manipulation. Publish methodology and disclose paid promotion.

## Binance Futures preparation

- Maintain a factual project dossier: team and contact verification, token contract and chain, tokenomics, vesting/allocations, treasury policy, product usage, security audits, legal/compliance status, market venues, liquidity and community analytics.
- Maintain verified weekly and monthly metrics with source evidence and methodology.
- Prepare concise product demo, roadmap, incident/security disclosures, token distribution analysis, market-maker/liquidity disclosures and risk factors.
- Submit through Binance's official channels only. Do not pay brokers or agents claiming guaranteed listing.
- Binance controls all listing decisions and may request additional information. No public fixed metric threshold guarantees Futures listing.
- No listing promise, timetable or price target may be advertised.

## Launch status ledger

| Workstream | Current verified state |
|---|---|
| Fixed-supply ANT contract | Implemented in repository; CI previously passed token compile/tests |
| 5% USDT sale contract | Implemented; 6/18-decimal, zero-output and atomic rollback tests added; token CI passed on commit 9aae7ff; latest backend CI pending |
| Production oracle | Not implemented/approved |
| Testnet deployment | Not yet performed |
| Safe addresses | Not yet supplied/verified |
| Member auth | Existing Supabase Auth plus ANT wallet nonce/signature API committed; runtime configuration and end-to-end tests pending |
| ANT wallet/order API | Wallet linking, on-chain quote/order creation, tx submission validation and order lookup committed; activation pending |\n| ANT member purchase UI | Not yet implemented |
| Persistent payment ledger schema | Payment, audit, wallet and indexer migrations committed; not yet applied to Supabase |
| On-chain event indexer | Dual-RPC testnet indexer, receipt reconciliation, reorg handling and gated 5-minute GitHub workflow committed; disabled pending configuration and end-to-end verification |
| Finance/admin API | Role-gated finance endpoint committed; visual ANT finance dashboard not yet implemented |
| Independent audit | Not performed |
| Mainnet sale | Disabled / not deployed |
| Binance Futures | Preparation only; no application or approval claimed |

## Operating principles

- Report the exact commit, CI run, deployment ID, chain ID and transaction hash for every completed step.
- If an upstream provider, database, oracle or deployment secret is unavailable, report the blocker and keep the affected feature disabled.
- Do not describe code committed to a branch as deployed production functionality.
- Never move, mint, burn, sell or transfer real assets without explicit authorization and verified transaction details.
