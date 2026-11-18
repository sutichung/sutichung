-- Global Finance data foundation.
-- This migration defines tenant-isolated storage only; it does not connect any bank,
-- create consent, or store provider credentials/tokens.
create extension if not exists pgcrypto;

create table if not exists public.finance_institutions (
  id text primary key,
  legal_name text not null,
  country_code char(2) not null,
  region text not null,
  category text not null,
  official_url text,
  directory_status text not null default 'directory_only'
    check (directory_status in ('public_data_only','directory_only','contract_required','unsupported')),
  capabilities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_connectors (
  id text primary key,
  institution_id text references public.finance_institutions(id) on delete set null,
  provider text not null,
  connector_type text not null check (connector_type in ('public_data','account_information','institutional')),
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  status text not null default 'not_configured'
    check (status in ('not_configured','sandbox','pending_approval','active','degraded','disabled')),
  capabilities jsonb not null default '[]'::jsonb,
  last_success_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id text references public.finance_institutions(id) on delete set null,
  connector_id text references public.finance_connectors(id) on delete set null,
  provider_consent_ref_hash text,
  scopes jsonb not null default '[]'::jsonb,
  purpose text not null default 'account_information',
  status text not null default 'pending'
    check (status in ('pending','active','expired','revoked','rejected','error')),
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or granted_at is null or expires_at > granted_at)
);

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id text references public.finance_institutions(id) on delete set null,
  connector_id text references public.finance_connectors(id) on delete set null,
  consent_id uuid references public.finance_consents(id) on delete set null,
  provider_account_ref_hash text,
  masked_identifier text,
  account_name text,
  account_type text,
  currency char(3) not null,
  status text not null default 'active' check (status in ('active','closed','disconnected','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id)
);

create table if not exists public.finance_balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(28,10) not null,
  currency char(3) not null,
  balance_type text not null default 'current',
  observed_at timestamptz,
  fetched_at timestamptz not null default now(),
  source text not null,
  freshness text not null default 'unknown'
    check (freshness in ('realtime','delayed','historical','stale','unknown')),
  foreign key (account_id,user_id) references public.finance_accounts(id,user_id) on delete cascade
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_transaction_ref_hash text,
  amount numeric(28,10) not null,
  currency char(3) not null,
  booking_date date,
  value_date date,
  description text,
  category text,
  transaction_status text not null default 'booked',
  source text not null,
  fetched_at timestamptz not null default now(),
  foreign key (account_id,user_id) references public.finance_accounts(id,user_id) on delete cascade
);

create table if not exists public.finance_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'system',
  action text not null,
  subject_type text,
  subject_id text,
  outcome text not null default 'success',
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_consents_user_status_idx
  on public.finance_consents(user_id,status,expires_at);
create index if not exists finance_accounts_user_idx
  on public.finance_accounts(user_id,created_at desc);
create index if not exists finance_balances_user_observed_idx
  on public.finance_balances(user_id,observed_at desc);
create index if not exists finance_transactions_user_booking_idx
  on public.finance_transactions(user_id,booking_date desc);
create unique index if not exists finance_transactions_provider_ref_uidx
  on public.finance_transactions(account_id,provider_transaction_ref_hash)
  where provider_transaction_ref_hash is not null;
create index if not exists finance_audit_user_created_idx
  on public.finance_audit_events(user_id,created_at desc);

alter table public.finance_institutions enable row level security;
alter table public.finance_connectors enable row level security;
alter table public.finance_consents enable row level security;
alter table public.finance_accounts enable row level security;
alter table public.finance_balances enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_audit_events enable row level security;

-- Public directory metadata only. No private account data is exposed here.
drop policy if exists finance_institutions_public_read on public.finance_institutions;
create policy finance_institutions_public_read
  on public.finance_institutions for select to anon, authenticated using (true);

drop policy if exists finance_connectors_public_read on public.finance_connectors;
create policy finance_connectors_public_read
  on public.finance_connectors for select to anon, authenticated using (true);

-- Private records are readable only by their owner. Writes are reserved for the
-- trusted server-side service role after provider authorization and verification.
drop policy if exists finance_consents_owner_read on public.finance_consents;
create policy finance_consents_owner_read
  on public.finance_consents for select to authenticated using (auth.uid() = user_id);

drop policy if exists finance_accounts_owner_read on public.finance_accounts;
create policy finance_accounts_owner_read
  on public.finance_accounts for select to authenticated using (auth.uid() = user_id);

drop policy if exists finance_balances_owner_read on public.finance_balances;
create policy finance_balances_owner_read
  on public.finance_balances for select to authenticated using (auth.uid() = user_id);

drop policy if exists finance_transactions_owner_read on public.finance_transactions;
create policy finance_transactions_owner_read
  on public.finance_transactions for select to authenticated using (auth.uid() = user_id);

drop policy if exists finance_audit_owner_read on public.finance_audit_events;
create policy finance_audit_owner_read
  on public.finance_audit_events for select to authenticated using (auth.uid() = user_id);

-- Deliberately no client INSERT/UPDATE/DELETE policies for consent, accounts,
-- balances, transactions, or audit events. The server must verify consent,
-- connector ownership and provider responses before writing via service role.
