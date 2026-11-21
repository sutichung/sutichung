# ZENTRAX Network — Layer-1 Architecture & Delivery Blueprint

**Version:** 0.1-draft  
**Date:** 2026-11-21  
**Public creator identity:** ZENTRAX Creator (pseudonymous)  
**Governance:** Hybrid  
**Status:** Architecture proposal only. No ZENTRAX L1 network, validator set, genesis, native asset, RPC, bridge, or mainnet exists by virtue of this document.

## 1. Product direction

The long-term objective is a sovereign, public, EVM-compatible Layer-1 network with its own consensus, validators, native gas asset, block explorer, wallet support, developer tooling, governance, and application ecosystem.

ZENTRAX should not claim to be Ethereum, equal to Ethereum in security/decentralization, or "ETH-level" merely because it runs Solidity contracts. The objective is Ethereum-like capabilities and developer experience, earned through open-source implementation, independent validators, audits, public operation, credible economics, and sustained adoption.

The existing ANT-on-BNB-Smart-Chain work is a transitional application/token project, not the ZENTRAX L1 itself.

## 2. Recommended technical direction

### Preferred research prototype: Cosmos SDK + CometBFT + Cosmos EVM

Use the Cosmos Stack as the first candidate for a sovereign EVM-compatible L1:
- **Cosmos SDK:** application-specific chain modules, account/bank/staking/governance and custom business logic.
- **CometBFT:** Byzantine-fault-tolerant consensus and validator networking.
- **Cosmos EVM:** EVM execution, Solidity contracts, Ethereum JSON-RPC and compatibility with familiar Ethereum wallets and developer tools.
- **IBC:** potential interchain messaging and asset transfers after the base chain and security model are mature.

Why this candidate: it allows a sovereign chain with a native validator set while retaining EVM developer compatibility. The Cosmos EVM repository currently describes itself as a v0.x project undergoing audit and testing; therefore pin an exact reviewed release/commit, evaluate its maturity and security advisories, and do not treat "production-ready" marketing language as a substitute for an independent review.

### Alternative: OP Stack

OP Stack is a strong alternative if the priority changes from a sovereign L1 to an Ethereum-aligned L2 rollup. It inherits a different trust and settlement model and depends on Ethereum and rollup infrastructure. It must not be described as an independent sovereign L1. Run a separate feasibility review before choosing it.

### Decision gate

Do not commit to a production stack until an engineering review compares:
- consensus and finality assumptions;
- EVM compatibility and fork/upgrades;
- client diversity and maintenance;
- validator operating costs and decentralization;
- data availability, state growth and pruning;
- bridge/IBC trust assumptions;
- audit status, known vulnerabilities and upgrade process;
- licensing, contributor capacity and long-term maintenance.

## 3. Asset model — proposed separation

The recommended initial product model separates the chain's native asset from the existing ANT application token:

| Asset | Intended role | Status |
|---|---|---|
| ZTX (working ticker; subject to name/ticker/legal review) | Native gas, staking, validator security and protocol governance asset | Proposed; not issued |
| ANT (Ant Colony) | Application/ecosystem token for Ant Colony products, payments and future apps | Existing project design; not a ZENTRAX L1 native coin |
| USDT or other stablecoin | Optional application-level payment asset, only after issuer/network/legal review | Not enabled on a future L1 |

The native asset ticker is provisional and must be checked for trademark, exchange-symbol collisions, token naming conflicts, and legal suitability. If the project instead chooses ANT as the native asset, the existing fixed 200,000 supply and no-mint design must be re-evaluated against validator security and reward economics before any deployment. Do not silently create two assets with the same ticker or imply that a bridged ANT is identical to the canonical asset without a verified bridge.

### Native asset economic design — unresolved

Do not invent a supply cap, inflation rate, premine, validator reward, treasury allocation, or staking APR. Model and publish scenarios for:
- initial genesis distribution and vesting;
- validator self-bond and delegation;
- block rewards, transaction-fee allocation and any issuance;
- slashing, downtime penalties, unbonding and redelegation;
- community treasury and security budget;
- long-term security under low fees and low token value;
- concentration, insider allocation, Sybil and governance capture.

No yield or profit should be promised. A testnet faucet token has no monetary value.

## 4. Core protocol architecture

### Execution and accounts
- EVM-compatible transaction execution and JSON-RPC.
- Ethereum-style account addresses and chain-specific chain ID.
- Solidity contracts and standard tooling (Foundry/Hardhat, ethers/viem, MetaMask-compatible wallet configuration).
- Native gas token with explicit decimals, fee market and fee-distribution policy.
- Standard event, receipt, trace, archive and state-query support, subject to client implementation.

