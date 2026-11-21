# ZENTRAX Network — Initial Threat Model

- Status: initial draft; must be reviewed and expanded before any public devnet.
- Scope: proposed EVM-compatible sovereign Layer-1.

## Assets to protect

- Consensus safety and finalized state.
- Validator signing keys and node identities.
- User account keys, balances and transaction integrity.
- Genesis configuration and upgrade authority.
- RPC availability and correctness.
- Governance integrity and treasury controls.
- Software supply chain, build artifacts and release provenance.

## Trust boundaries

1. User wallet to public RPC.
2. RPC provider to full node.
3. Validator signer to consensus process.
4. Node-to-node P2P network.
5. Governance proposal to parameter/upgrade execution.
6. Build pipeline to published binary/container.
7. Any future bridge or external oracle to chain state.

## Threat scenarios and required mitigations

| Threat | Potential impact | Required control / test |
|---|---|---|
| Validator key theft | Equivocation, censorship or consensus compromise | Hardware-backed signing where supported, key isolation, rotation and incident drills |
| Validator concentration or collusion | Censorship, liveness loss or safety failure | Public validator set metrics, independent operators and concentration analysis |
| Network partition / peer eclipse | Liveness loss or inconsistent network views | Adversarial network tests, peer diversity and documented recovery |
| Consensus software defect | Halt, invalid finality or chain split | Pinned versions, upstream review, fuzz/invariant tests and independent audit |
| Malicious or faulty upgrade | Chain halt or state corruption | Reproducible release, testnet rehearsal, timelock and documented emergency process |
| RPC manipulation / outage | Wrong wallet display or denial of service | Multiple providers, chain/genesis verification, rate limits and status monitoring |
| Replay / nonce handling bug | Unauthorized or duplicated transaction effects | Chain-ID domain tests, nonce tests and transaction replay tests |
| Governance capture | Unauthorized parameter or treasury changes | Transparent voting, quorum/threshold analysis, timelock and conflict disclosures |
| Supply-chain compromise | Malicious binaries or dependency takeover | Immutable pins, SBOM, signature verification and reproducible builds |
| Bridge exploit (future) | Cross-chain asset loss | Bridge disabled by default; independent audit, limits, monitoring and recovery plan |

## Security invariants

- Finalized transactions must not be silently rewritten.
- No hidden mint, confiscation, selective freeze or creator-only validator control.
- Chain ID and genesis identity must be verified by clients.
- Testnet assets must be clearly marked as having no monetary value.
- Mainnet keys and secrets must never be present in source control or CI logs.
- No bridge is enabled until its threat model, audit and incident plan are approved.

## Required adversarial test campaign

- Validator churn, downtime and key rotation.
- Network partition, delayed messages and peer eclipse attempts.
- Node crash/restart and state-sync from a trusted snapshot.
- Malformed transactions, signature failures, nonce replay and gas exhaustion.
- Governance spam, vote concentration and timelock bypass attempts.
- Upgrade failure, rollback constraints and recovery from inconsistent nodes.
- RPC rate abuse and disagreement between independent providers.

## Open questions

- Exact consensus safety/liveness assumptions of the pinned upstream release.
- Validator admission and minimum decentralization criteria.
- Emergency authority scope, multi-party control and expiry.
- Formal verification and independent audit scope.
- Bug bounty scope, disclosure channel and incident-response ownership.
