# Architecture Decision Record — ZENTRAX Network

- Status: **PROPOSED — NOT APPROVED**
- Date: 2026-11-21
- Scope: sovereign EVM-compatible Layer-1
- Decision owner: project maintainers, subject to independent engineering review

## Context

ZENTRAX aims to operate an independent public Layer-1 with its own consensus and validator set while supporting Solidity and Ethereum-compatible developer interfaces. The existing ANT token/application on BNB Smart Chain is not this chain.

## Candidate A — Cosmos SDK + CometBFT + Cosmos EVM

Potential fit:
- Cosmos SDK provides application modules and chain-specific state transition logic.
- CometBFT provides BFT consensus and validator networking.
- Cosmos EVM provides EVM execution and Ethereum-oriented JSON-RPC compatibility.
- IBC may provide future interchain messaging, subject to separate security review.

Risks and required evidence:
- Verify exact release maturity, audit status, advisories and maintenance activity.
- Pin an exact release/commit and all transitive dependencies.
- Test EVM fork compatibility, precompiles, JSON-RPC edge cases and wallet tooling.
- Review consensus assumptions, validator key management, upgrade process and state sync.
- Do not assume upstream audit coverage includes ZENTRAX custom modules or configuration.

## Candidate B — OP Stack

Potential fit:
- Strong Ethereum-aligned EVM rollup architecture and developer ecosystem.

Critical distinction:
- OP Stack is an Ethereum L2 rollup architecture, not an independent sovereign L1. Choosing it changes the product's trust, settlement and data-availability model. It is not an interchangeable implementation of the current L1 requirement.

## Candidate C — custom execution/consensus stack

Rejected for the initial prototype unless a future review demonstrates a compelling need. A bespoke consensus and execution stack substantially increases correctness, audit and long-term maintenance burden.

## Decision

No production stack is approved yet. Cosmos SDK + CometBFT + Cosmos EVM is the preferred candidate for a time-boxed feasibility prototype because it appears to align with the sovereign-chain requirement while preserving EVM compatibility. This is not a claim that the stack is production-ready or audited for ZENTRAX.

## Approval gates

Before pinning dependencies:
1. Record exact upstream release tags and immutable commit hashes.
2. Record licenses and software bill of materials.
3. Review upstream security advisories, audits and unresolved issues.
4. Produce a threat model and consensus safety/liveness review.
5. Demonstrate a reproducible clean build.
6. Demonstrate a local multi-node devnet and EVM transaction path.
7. Obtain independent reviewer sign-off.

## Consequences

- No public chain ID, ticker, genesis allocation, staking APR or issuance policy is announced by this ADR.
- No public testnet or mainnet deployment is authorized.
- OP Stack remains an alternative only if the project explicitly changes to an Ethereum L2.
- ANT remains a separate application token unless a separately audited migration decision is made.


## Prototype dependency pin and compatibility note

The local-only reference devnet pins the upstream Cosmos EVM `v0.7.4` source commit `ba66d3106a52f84b1c1ede8d9683c2df98d742ef`. Its `evmd/go.mod` currently declares Cosmos SDK `v0.54.3`, CometBFT `v0.39.3`, and Go `1.25.9`. This is the dependency set actually used by that tagged example application; do not infer a newer compatibility set from a product-level release-family label.

The Cosmos Stack release-family page currently lists the 2026.1 family as Cosmos SDK `0.55.x`, CometBFT `0.40.x`, and Cosmos EVM `0.7.x`. The discrepancy must be resolved by reviewing the exact published modules and a supported compatibility matrix before selecting the production ZENTRAX stack. The v0.7.4 example is used only to validate a disposable local multi-validator workflow; it is not the approved production dependency set.

References:
- Cosmos Stack release families: https://docs.cosmos.network/sdk/latest/release-family
- Cosmos EVM v0.7.4 release: https://github.com/cosmos/evm/releases/tag/v0.7.4
- Pinned evmd module manifest: https://github.com/cosmos/evm/blob/ba66d3106a52f84b1c1ede8d9683c2df98d742ef/evmd/go.mod
