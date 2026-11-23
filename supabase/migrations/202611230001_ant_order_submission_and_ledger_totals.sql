do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.ant_payment_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tx_hash%'
      and pg_get_constraintdef(oid) ilike '%tx_log_index%'
  loop
    execute format('alter table public.ant_payment_orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.ant_payment_orders
  add constraint ant_payment_orders_tx_log_requires_hash
  check (tx_log_index is null or tx_hash is not null);

create unique index if not exists ant_payment_orders_chain_tx_hash_uidx
  on public.ant_payment_orders(chain_id, tx_hash)
  where tx_hash is not null;

create or replace view public.ant_financial_ledger_totals as
select entry_type, sum(amount_raw)::numeric(78,0) as amount_raw, count(*)::bigint as entry_count
from public.ant_financial_ledger
where canonical = true
group by entry_type;

revoke all on public.ant_financial_ledger_totals from anon, authenticated;
grant select on public.ant_financial_ledger_totals to service_role;
