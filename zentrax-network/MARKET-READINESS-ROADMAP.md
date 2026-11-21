# ZENTRAX / ANT — Market Readiness Roadmap

Status: planning and test-only. This document is not an offer, solicitation, prospectus, investment recommendation, or confirmation of legal approval.

## Scope boundary

This roadmap applies only to ZENTRAX / ANT. It must not be merged into, deployed with, or share runtime secrets, databases, or production configuration with Taiwan Stock Hunter.

The current engineering specification recorded for ANT is a proposed fixed supply of 200,000 tokens with 18 decimals. Treat this as a specification to verify against the actual reviewed contract; it is not proof that tokens have been minted or issued. No live sale, deposits, custody, or public trading is enabled.

## Market stages

### Stage 1 — Primary-market readiness (first priority)

Goal: prepare a legally reviewable, technically testable issuance package. No real-money subscription may be enabled until legal eligibility, required registrations/licences, disclosures, contract audit, custody/payment controls, and age/identity requirements have been independently confirmed.

Deliverables:
- Final token specification: chain, contract standard, decimals, supply cap, mint/burn permissions, pause/blacklist powers, upgradeability, admin roles, and immutable vs changeable parameters.
- Allocation schedule: creator/team, ecosystem, community, treasury, liquidity, and any sale allocation. Percentages, vesting, cliffs, unlock dates, and wallet addresses remain unapproved until explicitly reviewed and documented.
- Subscription workflow in test mode only: eligibility gate, order idempotency, allocation limits, payment state machine, cancellation/refund path, reconciliation, audit trail, and incident handling.
- Offering pack: technical paper, tokenomics, use of proceeds, risk factors, conflicts, governance, treasury policy, vesting schedule, and plain-language disclosures.
- Security package: independent contract review, multisig policy, key ceremony, timelock policy, monitoring, emergency pause runbook, and incident response.
- Compliance gate: qualified local counsel determines permitted jurisdictions, issuer eligibility, investor eligibility, required filings/approvals, marketing restrictions, AML/sanctions obligations, tax, and custody/payment requirements.

Exit criteria:
- All token parameters match deployed, verified contract bytecode and source.
- No unresolved critical/high security findings.
- Legal/compliance sign-off is documented for the exact issuer, instrument, jurisdictions, and distribution method.
- Test subscription, cancellation, refund, and reconciliation pass end-to-end.
- Explicit authorized release decision is recorded. Until then, production sale switches remain OFF.

### Stage 2 — Secondary-market readiness

Goal: prepare for independent market access only after Stage 1 has been lawfully completed.

Deliverables:
- Exchange due-diligence data room: legal opinions, corporate/issuer documents, ownership and control disclosures, audited contract, token distribution, vesting, treasury and market-maker disclosures.
- Technical integration pack: chain/RPC reliability, explorer verification, deposit/withdrawal monitoring, confirmations, reorg handling, wallet compatibility, incident contacts, and token metadata.
- Market integrity controls: prohibit wash trading, spoofing, undisclosed paid promotion, artificial volume, insider dealing, and misleading liquidity claims.
- Listing applications are submissions only; no exchange listing is guaranteed or implied.

Exit criteria:
- Written exchange approval and completed listing agreement for each venue.
- Deposit/withdrawal and monitoring tests pass with the venue.
- All public statements match actual exchange status.

### Stage 3 — Broader market and ecosystem readiness

Goal: expand responsibly after real operational history exists.

Deliverables:
- Additional venues and jurisdictions reviewed independently rather than bulk-submitted indiscriminately.
- Ecosystem integrations, developer documentation, public APIs, wallet support, governance transparency, and treasury reporting.
- Ongoing security monitoring, bug bounty, incident drills, reserve/liquidity disclosures, and periodic independent reviews.
- Market-quality metrics based on organic activity; never manufacture volume or promise price performance.

Exit criteria:
- Each new venue/jurisdiction has its own approval and compliance record.
- Operational, security, and disclosure controls remain effective at increased scale.

## Non-negotiable release controls

- Default all sale, transfer, bridge, and public-deposit features to disabled until separately approved.
- Never request or store a user's seed phrase or private key.
- Use multisig and least-privilege roles; do not give one creator account unilateral custody of user funds.
- Publish admin powers and upgrade controls; do not hide mint, blacklist, pause, tax, or seizure capabilities.
- No guaranteed returns, price targets, artificial scarcity claims, or claims of exchange acceptance.
- Testnet success is not mainnet readiness; a code commit or CI pass is not an audit or regulatory approval.
- If issuer age/capacity or authorization is uncertain, restrict work to non-commercial testnet and documentation.

## Current blockers / evidence required

- Four-validator devnet must pass runtime consensus and EVM RPC acceptance.
- Actual ANT contract deployment, address, verified source, and on-chain supply must be independently checked; no address or transaction hash is assumed here.
- Database migrations, RPC credentials, and indexer must be validated before enabling indexing.
- No sale, mainnet deployment, or exchange listing is currently certified by this roadmap.
