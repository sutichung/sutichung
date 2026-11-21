# ZENTRAX local four-validator Devnet (reference harness)

This is a **local-only engineering harness**, built from the upstream Cosmos EVM example chain at the immutable source tag `v0.7.4`. It exercises the CometBFT/Cosmos EVM toolchain and four independent validator processes. It is not yet the bespoke ZENTRAX production chain application.

## Requirements

- Docker Engine and Docker Compose v2
- 8 GB RAM recommended for building the upstream Go application and running four nodes
- Ports 26657/26667/26677/26687, 8545/8555/8565/8575, and 1317/1327/1337/1347 available

## Start

From this directory:

```sh
sh up.sh
sh verify.sh
```

The first run builds the pinned upstream binary and generates a fresh local four-validator genesis. The generated validator keys, node keys, genesis and databases stay under `.local-data/`, which is git-ignored. Do not copy these local test keys into production or reuse them for a public network.

## Endpoints

| Node | CometBFT RPC | EVM JSON-RPC | REST |
|---|---|---|---|
| 0 | http://localhost:26657 | http://localhost:8545 | http://localhost:1317 |
| 1 | http://localhost:26667 | http://localhost:8555 | http://localhost:1327 |
| 2 | http://localhost:26677 | http://localhost:8565 | http://localhost:1337 |
| 3 | http://localhost:26687 | http://localhost:8575 | http://localhost:1347 |

The CometBFT chain ID is `zentrax-devnet-1`. The upstream example application's EVM chain ID and test denomination are not production decisions.

## Stop and reset

```sh
sh down.sh
```

This stops containers but preserves local keys and data. To reset, stop the network and manually remove `.local-data/`; a new local genesis and new test keys will be generated on next start.

## Automated acceptance

The GitHub Actions workflow `ZENTRAX four-validator devnet` builds the image, starts all four nodes, checks their chain IDs and committed heights, waits for block height to advance on all four validators, verifies four genesis validators, and calls `eth_chainId` on all four EVM endpoints. The init logic lives in `init.sh` rather than an interpolated Compose command so shell variables are evaluated by `/bin/sh`, not Compose. CI success is the first actual runtime validation; until it passes, this harness is only code committed for testing.

## Scope and security boundary

- The example chain is upstream Cosmos EVM `v0.7.4`; it is not a custom ZENTRAX app or audited network.
- Local validator keys and genesis allocations are disposable test material.
- No public RPC, public validator enrollment, faucet, bridge, real asset, token sale, or mainnet deployment is enabled.
- Native token symbol, EVM chain ID, genesis allocations, staking economics, governance authorities and production validator policy remain unset.
- The reference chain must be replaced/adapted into a reviewed ZENTRAX application before a public testnet is announced.
