-- Persistent prediction evidence, cross-provider checks, horizon outcomes and calibration.
create table if not exists public.market_prediction_snapshots (
 id uuid primary key default gen_random_uuid(),
 prediction_key text not null unique,
 market text not null check (market in ('TW-STOCK','US-STOCK','CRYPTO')),
 symbol text not null,
 timeframe text not null check (timeframe in ('1h','1d','5d','20d')),
 model_version text not null,
 direction text not null check (direction in ('UP','DOWN','NEUTRAL')),
 score numeric,
 confidence numeric check (confidence is null or confidence between 0 and 1),
 raw_up_probability numeric check (raw_up_probability is null or raw_up_probability between 0 and 1),
 up_probability numeric check (up_probability is null or up_probability between 0 and 1),
 calibration_applied boolean not null default false,
 probability_semantics text,
 reference_price numeric not null check (reference_price > 0),
 reference_as_of timestamptz not null,
 source_consensus jsonb not null,
 source_spread_bps numeric not null check (source_spread_bps >= 0),
 consensus_status text not null check (consensus_status in ('VERIFIED','DISAGREEMENT','INSUFFICIENT_SOURCES')),
 feature_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 constraint prediction_probability_semantics check (
   (up_probability is null and probability_semantics is null) or
   (up_probability is not null and probability_semantics = 'UP_PROBABILITY')
 )
);
create index if not exists idx_prediction_snapshot_subject on public.market_prediction_snapshots(market,symbol,timeframe,created_at desc);
create table if not exists public.market_prediction_source_observations (
 id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null references public.market_prediction_snapshots(id) on delete cascade,
 provider text not null,
 source_class text not null,
 price numeric not null check(price>0),
 observed_at timestamptz not null,
 data_mode text not null check(data_mode in ('REALTIME','DELAYED','END_OF_DAY','HISTORICAL')),
 authorized boolean not null,
 region text,
 latency_ms integer check(latency_ms is null or latency_ms>=0),
 created_at timestamptz not null default now(),
 unique(snapshot_id,provider)
);
create index if not exists idx_prediction_sources_snapshot on public.market_prediction_source_observations(snapshot_id,observed_at);
create table if not exists public.market_prediction_outcomes (
 id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null references public.market_prediction_snapshots(id) on delete cascade,
 horizon text not null check(horizon in ('1h','1d','5d','20d')),
 due_at timestamptz not null,
 status text not null default 'PENDING' check(status in ('PENDING','SETTLED','EXCLUDED')),
 observed_price numeric check(observed_price is null or observed_price>0),
 observed_at timestamptz,
 observation_source text,
 net_return_pct numeric,
 direction_correct boolean,
 actual_up boolean,
 exclusion_reason text,
 settled_at timestamptz,
 created_at timestamptz not null default now(),
 unique(snapshot_id,horizon)
);
create index if not exists idx_prediction_outcomes_due on public.market_prediction_outcomes(status,due_at);
create table if not exists public.market_model_calibration (
 id uuid primary key default gen_random_uuid(),
 model_version text not null,
 market text not null,
 horizon text not null check(horizon in ('1h','1d','5d','20d')),
 sample_count integer not null check(sample_count>=0),
 brier_score numeric,
 directional_accuracy numeric,
 calibration_bins jsonb not null default '[]'::jsonb,
 eligible boolean not null default false,
 exclusion_reason text,
 computed_at timestamptz not null default now(),
 unique(model_version,market,horizon)
);
create or replace function public.record_prediction_snapshot(p_snapshot jsonb,p_observations jsonb,p_horizons jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_obs jsonb; v_h jsonb;
begin
 if p_snapshot->>'consensus_status'<>'VERIFIED' then
   raise exception 'source_consensus_not_verified' using errcode='22023';
 end if;
 if jsonb_typeof(p_observations)<>'array' or jsonb_array_length(p_observations)<2 then
   raise exception 'at_least_two_source_observations_required' using errcode='22023';
 end if;
 insert into public.market_prediction_snapshots(
  prediction_key,market,symbol,timeframe,model_version,direction,score,confidence,raw_up_probability,up_probability,calibration_applied,probability_semantics,
  reference_price,reference_as_of,source_consensus,source_spread_bps,consensus_status,feature_snapshot
 ) values(
  p_snapshot->>'prediction_key',p_snapshot->>'market',upper(p_snapshot->>'symbol'),p_snapshot->>'timeframe',
  p_snapshot->>'model_version',p_snapshot->>'direction',nullif(p_snapshot->>'score','')::numeric,
  nullif(p_snapshot->>'confidence','')::numeric,nullif(p_snapshot->>'raw_up_probability','')::numeric,nullif(p_snapshot->>'up_probability','')::numeric,
  coalesce((p_snapshot->>'calibration_applied')::boolean,false),p_snapshot->>'probability_semantics',(p_snapshot->>'reference_price')::numeric,(p_snapshot->>'reference_as_of')::timestamptz,
  coalesce(p_snapshot->'source_consensus','{}'::jsonb),(p_snapshot->>'source_spread_bps')::numeric,'VERIFIED',
  coalesce(p_snapshot->'feature_snapshot','{}'::jsonb)
 ) on conflict(prediction_key) do nothing
 returning id into v_id;
 if v_id is null then select id into v_id from public.market_prediction_snapshots where prediction_key=p_snapshot->>'prediction_key'; end if;
 for v_obs in select * from jsonb_array_elements(p_observations) loop
  insert into public.market_prediction_source_observations(snapshot_id,provider,source_class,price,observed_at,data_mode,authorized,region,latency_ms)
  values(v_id,v_obs->>'provider',v_obs->>'source_class',(v_obs->>'price')::numeric,(v_obs->>'observed_at')::timestamptz,
   v_obs->>'data_mode',(v_obs->>'authorized')::boolean,v_obs->>'region',nullif(v_obs->>'latency_ms','')::integer)
  on conflict(snapshot_id,provider) do nothing;
 end loop;
 for v_h in select * from jsonb_array_elements(p_horizons) loop
  insert into public.market_prediction_outcomes(snapshot_id,horizon,due_at)
  values(v_id,v_h->>'horizon',(v_h->>'due_at')::timestamptz)
  on conflict(snapshot_id,horizon) do nothing;
 end loop;
 return jsonb_build_object('snapshot_id',v_id,'status','recorded');
end; $$;
revoke all on function public.record_prediction_snapshot(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_prediction_snapshot(jsonb,jsonb,jsonb) to service_role;
create or replace function public.reject_prediction_evidence_mutation()
returns trigger language plpgsql as $
begin
 raise exception 'prediction evidence is append-only' using errcode='55000';
end; $;
drop trigger if exists trg_prediction_snapshot_immutable on public.market_prediction_snapshots;
create trigger trg_prediction_snapshot_immutable before update or delete on public.market_prediction_snapshots
for each row execute function public.reject_prediction_evidence_mutation();
drop trigger if exists trg_prediction_source_immutable on public.market_prediction_source_observations;
create trigger trg_prediction_source_immutable before update or delete on public.market_prediction_source_observations
for each row execute function public.reject_prediction_evidence_mutation();
revoke all on public.market_prediction_snapshots,public.market_prediction_source_observations,public.market_prediction_outcomes,public.market_model_calibration from anon,authenticated;
grant select,insert on public.market_prediction_snapshots,public.market_prediction_source_observations to service_role;
grant select,insert,update on public.market_prediction_outcomes,public.market_model_calibration to service_role;
