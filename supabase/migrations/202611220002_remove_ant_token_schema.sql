-- Permanently remove ANT/ZENTRAX token-sale schema from Taiwan Stock Hunter.
-- These tables and views are dedicated to the discontinued token wallet, sale,
-- indexer, payment ledger, creator revenue, and listing administration features.
-- This intentionally deletes their stored records.
drop view if exists public.ant_creator_revenue_monthly_totals cascade;
drop view if exists public.ant_creator_revenue_eligible_events cascade;
drop view if exists public.ant_financial_ledger_totals cascade;

drop table if exists public.ant_creator_revenue_allocations cascade;
drop table if exists public.ant_indexer_state cascade;
drop table if exists public.ant_listing_metric_snapshots cascade;
drop table if exists public.ant_admin_audit_log cascade;
drop table if exists public.ant_wallet_nonces cascade;
drop table if exists public.ant_wallets cascade;
drop table if exists public.ant_admin_roles cascade;
drop table if exists public.ant_payment_audit_log cascade;
drop table if exists public.ant_financial_ledger cascade;
drop table if exists public.ant_payment_chain_events cascade;
drop table if exists public.ant_payment_orders cascade;
