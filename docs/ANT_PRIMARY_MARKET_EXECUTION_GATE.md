# ANT Primary-Market Readiness — Execution Gate

Status date: 2026-11-22
Target: international primary-market distribution for ANT
Network target: BNB Smart Chain mainnet (chain ID 56), only after all gates pass.
This document is an execution checklist, not evidence that a sale, deployment, approval, or listing has occurred.

## Verified repository findings

- The `ant-listing-readiness` branch exists.
- The repository package scripts currently expose testnet deployment commands:
  - `deploy:token:testnet`
  - `deploy:sale:testnet`
  - `deploy:ant:e2e:testnet`
- The inspected `hardhat.config.js` on `ant-token-testnet` defines only `bscTestnet` (chain ID 97). No BSC mainnet network configuration was present in that inspected file.
- The prior testnet deployment run failed because the deployer had zero testnet BNB for gas. Contract compilation and 18 tests passed in that prior run; this does not prove mainnet readiness.
- The existing ANT global growth plan explicitly says testnet first and says not to imply a mainnet launch or exchange listing.
- PR #43 is a ZENTRAX network/architecture PR; its changed-file list does not establish that an ANT primary-sale contract or sale flow is complete.

## Gate 0 — Freeze claims and protect users

- [ ] Do not announce an open sale, guaranteed return, guaranteed liquidity, or exchange listing.
- [ ] Do not accept funds or publish a payment address until legal, contract, custody, and operational reviews are complete.
- [ ] Publish only independently verifiable contract addresses and transaction hashes.
- [ ] No artificial demand, wash trading, undisclosed promotion, or misleading scarcity.

## Gate 1 — Reconcile the actual token implementation

- [ ] Locate and review the exact ANT token Solidity source and deployment scripts.
- [ ] Confirm name, symbol, decimals, total supply, mint/burn permissions, owner/admin roles, pause/blacklist/tax controls, and upgradeability.
- [ ] Reconcile source-code supply with tokenomics, allocations, vesting, treasury, creator/community allocation, and circulating-supply disclosures.
- [ ] Confirm the deployer and treasury custody design; require independently controlled multisig signers for privileged roles.
- [ ] Add tests for access control, supply invariants, transfers, sale limits, refunds, vesting, and emergency paths.
- [ ] Produce reproducible build artifacts and verify source code on the chain explorer after deployment.

## Gate 2 — Primary-sale contract and operating controls

- [ ] Specify sale phases, start/end times, accepted assets, price and pricing method, per-wallet limits, overall cap, minimum raise, vesting/delivery, and refund conditions.
- [ ] Specify how proceeds are held, who can withdraw, withdrawal limits, and what happens if the sale is canceled or a threshold is not met.
- [ ] Ensure users see all fees, allocation, lockups, risks, eligibility restrictions, and conflicts before they commit funds.
- [ ] Add contract tests and independent security review; do not deploy a sale contract with unresolved critical/high findings.
- [ ] Test the entire purchase, allocation, claim, refund, and pause process on testnet.

## Gate 3 — International legal and distribution readiness

- [ ] Identify the issuer, responsible operating entity, beneficial owners, directors, and countries where offers will be actively marketed.
- [ ] Obtain qualified legal review for the issuer jurisdiction and each target market; international distribution does not remove applicable local laws.
- [ ] Determine whether the token or sale triggers securities, collective investment, payment, VASP/CASP, consumer, sanctions, AML/KYC, privacy, tax, or advertising requirements.
- [ ] Define restricted jurisdictions and investor eligibility; implement geofencing/KYC only where counsel determines it is required.
- [ ] Prepare truthful whitepaper/offering memorandum, risk factors, tokenomics, use-of-proceeds, conflicts, privacy notice, terms, and support/complaints process.
- [ ] Obtain required registrations, licenses, exemptions, or legal opinions before solicitation or accepting funds.

## Gate 4 — Testnet evidence

- [ ] Deploy token and sale contracts to BSC Testnet (chain ID 97).
- [ ] Verify contract source and constructor parameters on BscScan testnet.
- [ ] Run end-to-end purchase, claim, refund, cap, vesting, pause, and role tests.
- [ ] Record independent review results and publish known limitations.
- [ ] Confirm multisig control and recovery procedure.

## Gate 5 — Mainnet release authorization

- [ ] Add a separate BSC mainnet configuration (chain ID 56) and explicit chain-ID guard.
- [ ] Use a hardware-backed deployer and multisig; never store or expose private keys in source control, chat, or public logs.
- [ ] Complete final bytecode, parameter, supply, allocation, and recipient review.
- [ ] Obtain explicit issuer authorization for the exact contract addresses, parameters, sale dates, accepted assets, and caps.
- [ ] Deploy only after all previous gates pass; verify source and independently verify ownership/roles.
- [ ] Conduct a controlled launch with monitoring, incident response, and transparent reporting.

## Current blockers / next engineering actions

1. Find the actual ANT token and sale Solidity files and inspect the implementation; the initially guessed paths `contracts/ANTToken.sol` and `docs/ANT_PRESALE.md` were not present at those paths on the inspected branch.
2. Inspect the real deployment scripts and test suite before proposing edits.
3. Confirm the testnet faucet transfer on-chain and retry testnet deployment only after the deployer balance is independently verified.
4. Do not add a mainnet deployment path or enable sale acceptance until the contract, legal, custody, and testnet gates are complete.

## Release status

**NOT READY FOR PRIMARY SALE.** No verified BSC mainnet token contract, sale contract, or public sale transaction was established by this repository inspection. The work may proceed on documentation, code review, tests, and testnet validation only.
