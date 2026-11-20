# ZENTRAX Creator Revenue Allocation Ledger

This migration adds an auditable, draft-first monthly allocation ledger. It does not initiate transfers.

## Source of truth
Only BSC testnet (chain 97) canonical `AntPurchased` events with a matching canonical `usdt_fee` ledger entry are eligible. The event fee must exactly match the ledger amount. Reorged, orphaned, unmatched, non-final, or gross/net proceeds are excluded.

## Allocation order
1. Finance explicitly records the tax/statutory reserve amount. The system never guesses tax.
2. Remaining distributable fee income is split: creator 60%, product/operations 25%, security 10%, reserve 5%.
3. Integer raw USDT units are used throughout. Any division remainder is assigned to reserve so the ledger always balances.

## Workflow
- Create a draft allocation per eligible source event; unique constraints prevent duplicate allocations.
- Review and approve through the finance process with MFA and dual-control governance.
- A row becomes paid only after an actual multisig payout is independently verified and its transaction hash is recorded.
- Void rows remain auditable; do not delete financial history.

## Security and limitations
- RLS is enabled; browser roles have no table privileges; only service_role can access this accounting table/view.
- The MFA-gated Super Admin API supports listing monthly allocations (`GET /api/ant/admin/creator-revenue/allocations`) and creating draft rows from eligible finalized events (`POST` with `sourceEventId` and `taxReserveRaw`). Approval and payout transitions are intentionally not exposed yet. This migration is not applied to Supabase by this commit.
- No automatic wallet payout, no claim of earned/withdrawable balance, and no mainnet enablement.
- Tax, legal, and accounting treatment must be confirmed by qualified local professionals before real funds are accepted.
