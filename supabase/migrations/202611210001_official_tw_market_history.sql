-- Official Taiwan stock daily bars captured from TWSE / TPEx public exchange endpoints.
-- This table stores unadjusted end-of-day prices only; it is not an intraday feed.
create table if not exists public.tw_market_daily_bars (
  symbol text not null,
  exchange text not null check (exchange in ('TWSE', 'TPEx')),
  trade_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null check (close > 0),
  volume numeric not null default 0 check (volume >= 0),
  turnover numeric,
  trades numeric,
  source text not null,
  source_url text not null,
  received_at timestamptz not null default now(),
  primary key (symbol, exchange, trade_date),
  check (high is null or low is null or high >= low),
  check (open is null or high is null or high >= open),
  check (open is null or low is null or low <= open),
  check (close is null or high is null or high >= close),
  check (close is null or low is null or low <= close)
);

create index if not exists tw_market_daily_bars_exchange_date_idx
  on public.tw_market_daily_bars (exchange, trade_date desc);

create index if not exists tw_market_daily_bars_symbol_date_idx
  on public.tw_market_daily_bars (symbol, trade_date desc);

alter table public.tw_market_daily_bars enable row level security;
grant all on table public.tw_market_daily_bars to service_role;
-- The application writes and reads this table only with the server-side service role key.
-- No anon/authenticated policies are intentionally created.

-- Returns each symbol's most recent N official daily bars for the server-side scanner.
create or replace function public.tw_market_scan_history(p_limit integer default 120)
returns table(symbol text, exchange text, bars jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select b.symbol, b.exchange, b.trade_date, b.open, b.high, b.low, b.close, b.volume,
      row_number() over (partition by b.symbol, b.exchange order by b.trade_date desc) as rn
    from public.tw_market_daily_bars b
  )
  select r.symbol, r.exchange,
    jsonb_agg(jsonb_build_object(
      'time', r.trade_date, 'open', r.open, 'high', r.high, 'low', r.low,
      'close', r.close, 'volume', r.volume
    ) order by r.trade_date asc) as bars
  from ranked r
  where r.rn <= greatest(60, least(coalesce(p_limit, 120), 500))
  group by r.symbol, r.exchange;
$$;
revoke all on function public.tw_market_scan_history(integer) from public, anon, authenticated;
grant execute on function public.tw_market_scan_history(integer) to service_role;
