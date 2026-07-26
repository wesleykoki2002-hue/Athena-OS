-- Build 0083
-- Automatic helper-token security QA evidence
--
-- This migration adds one service-role-only, idempotent runtime self-test.
-- It proves that the real helper heartbeat rejects an expired token and that
-- helper-token issuance rejects a mismatched operator before any write.
-- No raw token is generated, stored, returned, or logged.

create table public.athena_build_timer_helper_security_qa_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.athena_build_timer_sessions(id),
  test_key text not null,
  expired_token_rejected boolean not null,
  expired_token_not_used boolean not null,
  expired_token_no_heartbeat_event boolean not null,
  expired_token_error text not null,
  expired_token_sqlstate text not null,
  wrong_operator_rejected boolean not null,
  wrong_operator_error text not null,
  wrong_operator_sqlstate text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint athena_build_timer_helper_security_qa_key_unique
    unique (session_id, test_key),

  constraint athena_build_timer_helper_security_qa_key_not_blank
    check (nullif(btrim(test_key), '') is not null),

  constraint athena_build_timer_helper_security_qa_expired_complete
    check (
      expired_token_rejected
      and expired_token_not_used
      and expired_token_no_heartbeat_event
    ),

  constraint athena_build_timer_helper_security_qa_wrong_operator_complete
    check (wrong_operator_rejected)
);

alter table public.athena_build_timer_helper_security_qa_evidence
  enable row level security;

revoke all
on table public.athena_build_timer_helper_security_qa_evidence
from public, anon, authenticated, service_role;

