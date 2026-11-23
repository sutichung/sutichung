create table if not exists public.ant_creator_revenue_allocations (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null references public.ant_payment_chain_events(id) on delete restrict,
  chain_id bigint not null check (chain_id = 97),
  tx_hash text not null check (char_length(tx_hash) = 66 and tx_hash ~ '^0x[0-9a-fA-F]+$'),
  log_index integer not null check (log_index >= 0),
  revenue_month date not null,
  fee_usdt_raw numeric(78,0) not null check (fee_usdt_raw > 0),
  tax_reserve_usdt_raw numeric(78,0) not null default 0 check (tax_reserve_usdt_raw >= 0),
  distributable_usdt_raw numeric(78,0) not null check (distributable_usdt_raw >= 0),
  creator_usdt_raw numeric(78,0) not null check (creator_usdt_raw >= 0),
  product_usdt_raw numeric(78,0) not null check (product_usdt_raw >= 0),
  security_usdt_raw numeric(78,0) not null check (security_usdt_raw >= 0),
  reserve_usdt_raw numeric(78,0) not null check (reserve_usdt_raw >= 0),
  status text not null default 'draft' check (status in ('draft','approved','paid','void')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  payout_tx_hash text check (payout_tx_hash is null or (char_length(payout_tx_hash) = 66 and payout_tx_hash ~ '^0x[0-9a-fA-F]+$')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_event_id),
  unique(chain_id, tx_hash, log_index),
  check (fee_usdt_raw = tax_reserve_usdt_raw + distributable_usdt_raw),
  check (distributable_usdt_raw = creator_usdt_raw + product_usdt_raw + security_usdt_raw + reserve_usdt_raw),
  check ((status = 'draft' and approved_at is null and paid_at is null and payout_tx_hash is null)
      or (status = 'approved' and approved_at is not null and paid_at is null and payout_tx_hash is null)
      or (status = 'paid' and approved_at is not null and paid_at is not null and payout_tx_hash is not null)
      or status = 'void')
);
create index if not exists ant_creator_allocations_month_idx
  on public.ant_creator_revenue_allocations(revenue_month desc, status);
alter table public.ant_creator_revenue_allocations enable row level security;
revoke all on public.ant_creator_revenue_allocations from anon, authenticated;
grant select, insert, update on public.ant_creator_revenue_allocations to service_role;

create or replace view public.ant_creator_revenue_eligible_events
with (security_invoker = true) as
select e.id as source_event_id, e.chain_id, e.tx_hash, e.log_index,
       date_trunc('month', e.observed_at)::date as revenue_month,
       e.fee_usdt_raw::numeric(78,0) as fee_usdt_raw,
       e.observed_at
from public.ant_payment_chain_events e
where e.chain_id = 97
  and e.canonical = true
  and e.fee_usdt_raw > 0
  and exists (
    select 1 from public.ant_financial_ledger l
    where l.chain_id = e.chain_id and l.tx_hash = e.tx_hash
      and l.log_index = e.log_index and l.entry_type = 'usdt_fee'
      and l.asset_symbol = 'USDT' and l.direction = 'in' and l.canonical = true
      and l.amount_raw = e.fee_usdt_raw
  );
grant select on public.ant_creator_revenue_eligible_events to service_role;

create or replace view public.ant_creator_revenue_monthly_totals
with (security_invoker = true) as
select revenue_month, status,
       count(*)::bigint as allocation_count,
       sum(fee_usdt_raw)::numeric(78,0) as gross_fee_usdt_raw,
       sum(tax_reserve_usdt_raw)::numeric(78,0) as tax_reserve_usdt_raw,
       sum(creator_usdt_raw)::numeric(78,0) as creator_usdt_raw,
       sum(product_usdt_raw)::numeric(78,0) as product_usdt_raw,
       sum(security_usdt_raw)::numeric(78,0) as security_usdt_raw,
       sum(reserve_usdt_raw)::numeric(78,0) as reserve_usdt_raw
from public.ant_creator_revenue_allocations
group by revenue_month, status;
grant select on public.ant_creator_revenue_monthly_totals to service_role;
