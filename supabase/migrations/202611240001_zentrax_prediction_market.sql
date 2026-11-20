-- ZENTRAX Crypto Prediction Market v1: virtual-credit-only markets.
-- No real USDT, wallet deposits, withdrawals, or token transfers are supported.
create extension if not exists pgcrypto;

create table if not exists public.prediction_markets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  symbol text not null check (symbol in ('BTCUSDT','ETHUSDT','BNBUSDT')),
  direction text not null check (direction in ('ABOVE','BELOW')),
  strike_price numeric(30,10) not null check (strike_price > 0),
  reference_price numeric(30,10) not null check (reference_price > 0),
  reference_source text not null default 'Binance Spot public ticker',
  reference_as_of timestamptz not null,
  close_at timestamptz not null,
  resolve_after timestamptz not null,
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  yes_pool numeric(30,8) not null default 0 check (yes_pool >= 0),
  no_pool numeric(30,8) not null default 0 check (no_pool >= 0),
  resolved_outcome boolean,
  resolution_price numeric(30,10),
  resolution_source text,
  resolution_candle_open timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (resolve_after = close_at + interval '1 minute'),
  check ((status = 'resolved' and resolved_outcome is not null and resolution_price is not null and resolved_at is not null)
      or status <> 'resolved')
);
create index if not exists prediction_markets_status_close_idx on public.prediction_markets(status, close_at);

create table if not exists public.prediction_paper_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(30,8) not null default 10000 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_paper_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  market_id uuid not null references public.prediction_markets(id) on delete restrict,
  yes_shares numeric(30,8) not null default 0 check (yes_shares >= 0),
  no_shares numeric(30,8) not null default 0 check (no_shares >= 0),
  yes_cost numeric(30,8) not null default 0 check (yes_cost >= 0),
  no_cost numeric(30,8) not null default 0 check (no_cost >= 0),
  payout numeric(30,8) not null default 0 check (payout >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create table if not exists public.prediction_paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  market_id uuid not null references public.prediction_markets(id) on delete restrict,
  client_order_id uuid not null,
  side text not null check (side in ('YES','NO')),
  stake numeric(30,8) not null check (stake > 0),
  shares numeric(30,8) not null check (shares > 0),
  price numeric(12,10) not null check (price >= 0.05 and price <= 0.95),
  created_at timestamptz not null default now()
);
create unique index if not exists prediction_paper_orders_client_id_uidx on public.prediction_paper_orders(user_id, client_order_id);
create index if not exists prediction_paper_orders_user_idx on public.prediction_paper_orders(user_id, created_at desc);
create index if not exists prediction_paper_orders_market_idx on public.prediction_paper_orders(market_id, created_at);

create table if not exists public.prediction_paper_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  market_id uuid references public.prediction_markets(id) on delete restrict,
  order_id uuid references public.prediction_paper_orders(id) on delete restrict,
  entry_type text not null check (entry_type in ('welcome_credit','order_stake','market_payout')),
  amount numeric(30,8) not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.prediction_markets enable row level security;
alter table public.prediction_paper_accounts enable row level security;
alter table public.prediction_paper_positions enable row level security;
alter table public.prediction_paper_orders enable row level security;
alter table public.prediction_paper_ledger enable row level security;
revoke all on public.prediction_markets, public.prediction_paper_accounts, public.prediction_paper_positions, public.prediction_paper_orders, public.prediction_paper_ledger from anon, authenticated;
grant select, insert, update on public.prediction_markets to service_role;
grant select, insert, update on public.prediction_paper_accounts, public.prediction_paper_positions, public.prediction_paper_orders, public.prediction_paper_ledger to service_role;

