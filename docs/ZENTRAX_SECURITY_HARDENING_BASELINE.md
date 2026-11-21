# ZENTRAX Security Hardening Baseline

Status: security review and release-gate proposal. This document is not an audit certificate and does not mean the controls below are implemented or that the network is secure.

## Security objective

Use defense in depth across the ANT application today and the future ZENTRAX sovereign L1. Assume that any single account, API, RPC provider, validator, dependency, or operator may be compromised. No single key or administrator should be able to drain treasury funds, mint arbitrary supply, rewrite balances, or silently change critical protocol parameters.

No system can guarantee that intrusion is impossible. The release standard is independently tested prevention, detection, containment, recovery, and transparent disclosure.

## Findings from the current ant-token-testnet branch review

1. **The current repository is not the ZENTRAX L1 implementation.** It contains a web application and BSC testnet ANT payment integration. There is no ZENTRAX genesis, consensus client, validator network, or L1 protocol to audit yet.
2. **The API uses the Supabase service-role key for database REST operations.** This key bypasses ordinary row-level security enforcement. Every query and mutation therefore needs explicit ownership/role predicates, least-privilege database functions, and negative authorization tests. Never expose this key to browsers.
3. **The wallet-link and payment API has a duplicated GET /api/ant/orders handler in the reviewed source.** Remove duplicate route code and maintain one canonical authorization-tested implementation before treating the API as production-ready.
4. **The Docker build currently runs npm install and records npm audit output with '|| true'.** This records findings but does not fail the build when vulnerabilities are present. Release CI must use the lockfile reproducibly and fail on agreed severity thresholds; exceptions must be documented and time-limited.
5. **The current deployment and payment path is BSC testnet-only (chain ID 97).** Testnet configuration and a live web service are not evidence of mainnet security, a completed contract audit, or safe custody.
6. **The current contract, database, RPC, deployment-secret, and production environment settings have not been independently verified in this review.** Treat all as unverified until evidence is collected.

## P0: block mainnet and real-money activity until complete

- Keep mainnet deployment, real USDT acceptance, public token sale, bridges, and exchange representations disabled.
- Obtain independent smart-contract audits from qualified firms; publish scope, commit hash, compiler settings, deployed bytecode match, findings, fixes, and retest results.
- Use two independent multisig safes for treasury and protocol administration. Minimum 3-of-5 for high-impact treasury actions; signers must be independent people/devices and geographically separated. Use hardware wallets and verified recovery procedures.
- Separate roles and keys: deployer, proxy/admin (if any), treasury, fee receiver, oracle publisher, validator, CI deploy identity, and application runtime. Never reuse one private key.
- No private keys, seed phrases, service-role keys, RPC credentials, or database passwords in source, logs, browser bundles, chat, or CI output. Use managed secret stores; rotate exposed credentials immediately.
- Require timelocks and public on-chain announcements for upgrades, ownership changes, parameter changes, and treasury transfers. Emergency pause must be narrowly scoped, transparent, time-bounded, and unable to confiscate user balances.
- Verify token supply invariants: fixed cap, no hidden mint path, no arbitrary balance editing, no privileged transfer seizure, and no undocumented tax or blacklist.
- No unaudited bridge, cross-chain message relayer, upgrade proxy, or oracle-controlled minting.
- Complete legal, custody, incident-response, and recovery review before any mainnet or listing application.

## P1: smart-contract engineering controls

- Prefer minimal, non-upgradeable contracts where practical. If upgradeability is essential, disclose it, put upgrades behind multisig + timelock, and test storage-layout compatibility.
- Use checks-effects-interactions, reentrancy protection where applicable, strict access control, SafeERC20, bounded loops, checked arithmetic, and explicit pause/recovery semantics.
- Add invariant/property/fuzz tests for total supply, balances, fees, accounting conservation, replay resistance, nonce uniqueness, authorization, oracle staleness, rounding, and reorg/retry behavior.
- Test malicious tokens, fee-on-transfer tokens, decimals mismatch, stale/manipulated oracle values, front-running, sandwiching, reentrancy, duplicate submissions, chain reorgs, RPC disagreement, and partial outages.
- Verify deployed bytecode and constructor/immutable configuration against the reviewed source. Publish contract addresses only after verification.

## P1: API, identity, and database controls

