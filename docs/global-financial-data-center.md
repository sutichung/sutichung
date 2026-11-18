# Global Financial Data Center — Architecture & Delivery Plan

## Mission
Build a consent-based, multi-jurisdiction financial data platform alongside Taiwan equities, US equities, and crypto zones. It aggregates public institutional data and user-authorized private account data. It does not scrape bank logins, bypass MFA, or initiate payments/trades.

## Non-negotiable scope boundaries
- "Global coverage" is a long-term connector roadmap, not a claim that every bank is currently connected.
- Private balances and transactions are available only through a bank/provider API with valid user consent, contracts, licensing, and jurisdictional approval where required.
- Public macro/central-bank/payment statistics are kept separate from private customer-account data.
- Read-only account access is the default. Payment initiation is out of scope until separately approved, licensed, threat-modelled, and explicitly authorized.
- Every data point carries provider, institution, jurisdiction, currency, observed_at, fetched_at, freshness, and permission provenance.
- Never present estimated, delayed, stale, or synthetic values as live facts.

## Global interoperability strategy
Use a "network of networks" model rather than one universal bank API:
1. Country/jurisdiction adapters for local open-banking/open-finance schemes.
2. Provider adapters where licensed aggregators have coverage and lawful contracts.
3. Public-data adapters for central banks, regulators, statistical agencies, payment-system operators, and official market sources.
4. A canonical internal schema translating institution-specific formats into normalized accounts, balances, transactions, counterparties, currencies, and consent records.
5. Consent and trust remain governed by each jurisdiction; no central bypass of local authorization.

Reference standards and initiatives:
- BIS Project Aperta: prototype interconnecting domestic open-finance networks across UK, UAE, Brazil, Hong Kong, and India; its reference architecture includes a translator/directory and shared trust framework. Treat as architectural reference, not a production global bank API.
- UK Open Banking Standard and Berlin Group NextGenPSD2/openFinance: reusable API, security, directory, consent, and data-model references. Implement jurisdiction profiles rather than assuming universal compatibility.
- ISO 20022: canonical payment-message interoperability where relevant.
- BIS Project Nexus: cross-border instant payment-system interlinking, distinct from account-information aggregation.

## Connector tiers
- Tier A — public data: central-bank rates, policy rates, FX reference rates, public bank branch/product data, public payment statistics.
- Tier B — user-authorized account information: balances, account metadata, transactions, statements; connector availability depends on country, bank, provider, consent, and commercial approval.
- Tier C — institutional/corporate data: treasury, cash management, custody, securities, lending; requires direct institutional contracts and stronger controls.
- Tier D — payment initiation: disabled by default and not part of the initial release.

## Initial region rollout
1. Taiwan: official bank open APIs and approved open-banking/third-party arrangements; start with a sandbox/public-data adapter and a connector capability registry. Do not assume a bank's public developer portal grants personal-account access.
2. Europe/UK: PSD2/UK Open Banking AIS through appropriately authorized providers or a licensed aggregator; support Berlin Group/UK profiles.
3. North America: licensed data aggregators subject to institution coverage, contracts, pricing, and production approval.
4. Asia-Pacific: country-by-country adapters and bank partnerships; evaluate local schemes and consent requirements.
5. Other regions: add only after legal, provider coverage, data residency, and security review.

## Proposed architecture
- Existing React frontend: add a Global Finance zone, responsive on desktop/mobile.
- Existing Node.js backend: separate finance router and connector registry.
- Connector workers: independent scheduled/background processes; bounded concurrency, rate limits, retries with exponential backoff, circuit breakers, idempotency, and dead-letter handling.
- PostgreSQL/Supabase: tenant-isolated relational metadata and normalized records; RLS for user data.
- Object storage: encrypted statements/raw provider payloads only when retention is justified and configured.
- Secrets: server-side secret manager/Vault; never browser storage or source control.
- Event pipeline: queue-based ingestion, schema validation, deduplication, provenance, and immutable audit events.
- Analytics: materialized summaries and time-series aggregates, not unrestricted access to raw account data.
- Observability: connector health, freshness, latency, failure rate, coverage, consent expiry, and reconciliation exceptions.

