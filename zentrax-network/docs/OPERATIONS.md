# ZENTRAX Network — Node Operations (Draft)

This is an operational design document. No production node service is currently deployed.

## Node roles

- Validator: participates in consensus and protects signing keys.
- Full node: verifies and serves chain state without validator signing authority.
- Archive/indexing node: retains historical data and feeds explorer/indexer services.
- Public RPC gateway: rate-limited access layer; must not expose validator signing material.

## Minimum operational controls

- Separate validator signer from public RPC and web application services.
- Use dedicated least-privilege service identities.
- Keep private keys and mnemonics out of source code, chat, issue trackers and CI logs.
- Pin and verify binaries and container images.
- Monitor block height, peer count, consensus participation, disk growth, process health and RPC error rates.
- Alert on missed blocks, validator key changes, peer isolation, disk pressure and indexer lag.
- Maintain encrypted backups and periodically rehearse restore procedures.
- Document upgrade height, release hash, operator instructions and rollback limitations.
- Publish incident status and post-incident review for material outages.

## Local development

Local devnet must use disposable keys and deterministic test fixtures. Never reuse local keys on public testnet or mainnet.

## Public devnet/testnet

Publish genesis hash, chain ID, software version, node requirements, peer seeds, RPC limits and faucet policy. Clearly label all faucet balances as test-only with no monetary value.

## Mainnet release hard stop

No mainnet release until independent audits, legal review, finalized genesis/tokenomics, independent validator operations, key custody and recovery procedures, monitoring, incident drills and public authorization are complete.
