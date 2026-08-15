-- Zero-build activity-heartbeat completion reconciliation regression.
--
-- This test runs after the repair migration is applied.
-- It validates definition contract plus the existing canonical MKT0011
-- activity-heartbeat representation without mutating timer history.

begin;

do $test$
declare
  v_packet_id constant uuid :=
    '3f1e8a53-aaef-4f9e-afae-29a640562f73'::uuid;

  v_timer_id constant uuid :=
    'bf8bce96-69ce-4103-a2e9-a6f156c0b0aa'::uuid;

  v_read_oid oid;
  v_write_oid oid;
  v_read_definition text;
  v_write_definition text;
  v_timer_last_heartbeat_at timestamptz;
  v_matching_activity_id uuid;
  v_matching_activity_count integer;
  v_reconciliation jsonb;

  v_positive boolean;
  v_wrong_time boolean;
  v_missing_operation boolean;
  v_wrong_operation boolean;
begin
  select p.oid
  into strict v_read_oid
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname =
      'athena_read_feature_completion_reconciliation';

  select p.oid
  into strict v_write_oid
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname =
      'athena_reconcile_feature_completion';

  if not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_read_oid
  ) then
    raise exception
      'Read reconciliation function must remain SECURITY DEFINER.';
  end if;

  if not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_write_oid
  ) then
    raise exception
      'Transactional reconciliation function must remain SECURITY DEFINER.';
  end if;

  v_read_definition :=
    pg_catalog.pg_get_functiondef(v_read_oid);

  v_write_definition :=
    pg_catalog.pg_get_functiondef(v_write_oid);

  if v_read_definition !~
    'event_row\.event_type = ''heartbeat'''
  then
    raise exception
      'Read verifier lost literal heartbeat compatibility.';
  end if;

  if v_write_definition !~
    'event_row\.event_type = ''heartbeat'''
  then
    raise exception
      'Transactional reconciliation lost literal heartbeat compatibility.';
  end if;

  if v_read_definition !~
    'event_row\.event_type = ''activity''[\s\S]*requested_operation[\s\S]*''activity''[\s\S]*event_row\.event_at =[\s\S]*v_timer\.last_heartbeat_at'
  then
    raise exception
      'Read verifier lacks exact activity-heartbeat compatibility.';
  end if;

  if v_write_definition !~
    'event_row\.event_type = ''activity''[\s\S]*requested_operation[\s\S]*''activity''[\s\S]*event_row\.event_at =[\s\S]*v_timer\.last_heartbeat_at'
  then
    raise exception
      'Transactional reconciliation lacks exact activity-heartbeat compatibility.';
  end if;

  select session.last_heartbeat_at
  into strict v_timer_last_heartbeat_at
  from public.athena_build_timer_sessions as session
  where session.id = v_timer_id;

  select
    count(*)::integer,
    min(event_row.id)
  into
    v_matching_activity_count,
    v_matching_activity_id
  from public.athena_build_timer_events as event_row
  where event_row.session_id = v_timer_id
    and event_row.event_type = 'activity'
    and event_row.evidence ->>
      'requested_operation' = 'activity'
    and event_row.event_at =
      v_timer_last_heartbeat_at;

  if v_matching_activity_count <> 1
     or v_matching_activity_id is null
  then
    raise exception
      'Expected exactly one canonical MKT0011 activity event at last_heartbeat_at.';
  end if;

  v_reconciliation :=
    public.athena_read_feature_completion_reconciliation(
      v_packet_id
    );

  if nullif(
       v_reconciliation ->> 'timer_heartbeat_event_id',
       ''
     )::uuid
     is distinct from v_matching_activity_id
  then
    raise exception
      'Read reconciliation did not select the canonical activity event.';
  end if;

  if coalesce(
       (v_reconciliation ->>
         'timer_event_chain_verified')::boolean,
       false
     ) is not true
  then
    raise exception
      'Timer event-chain verification regressed.';
  end if;

  if nullif(
       v_reconciliation ->> 'timer_start_event_id',
       ''
     ) is null
  then
    raise exception
      'Canonical timer start-event evidence regressed.';
  end if;

  v_positive :=
    (
      'activity' = 'activity'
      and '{"requested_operation":"activity"}'::jsonb
          ->> 'requested_operation' = 'activity'
      and v_timer_last_heartbeat_at =
          v_timer_last_heartbeat_at
    );

  v_wrong_time :=
    (
      'activity' = 'activity'
      and '{"requested_operation":"activity"}'::jsonb
          ->> 'requested_operation' = 'activity'
      and (
        v_timer_last_heartbeat_at -
        interval '1 second'
      ) = v_timer_last_heartbeat_at
    );

  v_missing_operation :=
    (
      'activity' = 'activity'
      and '{}'::jsonb
          ->> 'requested_operation' = 'activity'
      and v_timer_last_heartbeat_at =
          v_timer_last_heartbeat_at
    );

  v_wrong_operation :=
    (
      'activity' = 'activity'
      and '{"requested_operation":"heartbeat"}'::jsonb
          ->> 'requested_operation' = 'activity'
      and v_timer_last_heartbeat_at =
          v_timer_last_heartbeat_at
    );

  if v_positive is not true then
    raise exception
      'Positive activity-heartbeat predicate case failed.';
  end if;

  if coalesce(v_wrong_time, false) is not false then
    raise exception
      'Mismatched activity timestamp must remain fail-closed.';
  end if;

  if coalesce(v_missing_operation, false) is not false then
    raise exception
      'Missing requested_operation must remain fail-closed.';
  end if;

  if coalesce(v_wrong_operation, false) is not false then
    raise exception
      'Wrong requested_operation must remain fail-closed.';
  end if;

  if exists (
    select 1
    from public.athena_build_timer_events as event_row
    where event_row.session_id = v_timer_id
      and event_row.event_type = 'activity'
      and event_row.id <> v_matching_activity_id
      and (
        event_row.evidence ->>
          'requested_operation' is distinct from 'activity'
        or event_row.event_at
          is distinct from v_timer_last_heartbeat_at
      )
      and event_row.id =
        nullif(
          v_reconciliation ->>
            'timer_heartbeat_event_id',
          ''
        )::uuid
  ) then
    raise exception
      'Unrelated activity event was accepted as heartbeat evidence.';
  end if;
end
$test$;

rollback;