## Canonical entities
- institution(id, legal_name, country_code, scheme, provider, status)
- connector(id, institution_id, connector_type, environment, capabilities, coverage_status)
- consent(id, user_id, institution_id, scopes, granted_at, expires_at, revoked_at, status)
- account(id, user_id, institution_id, provider_account_ref_encrypted, currency, account_type, masked_identifier)
- balance(account_id, amount, currency, balance_type, observed_at, fetched_at, source, freshness)
- transaction(id, account_id, provider_transaction_id, amount, currency, booking_date, value_date, description, category, status, source, fetched_at)
- fx_rate(base_currency, quote_currency, rate, observed_at, source)
- ingestion_run(connector_id, started_at, completed_at, result, records_read, records_written, error_code)
- audit_event(actor, action, subject, timestamp, outcome, correlation_id)

## Security and privacy baseline
- Per-user tenant isolation and least privilege.
- OAuth/OIDC authorization-code flow with PKCE where supported; validate state, nonce, issuer, audience, redirect URI, and token expiry.
- Encrypt provider refresh/access tokens at rest with envelope encryption and key rotation; never log tokens or full account identifiers.
- Mask account numbers; minimize retained personal data.
- Consent scopes, purpose, expiry, revocation, and provider terms are enforced on every sync.
- Append-only audit trail for consent, access, export, and administrative actions.
- Rate limits, anomaly detection, CSRF protection, CSP, secure cookies, dependency scanning, backups, disaster recovery, and incident response.
- Data residency and cross-border transfer rules are evaluated per jurisdiction.
- No credentials or secrets are requested in chat or committed to GitHub.

## UI requirements
- Global map/list by region, country, institution, and connector status.
- Clear status labels: Connected, Sandbox, Public data only, Consent required, Contract required, Unsupported, Error, Stale.
- Account dashboard with balances, transactions, currencies, and last-sync timestamps.
- Global cash and investment asset view must keep bank cash, brokerage positions, exchange balances, and liabilities separate before consolidation.
- FX conversion shows rate source/time and original currency.
- No fabricated sample values in production; demo fixtures are visibly marked as demo.

## Delivery phases and acceptance gates
### Phase 0 — architecture and governance
- Inventory jurisdictions, official schemes, provider coverage, terms, data residency, and licensing requirements.
- Threat model, data classification, retention policy, and consent UX.
- Acceptance: connector registry can accurately report capability and legal/technical readiness without implying live connectivity.

### Phase 1 — public-data foundation
- Implement institution/connector registry, FX and central-bank public-data connectors, normalized schema, ingestion health, and dashboard.
- Acceptance: every field has source and timestamp; stale/error state is visible; tests cover dedupe and schema validation.

### Phase 2 — authorized personal account pilot
- Select one jurisdiction and one bank/provider sandbox; implement consent lifecycle and read-only AIS.
- Acceptance: valid authorization, revocation, token encryption, RLS isolation, transaction dedupe, and reconciliation tests pass.

### Phase 3 — multi-region connectors
- Add licensed providers and direct bank APIs region by region.
- Acceptance: each institution has independently verified coverage, scopes, refresh limits, pricing, and production approval.

### Phase 4 — global intelligence
- Add aggregated FX exposure, liquidity concentration, cash-flow trends, anomaly alerts, and cross-market exposure.
- Acceptance: calculations reproducible, provenance visible, and no unsupported inference about other customers' private data.

### Phase 5 — institutional integrations
- Only with direct contracts and security/legal approval; payment initiation remains a separately governed product.

## Deployment notes for current project
- Preserve the existing production URL and Render service.
- Do not add a large always-on database or queue to the free web process.
- Separate worker/cron deployment and persistent storage may require a paid Render plan or external managed service; do not incur costs without approval.
- Start with schema, public-data adapters, registry, and UI behind feature flags. Do not add placeholder live bank links or claim global bank coverage.
- Existing market modules remain separate connectors and feed only the normalized asset aggregation layer.

## Implementation status (2026-11-18)
- Added `src/GlobalFinance.jsx` as the responsive Global Finance zone.
- Added `server/lib/global-finance.js` and read-only endpoints `/api/finance/registry` and `/api/finance/fx`.
- The initial directory lists 17 official institutions/data entry points across six regions. Directory status is not evidence of personal-account connectivity.
- Implemented an ECB daily reference-rate connector for a set of major currencies. Rates are daily reference observations, not tick-by-tick FX quotes; unsupported or unavailable currencies are reported as missing.
- Added `server/test/global-finance.test.js` for directory integrity.
- Added `supabase/migrations/202611180001_global_finance_foundation.sql` with RLS and least-privilege grants. This SQL migration is committed but has **not** been applied to the live Supabase project.
- No bank account credentials, refresh tokens, personal balances, or transactions are connected or stored.
- GitHub main includes the implementation; production deployment and live upstream FX response still require independent verification before describing the feature as live.
