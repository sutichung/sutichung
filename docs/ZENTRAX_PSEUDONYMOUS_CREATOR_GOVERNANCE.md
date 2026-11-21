# ZENTRAX — Pseudonymous Creator & Hybrid Governance Charter

**Version:** 0.1-draft  
**Public creator identity:** ZENTRAX Creator  
**Governance model:** Hybrid  
**Status:** Design proposal; not legal advice or evidence of a deployed DAO.

## 1. Identity model

ZENTRAX uses **ZENTRAX Creator** as its public-facing creator identity. Public project materials may use this pseudonym and need not publish the creator's personal home address, identity documents, or other private personal data.

Pseudonymity is not a promise of untraceability and does not exempt anyone from applicable law. Exchanges, banks, payment providers, auditors, tax authorities, courts, or regulators may require confidential identity verification, beneficial-owner information, sanctions screening, or an accountable legal representative. Provide accurate information through verified, secure official channels when required. Never fabricate an entity, representative, biography, KYC record, or authorization.

**Public disclosure standard:** publish the project's control model, treasury addresses, token allocations, conflicts of interest, governance powers, security incidents, and material decisions. Do not publish private identity documents or sensitive personal data.

## 2. Role separation

| Role | Public identity | Authority |
|---|---|---|
| Creator | ZENTRAX Creator (pseudonym) | Proposes roadmap and product priorities; may hold disclosed token allocations and a disclosed creator treasury role. |
| Protocol multisig | Public signer aliases and on-chain addresses | Executes narrowly scoped treasury or emergency actions under published thresholds. |
| Community | ANT holders and eligible participants | Discusses and votes on governance proposals under published rules. |
| Independent reviewers | Auditors, security researchers, legal/accounting advisers | Review code, controls and disclosures; no implied endorsement. |
| Legal / compliance contact | Designated accountable contact when required | Handles formal notices, exchange diligence and regulated counterparties. Public identity may be a role mailbox; private verification may still be required. |

Do not imply that token ownership automatically grants legal ownership of the software, company, or project intellectual property.

## 3. Hybrid governance boundaries

### Creator-reserved operational scope
- Propose product roadmap, interface changes, documentation and non-economic integrations.
- Coordinate releases after code review, testing and published release notes.
- Recommend budgets and ecosystem grants.
- Temporarily halt a new sale or protocol operation only if an explicitly reviewed, deployed emergency control exists and a documented incident trigger is met.

### Community-governed scope
- Changes to token economics for future deployments.
- Treasury budget policy and ecosystem grant frameworks.
- Material changes to governance rules, protocol fees, or creator compensation policy.
- Migration plans, protocol sunset plans, and non-emergency upgrades.
- Selection or removal of community representatives, where a formal mechanism exists.

### Non-negotiable limits
- No unilateral minting if the published token design is fixed-supply and non-mintable.
- No secret fee changes, hidden transfer taxes, arbitrary confiscation, selective holder punishment, or retaliation for selling.
- No unilateral movement of user deposits or community treasury funds.
- No retroactive change to settled transactions or previously disclosed buyer terms.
- No vote buying, fake governance participation, wash trading, spoofing, or fabricated community metrics.

If the deployed contract does not support a proposed control, documentation must say so; governance prose cannot create an on-chain power that does not exist.

## 4. Governance process (proposed)

1. **Discussion:** publish proposal, motivation, affected contracts, security and legal impact, cost, alternatives, and conflicts of interest.
2. **Review:** allow at least 7 calendar days for public comments for ordinary proposals; critical security incidents use a separate incident process.
3. **Independent checks:** obtain technical review and, where relevant, legal, tax, privacy, or financial-promotion review.
4. **Vote:** publish the exact voting snapshot, eligible voting power, quorum, approval threshold, abstentions, and result. Do not claim a binding on-chain vote if it was only an informal poll.
5. **Timelock:** proposed economic or contract changes have a minimum 48-hour public timelock after approval, unless a narrowly scoped emergency response is required to prevent immediate harm.
6. **Execution:** use a 2-of-3 or stronger independent multisig for protocol treasury actions; publish the transaction hash and implementation diff.
7. **Post-change report:** publish outcome, signer approvals, transaction links, and any deviations.

Voting thresholds and quorum must be finalized only after a Sybil-resistance and concentration analysis. Token-weighted voting can be dominated by large holders; disclose that limitation and consider delegation, capped voting, or independent review.

## 5. Treasury and creator compensation

- Keep creator compensation, operating funds, security reserves, and user funds in separate accounts/contracts.
- Use independent signers and hardware wallets for treasury multisigs.
- Publish wallet addresses, signer threshold, budgets, inflows/outflows, and periodic reconciliations.
- The current proposed fee-income allocation (after taxes/statutory reserves) is 60% creator compensation, 25% product/operations, 10% security/compliance, and 5% contingency reserve. This is a proposal, not an automatic payout or guaranteed income.
- No single creator key should be able to transfer all user deposits or unilaterally alter immutable token rules.

## 6. Privacy and operational security

- Use a dedicated public project email and role-based accounts; do not reuse personal social accounts.
- Enable hardware security keys and MFA for GitHub, domain registrar, cloud, email, and exchange accounts.
- Keep signing keys in hardware wallets or managed multisig; never store seed phrases, private keys, passwords, or recovery codes in source code, chat, issues, screenshots, or CI logs.
- Separate public creator wallets from personal wallets and project treasury wallets.
- Use a documented recovery and signer-rotation process; test it before mainnet.
- Do not promise perfect anonymity. Blockchain transactions and operational metadata may be public and correlatable.
- Publish a privacy notice before collecting user information; minimize data collection and define retention and deletion procedures.

## 7. Exchange-facing identity statement

Suggested wording, subject to review by the actual applicant:

> ZENTRAX is a pseudonymously founded digital-asset project. “ZENTRAX Creator” is the public-facing creator identity. The project is prepared to provide accurate confidential applicant, control-person, beneficial-owner, and compliance information to the exchange through its verified due-diligence process where required. Public pseudonymity does not replace or obstruct required KYC/AML checks.

Do not submit this statement until the applicant has an actual authorized contact and can truthfully satisfy the exchange's diligence process.

## 8. Adoption gates

Before representing this charter as active:
- publish the final governance policy and role-based responsibilities;
- deploy and verify the exact multisig/timelock/governance contracts, if used;
- independently review access controls and emergency powers;
- publish the final token allocation and vesting schedule;
- obtain legal review for target jurisdictions and token distribution;
- test proposal, vote, timelock, execution, signer rotation and incident recovery on testnet.

**Current status:** this charter is a design document. It does not establish a legal entity, DAO, deployed governance system, independent audit, or exchange approval.
