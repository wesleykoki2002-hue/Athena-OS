-- Build 0083
-- Athena Build Timer helper-token operation contract
--
-- Canonical owner:
--   project_key: athena-cto
--   module_key: build-log-recorder
--
-- Raw helper tokens are generated only by the Athena OS server.
-- Only SHA-256 token hashes are stored in PostgreSQL.
-- Direct access to timer and token tables remains revoked.
-- All helper-token RPC functions remain service-role only.

create or replace function public.athena_build_timer_issue_helper_token(
  p_session_id uuid,
  p_operator_key text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_operation_key text,
  p_metadata jsonb default '{}'::jsonb
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
  v_settings
    public.athena_build_timer_settings%rowtype;
  v_token
    public.athena_build_timer_helper_tokens%rowtype;
  v_existing_event
    public.athena_build_timer_events%rowtype;
  v_existing_token_id uuid;
begin
  if p_session_id is null
    or nullif(btrim(p_operator_key), '') is null
    or nullif(btrim(p_token_hash), '') is null
    or p_expires_at is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception
      'Session, operator, token hash, expiry, and operation key are required.';
  end if;

  if btrim(p_token_hash) !~ '^[0-9a-f]{64}$' then
    raise exception
      'Helper token hash must be a lowercase SHA-256 hexadecimal value.';
  end if;

  if p_expires_at <= v_now + interval '30 seconds'
    or p_expires_at > v_now + interval '4 hours'
  then
    raise exception
      'Helper token expiry must be between 30 seconds and 4 hours from issuance.';
  end if;

  if jsonb_typeof(
    coalesce(
      p_metadata,
      '{}'::jsonb
    )
  ) <> 'object' then
    raise exception
      'Helper token metadata must be a JSON object.';
  end if;

  select event_row.*
  into v_existing_event
  from public.athena_build_timer_events
    as event_row
  where event_row.operation_key =
    btrim(p_operation_key);

  if v_existing_event.id is not null then
    if v_existing_event.session_id <> p_session_id
      or v_existing_event.event_type <>
        'helper_token_issued'
    then
      raise exception
        'Operation key belongs to a different timer operation.';
    end if;

    begin
      v_existing_token_id :=
        nullif(
          v_existing_event.evidence
            ->> 'helper_token_id',
          ''
        )::uuid;
    exception
      when others then
        raise exception
          'Existing helper-token issuance evidence is malformed.';
    end;

    select token_row.*
    into v_token
    from public.athena_build_timer_helper_tokens
      as token_row
    where token_row.id =
      v_existing_token_id;

    if v_token.id is null
      or v_token.session_id <> p_session_id
      or v_token.issued_to_operator <>
        btrim(p_operator_key)
      or v_token.token_hash <>
        btrim(p_token_hash)
    then
      raise exception
        'Existing helper-token issuance does not match this request.';
    end if;

    return jsonb_build_object(
      'token_id',
      v_token.id,
      'session_id',
      v_token.session_id,
      'expires_at',
      v_token.expires_at,
      'revoked_at',
      v_token.revoked_at,
      'idempotent_replay',
      true,
      'raw_token_stored',
      false
    );
  end if;

  select session_row.*
  into v_session
  from public.athena_build_timer_sessions
    as session_row
  where session_row.id =
    p_session_id
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

  if v_session.status not in (
    'active',
    'idle'
  ) then
    raise exception
      'Helper tokens may be issued only for active or idle timer sessions.';
  end if;

  select settings_row.*
  into v_settings
  from public.athena_build_timer_settings
    as settings_row
  where settings_row.settings_key =
    'canonical';

  if v_settings.settings_key is null then
    raise exception
      'Canonical timer settings are missing.';
  end if;

  insert into public.athena_build_timer_helper_tokens (
    session_id,
    token_hash,
    issued_to_operator,
    expires_at,
    metadata
  )
  values (
    v_session.id,
    btrim(p_token_hash),
    btrim(p_operator_key),
    p_expires_at,
    coalesce(
      p_metadata,
      '{}'::jsonb
    ) || jsonb_build_object(
      'token_hash_algorithm',
      'sha256',
      'raw_token_stored',
      false,
      'issued_by',
      'athena_os_server'
    )
  )
  returning *
  into v_token;

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
    'helper_token_issued',
    'athena_os_ui',
    btrim(p_operator_key),
    v_now,
    v_session.status,
    v_session.status,
    0,
    0,
    0,
    v_session.active_seconds,
    v_session.paused_seconds,
    v_session.idle_seconds,
    coalesce(
      p_metadata,
      '{}'::jsonb
    ) || jsonb_build_object(
      'helper_token_id',
      v_token.id,
      'expires_at',
      v_token.expires_at,
      'token_hash_algorithm',
      'sha256',
      'raw_token_stored',
      false
    )
  );

  return jsonb_build_object(
    'token_id',
    v_token.id,
    'session_id',
    v_token.session_id,
    'expires_at',
    v_token.expires_at,
    'heartbeat_interval_seconds',
    v_settings.heartbeat_interval_seconds,
    'idempotent_replay',
    false,
    'raw_token_stored',
    false
  );