create or replace function public.ensure_prediction_paper_account(p_user_id uuid)
returns public.prediction_paper_accounts
language plpgsql security definer set search_path = public
as $$
declare a public.prediction_paper_accounts;
begin
  insert into public.prediction_paper_accounts(user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into a from public.prediction_paper_accounts where user_id = p_user_id;
  if not exists (select 1 from public.prediction_paper_ledger where user_id = p_user_id and idempotency_key = 'welcome:' || p_user_id::text) then
    insert into public.prediction_paper_ledger(user_id, entry_type, amount, idempotency_key)
    values (p_user_id, 'welcome_credit', 10000, 'welcome:' || p_user_id::text)
    on conflict (idempotency_key) do nothing;
  end if;
  return a;
end $$;

create or replace function public.place_prediction_paper_order(p_user_id uuid, p_market_id uuid, p_side text, p_stake numeric, p_client_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m public.prediction_markets; a public.prediction_paper_accounts;
  yp numeric; np numeric; px numeric; shares numeric; order_row public.prediction_paper_orders;
begin
  if p_user_id is null or p_client_order_id is null or p_side is null or p_side not in ('YES','NO') or p_stake is null or p_stake < 1 or p_stake > 1000 or round(p_stake,2) <> p_stake then
    raise exception 'invalid_prediction_order';
  end if;
  perform public.ensure_prediction_paper_account(p_user_id);
  select * into order_row from public.prediction_paper_orders where user_id=p_user_id and client_order_id=p_client_order_id;
  if found then
    select * into a from public.prediction_paper_accounts where user_id=p_user_id;
    return jsonb_build_object('orderId',order_row.id,'side',order_row.side,'stake',order_row.stake,'shares',order_row.shares,'price',order_row.price,'balance',a.balance,'duplicate',true);
  end if;
  select * into m from public.prediction_markets where id = p_market_id for update;
  if not found or m.status <> 'open' or m.close_at <= now() then raise exception 'prediction_market_not_open'; end if;
  select * into a from public.prediction_paper_accounts where user_id = p_user_id for update;
  if a.balance < p_stake then raise exception 'insufficient_virtual_credits'; end if;
  yp := least(0.95::numeric, greatest(0.05::numeric, (m.yes_pool + 1000) / (m.yes_pool + m.no_pool + 2000)));
  np := 1 - yp;
  px := case when p_side = 'YES' then yp else np end;
  shares := round(p_stake / px, 8);
  update public.prediction_paper_accounts set balance = balance - p_stake, updated_at = now() where user_id = p_user_id;
  if p_side = 'YES' then update public.prediction_markets set yes_pool = yes_pool + p_stake where id = p_market_id;
  else update public.prediction_markets set no_pool = no_pool + p_stake where id = p_market_id; end if;
  insert into public.prediction_paper_positions(user_id, market_id, yes_shares, no_shares, yes_cost, no_cost)
  values (p_user_id, p_market_id, case when p_side='YES' then shares else 0 end, case when p_side='NO' then shares else 0 end,
    case when p_side='YES' then p_stake else 0 end, case when p_side='NO' then p_stake else 0 end)
  on conflict (user_id, market_id) do update set
    yes_shares = prediction_paper_positions.yes_shares + excluded.yes_shares,
    no_shares = prediction_paper_positions.no_shares + excluded.no_shares,
    yes_cost = prediction_paper_positions.yes_cost + excluded.yes_cost,
    no_cost = prediction_paper_positions.no_cost + excluded.no_cost,
    updated_at = now();
  insert into public.prediction_paper_orders(user_id, market_id, client_order_id, side, stake, shares, price)
  values (p_user_id, p_market_id, p_client_order_id, p_side, p_stake, shares, px) returning * into order_row;
  insert into public.prediction_paper_ledger(user_id, market_id, order_id, entry_type, amount, idempotency_key)
  values (p_user_id, p_market_id, order_row.id, 'order_stake', -p_stake, 'order:' || order_row.id::text);
  select * into a from public.prediction_paper_accounts where user_id = p_user_id;
  return jsonb_build_object('orderId', order_row.id, 'side', p_side, 'stake', p_stake, 'shares', shares, 'price', px, 'balance', a.balance);
end $$;

create or replace function public.settle_prediction_market(p_market_id uuid, p_outcome boolean, p_resolution_price numeric, p_source text, p_candle_open timestamptz)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m public.prediction_markets; total_pool numeric; winning_shares numeric; paid_count integer;
begin
  select * into m from public.prediction_markets where id = p_market_id for update;
  if not found or m.status <> 'open' or m.resolve_after > now() then raise exception 'prediction_market_not_due'; end if;
  total_pool := m.yes_pool + m.no_pool;
  if p_resolution_price <= 0 or p_source <> 'Binance Spot 1m kline close' or p_candle_open <> m.close_at then
    raise exception 'invalid_prediction_resolution_evidence';
  end if;
  select coalesce(sum(case when p_outcome then yes_shares else no_shares end),0)
    into winning_shares from public.prediction_paper_positions where market_id = p_market_id;
  update public.prediction_markets set status='resolved', resolved_outcome=p_outcome, resolution_price=p_resolution_price,
    resolution_source=p_source, resolution_candle_open=p_candle_open, resolved_at=now() where id=p_market_id;
  if winning_shares = 0 then
    -- If no participant chose the resolved side, refund each paper stake instead of confiscating credits.
    with refunds as (
      select user_id, yes_cost + no_cost as amount
      from public.prediction_paper_positions
      where market_id=p_market_id and yes_cost + no_cost > 0
    ), credited as (
      update public.prediction_paper_accounts a set balance=a.balance+r.amount, updated_at=now()
      from refunds r where a.user_id=r.user_id returning a.user_id, r.amount
    )
    insert into public.prediction_paper_ledger(user_id, market_id, entry_type, amount, idempotency_key)
    select user_id, p_market_id, 'market_payout', amount, 'payout:' || p_market_id::text || ':' || user_id::text from credited
    on conflict (idempotency_key) do nothing;
    update public.prediction_paper_positions p set payout=coalesce(l.amount,0), updated_at=now()
    from (select user_id, sum(amount) amount from public.prediction_paper_ledger
      where market_id=p_market_id and entry_type='market_payout' group by user_id) l
    where p.market_id=p_market_id and p.user_id=l.user_id;
  elsif total_pool > 0 then
    with payouts as (
      select user_id, round(total_pool * (case when p_outcome then yes_shares else no_shares end) / winning_shares, 8) as amount
      from public.prediction_paper_positions where market_id=p_market_id
        and (case when p_outcome then yes_shares else no_shares end) > 0
    ), credited as (
      update public.prediction_paper_accounts a set balance=a.balance+p.amount, updated_at=now()
      from payouts p where a.user_id=p.user_id returning a.user_id, p.amount
    )
    insert into public.prediction_paper_ledger(user_id, market_id, entry_type, amount, idempotency_key)
    select user_id, p_market_id, 'market_payout', amount, 'payout:' || p_market_id::text || ':' || user_id::text from credited
    on conflict (idempotency_key) do nothing;
    update public.prediction_paper_positions p set payout=coalesce(l.amount,0), updated_at=now()
    from (select user_id, sum(amount) amount from public.prediction_paper_ledger
      where market_id=p_market_id and entry_type='market_payout' group by user_id) l
    where p.market_id=p_market_id and p.user_id=l.user_id;
  end if;
  select count(*) into paid_count from public.prediction_paper_ledger where market_id=p_market_id and entry_type='market_payout';
  return jsonb_build_object('marketId',p_market_id,'outcome',p_outcome,'resolutionPrice',p_resolution_price,'payoutAccounts',paid_count);
end $$;

revoke all on function public.ensure_prediction_paper_account(uuid) from public, anon, authenticated;
revoke all on function public.place_prediction_paper_order(uuid,uuid,text,numeric,uuid) from public, anon, authenticated;
revoke all on function public.settle_prediction_market(uuid,boolean,numeric,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ensure_prediction_paper_account(uuid) to service_role;
grant execute on function public.place_prediction_paper_order(uuid,uuid,text,numeric) to service_role;
grant execute on function public.settle_prediction_market(uuid,boolean,numeric,text,timestamptz) to service_role;
