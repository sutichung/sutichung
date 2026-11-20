-- ANT platform identity, wallet proof, sale ledger and listing evidence.
-- Apply only after reviewing this migration in the Supabase project.
-- All writes are intended for the trusted server/service role; clients are read-only under RLS.

create table if not exists public.ant_admin_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN','FINANCE_VIEWER','SUPPORT')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.ant_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_id bigint not null check (chain_id > 0),
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (chain_id, wallet_address)
);

create index if not exists ant_wallets_user_idx
  on public.ant_wallets(user_id, chain_id);

create table if not exists public.ant_wallet_nonces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_id bigint not null check (chain_id > 0),
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  nonce text not null unique,
  domain text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > issued_at)
);

create index if not exists ant_wallet_nonces_expiry_idx
  on public.ant_wallet_nonces(expires_at)
  where consumed_at is null;

create table if not exists public.ant_sale_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  chain_id bigint not null check (chain_id > 0),
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64} text not null check (buyer_wallet ~ '^0x[0-9a-f]{40}$'),
  sale_contract text not null check (sale_contract ~ '^0x[0-9a-f]{40}$'),
  usdt_contract text not null check (usdt_contract ~ '^0x[0-9a-f]{40}$'),
  ant_contract text not null check (ant_contract ~ '^0x[0-9a-f]{40}$'),
  gross_usdt numeric(78,0) not null check (gross_usdt > 0),
  fee_usdt numeric(78,0) not null check (fee_usdt >= 0),
  net_usdt numeric(78,0) not null check (net_usdt >= 0),
  ant_out numeric(78,0) not null check (ant_out > 0),
  oracle_price numeric(78,0) not null check (oracle_price > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','orphaned','failed')),
  confirmations integer not null default 0 check (confirmations >= 0),
  source text not null default 'bsc-log-indexer',
  observed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  check (gross_usdt = fee_usdt + net_usdt)
);

create index if not exists ant_sale_events_user_time_idx
  on public.ant_sale_events(user_id, created_at desc);
create index if not exists ant_sale_events_wallet_time_idx
  on public.ant_sale_events(chain_id, buyer_wallet, created_at desc);
create index if not exists ant_sale_events_status_block_idx
  on public.ant_sale_events(status, block_number);

create table if not exists public.ant_indexer_cursors (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null check (chain_id > 0),
  sale_contract text not null check (sale_contract ~ '^0x[0-9a-f]{40}
create table if not exists public.ant_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ant_admin_audit_log_time_idx
  on public.ant_admin_audit_log(created_at desc);

create table if not exists public.ant_listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  category text not null check (category in ('onchain','market','community','product','security','compliance')),
  metric_key text not null,
  metric_value numeric,
  unit text,
  source_name text not null,
  source_url text,
  methodology text not null,
  evidence_hash text,
  observed_at timestamptz not null,
  freshness_seconds integer check (freshness_seconds is null or freshness_seconds >= 0),
  quality_status text not null check (quality_status in ('verified','delayed','unavailable','disputed')),
  limitations text,
  created_at timestamptz not null default now(),
  unique (metric_date, category, metric_key, source_name)
);

create index if not exists ant_listing_metric_date_idx
  on public.ant_listing_metric_snapshots(metric_date desc, category);

alter table public.ant_admin_roles enable row level security;
alter table public.ant_wallets enable row level security;
alter table public.ant_wallet_nonces enable row level security;
alter table public.ant_sale_events enable row level security;
alter table public.ant_admin_audit_log enable row level security;
alter table public.ant_listing_metric_snapshots enable row level security;
alter table public.ant_indexer_cursors enable row level security;

-- Users can read only their own role assignment; role writes are service-role only.
drop policy if exists ant_admin_roles_read_self on public.ant_admin_roles;
create policy ant_admin_roles_read_self on public.ant_admin_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ant_wallets_read_self on public.ant_wallets;
create policy ant_wallets_read_self on public.ant_wallets
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_sale_events_read_owner_or_finance on public.ant_sale_events;
create policy ant_sale_events_read_owner_or_finance on public.ant_sale_events
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_admin_audit_read_super_admin on public.ant_admin_audit_log;
create policy ant_admin_audit_read_super_admin on public.ant_admin_audit_log
  for select to authenticated using (
    exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid() and r.role = 'SUPER_ADMIN'
    )
  );

drop policy if exists ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots;
create policy ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots
  for select to authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies are created. Trusted ingestion,
