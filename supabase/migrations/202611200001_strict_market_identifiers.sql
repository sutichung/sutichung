-- Enforce canonical market identifiers for all new signal journal writes.
-- NOT VALID preserves legacy rows for audit while enforcing the rule on new/updated rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_signal_events_market_allowed'
      and conrelid = 'public.market_signal_events'::regclass
  ) then
    alter table public.market_signal_events
      add constraint market_signal_events_market_allowed
      check (market in ('tw-stock', 'us-stock', 'crypto')) not valid;
  end if;
end $$;

create or replace function public.record_market_signal(
 p_signal_key text,p_symbol text,p_market text,p_timeframe text,p_action text,p_side text,p_price numeric,p_as_of timestamptz,
 p_source text,p_confidence numeric,p_regime_tag text,p_strategy_id text,p_thesis text,p_metadata jsonb,
 p_cooldown_seconds integer,p_daily_max_triggers integer,p_min_shift_pct numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_subject text:=upper(p_market)||':'||upper(p_symbol)||':'||p_timeframe||':'||p_strategy_id;
 v_state public.market_signal_trigger_state%rowtype;v_count integer;v_id uuid;v_now timestamptz:=now();v_shift numeric;
begin
 if p_market is null or p_market not in ('tw-stock','us-stock','crypto')
  or p_signal_key is null or length(p_signal_key)<16 or p_price is null or p_price<=0
  or p_confidence is null or p_confidence<0 or p_confidence>1
  or p_action not in ('ALERT_BULLISH','ALERT_BEARISH','HOLD') or p_side not in ('LONG','SHORT','FLAT')
  or p_source is null or length(trim(p_source))=0 then
  raise exception 'invalid_signal_payload_or_market' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(upper(p_market)||':'||upper(p_symbol)));
 if exists(select 1 from public.market_signal_events where signal_key=p_signal_key) then
  return jsonb_build_object('status','duplicate','reason','IDEMPOTENCY_KEY_EXISTS');
 end if;
 if p_action<>'HOLD' then
  select count(*) into v_count from public.market_signal_events
   where market=p_market and symbol=upper(p_symbol) and action<>'HOLD'
   and created_at>=(date_trunc('day',v_now at time zone 'Asia/Taipei') at time zone 'Asia/Taipei');
  if v_count>=greatest(1,least(p_daily_max_triggers,500)) then
   return jsonb_build_object('status','suppressed','reason','DAILY_CAP_REACHED');
  end if;
  select * into v_state from public.market_signal_trigger_state where subject_key=v_subject for update;
  if found then
   v_shift:=abs((p_price-v_state.last_ref_price)/v_state.last_ref_price)*100;
   if v_now<v_state.cooldown_until and v_shift<greatest(0,p_min_shift_pct)*2.5 then
    return jsonb_build_object('status','suppressed','reason','IN_COOLDOWN');
   end if;
   if v_now>=v_state.cooldown_until and v_shift<greatest(0,p_min_shift_pct) then
    return jsonb_build_object('status','suppressed','reason','INSUFFICIENT_PRICE_SHIFT');
   end if;
  end if;
 end if;
 insert into public.market_signal_events(signal_key,symbol,market,timeframe,action,side,price,as_of,source,confidence,regime_tag,strategy_id,thesis,metadata)
 values(p_signal_key,upper(p_symbol),p_market,p_timeframe,p_action,p_side,p_price,p_as_of,p_source,p_confidence,coalesce(p_regime_tag,'UNKNOWN'),coalesce(p_strategy_id,'default'),coalesce(p_thesis,''),coalesce(p_metadata,'{}'::jsonb))
 returning id into v_id;
 if p_action<>'HOLD' then
  insert into public.market_signal_trigger_state(subject_key,last_action,last_ref_price,last_triggered_at,cooldown_until,consecutive_hits)
  values(v_subject,p_action,p_price,v_now,v_now+make_interval(secs=>greatest(0,least(p_cooldown_seconds,86400))),1)
  on conflict(subject_key) do update set last_action=excluded.last_action,last_ref_price=excluded.last_ref_price,last_triggered_at=excluded.last_triggered_at,cooldown_until=excluded.cooldown_until,consecutive_hits=public.market_signal_trigger_state.consecutive_hits+1;
 end if;
 return jsonb_build_object('status','recorded','reason','ACCEPTED','signal_id',v_id);
end; $$;
