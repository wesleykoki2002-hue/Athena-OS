-- Athena CTO canonical persisted build assignment and formal-start lifecycle
-- Draft migration package only. Applying this migration is NOT AUTHORIZED.
-- Intended repository target:
--   supabase/migrations/20260726103000_canonical_build_lifecycle_assign_start.sql
-- Intended Supabase project:
--   voiwlcvfahykdldtjeqy
-- Canonical owner:
--   athena-cto / build-log-recorder
-- Handoff used to design this package:
--   Version 1.7 / SHA-256 054666ad7aab6a5f3418255c26b28f3817d48178c1c39ecc7719c754b1b3ad1d
--
-- This migration creates only:
--   1. one singleton current-state relation;
--   2. one immutable append-only transition relation;
--   3. internal trigger functions;
--   4. one service-role-only assignment/start RPC.
--
-- It does not assign, reserve, or start Build 0085 merely by being applied.

-- Fail closed if any canonical lifecycle object already exists. A successful
-- migration must be applied once through the governed migration runner.
do $preflight$
begin
  if to_regclass('public.athena_build_lifecycle_state') is not null
     or to_regclass('public.athena_build_lifecycle_transitions') is not null
     or to_regprocedure(
          'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
        ) is not null
     or to_regprocedure(
          'public.athena_touch_build_lifecycle_state_updated_at()'
        ) is not null
     or to_regprocedure(
          'public.prevent_athena_build_lifecycle_transition_mutation()'
        ) is not null then
    raise exception
      'Canonical build lifecycle objects already exist. Migration stopped without change.';
  end if;

  if to_regclass('public.athena_projects') is null
     or to_regclass('public.athena_project_modules') is null
     or to_regclass('public.athena_intake_items') is null
     or to_regclass('public.athena_intake_review_history') is null
     or to_regclass('public.athena_intake_preparation_packages') is null
     or to_regclass('public.athena_build_timer_sessions') is null
     or to_regclass('public.athena_qa_runs') is null
     or to_regclass('public.athena_feature_completion_packets') is null
     or to_regclass('public.athena_feature_completion_events') is null
     or to_regclass('public.athena_build_logs') is null then
    raise exception
      'One or more required canonical Athena relations are missing.';
  end if;

  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Required extensions.digest(bytea,text) SHA-256 function is missing.';
  end if;
end;
$preflight$;

create table public.athena_build_lifecycle_state (
  id uuid primary key default gen_random_uuid(),
  singleton_key boolean not null default true,
  build_number integer not null,
  build_id text not null,
  build_title text not null,
  lifecycle_status text not null default 'started',
  intake_id uuid not null
    references public.athena_intake_items(id) on delete restrict,
  preparation_package_id uuid not null
    references public.athena_intake_preparation_packages(id) on delete restrict,
  project_key text not null,
  module_key text not null,
  module_id uuid not null
    references public.athena_project_modules(id) on delete restrict,
  target_system text not null,
  tracking_system text not null,
  repository_path text not null,
  repository_head text not null,
  supabase_project_ref text not null,
  handoff_version text not null,
  handoff_sha256 text not null,
  assigned_at timestamptz not null,
  started_at timestamptz not null,
  assigned_by text not null,
  started_by text not null,
  assignment_method text not null,
  start_method text not null,
  operation_key text not null,
  request_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athena_build_lifecycle_state_singleton
    unique (singleton_key),
  constraint athena_build_lifecycle_state_singleton_true
    check (singleton_key),
  constraint athena_build_lifecycle_state_build_number_range
    check (build_number between 1 and 9999),
  constraint athena_build_lifecycle_state_build_id_format
    check (build_id ~ '^[0-9]{4}$'),
  constraint athena_build_lifecycle_state_build_identity_match
    check (build_id = lpad(build_number::text, 4, '0')),
  constraint athena_build_lifecycle_state_title_format
    check (build_title like build_id || ' Build title: %'),
  constraint athena_build_lifecycle_state_status
    check (lifecycle_status = 'started'),
  constraint athena_build_lifecycle_state_repository_head
    check (repository_head ~ '^[0-9a-f]{40}$'),
  constraint athena_build_lifecycle_state_handoff_sha256
    check (handoff_sha256 ~ '^[0-9a-f]{64}$'),
  constraint athena_build_lifecycle_state_request_hash
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint athena_build_lifecycle_state_operation_key
    check (operation_key ~ '^[a-z0-9][a-z0-9:_-]{15,199}$'),
  constraint athena_build_lifecycle_state_nonblank
    check (
      length(btrim(build_title)) > 0
      and length(btrim(project_key)) > 0
      and length(btrim(module_key)) > 0
      and length(btrim(target_system)) > 0
      and length(btrim(tracking_system)) > 0
      and length(btrim(repository_path)) > 0
      and length(btrim(supabase_project_ref)) > 0
      and length(btrim(handoff_version)) > 0
      and length(btrim(assigned_by)) > 0
      and length(btrim(started_by)) > 0
      and length(btrim(assignment_method)) > 0
      and length(btrim(start_method)) > 0
    )
);