-- nonce consumption, role assignment and audit writes must use service-role APIs.
comment on table public.ant_wallet_nonces is
  'Server-managed, one-time wallet challenge nonces. Never expose service-role access to clients.';
comment on table public.ant_sale_events is
  'Append-only chain event ledger; unique chain_id + tx_hash + log_index prevents duplicate ingestion.';
comment on table public.ant_listing_metric_snapshots is
  'Evidence-backed listing metrics. Values must retain source, timestamp, methodology and quality state.';
comment on table public.ant_indexer_cursors is
  'Server-only BSC log indexer cursor. Service-role access only; cursor updates occur after idempotent event upserts.';
),
  buyer_wallet text not null check (buyer_wallet ~ '^0x[0-9a-f]{40}$'),
  sale_contract text not null check (sale_contract ~ '^0x[0-9a-f]{40}$'),
  usdt_contract text not null check (usdt_contract ~ '^0x[0-9a-f]{40}$'),
  ant_contract text not null check (ant_contract ~ '^0x[0-9a-f]{40}$'),
  gross_usdt numeric(78,0) not null check (gross_usdt > 0),
  fee_usdt numeric(78,0) not null check (fee_usdt >= 0),
  net_usdt numeric(78,0) not null check (net_usdt >= 0),
  ant_out numeric(78,0) not null check (ant_out > 0),
  oracle_price numeric(78,0) not null check (oracle_price > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','orphaned','failed')),
  confirmations integer not null default 0 check (confirmations >= 0),
  source text not null default 'bsc-log-indexer',
  observed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  check (gross_usdt = fee_usdt + net_usdt)
);

create index if not exists ant_sale_events_user_time_idx
  on public.ant_sale_events(user_id, created_at desc);
create index if not exists ant_sale_events_wallet_time_idx
  on public.ant_sale_events(chain_id, buyer_wallet, created_at desc);
create index if not exists ant_sale_events_status_block_idx
  on public.ant_sale_events(status, block_number);

create table if not exists public.ant_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ant_admin_audit_log_time_idx
  on public.ant_admin_audit_log(created_at desc);

create table if not exists public.ant_listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  category text not null check (category in ('onchain','market','community','product','security','compliance')),
  metric_key text not null,
  metric_value numeric,
  unit text,
  source_name text not null,
  source_url text,
  methodology text not null,
  evidence_hash text,
  observed_at timestamptz not null,
  freshness_seconds integer check (freshness_seconds is null or freshness_seconds >= 0),
  quality_status text not null check (quality_status in ('verified','delayed','unavailable','disputed')),
  limitations text,
  created_at timestamptz not null default now(),
  unique (metric_date, category, metric_key, source_name)
);

create index if not exists ant_listing_metric_date_idx
  on public.ant_listing_metric_snapshots(metric_date desc, category);

alter table public.ant_admin_roles enable row level security;
alter table public.ant_wallets enable row level security;
alter table public.ant_wallet_nonces enable row level security;
alter table public.ant_sale_events enable row level security;
alter table public.ant_admin_audit_log enable row level security;
alter table public.ant_listing_metric_snapshots enable row level security;

-- Users can read only their own role assignment; role writes are service-role only.
drop policy if exists ant_admin_roles_read_self on public.ant_admin_roles;
create policy ant_admin_roles_read_self on public.ant_admin_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ant_wallets_read_self on public.ant_wallets;
create policy ant_wallets_read_self on public.ant_wallets
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_sale_events_read_owner_or_finance on public.ant_sale_events;
create policy ant_sale_events_read_owner_or_finance on public.ant_sale_events
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_admin_audit_read_super_admin on public.ant_admin_audit_log;
create policy ant_admin_audit_read_super_admin on public.ant_admin_audit_log
  for select to authenticated using (
    exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid() and r.role = 'SUPER_ADMIN'
    )
  );

drop policy if exists ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots;
create policy ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots
  for select to authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies are created. Trusted ingestion,
-- nonce consumption, role assignment and audit writes must use service-role APIs.
comment on table public.ant_wallet_nonces is
  'Server-managed, one-time wallet challenge nonces. Never expose service-role access to clients.';
comment on table public.ant_sale_events is
  'Append-only chain event ledger; unique chain_id + tx_hash + log_index prevents duplicate ingestion.';
