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