exception
  when unique_violation then
    raise exception
      'Helper-token issuance conflicted with another operation.';
end;
$function$;

create or replace function public.athena_build_timer_revoke_helper_token(
  p_session_id uuid,
  p_operator_key text,
  p_token_id uuid,
  p_operation_key text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
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
  v_token
    public.athena_build_timer_helper_tokens%rowtype;
  v_existing_event
    public.athena_build_timer_events%rowtype;
begin
  if p_session_id is null
    or nullif(btrim(p_operator_key), '') is null
    or p_token_id is null
    or nullif(btrim(p_operation_key), '') is null
    or nullif(btrim(p_reason), '') is null
  then
    raise exception
      'Session, operator, token, operation key, and reason are required.';
  end if;

  if jsonb_typeof(
    coalesce(
      p_metadata,
      '{}'::jsonb
    )
  ) <> 'object' then
    raise exception
      'Helper token revocation metadata must be a JSON object.';
  end if;

  select session_row.*
  into v_session
  from public.athena_build_timer_sessions
    as session_row
  where session_row.id =
    p_session_id
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

  select token_row.*
  into v_token
  from public.athena_build_timer_helper_tokens
    as token_row
  where token_row.id =
      p_token_id
    and token_row.session_id =
      p_session_id
  for update;

  if v_token.id is null then
    raise exception
      'Helper token was not found for this timer session.';
  end if;

  if v_token.issued_to_operator <>
    btrim(p_operator_key)
  then
    raise exception
      'Helper token belongs to a different operator.';
  end if;

  select event_row.*
  into v_existing_event
  from public.athena_build_timer_events
    as event_row
  where event_row.operation_key =
    btrim(p_operation_key);

  if v_existing_event.id is not null then
    if v_existing_event.session_id <>
        p_session_id
      or v_existing_event.event_type <>
        'helper_token_revoked'
    then
      raise exception
        'Operation key belongs to a different timer operation.';
    end if;

    return jsonb_build_object(
      'token_id',
      v_token.id,
      'session_id',
      v_token.session_id,
      'expires_at',
      v_token.expires_at,
      'revoked_at',
      v_token.revoked_at,
      'idempotent_replay',
      true
    );
  end if;

  update public.athena_build_timer_helper_tokens
  set
    revoked_at =
      coalesce(
        revoked_at,
        v_now
      ),
    metadata =
      metadata || jsonb_build_object(
        'revoked_by',
        'athena_os_operator',
        'revocation_reason',
        btrim(p_reason)
      )
  where id =
    v_token.id
  returning *
  into v_token;

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
    reason,
    evidence
  )
  values (
    v_session.id,
    btrim(p_operation_key),
    'helper_token_revoked',
    'athena_os_ui',
    btrim(p_operator_key),
    v_now,
    v_session.status,
    v_session.status,
    0,
    0,
    0,
    v_session.active_seconds,
    v_session.paused_seconds,
    v_session.idle_seconds,
    btrim(p_reason),
    coalesce(
      p_metadata,
      '{}'::jsonb
    ) || jsonb_build_object(
      'helper_token_id',
      v_token.id,
      'expires_at',
      v_token.expires_at,
      'revoked_at',
      v_token.revoked_at
    )
  );

  return jsonb_build_object(
    'token_id',
    v_token.id,
    'session_id',
    v_token.session_id,
    'expires_at',
    v_token.expires_at,
    'revoked_at',
    v_token.revoked_at,
    'idempotent_replay',
    false
  );