comment on table public.ant_listing_metric_snapshots is
  'Evidence-backed listing metrics. Values must retain source, timestamp, methodology and quality state.';
),
  last_scanned_block bigint not null check (last_scanned_block >= 0),
  last_block_hash text not null check (last_block_hash ~ '^0x[0-9a-f]{64}
create table if not exists public.ant_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ant_admin_audit_log_time_idx
  on public.ant_admin_audit_log(created_at desc);

create table if not exists public.ant_listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  category text not null check (category in ('onchain','market','community','product','security','compliance')),
  metric_key text not null,
  metric_value numeric,
  unit text,
  source_name text not null,
  source_url text,
  methodology text not null,
  evidence_hash text,
  observed_at timestamptz not null,
  freshness_seconds integer check (freshness_seconds is null or freshness_seconds >= 0),
  quality_status text not null check (quality_status in ('verified','delayed','unavailable','disputed')),
  limitations text,
  created_at timestamptz not null default now(),
  unique (metric_date, category, metric_key, source_name)
);

create index if not exists ant_listing_metric_date_idx
  on public.ant_listing_metric_snapshots(metric_date desc, category);

alter table public.ant_admin_roles enable row level security;
alter table public.ant_wallets enable row level security;
alter table public.ant_wallet_nonces enable row level security;
alter table public.ant_sale_events enable row level security;
alter table public.ant_admin_audit_log enable row level security;
alter table public.ant_listing_metric_snapshots enable row level security;

-- Users can read only their own role assignment; role writes are service-role only.
drop policy if exists ant_admin_roles_read_self on public.ant_admin_roles;
create policy ant_admin_roles_read_self on public.ant_admin_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ant_wallets_read_self on public.ant_wallets;
create policy ant_wallets_read_self on public.ant_wallets
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_sale_events_read_owner_or_finance on public.ant_sale_events;
create policy ant_sale_events_read_owner_or_finance on public.ant_sale_events
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_admin_audit_read_super_admin on public.ant_admin_audit_log;
create policy ant_admin_audit_read_super_admin on public.ant_admin_audit_log
  for select to authenticated using (
    exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid() and r.role = 'SUPER_ADMIN'
    )
  );

drop policy if exists ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots;
create policy ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots
  for select to authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies are created. Trusted ingestion,
-- nonce consumption, role assignment and audit writes must use service-role APIs.
comment on table public.ant_wallet_nonces is
  'Server-managed, one-time wallet challenge nonces. Never expose service-role access to clients.';
comment on table public.ant_sale_events is
  'Append-only chain event ledger; unique chain_id + tx_hash + log_index prevents duplicate ingestion.';
comment on table public.ant_listing_metric_snapshots is
  'Evidence-backed listing metrics. Values must retain source, timestamp, methodology and quality state.';
),
  buyer_wallet text not null check (buyer_wallet ~ '^0x[0-9a-f]{40}$'),
  sale_contract text not null check (sale_contract ~ '^0x[0-9a-f]{40}$'),
  usdt_contract text not null check (usdt_contract ~ '^0x[0-9a-f]{40}$'),
  ant_contract text not null check (ant_contract ~ '^0x[0-9a-f]{40}$'),
  gross_usdt numeric(78,0) not null check (gross_usdt > 0),
  fee_usdt numeric(78,0) not null check (fee_usdt >= 0),
  net_usdt numeric(78,0) not null check (net_usdt >= 0),
  ant_out numeric(78,0) not null check (ant_out > 0),
  oracle_price numeric(78,0) not null check (oracle_price > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','orphaned','failed')),
  confirmations integer not null default 0 check (confirmations >= 0),
  source text not null default 'bsc-log-indexer',
  observed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  check (gross_usdt = fee_usdt + net_usdt)
);

create index if not exists ant_sale_events_user_time_idx
  on public.ant_sale_events(user_id, created_at desc);
create index if not exists ant_sale_events_wallet_time_idx
  on public.ant_sale_events(chain_id, buyer_wallet, created_at desc);
create index if not exists ant_sale_events_status_block_idx
  on public.ant_sale_events(status, block_number);

create table if not exists public.ant_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ant_admin_audit_log_time_idx
  on public.ant_admin_audit_log(created_at desc);