create or replace function public.athena_build_timer_run_helper_security_qa(
  p_session_id uuid,
  p_test_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_session public.athena_build_timer_sessions%rowtype;
  v_existing public.athena_build_timer_helper_security_qa_evidence%rowtype;
  v_saved public.athena_build_timer_helper_security_qa_evidence%rowtype;
  v_expired_token public.athena_build_timer_helper_tokens%rowtype;
  v_normalized_test_key text;
  v_expired_hash text;
  v_wrong_operator_hash text;
  v_expired_operation_key text;
  v_wrong_operator_operation_key text;
  v_expired_rejected boolean := false;
  v_expired_not_used boolean := false;
  v_expired_no_heartbeat_event boolean := false;
  v_wrong_operator_rejected boolean := false;
  v_expired_error text := 'Expired helper token was unexpectedly accepted.';
  v_expired_sqlstate text := '00000';
  v_wrong_operator_error text := 'Mismatched operator was unexpectedly accepted.';
  v_wrong_operator_sqlstate text := '00000';
begin
  if p_session_id is null
    or nullif(btrim(p_test_key), '') is null
  then
    raise exception
      'Timer session ID and automatic QA test key are required.';
  end if;

  v_normalized_test_key := btrim(p_test_key);

  if length(v_normalized_test_key) > 200 then
    raise exception
      'Automatic QA test key cannot exceed 200 characters.';
  end if;

  select evidence_row.*
  into v_existing
  from public.athena_build_timer_helper_security_qa_evidence
    as evidence_row
  where evidence_row.session_id = p_session_id
    and evidence_row.test_key = v_normalized_test_key;

  if v_existing.id is not null then
    return jsonb_build_object(
      'evidence_id', v_existing.id,
      'session_id', v_existing.session_id,
      'test_key', v_existing.test_key,
      'expired_token_rejected', v_existing.expired_token_rejected,
      'expired_token_not_used', v_existing.expired_token_not_used,
      'expired_token_no_heartbeat_event',
        v_existing.expired_token_no_heartbeat_event,
      'expired_token_error', v_existing.expired_token_error,
      'expired_token_sqlstate', v_existing.expired_token_sqlstate,
      'wrong_operator_rejected', v_existing.wrong_operator_rejected,
      'wrong_operator_error', v_existing.wrong_operator_error,
      'wrong_operator_sqlstate', v_existing.wrong_operator_sqlstate,
      'idempotent_replay', true,
      'raw_token_stored', false
    );
  end if;

  select session_row.*
  into v_session
  from public.athena_build_timer_sessions as session_row
  where session_row.id = p_session_id;

  if v_session.id is null then
    raise exception
      'Timer session was not found.';
  end if;

  v_expired_hash :=
    md5(
      '0083-expired-a:' ||
      p_session_id::text || ':' ||
      v_normalized_test_key
    ) ||
    md5(
      '0083-expired-b:' ||
      p_session_id::text || ':' ||
      v_normalized_test_key
    );

  v_wrong_operator_hash :=
    md5(
      '0083-wrong-operator-a:' ||
      p_session_id::text || ':' ||
      v_normalized_test_key
    ) ||
    md5(
      '0083-wrong-operator-b:' ||
      p_session_id::text || ':' ||
      v_normalized_test_key
    );

  v_expired_operation_key :=
    'automatic-qa-expired:' ||
    md5(v_normalized_test_key);

  v_wrong_operator_operation_key :=
    'automatic-qa-wrong-operator:' ||
    md5(v_normalized_test_key);

  insert into public.athena_build_timer_helper_tokens (
    session_id,
    token_hash,
    issued_to_operator,
    expires_at,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_session.id,
    v_expired_hash,
    v_session.operator_key,
    v_now - interval '1 minute',
    jsonb_build_object(
      'automatic_qa_security_test', true,
      'scenario', 'expired_token',
      'test_key', v_normalized_test_key,
      'token_hash_algorithm', 'sha256',
      'raw_token_stored', false,
      'issued_by', 'athena_automatic_qa'
    ),
    v_now - interval '2 minutes',
    v_now - interval '2 minutes'
  )
  on conflict (token_hash) do nothing;

  select token_row.*
  into v_expired_token
  from public.athena_build_timer_helper_tokens as token_row
  where token_row.token_hash = v_expired_hash;

  if v_expired_token.id is null
    or v_expired_token.session_id <> v_session.id
    or v_expired_token.expires_at >= v_now
    or v_expired_token.metadata ->> 'scenario' <> 'expired_token'
  then
    raise exception
      'Automatic QA could not establish the expired-token fixture.';
  end if;

  begin
    perform public.athena_build_timer_apply_helper_heartbeat(
      v_expired_hash,
      v_expired_operation_key,
      jsonb_build_object(
        'automatic_qa_security_test', true,
        'scenario', 'expired_token',
        'test_key', v_normalized_test_key,
        'raw_token_stored', false,
        'offline_replay', false
      )
    );
  exception
    when others then
      get stacked diagnostics
        v_expired_sqlstate = returned_sqlstate,
        v_expired_error = message_text;

      v_expired_rejected :=
        v_expired_error =
          'Helper token is invalid or expired.';
  end;

  select token_row.last_used_at is null
  into v_expired_not_used
  from public.athena_build_timer_helper_tokens as token_row
  where token_row.id = v_expired_token.id;

  select not exists (
    select 1
    from public.athena_build_timer_events as event_row
    where event_row.operation_key = v_expired_operation_key
  )
  into v_expired_no_heartbeat_event;

  begin
    perform public.athena_build_timer_issue_helper_token(
      v_session.id,
      v_session.operator_key || ':automatic-qa-wrong-operator',
      v_wrong_operator_hash,
      v_now + interval '1 hour',
      v_wrong_operator_operation_key,
      jsonb_build_object(
        'automatic_qa_security_test', true,
        'scenario', 'wrong_operator',
        'test_key', v_normalized_test_key,
        'raw_token_stored', false
      )
    );
  exception
    when others then
      get stacked diagnostics
        v_wrong_operator_sqlstate = returned_sqlstate,
        v_wrong_operator_error = message_text;

      v_wrong_operator_rejected :=
        v_wrong_operator_error =
          'Timer session belongs to a different operator.';
  end;

  if v_expired_rejected
    and v_expired_not_used
    and v_expired_no_heartbeat_event
    and v_wrong_operator_rejected
  then
    insert into public.athena_build_timer_helper_security_qa_evidence (
      session_id,
      test_key,
      expired_token_rejected,
      expired_token_not_used,
      expired_token_no_heartbeat_event,
      expired_token_error,
      expired_token_sqlstate,
      wrong_operator_rejected,
      wrong_operator_error,
      wrong_operator_sqlstate,
      metadata
    )
    values (
      v_session.id,
      v_normalized_test_key,
      v_expired_rejected,
      v_expired_not_used,
      v_expired_no_heartbeat_event,
      v_expired_error,
      v_expired_sqlstate,
      v_wrong_operator_rejected,
      v_wrong_operator_error,
      v_wrong_operator_sqlstate,
      jsonb_build_object(
        'build_id', '0083',
        'evidence_source', 'automatic_runtime_security_self_test',
        'raw_token_stored', false,
        'expired_fixture_token_id', v_expired_token.id,
        'expired_operation_key', v_expired_operation_key,
        'wrong_operator_operation_key', v_wrong_operator_operation_key
      )
    )
    on conflict (session_id, test_key) do nothing;
  end if;

  select evidence_row.*
  into v_saved
  from public.athena_build_timer_helper_security_qa_evidence
    as evidence_row
  where evidence_row.session_id = p_session_id
    and evidence_row.test_key = v_normalized_test_key;

  return jsonb_build_object(
    'evidence_id', v_saved.id,
    'session_id', v_session.id,
    'test_key', v_normalized_test_key,
    'expired_token_rejected', v_expired_rejected,
    'expired_token_not_used', v_expired_not_used,
    'expired_token_no_heartbeat_event',
      v_expired_no_heartbeat_event,
    'expired_token_error', v_expired_error,
    'expired_token_sqlstate', v_expired_sqlstate,
    'wrong_operator_rejected', v_wrong_operator_rejected,
    'wrong_operator_error', v_wrong_operator_error,
    'wrong_operator_sqlstate', v_wrong_operator_sqlstate,
    'idempotent_replay', false,
    'raw_token_stored', false
  );
end;
$function$;

revoke all
on function public.athena_build_timer_run_helper_security_qa(
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.athena_build_timer_run_helper_security_qa(
  uuid,
  text
)
to service_role;

comment on table public.athena_build_timer_helper_security_qa_evidence is
  'Persisted, hash-only results from idempotent Build Timer helper-token security self-tests.';

comment on function public.athena_build_timer_run_helper_security_qa(
  uuid,
  text
) is
  'Runs and persists service-role-only expired-token and wrong-operator rejection tests without exposing a raw token.';