exception
  when unique_violation then
    raise exception
      'Helper-token revocation conflicted with another operation.';
end;
$function$;

create or replace function public.athena_build_timer_apply_helper_heartbeat(
  p_token_hash text,
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
  v_token
    public.athena_build_timer_helper_tokens%rowtype;
  v_result jsonb;
begin
  if nullif(btrim(p_token_hash), '') is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception
      'Helper token hash and operation key are required.';
  end if;

  if btrim(p_token_hash) !~ '^[0-9a-f]{64}$' then
    raise exception
      'Helper token is invalid or expired.';
  end if;

  if jsonb_typeof(
    coalesce(
      p_evidence,
      '{}'::jsonb
    )
  ) <> 'object' then
    raise exception
      'Helper heartbeat evidence must be a JSON object.';
  end if;

  select token_row.*
  into v_token
  from public.athena_build_timer_helper_tokens
    as token_row
  where token_row.token_hash =
      btrim(p_token_hash)
    and token_row.revoked_at is null
    and token_row.expires_at >
      v_now
  for update;

  if v_token.id is null then
    raise exception
      'Helper token is invalid or expired.';
  end if;

  v_result :=
    public.athena_build_timer_apply_operation(
      v_token.session_id,
      v_token.issued_to_operator,
      'heartbeat',
      'powershell_helper',
      btrim(p_operation_key),
      coalesce(
        p_evidence,
        '{}'::jsonb
      ) || jsonb_build_object(
        'helper_token_id',
        v_token.id,
        'helper_token_expires_at',
        v_token.expires_at,
        'token_authentication',
        'sha256_bearer_hash',
        'raw_token_stored',
        false,
        'offline_replay',
        false
      )
    );

  update public.athena_build_timer_helper_tokens
  set last_used_at =
    v_now
  where id =
    v_token.id;

  return v_result || jsonb_build_object(
    'helper_token_id',
    v_token.id,
    'helper_token_expires_at',
    v_token.expires_at,
    'helper_token_last_used_at',
    v_now
  );
end;
$function$;

revoke all
on function public.athena_build_timer_issue_helper_token(
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all
on function public.athena_build_timer_revoke_helper_token(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all
on function public.athena_build_timer_apply_helper_heartbeat(
  text,
  text,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.athena_build_timer_issue_helper_token(
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb
)
to service_role;

grant execute
on function public.athena_build_timer_revoke_helper_token(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
)
to service_role;

grant execute
on function public.athena_build_timer_apply_helper_heartbeat(
  text,
  text,
  jsonb
)
to service_role;

comment on function public.athena_build_timer_issue_helper_token(
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb
) is
  'Stores only a SHA-256 helper-token hash and records append-only issuance evidence.';

comment on function public.athena_build_timer_revoke_helper_token(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
) is
  'Revokes one helper token and records append-only operator evidence.';

comment on function public.athena_build_timer_apply_helper_heartbeat(
  text,
  text,
  jsonb
) is
  'Validates a short-lived hashed helper token and records one non-replayed PowerShell heartbeat.';