create table if not exists public.ant_listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  category text not null check (category in ('onchain','market','community','product','security','compliance')),
  metric_key text not null,
  metric_value numeric,
  unit text,
  source_name text not null,
  source_url text,
  methodology text not null,
  evidence_hash text,
  observed_at timestamptz not null,
  freshness_seconds integer check (freshness_seconds is null or freshness_seconds >= 0),
  quality_status text not null check (quality_status in ('verified','delayed','unavailable','disputed')),
  limitations text,
  created_at timestamptz not null default now(),
  unique (metric_date, category, metric_key, source_name)
);

create index if not exists ant_listing_metric_date_idx
  on public.ant_listing_metric_snapshots(metric_date desc, category);

alter table public.ant_admin_roles enable row level security;
alter table public.ant_wallets enable row level security;
alter table public.ant_wallet_nonces enable row level security;
alter table public.ant_sale_events enable row level security;
alter table public.ant_admin_audit_log enable row level security;
alter table public.ant_listing_metric_snapshots enable row level security;

-- Users can read only their own role assignment; role writes are service-role only.
drop policy if exists ant_admin_roles_read_self on public.ant_admin_roles;
create policy ant_admin_roles_read_self on public.ant_admin_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ant_wallets_read_self on public.ant_wallets;
create policy ant_wallets_read_self on public.ant_wallets
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_sale_events_read_owner_or_finance on public.ant_sale_events;
create policy ant_sale_events_read_owner_or_finance on public.ant_sale_events
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_admin_audit_read_super_admin on public.ant_admin_audit_log;
create policy ant_admin_audit_read_super_admin on public.ant_admin_audit_log
  for select to authenticated using (
    exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid() and r.role = 'SUPER_ADMIN'
    )
  );

drop policy if exists ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots;
create policy ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots
  for select to authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies are created. Trusted ingestion,
-- nonce consumption, role assignment and audit writes must use service-role APIs.
comment on table public.ant_wallet_nonces is
  'Server-managed, one-time wallet challenge nonces. Never expose service-role access to clients.';
comment on table public.ant_sale_events is
  'Append-only chain event ledger; unique chain_id + tx_hash + log_index prevents duplicate ingestion.';
comment on table public.ant_listing_metric_snapshots is
  'Evidence-backed listing metrics. Values must retain source, timestamp, methodology and quality state.';
),
  updated_at timestamptz not null default now(),
  unique (chain_id, sale_contract)
);

create table if not exists public.ant_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ant_admin_audit_log_time_idx
  on public.ant_admin_audit_log(created_at desc);

create table if not exists public.ant_listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  category text not null check (category in ('onchain','market','community','product','security','compliance')),
  metric_key text not null,
  metric_value numeric,
  unit text,
  source_name text not null,
  source_url text,
  methodology text not null,
  evidence_hash text,
  observed_at timestamptz not null,
  freshness_seconds integer check (freshness_seconds is null or freshness_seconds >= 0),
  quality_status text not null check (quality_status in ('verified','delayed','unavailable','disputed')),
  limitations text,
  created_at timestamptz not null default now(),
  unique (metric_date, category, metric_key, source_name)
);

create index if not exists ant_listing_metric_date_idx
  on public.ant_listing_metric_snapshots(metric_date desc, category);

alter table public.ant_admin_roles enable row level security;
alter table public.ant_wallets enable row level security;
alter table public.ant_wallet_nonces enable row level security;
alter table public.ant_sale_events enable row level security;
alter table public.ant_admin_audit_log enable row level security;
alter table public.ant_listing_metric_snapshots enable row level security;

-- Users can read only their own role assignment; role writes are service-role only.
drop policy if exists ant_admin_roles_read_self on public.ant_admin_roles;
create policy ant_admin_roles_read_self on public.ant_admin_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ant_wallets_read_self on public.ant_wallets;
create policy ant_wallets_read_self on public.ant_wallets
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_sale_events_read_owner_or_finance on public.ant_sale_events;
create policy ant_sale_events_read_owner_or_finance on public.ant_sale_events
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_admin_audit_read_super_admin on public.ant_admin_audit_log;
create policy ant_admin_audit_read_super_admin on public.ant_admin_audit_log
  for select to authenticated using (
    exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid() and r.role = 'SUPER_ADMIN'
    )
  );

drop policy if exists ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots;
create policy ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots
  for select to authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies are created. Trusted ingestion,
-- nonce consumption, role assignment and audit writes must use service-role APIs.
comment on table public.ant_wallet_nonces is
  'Server-managed, one-time wallet challenge nonces. Never expose service-role access to clients.';
