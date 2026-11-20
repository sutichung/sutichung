# Ant Colony platform architecture

## Confirmed commercial settings
- ANT: fixed initial supply 200,000; 18 decimals; burnable; no mint.
- Network target: BNB Smart Chain.
- Fee: immutable 500 basis points (5%) of gross USDT payment.
- Net purchase amount: 95% of gross USDT determines ANT output.
- Fee recipient: administrator-controlled multisig.
- Proceeds recipient: separate treasury multisig.
- ANT delivery: atomic transfer from sale-contract inventory to buyer.
- Sale is not production-ready until a robust, independently verified ANT/USDT oracle is deployed.

## Market price
The sale contract expects an oracle adapter returning USDT per ANT scaled to 8 decimals and an update timestamp. The included mock oracle is test-only. Production must use a manipulation-resistant TWAP with sufficient liquidity, an observation window, stale/future/zero-price checks and circuit breakers. A single spot swap quote is not an acceptable market oracle. If no reliable market exists, sales must remain disabled; do not substitute a fabricated price.

Fee = floor(gross USDT * 500 / 10,000). Net = gross - fee. ANT output is calculated from net USDT and the oracle price. Buyer supplies minAntOut for slippage protection.

## On-chain trust model
Sale contract has immutable USDT, ANT, oracle, fee recipient, proceeds recipient and oracle max-age. It has no owner setters or arbitrary withdrawal function. Sale inventory must be deposited before sale. Fee, proceeds and ANT delivery settle atomically; any failed transfer reverts the entire transaction.

Recommended separate 2-of-3 Safe wallets for fee and proceeds. Multisig controls custody, not ANT minting. Never store signer private keys in app, server, GitHub or chat.

## Off-chain account roles
- SUPER_ADMIN: account ID bootstrapped by controlled one-time process, wallet-signature proof and MFA; no public self-registration to this role.
- FINANCE_VIEWER: read-only reconciled ledger and reports.
- SUPPORT: member support only; cannot assign roles or access treasury controls.
- MEMBER: wallet connection, quote and purchase.
Wallet proof uses nonce, domain, chain ID and expiry to prevent replay. Database role alone is not proof of wallet ownership. All role changes are audited.

## Financial ledger and reconciliation
Persist chain ID, transaction hash, log index, block number, buyer, gross USDT, fee USDT, net USDT, ANT output, oracle price, token address and confirmation status. Enforce unique (chain_id, tx_hash, log_index), idempotent event ingestion and configurable confirmation depth. Reconcile USDT transfer events and AntPurchased logs. Never trust a browser-supplied paid flag.

## Admin dashboard
- Overview: gross USDT, fee USDT, net proceeds, ANT sold, remaining inventory, unique buyers, pending and failed transactions.
- Transactions: filter by date, buyer, tx hash and status; link to BscScan.
- Members: account-wallet association and compliance status where required. Support cannot change roles.
- Finance: fee/proceeds balances, chain reconciliation and CSV export.
- Settings: display immutable fee and oracle health; contract changes require a new reviewed deployment.
- Security: MFA, session expiry and append-only audit logs. Treasury withdrawals remain exclusively in Safe.

## Mainnet gates
Independent smart-contract audit; verify official BSC USDT contract and decimals; deploy audited TWAP oracle and verify market liquidity; test reorg/replay/decimal edge cases; complete jurisdiction-specific AML/KYC, sanctions, consumer disclosure, tax and licensing review. This is engineering documentation, not an audit or legal opinion.

## Unit tests
Run npm install, npm run compile:token and npm run test:token. Mock oracle and mock ERC20 are test-only, not production price sources or stablecoins.


## Persistent platform schema (migration committed, not yet applied)

The ANT branch now includes `supabase/migrations/202611210001_ant_platform_ledger.sql` with:
- `ant_admin_roles`: explicit SUPER_ADMIN / FINANCE_VIEWER / SUPPORT assignments.
- `ant_wallets` and `ant_wallet_nonces`: verified wallet association and one-time challenge storage.
- `ant_sale_events`: idempotent chain event ledger with unique (chain_id, tx_hash, log_index), raw integer token amounts, confirmation status and reconciliation metadata.
- `ant_admin_audit_log`: append-only administrative audit records.
- `ant_listing_metric_snapshots`: dated metrics with source, evidence hash, methodology, freshness and quality status.

The migration enables RLS. Client writes are intentionally not granted; trusted ingestion and nonce consumption must use the server/service role. Members can read only their own wallet and sale rows. Finance viewers and super admins can read the financial ledger; only super admins can read the admin audit log. Role assignment remains service-role-only.

**Activation is still pending:** review and apply the migration in the correct Supabase project, verify RLS with separate member / finance / support / super-admin test identities, then implement and test the server-side nonce signer, chain log indexer and finance endpoints. The migration alone does not create a working wallet connection or transaction indexer. Do not claim the database is live until Supabase confirms the migration and policy tests pass.
