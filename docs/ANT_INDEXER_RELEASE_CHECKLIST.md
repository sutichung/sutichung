# ANT BSC Testnet Indexer Release Checklist

**Status: isolated release slice; not active until reviewed and merged.** The workflow runs only on the repository default branch schedule. It is deliberately guarded by the repository Actions variable `ANT_INDEXER_ENABLED == true`; while unset or false, the indexer job is skipped and no RPC or Supabase secret is read.

## Required before enabling

1. Apply and verify these Supabase migrations in order:
   - `202611200002_ant_payment_gateway.sql`
   - `202611220001_ant_indexer_state.sql`
   - `202611230001_ant_order_submission_and_ledger_totals.sql`
2. Confirm the BSC Testnet sale, ANT, USDT and oracle contract addresses against on-chain bytecode and immutable sale configuration.
3. Confirm the fee and proceeds recipients match the deployed sale contract and are controlled by the disclosed multisig Safes.
4. Configure two independent BSC Testnet RPC endpoints and verify both report chain ID 97.
5. Configure the Supabase URL and service-role key only as GitHub Actions secrets. Never put secrets in repository variables, source files, logs or chat.
6. Set the indexer start block to the first block after the verified sale deployment. Configure at least 12 confirmations and a reorg lookback no smaller than the confirmation depth.
7. Run `workflow_dispatch` with the guard enabled only after the schema and all addresses have been independently verified. Inspect the first run, chain events, ledger rows and checkpoint before relying on the five-minute schedule.

## Safety properties

- This worker indexes BSC Testnet only (chain ID 97).
- It cross-checks two RPC providers, contract configuration, canonical block hashes, receipts, USDT fee/proceeds transfers and ANT delivery.
- It is idempotent by chain/transaction/log identity and rewinds its checkpoint after a detected reorg.
- It fails closed on provider disagreement or configuration mismatch.
- It does not submit transactions, hold private keys, or deploy contracts.
- It does not enable mainnet sales. Testnet tokens have no monetary value.

A successful CI run proves code checks only. It does not prove that migrations are applied, secrets are configured, a contract is deployed, or a real purchase has been reconciled.
