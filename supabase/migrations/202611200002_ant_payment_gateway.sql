create extension if not exists pgcrypto;
create table if not exists public.ant_payment_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 chain_id bigint not null check(chain_id=97), buyer_wallet text not null check(buyer_wallet~'^0x[a-fA-F0-9]{40}$'),
 sale_contract text not null check(sale_contract~'^0x[a-fA-F0-9]{40}$'), usdt_contract text not null check(usdt_contract~'^0x[a-fA-F0-9]{40}$'),
 ant_contract text not null check(ant_contract~'^0x[a-fA-F0-9]{40}$'),
 gross_usdt_raw numeric(78,0) not null check(gross_usdt_raw>0), fee_usdt_raw numeric(78,0) not null check(fee_usdt_raw>=0),
 net_usdt_raw numeric(78,0) not null check(net_usdt_raw>0), quoted_ant_raw numeric(78,0) not null check(quoted_ant_raw>0),
 min_ant_raw numeric(78,0) not null check(min_ant_raw>0), oracle_price_raw numeric(78,0) not null check(oracle_price_raw>0),
 quote_expires_at timestamptz not null, status text not null default 'created' check(status in ('created','submitted','observed','confirming','confirmed','delivered','expired','failed','reorged','manual_review')),
 tx_hash text check(tx_hash is null or tx_hash~'^0x[a-fA-F0-9]{64}$'), tx_log_index integer check(tx_log_index is null or tx_log_index>=0),
 block_number bigint check(block_number is null or block_number>0), block_hash text check(block_hash is null or block_hash~'^0x[a-fA-F0-9]{64}$'),
 confirmations integer not null default 0 check(confirmations>=0), failure_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(gross_usdt_raw=fee_usdt_raw+net_usdt_raw), check(min_ant_raw<=quoted_ant_raw), check((tx_hash is null)=(tx_log_index is null))
);
create unique index if not exists ant_payment_orders_chain_tx_uidx on public.ant_payment_orders(chain_id,tx_hash,tx_log_index) where tx_hash is not null;
create index if not exists ant_payment_orders_user_created_idx on public.ant_payment_orders(user_id,created_at desc);
create index if not exists ant_payment_orders_status_created_idx on public.ant_payment_orders(status,created_at);
create table if not exists public.ant_payment_chain_events (
 id uuid primary key default gen_random_uuid(), order_id uuid references public.ant_payment_orders(id) on delete restrict,
 chain_id bigint not null check(chain_id=97), tx_hash text not null check(tx_hash~'^0x[a-fA-F0-9]{64}$'),
 log_index integer not null check(log_index>=0), block_number bigint not null check(block_number>0),
 block_hash text not null check(block_hash~'^0x[a-fA-F0-9]{64}$'), event_name text not null check(event_name='AntPurchased'),
 buyer_wallet text not null check(buyer_wallet~'^0x[a-fA-F0-9]{40}$'),
 gross_usdt_raw numeric(78,0) not null check(gross_usdt_raw>0), fee_usdt_raw numeric(78,0) not null check(fee_usdt_raw>=0),
 net_usdt_raw numeric(78,0) not null check(net_usdt_raw>0), ant_out_raw numeric(78,0) not null check(ant_out_raw>0),
 oracle_price_raw numeric(78,0) not null check(oracle_price_raw>0), observed_at timestamptz not null default now(),
 canonical boolean not null default true, raw_event jsonb not null default '{}'::jsonb,
 unique(chain_id,tx_hash,log_index), check(gross_usdt_raw=fee_usdt_raw+net_usdt_raw)
);
create index if not exists ant_payment_events_order_idx on public.ant_payment_chain_events(order_id,observed_at desc);
create table if not exists public.ant_financial_ledger (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.ant_payment_orders(id) on delete restrict,
 chain_id bigint not null check(chain_id=97), tx_hash text not null check(tx_hash~'^0x[a-fA-F0-9]{64}$'),
 log_index integer not null check(log_index>=0), entry_type text not null check(entry_type in ('usdt_gross','usdt_fee','usdt_net','ant_delivery','reversal')),
 asset_symbol text not null check(asset_symbol in ('USDT','ANT')), asset_contract text not null check(asset_contract~'^0x[a-fA-F0-9]{40}$'),
 asset_decimals smallint not null check(asset_decimals between 0 and 36), amount_raw numeric(78,0) not null check(amount_raw>0),
 direction text not null check(direction in ('in','out')), wallet text not null check(wallet~'^0x[a-fA-F0-9]{40}$'),
 created_at timestamptz not null default now(), unique(chain_id,tx_hash,log_index,entry_type)
);
create index if not exists ant_financial_ledger_order_idx on public.ant_financial_ledger(order_id,created_at);
create table if not exists public.ant_payment_audit_log (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users(id) on delete set null,
 actor_type text not null check(actor_type in ('member','admin','system','worker')), action text not null,
 order_id uuid references public.ant_payment_orders(id) on delete restrict, correlation_id uuid,
 outcome text not null check(outcome in ('success','denied','error','warning')), metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.ant_payment_orders enable row level security;
alter table public.ant_payment_chain_events enable row level security;
alter table public.ant_financial_ledger enable row level security;
alter table public.ant_payment_audit_log enable row level security;
drop policy if exists ant_payment_orders_owner_read on public.ant_payment_orders;
create policy ant_payment_orders_owner_read on public.ant_payment_orders for select to authenticated using(auth.uid()=user_id);
drop policy if exists ant_payment_events_owner_read on public.ant_payment_chain_events;
create policy ant_payment_events_owner_read on public.ant_payment_chain_events for select to authenticated using(exists(select 1 from public.ant_payment_orders o where o.id=order_id and o.user_id=auth.uid()));
drop policy if exists ant_payment_ledger_owner_read on public.ant_financial_ledger;
create policy ant_payment_ledger_owner_read on public.ant_financial_ledger for select to authenticated using(exists(select 1 from public.ant_payment_orders o where o.id=order_id and o.user_id=auth.uid()));
drop policy if exists ant_payment_audit_owner_read on public.ant_payment_audit_log;
create policy ant_payment_audit_owner_read on public.ant_payment_audit_log for select to authenticated using(actor_user_id=auth.uid() and actor_type='member');
revoke all on public.ant_payment_orders,public.ant_payment_chain_events,public.ant_financial_ledger,public.ant_payment_audit_log from anon;
revoke insert,update,delete on public.ant_payment_orders,public.ant_payment_chain_events,public.ant_financial_ledger,public.ant_payment_audit_log from anon,authenticated;
grant select on public.ant_payment_orders,public.ant_payment_chain_events,public.ant_financial_ledger,public.ant_payment_audit_log to authenticated;
grant select,insert,update on public.ant_payment_orders to service_role;
grant select,insert,update on public.ant_payment_chain_events to service_role;
grant select,insert on public.ant_financial_ledger,public.ant_payment_audit_log to service_role;