### Consensus and validators
- Proof-of-stake validator set with documented proposer selection and finality.
- Delegation only after staking, unbonding, slashing and validator-key security are tested.
- Permissionless validator admission is the target; a small allowlisted bootstrap set may be used only on a clearly labelled devnet/testnet, with a published path and objective criteria to broaden participation.
- Independent operators, geographic/provider diversity, transparent validator registry and concentration monitoring.
- Document minimum self-bond, commission limits, uptime rules, slashing conditions and governance authority before testnet incentives.
- No creator-only validator control or hidden privileged validator admission on mainnet.

### Governance and upgrades
- Hybrid governance: creator proposes roadmap and coordinates product execution; protocol parameter changes and treasury budgets follow public governance.
- On-chain governance, proposal deposits, voting, quorum, threshold, timelock and execution must be specified and tested.
- Critical upgrades require public release notes, reproducible builds, testnet rehearsal, independent review and a published upgrade height.
- Emergency powers must be narrowly scoped, multi-party controlled, time-limited and publicly reported.
- No unilateral confiscation, hidden minting, discriminatory freezing, or retroactive changes to settled transactions.

### Networking and data
- P2P peer discovery, seed nodes, persistent peers, state sync and snapshot distribution.
- Full nodes, validator nodes, archive nodes and public RPC endpoints separated by role.
- Multiple independently operated RPC providers; rate limiting and abuse protection.
- Monitoring for peer count, block height, finality, consensus participation, disk growth, RPC errors and indexer lag.
- Backups and disaster recovery; no single cloud provider or account should control all critical infrastructure.

## 5. Ecosystem components

1. **ZENTRAX Core:** open-source chain node, genesis tooling, upgrade tooling and protocol documentation.
2. **ZENTRAX Wallet:** self-custody wallet support; hardware-wallet compatibility before mainnet; clear network/chain-ID verification and phishing protection.
3. **ZENTRAX Explorer:** blocks, transactions, accounts, validators, staking, token contracts, governance and verified source.
4. **RPC and WebSocket:** public endpoints with documented limits, status page, rate limits and independent failover.
5. **Developer portal:** chain ID, native currency metadata, RPC endpoints, faucets, SDK examples, Solidity templates and testnet guides.
6. **ANT applications:** payment, creator tools, market data and other modules, each separately reviewed for legal and security risks.
7. **Bridge/interoperability:** only after threat modelling, independent audit, monitoring, rate limits, pause/recovery design and a credible security budget. No unaudited bridge at launch.
8. **Indexing and analytics:** canonical event indexing, reorg/finality handling, public APIs and reproducible data definitions.
9. **Governance portal:** proposals, discussion, voting records, timelocks and treasury dashboards.
10. **Developer grants:** transparent application criteria, conflict disclosures, milestones and public payout records.

## 6. Network environments

| Environment | Purpose | Value / access |
|---|---|---|
| Local devnet | Fast developer iteration and automated tests | Disposable, no monetary value |
| Public devnet | Multi-node protocol integration | Experimental |
| Public testnet | Wallet, explorer, validator, staking, upgrade and dApp testing | Faucet tokens only; no monetary value |
| Mainnet | Production public network | Disabled until every launch gate is approved |

Every UI, wallet, faucet and explorer must make the environment unmistakable. Never use real USDT or claim testnet tokens have market value.

## 7. Proposed chain parameters — deliberately unset

The following values must be selected by protocol simulation and security review, not guessed:
- chain ID and EIP-155 domain;
- native token denomination, ticker and decimals;
- genesis supply and distribution;
- block time, gas limit, base-fee parameters and transaction-size limits;
- validator set size, minimum self-bond, commission and unbonding period;
- block rewards, fee split, inflation cap/floor, slashing and downtime windows;
- governance quorum, proposal deposit, voting period, approval threshold and timelock;
- state retention, pruning, snapshots and archive-node policy;
- RPC quotas and public service-level objectives.

Reserve a unique chain ID after checking chain registries and ecosystem conventions. Do not publish a placeholder chain ID as a live network.

## 8. Security and trust model

Before any public testnet:
- pin and review upstream dependencies and exact versions;
- build reproducibly and scan dependencies, container images and secrets;
- run unit, integration, property-based, fuzz, invariant and adversarial network tests;
- test chain halt, validator churn, key compromise, equivocation, partition, state sync and upgrade failures;
- audit custom modules, EVM integration, precompiles, staking, governance and bridge code;
- publish threat model, security contact, incident process and disclosure policy;
- use independent validators and infrastructure operators;
- implement key rotation, hardware-backed signing, backups and disaster recovery.