comment on table public.ant_sale_events is
  'Append-only chain event ledger; unique chain_id + tx_hash + log_index prevents duplicate ingestion.';
comment on table public.ant_listing_metric_snapshots is
  'Evidence-backed listing metrics. Values must retain source, timestamp, methodology and quality state.';
),
  buyer_wallet text not null check (buyer_wallet ~ '^0x[0-9a-f]{40}$'),
  sale_contract text not null check (sale_contract ~ '^0x[0-9a-f]{40}$'),
  usdt_contract text not null check (usdt_contract ~ '^0x[0-9a-f]{40}$'),
  ant_contract text not null check (ant_contract ~ '^0x[0-9a-f]{40}$'),
  gross_usdt numeric(78,0) not null check (gross_usdt > 0),
  fee_usdt numeric(78,0) not null check (fee_usdt >= 0),
  net_usdt numeric(78,0) not null check (net_usdt >= 0),
  ant_out numeric(78,0) not null check (ant_out > 0),
  oracle_price numeric(78,0) not null check (oracle_price > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','orphaned','failed')),
  confirmations integer not null default 0 check (confirmations >= 0),
  source text not null default 'bsc-log-indexer',
  observed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  check (gross_usdt = fee_usdt + net_usdt)
);

create index if not exists ant_sale_events_user_time_idx
  on public.ant_sale_events(user_id, created_at desc);
create index if not exists ant_sale_events_wallet_time_idx
  on public.ant_sale_events(chain_id, buyer_wallet, created_at desc);
create index if not exists ant_sale_events_status_block_idx
  on public.ant_sale_events(status, block_number);

create table if not exists public.ant_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ant_admin_audit_log_time_idx
  on public.ant_admin_audit_log(created_at desc);

create table if not exists public.ant_listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  category text not null check (category in ('onchain','market','community','product','security','compliance')),
  metric_key text not null,
  metric_value numeric,
  unit text,
  source_name text not null,
  source_url text,
  methodology text not null,
  evidence_hash text,
  observed_at timestamptz not null,
  freshness_seconds integer check (freshness_seconds is null or freshness_seconds >= 0),
  quality_status text not null check (quality_status in ('verified','delayed','unavailable','disputed')),
  limitations text,
  created_at timestamptz not null default now(),
  unique (metric_date, category, metric_key, source_name)
);

create index if not exists ant_listing_metric_date_idx
  on public.ant_listing_metric_snapshots(metric_date desc, category);

alter table public.ant_admin_roles enable row level security;
alter table public.ant_wallets enable row level security;
alter table public.ant_wallet_nonces enable row level security;
alter table public.ant_sale_events enable row level security;
alter table public.ant_admin_audit_log enable row level security;
alter table public.ant_listing_metric_snapshots enable row level security;

-- Users can read only their own role assignment; role writes are service-role only.
drop policy if exists ant_admin_roles_read_self on public.ant_admin_roles;
create policy ant_admin_roles_read_self on public.ant_admin_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ant_wallets_read_self on public.ant_wallets;
create policy ant_wallets_read_self on public.ant_wallets
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_sale_events_read_owner_or_finance on public.ant_sale_events;
create policy ant_sale_events_read_owner_or_finance on public.ant_sale_events
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid()
        and r.role in ('SUPER_ADMIN','FINANCE_VIEWER')
    )
  );

drop policy if exists ant_admin_audit_read_super_admin on public.ant_admin_audit_log;
create policy ant_admin_audit_read_super_admin on public.ant_admin_audit_log
  for select to authenticated using (
    exists (
      select 1 from public.ant_admin_roles r
      where r.user_id = auth.uid() and r.role = 'SUPER_ADMIN'
    )
  );

drop policy if exists ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots;
create policy ant_listing_metrics_read_authenticated on public.ant_listing_metric_snapshots
  for select to authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies are created. Trusted ingestion,
-- nonce consumption, role assignment and audit writes must use service-role APIs.
comment on table public.ant_wallet_nonces is
  'Server-managed, one-time wallet challenge nonces. Never expose service-role access to clients.';
comment on table public.ant_sale_events is
  'Append-only chain event ledger; unique chain_id + tx_hash + log_index prevents duplicate ingestion.';
comment on table public.ant_listing_metric_snapshots is
  'Evidence-backed listing metrics. Values must retain source, timestamp, methodology and quality state.';
