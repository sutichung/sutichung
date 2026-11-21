# ZENTRAX Network

This directory is the isolated workspace for the proposed ZENTRAX sovereign EVM-compatible Layer-1.

## Current status

**Scaffold only. No chain node, consensus engine, genesis, native asset, validator network, RPC endpoint, explorer, faucet or testnet is implemented here.**

The existing ANT application and BNB Smart Chain testnet work are separate products. Do not treat this workspace as a running chain.

## Engineering sequence

1. Review and approve the stack decision record in [docs/ARCHITECTURE_DECISION_RECORD.md](docs/ARCHITECTURE_DECISION_RECORD.md).
2. Complete the threat model in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
3. Keep chain/genesis parameters explicitly unset in [docs/GENESIS_PARAMETERS.md](docs/GENESIS_PARAMETERS.md) until protocol simulation and security review.
4. Define operator procedures in [docs/OPERATIONS.md](docs/OPERATIONS.md).
5. Only then pin upstream releases and introduce the node application and local multi-node devnet.

## Rules

- No mainnet deployment or production signing keys in this workspace.
- No real-money assets or claims of market value on devnet/testnet.
- Never commit mnemonics, private keys, RPC credentials or service secrets.
- Every completion claim must link to code, a reproducible test and its CI result.
- Never represent mocked consensus, fabricated transactions or synthetic market data as live network activity.

## Proposed stack

Cosmos SDK + CometBFT + Cosmos EVM remains a candidate, not an approved production stack. See the decision record for the evaluation gates and alternatives.