create table public.athena_build_lifecycle_transitions (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null
    references public.athena_build_lifecycle_state(id) on delete restrict,
  event_type text not null,
  operation_key text not null,
  request_hash text not null,
  result_hash text not null,
  build_number integer not null,
  build_id text not null,
  build_title text not null,
  intake_id uuid not null
    references public.athena_intake_items(id) on delete restrict,
  preparation_package_id uuid not null
    references public.athena_intake_preparation_packages(id) on delete restrict,
  project_key text not null,
  module_key text not null,
  module_id uuid not null
    references public.athena_project_modules(id) on delete restrict,
  from_state jsonb not null,
  to_state jsonb not null,
  actor_key text not null,
  actor_display_name text,
  assignment_method text not null,
  start_method text not null,
  request_evidence jsonb not null default '{}'::jsonb,
  result_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint athena_build_lifecycle_transitions_event_type
    check (event_type = 'assigned_started'),
  constraint athena_build_lifecycle_transitions_operation_key
    unique (operation_key),
  constraint athena_build_lifecycle_transitions_build_id
    unique (build_id),
  constraint athena_build_lifecycle_transitions_intake
    unique (intake_id),
  constraint athena_build_lifecycle_transitions_package
    unique (preparation_package_id),
  constraint athena_build_lifecycle_transitions_build_number_range
    check (build_number between 1 and 9999),
  constraint athena_build_lifecycle_transitions_build_id_format
    check (build_id ~ '^[0-9]{4}$'),
  constraint athena_build_lifecycle_transitions_build_identity_match
    check (build_id = lpad(build_number::text, 4, '0')),
  constraint athena_build_lifecycle_transitions_title_format
    check (build_title like build_id || ' Build title: %'),
  constraint athena_build_lifecycle_transitions_request_hash
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint athena_build_lifecycle_transitions_result_hash
    check (result_hash ~ '^[0-9a-f]{64}$'),
  constraint athena_build_lifecycle_transitions_operation_key_format
    check (operation_key ~ '^[a-z0-9][a-z0-9:_-]{15,199}$'),
  constraint athena_build_lifecycle_transitions_actor
    check (length(btrim(actor_key)) > 0)
);

create index athena_build_lifecycle_transitions_created_at_idx
  on public.athena_build_lifecycle_transitions (created_at desc);

create index athena_build_lifecycle_transitions_owner_idx
  on public.athena_build_lifecycle_transitions (
    project_key,
    module_key,
    created_at desc
  );

create or replace function public.athena_touch_build_lifecycle_state_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger athena_build_lifecycle_state_updated_at
before update on public.athena_build_lifecycle_state
for each row
execute function public.athena_touch_build_lifecycle_state_updated_at();

create or replace function public.prevent_athena_build_lifecycle_transition_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception
    'Athena build lifecycle transitions are append-only and cannot be updated or deleted.';
end;
$function$;

create trigger athena_build_lifecycle_transitions_append_only
before update or delete on public.athena_build_lifecycle_transitions
for each row
execute function public.prevent_athena_build_lifecycle_transition_mutation();

