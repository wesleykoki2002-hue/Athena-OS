-- Build 0083
-- Athena Build Timer controlled operation contract
--
-- Direct timer-table access remains revoked.
-- Only the service_role may execute the controlled RPC functions.
-- Browser clients must never mutate timer evidence directly.

alter table public.athena_build_timer_events
add column operation_key text;

alter table public.athena_build_timer_events
add constraint athena_build_timer_event_operation_key_valid
check (
  operation_key is null
  or length(btrim(operation_key)) > 0
);

create unique index
  athena_build_timer_events_operation_key_uidx
on public.athena_build_timer_events (
  operation_key
)
where operation_key is not null;

create trigger athena_build_timer_events_prevent_truncate
before truncate
on public.athena_build_timer_events
for each statement
execute function
  public.prevent_athena_build_timer_event_mutation();

create or replace function
  public.athena_build_timer_read_session(
    p_session_id uuid,
    p_operator_key text
  )
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if p_session_id is null then
    raise exception
      'Timer session id is required.';
  end if;

  if nullif(btrim(p_operator_key), '') is null then
    raise exception
      'Timer operator key is required.';
  end if;

  select to_jsonb(summary_row.*)
  into v_result
  from public.athena_build_timer_session_summary
    as summary_row
  where summary_row.id = p_session_id
    and summary_row.operator_key =
      btrim(p_operator_key);

  if v_result is null then
    raise exception
      'Timer session was not found for this operator.';
  end if;

  return v_result;
end;
$function$;

create or replace function
  public.athena_build_timer_find_session(
    p_project_key text,
    p_module_key text,
    p_build_session_title text,
    p_operator_key text
  )
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session_id uuid;
begin
  if nullif(btrim(p_project_key), '') is null
    or nullif(btrim(p_module_key), '') is null
    or nullif(
      btrim(p_build_session_title),
      ''
    ) is null
    or nullif(btrim(p_operator_key), '') is null
  then
    raise exception
      'Canonical timer identity and operator are required.';
  end if;

  select session_row.id
  into v_session_id
  from public.athena_build_timer_sessions
    as session_row
  where session_row.project_key =
      btrim(p_project_key)
    and session_row.module_key =
      btrim(p_module_key)
    and session_row.build_session_title =
      btrim(p_build_session_title)
    and session_row.operator_key =
      btrim(p_operator_key);

  if v_session_id is null then
    return null;
  end if;

  return public.athena_build_timer_read_session(
    v_session_id,
    btrim(p_operator_key)
  );
end;
$function$;

