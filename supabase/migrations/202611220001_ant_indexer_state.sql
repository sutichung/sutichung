-- Persistent checkpoint for the BSC testnet ANT log indexer.
-- The indexer uses the service role only. No browser access is granted.
create table if not exists public.ant_indexer_state (
  worker_key text primary key,
  chain_id bigint not null check (chain_id = 97),
  last_block bigint not null check (last_block >= -1),
  last_block_hash text check (last_block_hash is null or last_block_hash ~ '^0x[a-fA-F0-9]{64} timestamptz not null default now()
);
alter table public.ant_indexer_state enable row level security;
revoke all on public.ant_indexer_state from anon, authenticated;
grant select, insert, update on public.ant_indexer_state to service_role;
),
  updated_at timestamptz not null default now()
);
alter table public.ant_indexer_state enable row level security;
revoke all on public.ant_indexer_state from anon, authenticated;
grant select, insert, update on public.ant_indexer_state to service_role;
