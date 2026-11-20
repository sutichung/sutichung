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


## Persistent platform schema (migrations committed, not yet applied)

The ANT branch includes:
- `supabase/migrations/202611210001_ant_platform_ledger.sql`: `ant_admin_roles` (SUPER_ADMIN / FINANCE_VIEWER / SUPPORT), `ant_wallets`, one-time `ant_wallet_nonces`, `ant_admin_audit_log`, and evidence-backed `ant_listing_metric_snapshots`.
- `supabase/migrations/202611200002_ant_payment_gateway.sql`: purchase orders, chain events, financial ledger, and payment audit log. Event rows are unique by (chain_id, tx_hash, log_index); ledger rows are unique by (chain_id, tx_hash, log_index, entry_type).
- `supabase/migrations/202611220001_ant_indexer_state.sql`: service-only worker checkpoint including last block hash.

RLS is enabled. Members can read only their own orders/events/ledger rows and linked wallet. Finance access is checked by the server against `ant_admin_roles`; support has no finance access. Client writes to payment/ledger/admin tables are denied; the server and indexer use the service role. Role assignment remains service-role-only.

**Activation pending:** review and apply all three migrations in Supabase; test member, finance, support and super-admin RLS separately; then run the API and indexer end-to-end. The SQL files are not live merely because they are committed.

## BSC testnet payment API and indexer (code committed; activation gated)

- `server/lib/ant-api.js` implements authenticated wallet nonce issuance and signature verification, wallet linking, on-chain quote/order creation, transaction submission checks, order lookup and role-gated finance reporting.
- `server/jobs/ant-chain-indexer.js` uses two independent BSC testnet RPC providers, verifies both providers agree on chain, blocks and logs, and requires at least 12 confirmations.
- Before marking an order delivered, it validates immutable sale-contract configuration on both RPCs and reconciles the `AntPurchased` event with USDT fee/proceeds transfers and ANT delivery in the transaction receipt.
- It records idempotent chain events and balanced financial ledger entries, handles zero-fee integer rounding without writing zero-value ledger rows, and marks events/orders non-canonical/reorged when recent block hashes change.
- `.github/workflows/ant-chain-indexer.yml` runs one bounded cycle every five minutes or manually. It remains disabled unless repository variable `ANT_INDEXER_ENABLED=true`. It uses GitHub Actions rather than creating a paid Render worker.

Required repository variables: `ANT_INDEXER_ENABLED`, `ANT_INDEXER_START_BLOCK`, `ANT_INDEXER_CONFIRMATIONS` (minimum 12), `ANT_INDEXER_BLOCK_RANGE`, `ANT_INDEXER_REORG_LOOKBACK`, `ANT_USDT_DECIMALS`, `ANT_SALE_CONTRACT`, `ANT_USDT_CONTRACT`, `ANT_TOKEN_CONTRACT`, `ANT_FEE_WALLET`, `ANT_TREASURY_WALLET`. Required secrets: `BSC_TESTNET_RPC_URL`, `BSC_TESTNET_RPC_URL_SECONDARY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The member API also requires `SUPABASE_ANON_KEY` and `ANT_WALLET_DOMAIN` on the backend service.

**Not active yet:** the migrations must be applied, testnet token and sale contracts must be deployed and verified, Safe recipients and exact USDT decimals must be checked, the required secrets/variables must be configured, and the first indexer run must pass end-to-end reconciliation. Keep the indexer disabled until then.