Before mainnet:
- independent protocol and smart-contract audits;
- independent validator operations and sufficient geographic/provider diversity;
- public bug bounty and incident-response drills;
- formal review of genesis distribution and governance capture risks;
- bridge disabled unless separately audited and funded;
- legal, tax, privacy, consumer-protection and financial-promotion review for target jurisdictions.

## 9. Delivery roadmap and acceptance gates

### Phase 0 — Architecture and repository preparation
- compare Cosmos EVM and OP Stack with a written decision record;
- create a separate zentrax-network codebase or clearly isolated monorepo workspace;
- pin upstream versions and licenses;
- publish threat model, protocol requirements and genesis parameter decision log.

**Exit:** reproducible local node build and written stack decision.

### Phase 1 — Local devnet
- one-command local multi-node devnet;
- genesis generation and deterministic chain ID for local tests;
- EVM transactions, JSON-RPC, Solidity deployment and wallet connection;
- block explorer/indexer prototype and CI test suite.

**Exit:** independent clean-machine setup, deterministic tests, node restart/state recovery.

### Phase 2 — Public devnet
- multiple independent operators;
- peer discovery, state sync, snapshots, RPC and monitoring;
- validator onboarding, key rotation and upgrade rehearsal;
- adversarial and load testing.

**Exit:** published operator guide, stable multi-operator operation and incident drills.

### Phase 3 — Public testnet
- public faucet, explorer, wallet metadata, developer portal;
- staking/delegation/governance only after audited implementation;
- testnet bridge only if separately reviewed;
- bug bounty and public issue tracking.

**Exit:** security findings triaged, upgrade and recovery rehearsed, testnet stable for a defined observation period.

### Phase 4 — Mainnet readiness
- finalized tokenomics/genesis and transparent vesting;
- independent protocol audits and legal review;
- independent validator set and operational monitoring;
- public launch checklist and contingency plan.

**Exit:** all critical/high security findings resolved, launch authority documented, and no unresolved critical operational blockers.

### Phase 5 — Mainnet and ecosystem
- genesis launch with published validators and parameters;
- explorer, RPC, wallet, developer SDK and status page;
- ANT application migration only under a separately audited plan;
- gradual onboarding of dApps, bridges, DeFi and market applications.

**Exit:** independently measured uptime, decentralization, security and organic usage; no guaranteed market-cap or exchange-listing targets.

## 10. ANT migration policy

The existing ANT token on BNB Smart Chain must not be silently redefined as the native gas asset of a new chain.

Before any migration:
1. snapshot and publish the canonical BSC ANT contract, total supply, holders and excluded/burn addresses using verifiable chain data;
2. decide whether ANT remains on BSC, is migrated, or is represented on ZENTRAX through a canonical bridge;
3. design one-to-one or other explicit conversion rules, caps, deadlines and treatment of locked/treasury balances;
4. prevent double claims and replay attacks;
5. obtain independent bridge/migration-contract audit;
6. publish user instructions and recovery/support process;
7. reconcile every claim and publish proof;
8. never promise that wrapped/bridged assets are risk-free or identical to the canonical token.

Do not deploy a bridge or announce a conversion ratio until these decisions and audits are complete.

## 11. Exchange strategy

Exchange applications should be sequenced after the project has:
- a functioning public testnet or mainnet with stable RPC/explorer;
- verified native and ANT contract/asset metadata;
- transparent tokenomics and vesting;
- independent security audit(s);
- legal issuer/applicant and confidential KYC/UBO information where required;
- genuine users, applications, liquidity and market-quality evidence.

A sovereign chain may require separate exchange integration for its native asset and for ANT. Listing one does not list the other. No application, approval, or listing may be claimed without portal receipt and official confirmation.

## 12. Honest current status

At the time of this draft:
- ZENTRAX L1 is a proposal, not a running blockchain.
- No ZENTRAX genesis, chain ID, native token, validator set, consensus network, public RPC, explorer, wallet network configuration, or mainnet exists.
- Existing repository work concerns the ZENTRAX web application and ANT testnet/payment design; it is not a complete L1 implementation.
- No independent protocol audit, bridge audit, or mainnet legal review is available.
- The recommended stack is a candidate for a prototype, not a final audited production choice.
- No exchange has approved or listed ZENTRAX native asset or ANT.

## 13. Reference architecture documentation

- Cosmos Stack overview: https://github.com/cosmos
- Cosmos EVM framework: https://github.com/cosmos/evm
- Cosmos technology overview: https://cosmos.network/technology
- OP Stack protocol specification: https://specs.optimism.io/protocol/overview.html
- Ethereum proof-of-stake overview: https://ethereum.org/developers/docs/consensus-mechanisms/pos/

These references describe upstream technology; they do not imply endorsement, partnership, audit, or integration with ZENTRAX.
