# ANT Security Operations & Incident Response

**Scope:** Ant Colony token and sale system. This is an operational control baseline, not an audit or legal opinion.

## Non-negotiable controls
- Keep the fixed-supply ANT token free of hidden mint, blacklist, confiscation, owner-drain, or sell-blocking functions.
- Never request, store, or transmit seed phrases or private keys in the website, database, support chat, or GitHub.
- Use hardware-backed signers and a multisig for treasury and fee wallets. Require at least a 2-of-3 threshold as a starting policy; choose signers who are independent and geographically separated.
- Keep deployer, fee recipient, sale proceeds, liquidity, and operating wallets distinct. Publish addresses and their purpose.
- Do not deploy or accept real funds until independent audit, legal review, oracle review, and end-to-end reconciliation are complete.

## Role separation
| Role | Allowed duties | Prohibited duties |
|---|---|---|
| Owner / project lead | Approve roadmap, budgets, and release gates | Access member private keys or bypass multisig |
| Treasury signers | Approve disclosed treasury transactions under multisig policy | Unilateral transfers |
| Security operator | Monitor alerts, pause off-chain sale UI, coordinate incident response | Change immutable contract recipients or seize user tokens |
| Support | Resolve account and transaction questions using public tx hashes | Ask for seed phrases, passwords, or signing secrets |
| Community moderator | Moderate spam and publish verified notices | Promise returns or manipulate market activity |

## Key and access management
- Store deployment keys only in a managed secret store; never commit `.env`, RPC credentials, API keys, or private keys.
- Use separate keys for testnet and mainnet. Testnet credentials must never authorize mainnet transactions.
- Enforce MFA and least privilege on GitHub, Render, Supabase, domain registrar, and social accounts.
- Rotate exposed API credentials immediately; key rotation does not reverse already signed blockchain transactions.
- Require two-person review for changes to sale code, oracle configuration, wallet destinations, and production secrets.

## Sale and oracle safety
- Validate the official stablecoin contract address and decimals for the exact chain ID; never accept a token merely because it is named USDT.
- Use a reviewed oracle with documented source, heartbeat, deviation bounds, decimals, and manipulation resistance. A nonzero recent timestamp alone is insufficient.
- Enforce maximum oracle age and buyer-provided minimum ANT output. Alert on stale data, unexpected price jumps, or source disagreement.
- Reconcile gross USDT, 5% fee, 95% proceeds, ANT output, and emitted purchase events for every transaction.
- Treat fee-on-transfer or non-standard stablecoins as unsupported unless explicitly tested.
- Pre-fund sale inventory only after verifying contract address and chain. Test failed transfers and insufficient inventory on testnet.

## Monitoring and alert thresholds
- Alert on any fee/proceeds recipient mismatch, unexpected token transfer, treasury signer change, or contract address mismatch.
- Alert when oracle data is stale, future-dated, zero, or deviates beyond the documented tolerance.
- Monitor same-block launch concentration, repeated funding sources, rapid buy/sell cycles, sandwich patterns, and unusual holder concentration.
- Treat wallet-clustering results as probabilistic signals, not proof of wrongdoing; do not automatically confiscate or blacklist funds.
- Publish incident status and affected transaction hashes without exposing personal or secret information.

## Incident response
1. Detect and record UTC time, chain ID, contract address, transaction hash, affected function, and observed impact.
2. Stop new off-chain promotion and disable the sale interface if a credible critical issue is found; this does not stop immutable on-chain contracts.
3. Notify independent security reviewers and multisig signers through pre-established channels.
4. Preserve logs, source commit, deployment artifacts, RPC responses, and relevant block numbers.
5. Do not improvise a contract upgrade or move user funds. Follow the publicly documented contract capabilities and legal obligations.
6. Publish a factual status update, remediation plan, and post-incident report. Resume only after independent verification and explicit release approval.

## Release checklist
- [ ] Source commit and compiler settings pinned.
- [ ] Full unit, integration, and adversarial tests pass.
- [ ] Oracle and stablecoin addresses independently verified.
- [ ] Multisig threshold, signers, and wallet purposes publicly disclosed.
- [ ] Deployment simulation and transaction review completed.
- [ ] Independent audit findings resolved or transparently disclosed.
- [ ] Legal, privacy, consumer disclosure, and jurisdiction checks completed.
- [ ] Testnet purchase, failure rollback, and balance reconciliation pass.
- [ ] Mainnet release separately approved; testnet success is not mainnet approval.

## Current limitations
The sale contract's fee and proceeds recipients are immutable, and the sale contract has no pause or owner withdrawal function. That limits privileged abuse but also means an incorrect recipient, broken oracle, or trapped inventory cannot be repaired by an admin. Treat this as a deployment blocker requiring independent design review, not as a feature to bypass casually.