create or replace function
  public.athena_build_timer_start_session(
    p_project_key text,
    p_module_key text,
    p_build_session_title text,
    p_operator_key text,
    p_operation_key text,
    p_operator_display_name text default null,
    p_evidence jsonb default '{}'::jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_session
    public.athena_build_timer_sessions%rowtype;
  v_duplicate_session_id uuid;
  v_conflicting_session_id uuid;
  v_event_type text;
  v_event_source text;
  v_result jsonb;
begin
  if nullif(btrim(p_project_key), '') is null
    or nullif(btrim(p_module_key), '') is null
    or nullif(
      btrim(p_build_session_title),
      ''
    ) is null
    or nullif(btrim(p_operator_key), '') is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception
      'Canonical timer identity, operator, and operation key are required.';
  end if;

  if jsonb_typeof(
    coalesce(p_evidence, '{}'::jsonb)
  ) <> 'object' then
    raise exception
      'Timer evidence must be a JSON object.';
  end if;

  if not exists (
    select 1
    from public.athena_projects project_row
    join public.athena_project_modules
      as module_row
      on module_row.project_key =
        project_row.project_key
    where project_row.project_key =
        btrim(p_project_key)
      and module_row.module_key =
        btrim(p_module_key)
  ) then
    raise exception
      'Timer identity is not registered in the canonical project and module registries.';
  end if;

  select event_row.session_id
  into v_duplicate_session_id
  from public.athena_build_timer_events
    as event_row
  where event_row.operation_key =
    btrim(p_operation_key);

  if v_duplicate_session_id is not null then
    v_result :=
      public.athena_build_timer_read_session(
        v_duplicate_session_id,
        btrim(p_operator_key)
      );

    return v_result || jsonb_build_object(
      'operation',
      'start',
      'idempotent_replay',
      true
    );
  end if;

  select session_row.id
  into v_conflicting_session_id
  from public.athena_build_timer_sessions
    as session_row
  where session_row.operator_key =
      btrim(p_operator_key)
    and session_row.status in (
      'active',
      'idle'
    )
    and (
      session_row.project_key <>
        btrim(p_project_key)
      or session_row.module_key <>
        btrim(p_module_key)
      or session_row.build_session_title <>
        btrim(p_build_session_title)
    )
  order by session_row.updated_at desc
  limit 1;

  if v_conflicting_session_id is not null then
    raise exception
      'This operator already has another running timer session: %.',
      v_conflicting_session_id;
  end if;

  select session_row.*
  into v_session
  from public.athena_build_timer_sessions
    as session_row
  where session_row.project_key =
      btrim(p_project_key)
    and session_row.module_key =
      btrim(p_module_key)
    and session_row.build_session_title =
      btrim(p_build_session_title)
    and session_row.operator_key =
      btrim(p_operator_key)
  for update;

  if v_session.id is null then
    insert into public.athena_build_timer_sessions (
      project_key,
      module_key,
      build_session_title,
      operator_key,
      operator_display_name,
      status,
      started_at,
      last_state_changed_at,
      last_accounted_at,
      last_activity_at,
      last_heartbeat_at,
      active_seconds,
      paused_seconds,
      idle_seconds,
      metadata
    )
    values (
      btrim(p_project_key),
      btrim(p_module_key),
      btrim(p_build_session_title),
      btrim(p_operator_key),
      nullif(
        btrim(p_operator_display_name),
        ''
      ),
      'active',
      v_now,
      v_now,
      v_now,
      v_now,
      v_now,
      0,
      0,
      0,
      jsonb_build_object(
        'created_by_operation',
        'start',
        'created_at',
        v_now
      )
    )
    returning *
    into v_session;

    v_event_type := 'start';
    v_event_source := 'athena_os_ui';
  elsif v_session.status in (
    'active',
    'idle'
  ) then
    raise exception
      'This timer session is already running.';
  elsif v_session.status = 'paused' then
    raise exception
      'This timer session is paused. Use the resume operation.';
  else
    update public.athena_build_timer_sessions
    set
      status = 'active',
      operator_display_name = coalesce(
        nullif(
          btrim(p_operator_display_name),
          ''
        ),
        operator_display_name
      ),
      last_state_changed_at = v_now,
      last_accounted_at = v_now,
      last_activity_at = v_now,
      last_heartbeat_at = v_now,
      stopped_at = null,
      timer_version = timer_version + 1,
      metadata = metadata || jsonb_build_object(
        'last_recovered_at',
        v_now,
        'recovery_method',
        'restart_from_stopped_session'
      )
    where id = v_session.id
    returning *
    into v_session;

    v_event_type := 'recovery';
    v_event_source := 'server_recovery';
  end if;

  insert into public.athena_build_timer_events (
    session_id,
    operation_key,
    event_type,
    source,
    operator_key,
    event_at,
    previous_status,
    new_status,
    active_delta_seconds,
    paused_delta_seconds,
    idle_delta_seconds,
    raw_active_seconds_after,
    raw_paused_seconds_after,
    raw_idle_seconds_after,
    evidence
  )
  values (
    v_session.id,
    btrim(p_operation_key),
    v_event_type,
    v_event_source,
    btrim(p_operator_key),
    v_now,
    case
      when v_event_type = 'recovery'
        then 'stopped'
      else null
    end,
    'active',
    0,
    0,
    0,
    v_session.active_seconds,
    v_session.paused_seconds,
    v_session.idle_seconds,
    coalesce(
      p_evidence,
      '{}'::jsonb
    ) || jsonb_build_object(
      'calculation_version',
      v_session.calculation_version,
      'no_unverified_downtime_counted',
      true
    )
  );

  v_result :=
    public.athena_build_timer_read_session(
      v_session.id,
      btrim(p_operator_key)
    );

  return v_result || jsonb_build_object(
    'operation',
    v_event_type,
    'idempotent_replay',
    false
  );
exception
  when unique_violation then
    raise exception
      'Timer start conflicted with another concurrent timer operation.';
end;
$function$;

create or replace function
  public.athena_build_timer_apply_operation(
    p_session_id uuid,
    p_operator_key text,
    p_operation text,
    p_source text,
    p_operation_key text,
    p_evidence jsonb default '{}'::jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_settings
    public.athena_build_timer_settings%rowtype;
  v_session
    public.athena_build_timer_sessions%rowtype;
  v_updated_session
    public.athena_build_timer_sessions%rowtype;
  v_duplicate_session_id uuid;
  v_previous_status text;
  v_accounted_status text;
  v_target_status text;
  v_event_type text;
  v_elapsed_seconds bigint := 0;
  v_active_delta bigint := 0;
  v_paused_delta bigint := 0;
  v_idle_delta bigint := 0;
  v_idle_boundary timestamptz;
  v_stale_boundary timestamptz;
  v_active_cutoff timestamptz;
  v_heartbeat_was_stale boolean := false;
  v_result jsonb;
begin
  if p_session_id is null
    or nullif(btrim(p_operator_key), '') is null
    or nullif(btrim(p_operation), '') is null
    or nullif(btrim(p_source), '') is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception
      'Session, operator, operation, source, and operation key are required.';
  end if;

  if btrim(p_operation) not in (
    'pause',
    'resume',
    'stop',
    'heartbeat',
    'activity'
  ) then
    raise exception
      'Unsupported timer operation: %.',
      btrim(p_operation);
  end if;

  if jsonb_typeof(
    coalesce(p_evidence, '{}'::jsonb)
  ) <> 'object' then
    raise exception
      'Timer evidence must be a JSON object.';
  end if;

  if btrim(p_operation) in (
    'pause',
    'resume',
    'stop'
  )
    and btrim(p_source) <> 'athena_os_ui'
  then
    raise exception
      'Pause, resume, and stop require athena_os_ui source.';
  end if;

  if btrim(p_operation) = 'heartbeat'
    and btrim(p_source) not in (
      'athena_os_ui',
      'browser_activity',
      'powershell_helper'
    )
  then
    raise exception
      'Unsupported heartbeat source.';
  end if;

  if btrim(p_operation) = 'activity'
    and btrim(p_source) not in (
      'athena_os_ui',
      'browser_activity'
    )
  then
    raise exception
      'Unsupported activity source.';
  end if;

  select event_row.session_id
  into v_duplicate_session_id
  from public.athena_build_timer_events
    as event_row
  where event_row.operation_key =
    btrim(p_operation_key);

  if v_duplicate_session_id is not null then
    if v_duplicate_session_id <> p_session_id then
      raise exception
        'Operation key belongs to a different timer session.';
    end if;

    v_result :=
      public.athena_build_timer_read_session(
        p_session_id,
        btrim(p_operator_key)
      );

    return v_result || jsonb_build_object(
      'operation',
      btrim(p_operation),
      'idempotent_replay',
      true
    );
  end if;

  select *
  into v_settings
  from public.athena_build_timer_settings
  where settings_key = 'canonical';

  if v_settings.settings_key is null then
    raise exception
      'Canonical timer settings are missing.';
  end if;

  select session_row.*
  into v_session
  from public.athena_build_timer_sessions
    as session_row
  where session_row.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception
      'Timer session was not found.';
  end if;

  if v_session.operator_key <>
    btrim(p_operator_key)
  then
    raise exception
      'Timer session belongs to a different operator.';
  end if;

  if v_session.status = 'stopped' then
    raise exception
      'Stopped timer sessions must be restarted through the start operation.';
  end if;

  v_previous_status := v_session.status;

  v_elapsed_seconds := greatest(
    0,
    floor(
      extract(
        epoch from (
          v_now -
          v_session.last_accounted_at
        )
      )
    )::bigint
  );

  v_accounted_status :=
    v_session.status;

  if v_session.status = 'paused' then
    v_paused_delta :=
      v_elapsed_seconds;
  elsif v_session.status = 'idle' then
    v_idle_delta :=
      v_elapsed_seconds;
  elsif v_session.status = 'active' then
    if v_session.last_activity_at is null then
      v_idle_delta :=
        v_elapsed_seconds;
      v_accounted_status := 'idle';
    else
      v_idle_boundary :=
        v_session.last_activity_at +
        make_interval(
          secs =>
            v_settings.idle_threshold_seconds
        );

      v_active_cutoff :=
        least(
          v_idle_boundary,
          v_now
        );

      if v_session.last_heartbeat_at is null
        or v_session.last_heartbeat_at <
          v_now -
          make_interval(
            secs =>
              v_settings.stale_timeout_seconds
          )
      then
        v_heartbeat_was_stale := true;

        v_stale_boundary :=
          coalesce(
            v_session.last_heartbeat_at,
            v_session.last_accounted_at
          );

        v_active_cutoff :=
          least(
            v_active_cutoff,
            v_stale_boundary
          );
      end if;

      if v_active_cutoff <=
        v_session.last_accounted_at
      then
        v_idle_delta :=
          v_elapsed_seconds;
        v_accounted_status := 'idle';
      elsif v_active_cutoff >= v_now then
        v_active_delta :=
          v_elapsed_seconds;
      else
        v_active_delta := greatest(
          0,
          floor(
            extract(
              epoch from (
                v_active_cutoff -
                v_session.last_accounted_at
              )
            )
          )::bigint
        );

        v_idle_delta :=
          v_elapsed_seconds -
          v_active_delta;

        v_accounted_status := 'idle';
      end if;
    end if;
  end if;

  if btrim(p_operation) = 'pause' then
    if v_accounted_status = 'paused' then
      raise exception
        'Timer session is already paused.';
    end if;

    v_target_status := 'paused';
    v_event_type := 'pause';
  elsif btrim(p_operation) = 'resume' then
    if v_accounted_status <> 'paused' then
      raise exception
        'Only a paused timer session may be resumed.';
    end if;

    v_target_status := 'active';
    v_event_type := 'resume';
  elsif btrim(p_operation) = 'stop' then
    v_target_status := 'stopped';
    v_event_type := 'stop';
  elsif btrim(p_operation) = 'activity' then
    if v_accounted_status = 'paused' then
      raise exception
        'Activity cannot resume an explicitly paused timer.';
    end if;

    v_target_status := 'active';
    v_event_type := 'activity';
  else
    v_target_status :=
      v_accounted_status;

    if v_previous_status = 'active'
      and v_accounted_status = 'idle'
    then
      v_event_type := 'idle_detected';
    else
      v_event_type := 'heartbeat';
    end if;
  end if;

  update public.athena_build_timer_sessions
  set
    status = v_target_status,
    active_seconds =
      active_seconds + v_active_delta,
    paused_seconds =
      paused_seconds + v_paused_delta,
    idle_seconds =
      idle_seconds + v_idle_delta,
    last_accounted_at = v_now,
    last_state_changed_at =
      case
        when status <> v_target_status
          or (
            btrim(p_operation) = 'activity'
            and v_idle_delta > 0
          )
          then v_now
        else last_state_changed_at
      end,
    last_activity_at =
      case
        when btrim(p_operation) in (
          'activity',
          'resume'
        )
          then v_now
        else last_activity_at
      end,
    last_heartbeat_at =
      case
        when btrim(p_operation) in (
          'heartbeat',
          'activity',
          'resume'
        )
          then v_now
        else last_heartbeat_at
      end,
    stopped_at =
      case
        when v_target_status = 'stopped'
          then v_now
        else null
      end,
    timer_version =
      timer_version + 1
  where id = v_session.id
  returning *
  into v_updated_session;

  insert into public.athena_build_timer_events (
    session_id,
    operation_key,
    event_type,
    source,
    operator_key,
    event_at,
    previous_status,
    new_status,
    interval_started_at,
    interval_ended_at,
    active_delta_seconds,
    paused_delta_seconds,
    idle_delta_seconds,
    raw_active_seconds_after,
    raw_paused_seconds_after,
    raw_idle_seconds_after,
    evidence
  )
  values (
    v_updated_session.id,
    btrim(p_operation_key),
    v_event_type,
    btrim(p_source),
    btrim(p_operator_key),
    v_now,
    v_previous_status,
    v_target_status,
    v_session.last_accounted_at,
    v_now,
    v_active_delta,
    v_paused_delta,
    v_idle_delta,
    v_updated_session.active_seconds,
    v_updated_session.paused_seconds,
    v_updated_session.idle_seconds,
    coalesce(
      p_evidence,
      '{}'::jsonb
    ) || jsonb_build_object(
      'requested_operation',
      btrim(p_operation),
      'accounted_status',
      v_accounted_status,
      'elapsed_seconds',
      v_elapsed_seconds,
      'heartbeat_was_stale',
      v_heartbeat_was_stale,
      'last_verified_heartbeat_at',
      v_session.last_heartbeat_at,
      'active_cutoff_at',
      v_active_cutoff,
      'stale_timeout_seconds',
      v_settings.stale_timeout_seconds,
      'calculation_version',
      v_updated_session.calculation_version
    )
  );

  v_result :=
    public.athena_build_timer_read_session(
      v_updated_session.id,
      btrim(p_operator_key)
    );

  return v_result || jsonb_build_object(
    'operation',
    v_event_type,
    'idempotent_replay',
    false,
    'active_delta_seconds',
    v_active_delta,
    'paused_delta_seconds',
    v_paused_delta,
    'idle_delta_seconds',
    v_idle_delta
  );
exception
  when unique_violation then
    raise exception
      'Timer operation conflicted with another concurrent operation.';
end;
$function$;

create or replace function
  public.athena_build_timer_correct_active_seconds(
    p_session_id uuid,
    p_operator_key text,
    p_new_active_seconds bigint,
    p_reason text,
    p_operation_key text,
    p_evidence jsonb default '{}'::jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_session
    public.athena_build_timer_sessions%rowtype;
  v_updated_session
    public.athena_build_timer_sessions%rowtype;
  v_duplicate_session_id uuid;
  v_previous_active_seconds bigint;
  v_difference_seconds bigint;
  v_paused_delta bigint := 0;
  v_result jsonb;
begin
  if p_session_id is null
    or nullif(btrim(p_operator_key), '') is null
    or p_new_active_seconds is null
    or p_new_active_seconds < 0
    or nullif(btrim(p_reason), '') is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception
      'Valid correction session, operator, seconds, reason, and operation key are required.';
  end if;

  if jsonb_typeof(
    coalesce(p_evidence, '{}'::jsonb)
  ) <> 'object' then
    raise exception
      'Correction evidence must be a JSON object.';
  end if;

  select event_row.session_id
  into v_duplicate_session_id
  from public.athena_build_timer_events
    as event_row
  where event_row.operation_key =
    btrim(p_operation_key);

  if v_duplicate_session_id is not null then
    if v_duplicate_session_id <> p_session_id then
      raise exception
        'Operation key belongs to a different timer session.';
    end if;

    v_result :=
      public.athena_build_timer_read_session(
        p_session_id,
        btrim(p_operator_key)
      );

    return v_result || jsonb_build_object(
      'operation',
      'manual_correction',
      'idempotent_replay',
      true
    );
  end if;

  select session_row.*
  into v_session
  from public.athena_build_timer_sessions
    as session_row
  where session_row.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception
      'Timer session was not found.';
  end if;

  if v_session.operator_key <>
    btrim(p_operator_key)
  then
    raise exception
      'Timer session belongs to a different operator.';
  end if;

  if v_session.status in (
    'active',
    'idle'
  ) then
    raise exception
      'Pause or stop the timer before correcting active seconds.';
  end if;

  if v_session.status = 'paused' then
    v_paused_delta := greatest(
      0,
      floor(
        extract(
          epoch from (
            v_now -
            v_session.last_accounted_at
          )
        )
      )::bigint
    );
  end if;

  v_previous_active_seconds :=
    v_session.active_seconds;

  v_difference_seconds :=
    p_new_active_seconds -
    v_previous_active_seconds;

  update public.athena_build_timer_sessions
  set
    active_seconds =
      p_new_active_seconds,
    paused_seconds =
      paused_seconds + v_paused_delta,
    last_accounted_at = v_now,
    timer_version =
      timer_version + 1,
    metadata = metadata || jsonb_build_object(
      'last_manual_correction_at',
      v_now,
      'last_manual_correction_reason',
      btrim(p_reason)
    )
  where id = v_session.id
  returning *
  into v_updated_session;

  insert into public.athena_build_timer_events (
    session_id,
    operation_key,
    event_type,
    source,
    operator_key,
    event_at,
    previous_status,
    new_status,
    interval_started_at,
    interval_ended_at,
    active_delta_seconds,
    paused_delta_seconds,
    idle_delta_seconds,
    raw_active_seconds_after,
    raw_paused_seconds_after,
    raw_idle_seconds_after,
    correction_previous_active_seconds,
    correction_new_active_seconds,
    correction_difference_seconds,
    reason,
    evidence
  )
  values (
    v_updated_session.id,
    btrim(p_operation_key),
    'manual_correction',
    'operator_correction',
    btrim(p_operator_key),
    v_now,
    v_session.status,
    v_updated_session.status,
    v_session.last_accounted_at,
    v_now,
    0,
    v_paused_delta,
    0,
    v_updated_session.active_seconds,
    v_updated_session.paused_seconds,
    v_updated_session.idle_seconds,
    v_previous_active_seconds,
    p_new_active_seconds,
    v_difference_seconds,
    btrim(p_reason),
    coalesce(
      p_evidence,
      '{}'::jsonb
    ) || jsonb_build_object(
      'correction_method',
      'audited_operator_correction',
      'calculation_version',
      v_updated_session.calculation_version
    )
  );

  v_result :=
    public.athena_build_timer_read_session(
      v_updated_session.id,
      btrim(p_operator_key)
    );

  return v_result || jsonb_build_object(
    'operation',
    'manual_correction',
    'idempotent_replay',
    false,
    'previous_active_seconds',
    v_previous_active_seconds,
    'new_active_seconds',
    p_new_active_seconds,
    'difference_seconds',
    v_difference_seconds
  );
exception
  when unique_violation then
    raise exception
      'Timer correction conflicted with another concurrent operation.';
end;
$function$;

revoke all
on function
  public.athena_build_timer_read_session(
    uuid,
    text
  )
from public, anon, authenticated, service_role;

revoke all
on function
  public.athena_build_timer_find_session(
    text,
    text,
    text,
    text
  )
from public, anon, authenticated, service_role;

revoke all
on function
  public.athena_build_timer_start_session(
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
from public, anon, authenticated, service_role;

revoke all
on function
  public.athena_build_timer_apply_operation(
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
from public, anon, authenticated, service_role;

revoke all
on function
  public.athena_build_timer_correct_active_seconds(
    uuid,
    text,
    bigint,
    text,
    text,
    jsonb
  )
from public, anon, authenticated, service_role;

grant execute
on function
  public.athena_build_timer_read_session(
    uuid,
    text
  )
to service_role;

grant execute
on function
  public.athena_build_timer_find_session(
    text,
    text,
    text,
    text
  )
to service_role;

grant execute
on function
  public.athena_build_timer_start_session(
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
to service_role;

grant execute
on function
  public.athena_build_timer_apply_operation(
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
to service_role;

grant execute
on function
  public.athena_build_timer_correct_active_seconds(
    uuid,
    text,
    bigint,
    text,
    text,
    jsonb
  )
to service_role;

comment on function
  public.athena_build_timer_start_session(
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
is
  'Starts or safely recovers one canonical timer session without counting uncertain downtime.';

comment on function
  public.athena_build_timer_apply_operation(
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
is
  'Applies idempotent pause, resume, stop, heartbeat, or verified-activity operations.';

comment on function
  public.athena_build_timer_correct_active_seconds(
    uuid,
    text,
    bigint,
    text,
    text,
    jsonb
  )
is
  'Creates an audited append-only correction while preserving original timer evidence.';