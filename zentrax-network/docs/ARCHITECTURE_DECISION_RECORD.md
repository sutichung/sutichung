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
