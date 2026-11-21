# ZENTRAX Network — Phase 0 Engineering Backlog

**Status:** Planning artifact; no chain implementation is claimed by this file.
**Owner:** ZENTRAX engineering
**Target:** A reproducible local multi-node EVM-compatible devnet.

## Non-negotiable delivery rules

- Keep the chain implementation isolated from the existing ANT/web application. Do not make the current Render web service pretend to be a blockchain node.
- Do not deploy a public endpoint, mint a native asset, publish a chain ID, or accept real funds during the prototype phase.
- Pin every upstream dependency to an exact reviewed release or commit. Record license, release provenance, known advisories, and upgrade policy.
- Keep production/mainnet deployment disabled in CI. No workflow may read a production signing key during local/devnet tests.
- A green documentation build is not a green chain build. Report each gate separately.

## Stack decision gate

Evaluate Cosmos SDK + CometBFT + Cosmos EVM against at least one credible alternative before pinning dependencies. The decision record must cover:

1. consensus safety/liveness assumptions and finality;
2. EVM opcode/precompile and JSON-RPC compatibility;
3. upstream release maturity, audits, advisories and maintenance;
4. validator operations, key management and client diversity;
5. state growth, pruning, snapshots and state sync;
6. upgrade coordination and rollback/recovery limits;
7. licensing, reproducible builds and long-term maintainer capacity.

**Exit evidence:** signed-off architecture decision record, exact dependency pins, license inventory and threat model. Until then, no stack is represented as final.

## Proposed isolated workspace

```text
zentrax-network/
  README.md
  docs/
    ARCHITECTURE_DECISION.md
    THREAT_MODEL.md
    GENESIS_PARAMETERS.md
    OPERATIONS.md
  chain/                 # upstream-based chain application; add only after stack gate
  devnet/                # local multi-node compose/config; no real funds
  contracts/             # test contracts and fixtures only
  explorer/               # later phase; separate deployable service
  scripts/                # deterministic build/test helpers
  .github/workflows/      # CI; mainnet deploy prohibited
```

## Phase 1 — local devnet acceptance

A phase is complete only when all evidence below is attached to a commit/CI run:

- [ ] clean-machine setup documented and repeatable;
- [ ] at least four local nodes start from generated genesis;
- [ ] nodes reach consensus and agree on block height/hash;
- [ ] stop/restart a node and prove it catches up without manual state edits;
- [ ] submit an EVM transaction and verify receipt, event and canonical block;
- [ ] deploy and call a small Solidity contract using a standard toolchain;
- [ ] JSON-RPC chain ID and native currency metadata match the generated config;
- [ ] invalid signature, nonce replay, insufficient gas and malformed transaction tests fail safely;
- [ ] deterministic test fixtures; no simulated market data or mocked consensus presented as live;
- [ ] CI runs unit, integration, lint, dependency and secret scans;
- [ ] no private key or mnemonic is committed or printed in logs.

## Phase 2 — public devnet acceptance

- [ ] independent operators can join using published instructions;
- [ ] peer discovery, persistent peers, state sync and snapshot restore are tested;
- [ ] validator key rotation, node loss, network partition and upgrade rehearsal are tested;
- [ ] RPC rate limits, monitoring, alerting and status page are operational;
- [ ] provider/geographic concentration is measured and disclosed;
- [ ] incident response and coordinated disclosure process is published.

## Phase 3 — public testnet acceptance

- [ ] public faucet tokens are prominently marked as having no monetary value;
- [ ] wallet network configuration is verified against chain ID and genesis;
- [ ] explorer independently verifies blocks, transactions and validator data;
- [ ] staking/governance are enabled only after implementation review and adversarial tests;
- [ ] critical/high findings are resolved or explicitly block launch;
- [ ] bug bounty scope and incident-response drills are live.

## Mainnet hard stop

Mainnet remains disabled until independent protocol and contract audits, legal review, finalized and disclosed genesis/tokenomics, independent validator operations, key custody/recovery plans, monitoring, upgrade rehearsals and public launch authorization are all documented. No exchange listing, market-cap, uptime, or security guarantee is implied.

## Current verified status

This backlog is a planning artifact only. It does not mean the chain repository, node binary, genesis, validators, RPC, explorer, faucet, wallet integration, audits or testnet exist. Track implementation by commit and CI evidence, not by checklist intention.