alter table public.athena_build_lifecycle_state enable row level security;
alter table public.athena_build_lifecycle_transitions enable row level security;

revoke all on table public.athena_build_lifecycle_state
  from public, anon, authenticated, service_role;
revoke all on table public.athena_build_lifecycle_transitions
  from public, anon, authenticated, service_role;

grant select on table public.athena_build_lifecycle_state
  to service_role;
grant select on table public.athena_build_lifecycle_transitions
  to service_role;

create or replace function public.athena_build_lifecycle_assign_and_start(
  p_intake_id uuid,
  p_preparation_package_id uuid,
  p_project_key text,
  p_module_key text,
  p_module_id uuid,
  p_build_name text,
  p_target_system text,
  p_tracking_system text,
  p_repository_path text,
  p_repository_head text,
  p_supabase_project_ref text,
  p_handoff_version text,
  p_handoff_sha256 text,
  p_operator_key text,
  p_operator_display_name text,
  p_operation_key text,
  p_request_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_intake public.athena_intake_items%rowtype;
  v_package public.athena_intake_preparation_packages%rowtype;
  v_state public.athena_build_lifecycle_state%rowtype;
  v_replay public.athena_build_lifecycle_transitions%rowtype;
  v_transition public.athena_build_lifecycle_transitions%rowtype;
  v_request jsonb;
  v_request_hash text;
  v_result jsonb;
  v_result_hash text;
  v_state_id uuid;
  v_transition_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_highest_build_number integer;
  v_candidate_build_number integer;
  v_candidate_build_id text;
  v_candidate_build_title text;
  v_previous_build_id text;
  v_previous_closed boolean;
  v_from_state jsonb := '{}'::jsonb;
  v_intake_hash_before text;
  v_intake_hash_after text;
  v_package_hash_before text;
  v_package_hash_after text;
  v_project_hash_before text;
  v_project_hash_after text;
  v_module_hash_before text;
  v_module_hash_after text;
  v_timer_count_before bigint;
  v_timer_count_after bigint;
  v_qa_count_before bigint;
  v_qa_count_after bigint;
  v_packet_count_before bigint;
  v_packet_count_after bigint;
  v_event_count_before bigint;
  v_event_count_after bigint;
  v_log_count_before bigint;
  v_log_count_after bigint;
  v_transition_count_before bigint;
  v_transition_count_after bigint;
  v_state_count_before bigint;
  v_state_count_after bigint;
  v_conflict_count bigint;
begin
  if p_intake_id is null
     or p_preparation_package_id is null
     or p_module_id is null
     or nullif(btrim(p_project_key), '') is null
     or nullif(btrim(p_module_key), '') is null
     or nullif(btrim(p_build_name), '') is null
     or nullif(btrim(p_target_system), '') is null
     or nullif(btrim(p_tracking_system), '') is null
     or nullif(btrim(p_repository_path), '') is null
     or nullif(btrim(p_repository_head), '') is null
     or nullif(btrim(p_supabase_project_ref), '') is null
     or nullif(btrim(p_handoff_version), '') is null
     or nullif(btrim(p_handoff_sha256), '') is null
     or nullif(btrim(p_operator_key), '') is null
     or nullif(btrim(p_operation_key), '') is null then
    raise exception
      'All canonical lifecycle identity, evidence, operator, and operation fields are required.';
  end if;

  if btrim(p_repository_head) !~ '^[0-9a-f]{40}$'
     or btrim(p_handoff_sha256) !~ '^[0-9a-f]{64}$'
     or btrim(p_operation_key) !~ '^[a-z0-9][a-z0-9:_-]{15,199}$' then
    raise exception
      'Repository HEAD, handoff SHA-256, or operation-key format is invalid.';
  end if;

  if btrim(p_supabase_project_ref) <> 'voiwlcvfahykdldtjeqy' then
    raise exception 'Unexpected Supabase project identity.';
  end if;

  if coalesce((p_request_evidence ->> 'local_handoff_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_head_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'tracked_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'staged_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'supabase_project_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'operator_session_verified')::boolean, false) <> true then
    raise exception
      'Required server-side handoff, repository, Supabase, or operator verification evidence is absent.';
  end if;

  v_request := jsonb_build_object(
    'intake_id', p_intake_id,
    'preparation_package_id', p_preparation_package_id,
    'project_key', btrim(p_project_key),
    'module_key', btrim(p_module_key),
    'module_id', p_module_id,
    'build_name', btrim(p_build_name),
    'target_system', btrim(p_target_system),
    'tracking_system', btrim(p_tracking_system),
    'repository_path', btrim(p_repository_path),
    'repository_head', btrim(p_repository_head),
    'supabase_project_ref', btrim(p_supabase_project_ref),
    'handoff_version', btrim(p_handoff_version),
    'handoff_sha256', btrim(p_handoff_sha256),
    'operator_key', btrim(p_operator_key),
    'operator_display_name', nullif(btrim(p_operator_display_name), ''),
    'operation_key', btrim(p_operation_key),
    'request_evidence', coalesce(p_request_evidence, '{}'::jsonb)
  );

  v_request_hash := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('athena:canonical-build-lifecycle:global-assignment-start', 0)
  );

  select *
  into v_replay
  from public.athena_build_lifecycle_transitions
  where operation_key = btrim(p_operation_key);

  if found then
    if v_replay.request_hash <> v_request_hash then
      raise exception
        'Operation key was already used with contradictory lifecycle inputs.';
    end if;

    return v_replay.result_snapshot || jsonb_build_object(
      'idempotent_replay', true,
      'replayed_transition_id', v_replay.id
    );
  end if;

  select *
  into strict v_intake
  from public.athena_intake_items
  where id = p_intake_id
  for update;

  if v_intake.status_key <> 'approved'
     or v_intake.project_key <> btrim(p_project_key)
     or v_intake.module_key <> btrim(p_module_key) then
    raise exception
      'The Intake is not the exact approved canonical project/module Intake.';
  end if;

  if (
    select count(*)
    from public.athena_intake_review_history
    where intake_id = p_intake_id
      and to_status_key = 'approved'
      and review_outcome = 'approve'
  ) <> 1 then
    raise exception
      'The Intake does not have exactly one immutable approval review.';
  end if;

  select *
  into strict v_package
  from public.athena_intake_preparation_packages
  where id = p_preparation_package_id
    and intake_id = p_intake_id
  for update;

  if v_package.project_key <> btrim(p_project_key)
     or v_package.module_key <> btrim(p_module_key)
     or v_package.proposed_build_id is not null
     or v_package.proposed_build_title is not null
     or coalesce((v_package.metadata ->> 'build_id_assigned')::boolean, false)
     or coalesce((v_package.metadata ->> 'build_start_performed')::boolean, false)
     or coalesce((v_package.metadata ->> 'implementation_started')::boolean, false) then
    raise exception
      'The preparation package is contradictory, already assigned, or already started.';
  end if;

  if coalesce(
       (v_package.metadata ->> 'zero_build_id_control_plane_repair')::boolean,
       false
     ) then
    raise exception
      'A zero-build-ID control-plane repair package cannot itself be assigned as a build.';
  end if;

  if (
    select count(*)
    from public.athena_projects as project_row
    join public.athena_project_modules as module_row
      on module_row.project_key = project_row.project_key
    where project_row.project_key = btrim(p_project_key)
      and project_row.status = 'active'
      and project_row.blocked = false
      and module_row.id = p_module_id
      and module_row.project_key = btrim(p_project_key)
      and module_row.module_key = btrim(p_module_key)
  ) <> 1 then
    raise exception
      'Canonical project/module registry verification failed.';
  end if;

  select *
  into v_state
  from public.athena_build_lifecycle_state
  where singleton_key
  for update;

  if found then
    v_from_state := to_jsonb(v_state);
  end if;

  with raw_identifiers(value) as (
    select transition_row.build_id
    from public.athena_build_lifecycle_transitions as transition_row

    union all
    select state_row.build_id
    from public.athena_build_lifecycle_state as state_row

    union all
    select package_row.proposed_build_id
    from public.athena_intake_preparation_packages as package_row

    union all
    select package_row.metadata ->> 'assigned_build_id'
    from public.athena_intake_preparation_packages as package_row

    union all
    select package_row.metadata ->> 'build_start_id'
    from public.athena_intake_preparation_packages as package_row

    union all
    select package_row.proposed_build_title
    from public.athena_intake_preparation_packages as package_row

    union all
    select to_jsonb(qa_row) ->> 'build_number'
    from public.athena_qa_runs as qa_row

    union all
    select to_jsonb(qa_row) ->> 'build_id'
    from public.athena_qa_runs as qa_row

    union all
    select to_jsonb(qa_row) ->> 'build_session_title'
    from public.athena_qa_runs as qa_row

    union all
    select to_jsonb(packet_row) ->> 'build_session_title'
    from public.athena_feature_completion_packets as packet_row

    union all
    select to_jsonb(event_row) ->> 'build_session_title'
    from public.athena_feature_completion_events as event_row

    union all
    select to_jsonb(event_row) ->> 'feature_name'
    from public.athena_feature_completion_events as event_row

    union all
    select to_jsonb(log_row) ->> 'build_id'
    from public.athena_build_logs as log_row

    union all
    select to_jsonb(log_row) ->> 'build_number'
    from public.athena_build_logs as log_row

    union all
    select to_jsonb(log_row) ->> 'build_session_title'
    from public.athena_build_logs as log_row

    union all
    select to_jsonb(log_row) ->> 'title'
    from public.athena_build_logs as log_row
  ), parsed_identifiers(build_number) as (
    select case
      when btrim(value) ~ '^[0-9]{4}$'
        then btrim(value)::integer
      when btrim(value) ~ '^[0-9]{4}[[:space:]]+Build title:'
        then left(btrim(value), 4)::integer
      else null
    end
    from raw_identifiers
    where value is not null
  )
  select coalesce(max(build_number), 0)
  into v_highest_build_number
  from parsed_identifiers
  where build_number between 1 and 9999;

  if v_highest_build_number > 0 then
    v_previous_build_id := lpad(v_highest_build_number::text, 4, '0');

    select exists (
      select 1
      from public.athena_intake_preparation_packages as package_row
      where coalesce(
              package_row.metadata ->> 'formal_build_closed',
              'false'
            ) = 'true'
        and lower(coalesce(
              package_row.metadata ->> 'final_build_status',
              ''
            )) in ('completed', 'paused', 'cancelled')
        and (
          package_row.proposed_build_id = v_previous_build_id
          or package_row.metadata ->> 'assigned_build_id' = v_previous_build_id
          or package_row.metadata ->> 'build_start_id' = v_previous_build_id
          or coalesce(package_row.proposed_build_title, '') like
            v_previous_build_id || ' Build title:%'
        )

      union all
      select 1
      from public.athena_feature_completion_events as event_row
      where lower(coalesce(to_jsonb(event_row) ->> 'status', ''))
          in ('completed', 'paused', 'cancelled')
        and (
          coalesce(to_jsonb(event_row) ->> 'build_session_title', '') like
            v_previous_build_id || ' Build title:%'
          or coalesce(to_jsonb(event_row) ->> 'feature_name', '') like
            v_previous_build_id || ' Build title:%'
        )

      union all
      select 1
      from public.athena_feature_completion_packets as packet_row
      where lower(coalesce(to_jsonb(packet_row) ->> 'status', ''))
          in ('completed', 'paused', 'cancelled')
        and coalesce(
              to_jsonb(packet_row) ->> 'build_session_title',
              ''
            ) like v_previous_build_id || ' Build title:%'

      union all
      select 1
      from public.athena_build_logs as log_row
      where lower(coalesce(to_jsonb(log_row) ->> 'status', ''))
          in ('completed', 'paused', 'cancelled')
        and (
          coalesce(to_jsonb(log_row) ->> 'build_session_title', '') like
            v_previous_build_id || ' Build title:%'
          or coalesce(to_jsonb(log_row) ->> 'title', '') like
            v_previous_build_id || ' Build title:%'
        )
    ) into v_previous_closed;

    if not v_previous_closed then
      raise exception
        'Highest used build % is not formally closed in canonical evidence.',
        v_previous_build_id;
    end if;
  end if;

  v_candidate_build_number := v_highest_build_number + 1;

  if v_candidate_build_number > 9999 then
    raise exception 'No four-digit build identity remains available.';
  end if;

  v_candidate_build_id := lpad(v_candidate_build_number::text, 4, '0');
  v_candidate_build_title :=
    v_candidate_build_id || ' Build title: ' || btrim(p_build_name);

  select count(*)
  into v_conflict_count
  from public.athena_build_lifecycle_transitions as transition_row
  where transition_row.build_id = v_candidate_build_id
     or transition_row.intake_id = p_intake_id
     or transition_row.preparation_package_id = p_preparation_package_id;

  v_conflict_count := v_conflict_count + (
    select count(*)
    from public.athena_intake_preparation_packages as package_row
    where package_row.id <> p_preparation_package_id
      and (
        package_row.proposed_build_id = v_candidate_build_id
        or package_row.metadata ->> 'assigned_build_id' = v_candidate_build_id
        or package_row.metadata ->> 'build_start_id' = v_candidate_build_id
      )
  );

  if v_conflict_count <> 0 then
    raise exception
      'Candidate build identity %, Intake, or preparation package conflicts with existing canonical evidence.',
      v_candidate_build_id;
  end if;

  select count(*)
  into v_timer_count_before
  from public.athena_build_timer_sessions
  where status in ('active', 'paused', 'idle');

  if v_timer_count_before <> 0 then
    raise exception
      'An active, paused, or idle timer exists. Lifecycle start is blocked.';
  end if;

  select md5(to_jsonb(intake_row)::text)
  into v_intake_hash_before
  from public.athena_intake_items as intake_row
  where intake_row.id = p_intake_id;

  select md5(to_jsonb(package_row)::text)
  into v_package_hash_before
  from public.athena_intake_preparation_packages as package_row
  where package_row.id = p_preparation_package_id;

  select md5(to_jsonb(project_row)::text)
  into v_project_hash_before
  from public.athena_projects as project_row
  where project_row.project_key = btrim(p_project_key);

  select md5(to_jsonb(module_row)::text)
  into v_module_hash_before
  from public.athena_project_modules as module_row
  where module_row.id = p_module_id;

  select count(*) into v_qa_count_before
  from public.athena_qa_runs;
  select count(*) into v_packet_count_before
  from public.athena_feature_completion_packets;
  select count(*) into v_event_count_before
  from public.athena_feature_completion_events;
  select count(*) into v_log_count_before
  from public.athena_build_logs;
  select count(*) into v_transition_count_before
  from public.athena_build_lifecycle_transitions;
  select count(*) into v_state_count_before
  from public.athena_build_lifecycle_state;

  if v_state.id is null then
    v_state_id := gen_random_uuid();

    insert into public.athena_build_lifecycle_state (
      id,
      singleton_key,
      build_number,
      build_id,
      build_title,
      lifecycle_status,
      intake_id,
      preparation_package_id,
      project_key,
      module_key,
      module_id,
      target_system,
      tracking_system,
      repository_path,
      repository_head,
      supabase_project_ref,
      handoff_version,
      handoff_sha256,
      assigned_at,
      started_at,
      assigned_by,
      started_by,
      assignment_method,
      start_method,
      operation_key,
      request_hash,
      evidence
    ) values (
      v_state_id,
      true,
      v_candidate_build_number,
      v_candidate_build_id,
      v_candidate_build_title,
      'started',
      p_intake_id,
      p_preparation_package_id,
      btrim(p_project_key),
      btrim(p_module_key),
      p_module_id,
      btrim(p_target_system),
      btrim(p_tracking_system),
      btrim(p_repository_path),
      btrim(p_repository_head),
      btrim(p_supabase_project_ref),
      btrim(p_handoff_version),
      btrim(p_handoff_sha256),
      v_now,
      v_now,
      btrim(p_operator_key),
      btrim(p_operator_key),
      'canonical_lifecycle_highest_used_plus_one',
      'canonical_atomic_assign_and_start',
      btrim(p_operation_key),
      v_request_hash,
      coalesce(p_request_evidence, '{}'::jsonb)
    );
  else
    v_state_id := v_state.id;

    update public.athena_build_lifecycle_state
    set
      build_number = v_candidate_build_number,
      build_id = v_candidate_build_id,
      build_title = v_candidate_build_title,
      lifecycle_status = 'started',
      intake_id = p_intake_id,
      preparation_package_id = p_preparation_package_id,
      project_key = btrim(p_project_key),
      module_key = btrim(p_module_key),
      module_id = p_module_id,
      target_system = btrim(p_target_system),
      tracking_system = btrim(p_tracking_system),
      repository_path = btrim(p_repository_path),
      repository_head = btrim(p_repository_head),
      supabase_project_ref = btrim(p_supabase_project_ref),
      handoff_version = btrim(p_handoff_version),
      handoff_sha256 = btrim(p_handoff_sha256),
      assigned_at = v_now,
      started_at = v_now,
      assigned_by = btrim(p_operator_key),
      started_by = btrim(p_operator_key),
      assignment_method = 'canonical_lifecycle_highest_used_plus_one',
      start_method = 'canonical_atomic_assign_and_start',
      operation_key = btrim(p_operation_key),
      request_hash = v_request_hash,
      evidence = coalesce(p_request_evidence, '{}'::jsonb)
    where id = v_state_id
      and singleton_key;

    if not found then
      raise exception 'Canonical lifecycle state update failed.';
    end if;
  end if;

  v_result := jsonb_build_object(
    'status', 'canonical_build_assigned_and_started',
    'state_id', v_state_id,
    'transition_id', v_transition_id,
    'build_number', v_candidate_build_number,
    'build_id', v_candidate_build_id,
    'build_title', v_candidate_build_title,
    'lifecycle_status', 'started',
    'intake_id', p_intake_id,
    'preparation_package_id', p_preparation_package_id,
    'project_key', btrim(p_project_key),
    'module_key', btrim(p_module_key),
    'module_id', p_module_id,
    'target_system', btrim(p_target_system),
    'tracking_system', btrim(p_tracking_system),
    'repository_path', btrim(p_repository_path),
    'repository_head', btrim(p_repository_head),
    'supabase_project_ref', btrim(p_supabase_project_ref),
    'handoff_version', btrim(p_handoff_version),
    'handoff_sha256', btrim(p_handoff_sha256),
    'assigned_at', v_now,
    'started_at', v_now,
    'assigned_by', btrim(p_operator_key),
    'started_by', btrim(p_operator_key),
    'assignment_method', 'canonical_lifecycle_highest_used_plus_one',
    'start_method', 'canonical_atomic_assign_and_start',
    'operation_key', btrim(p_operation_key),
    'request_hash', v_request_hash,
    'idempotent_replay', false,
    'timer_started', false,
    'qa_created', false,
    'completion_created', false,
    'build_log_created', false
  );

  v_result_hash := encode(
    extensions.digest(convert_to(v_result::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.athena_build_lifecycle_transitions (
    id,
    state_id,
    event_type,
    operation_key,
    request_hash,
    result_hash,
    build_number,
    build_id,
    build_title,
    intake_id,
    preparation_package_id,
    project_key,
    module_key,
    module_id,
    from_state,
    to_state,
    actor_key,
    actor_display_name,
    assignment_method,
    start_method,
    request_evidence,
    result_snapshot,
    created_at
  ) values (
    v_transition_id,
    v_state_id,
    'assigned_started',
    btrim(p_operation_key),
    v_request_hash,
    v_result_hash,
    v_candidate_build_number,
    v_candidate_build_id,
    v_candidate_build_title,
    p_intake_id,
    p_preparation_package_id,
    btrim(p_project_key),
    btrim(p_module_key),
    p_module_id,
    v_from_state,
    v_result,
    btrim(p_operator_key),
    nullif(btrim(p_operator_display_name), ''),
    'canonical_lifecycle_highest_used_plus_one',
    'canonical_atomic_assign_and_start',
    coalesce(p_request_evidence, '{}'::jsonb),
    v_result,
    v_now
  );

  select *
  into strict v_state
  from public.athena_build_lifecycle_state
  where id = v_state_id;

  select *
  into strict v_transition
  from public.athena_build_lifecycle_transitions
  where id = v_transition_id;

  if v_state.build_id <> v_candidate_build_id
     or v_state.build_title <> v_candidate_build_title
     or v_state.lifecycle_status <> 'started'
     or v_state.intake_id <> p_intake_id
     or v_state.preparation_package_id <> p_preparation_package_id
     or v_state.operation_key <> btrim(p_operation_key)
     or v_state.request_hash <> v_request_hash
     or v_transition.operation_key <> btrim(p_operation_key)
     or v_transition.request_hash <> v_request_hash
     or v_transition.result_hash <> v_result_hash
     or v_transition.result_snapshot <> v_result then
    raise exception
      'Canonical lifecycle read-after-write verification failed.';
  end if;

  select md5(to_jsonb(intake_row)::text)
  into v_intake_hash_after
  from public.athena_intake_items as intake_row
  where intake_row.id = p_intake_id;

  select md5(to_jsonb(package_row)::text)
  into v_package_hash_after
  from public.athena_intake_preparation_packages as package_row
  where package_row.id = p_preparation_package_id;

  select md5(to_jsonb(project_row)::text)
  into v_project_hash_after
  from public.athena_projects as project_row
  where project_row.project_key = btrim(p_project_key);

  select md5(to_jsonb(module_row)::text)
  into v_module_hash_after
  from public.athena_project_modules as module_row
  where module_row.id = p_module_id;

  select count(*)
  into v_timer_count_after
  from public.athena_build_timer_sessions
  where status in ('active', 'paused', 'idle');
  select count(*) into v_qa_count_after
  from public.athena_qa_runs;
  select count(*) into v_packet_count_after
  from public.athena_feature_completion_packets;
  select count(*) into v_event_count_after
  from public.athena_feature_completion_events;
  select count(*) into v_log_count_after
  from public.athena_build_logs;
  select count(*) into v_transition_count_after
  from public.athena_build_lifecycle_transitions;
  select count(*) into v_state_count_after
  from public.athena_build_lifecycle_state;

  if v_intake_hash_before is distinct from v_intake_hash_after
     or v_package_hash_before is distinct from v_package_hash_after
     or v_project_hash_before is distinct from v_project_hash_after
     or v_module_hash_before is distinct from v_module_hash_after
     or v_timer_count_after <> v_timer_count_before
     or v_qa_count_after <> v_qa_count_before
     or v_packet_count_after <> v_packet_count_before
     or v_event_count_after <> v_event_count_before
     or v_log_count_after <> v_log_count_before
     or v_transition_count_after <> v_transition_count_before + 1
     or v_state_count_after <> greatest(v_state_count_before, 1) then
    raise exception
      'Unauthorized related-state change or lifecycle row-count mismatch detected.';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.athena_build_lifecycle_assign_and_start(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.athena_build_lifecycle_assign_and_start(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

revoke all on function public.athena_touch_build_lifecycle_state_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_athena_build_lifecycle_transition_mutation()
  from public, anon, authenticated, service_role;

comment on table public.athena_build_lifecycle_state is
  'Singleton canonical current state for the most recently persisted Athena build assignment and formal start.';

comment on table public.athena_build_lifecycle_transitions is
  'Append-only immutable transition evidence for canonical Athena build assignment and formal start operations.';

comment on function public.athena_build_lifecycle_assign_and_start(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) is
  'Service-role-only atomic, idempotent, collision-safe build assignment and formal-start lifecycle RPC. It never starts a timer or creates QA, completion, build-log, planning, registry, or Git side effects.';