- Treat the service-role key as a root credential. Prefer narrowly scoped database RPCs or a dedicated backend role; where service-role use remains, require explicit tenant/user predicates for every read/write and test cross-user access denial.
- Validate Supabase JWTs through the Auth server or trusted JWT verification with issuer, audience, expiry, and signature checks. Do not authorize based on unverified decoded claims.
- Require phishing-resistant MFA for administrators; require fresh AAL2 sessions for financial/admin actions. Separate finance read-only from payment, deployment, and governance permissions.
- Enforce per-route rate limits, request-size limits, schema validation, CSRF/origin controls where cookie auth is used, strict CORS, security headers, and safe error messages.
- Make wallet challenges one-time, short-lived, domain-bound, chain-bound, and atomically consumed. Add race-condition tests and unique database constraints.
- Add idempotency keys and database uniqueness constraints to payment/order processing. Reconcile every credited token against canonical finalized chain events.
- Keep append-only security/audit logs with actor, action, target, timestamp, request ID, and outcome. Never log secrets or full auth tokens.

## P1: supply chain, build, and deployment

- Use npm ci with a committed lockfile; fail CI on critical/high dependency vulnerabilities unless a documented, approved exception exists.
- Enable GitHub secret scanning, push protection, Dependabot alerts/updates, branch protection, required reviews, and signed/reproducible release artifacts.
- Pin GitHub Actions to reviewed full commit SHAs; grant workflow permissions least privilege; use OIDC short-lived deployment credentials instead of long-lived cloud keys where supported.
- Build once, produce an SBOM, scan container images, sign artifacts, and deploy only the exact artifact that passed tests.
- Run as non-root, use a minimal patched base image, drop unnecessary Linux capabilities, use read-only filesystem where possible, and keep runtime dependencies minimal.
- Separate devnet, testnet, and mainnet credentials and projects. No automatic mainnet deploy from a normal branch push.

## P1: ZENTRAX L1 consensus and validator controls

- Pin audited versions of the Cosmos SDK, CometBFT, and Cosmos EVM stack; review licenses, upgrade paths, security advisories, and known limitations before adopting.
- Run adversarial multi-node tests: Byzantine validators, equivocation, validator churn, network partitions, delayed messages, state sync corruption, snapshot poisoning, chain halt, and coordinated upgrades.
- Distribute validators across independent operators, providers, regions, and jurisdictions. Do not let the creator or one hosting provider control consensus.
- Publish validator onboarding, key rotation, slashing, unbonding, recovery, and incident procedures. Use hardware-backed signing keys and remote signer/HSM support where practical.
- Require independent client implementations or strong differential testing where feasible; publish reproducible genesis and chain configuration.
- Add public RPC rate limits, archive-node separation, peer allowlists only where operationally justified, DDoS protection, telemetry, and abuse monitoring.

## P1: monitoring and incident response

- Monitor contract events, privileged calls, multisig proposals, validator voting power, missed blocks, double-sign evidence, RPC divergence, abnormal withdrawals, API authentication failures, database privilege changes, and secret access.
- Alert multiple independent responders. Keep immutable off-site logs and tested backups.
- Prepare a runbook for key compromise, suspected exploit, chain halt, oracle failure, RPC compromise, database breach, and dependency zero-day.
- Practice tabletop exercises and restore tests. Publish a vulnerability disclosure policy and a public bug bounty before mainnet.

## Mandatory release gates

A release cannot be called production-secure until all relevant gates have evidence:

- [ ] Threat model and attack-surface inventory reviewed.
- [ ] All P0 findings closed and independently retested.
- [ ] Contract audit(s) completed; all critical/high findings fixed and retested.
- [ ] Fuzz, invariant, integration, reorg, and adversarial network tests pass.
- [ ] Multisig signers and recovery process independently verified.
- [ ] Secrets scan clean; credential rotation and least-privilege review complete.
- [ ] CI dependency, source, and container scans pass.
- [ ] API authorization tests prove cross-user and non-admin access is denied.
- [ ] Database RLS/policies and service-role exposure reviewed.
- [ ] Monitoring, alert routing, incident response, backups, and restore drills tested.
- [ ] Independent validators operate the public testnet for a defined soak period.
- [ ] Legal and operational sign-off completed.
- [ ] Mainnet launch decision publicly documented.

## Current status

This review is static and limited to source files fetched from the ant-token-testnet branch. It is not a penetration test, contract audit, live configuration inspection, or proof of deployed behavior. No code remediation, database migration, secret rotation, external audit, or production control change is claimed by this document. Mainnet remains blocked.
