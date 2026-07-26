begin;

-- ============================================================
-- 0081
-- Persistent Completion Packet Recovery
-- Acknowledged QA Warning Closure
-- ============================================================

-- ------------------------------------------------------------
-- 1. Warning acknowledgement evidence
-- ------------------------------------------------------------

alter table public.athena_qa_check_results
  add column if not exists warning_acknowledged_at timestamptz,
  add column if not exists warning_acknowledged_by text,
  add column if not exists warning_acknowledgement_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.athena_qa_check_results'::regclass
      and conname =
        'athena_qa_check_results_warning_acknowledgement_check'
  ) then
    alter table public.athena_qa_check_results
      add constraint
        athena_qa_check_results_warning_acknowledgement_check
      check (
        (
          warning_acknowledged_at is null
          and warning_acknowledged_by is null
          and warning_acknowledgement_notes is null
        )
        or
        (
          status = 'warning'
          and warning_acknowledged_at is not null
          and nullif(
            btrim(warning_acknowledged_by),
            ''
          ) is not null
          and nullif(
            btrim(warning_acknowledgement_notes),
            ''
          ) is not null
        )
      );
  end if;
end
$$;

create index if not exists
  athena_qa_check_results_warning_closure_idx
on public.athena_qa_check_results (
  qa_run_id,
  status,
  warning_acknowledged_at
);

create or replace function
  public.athena_normalize_qa_warning_acknowledgement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Acknowledgement evidence is valid only while the check
  -- remains in warning status. Evidence supplied during a
  -- transition to warning must be preserved.
  if new.status <> 'warning' then
    new.warning_acknowledged_at := null;
    new.warning_acknowledged_by := null;
    new.warning_acknowledgement_notes := null;
  end if;

  return new;
end;
$$;

drop trigger if exists
  athena_qa_check_results_normalize_warning_acknowledgement
on public.athena_qa_check_results;

create trigger
  athena_qa_check_results_normalize_warning_acknowledgement
before insert or update
on public.athena_qa_check_results
for each row
execute function
  public.athena_normalize_qa_warning_acknowledgement();

-- ------------------------------------------------------------
-- 2. Persistent completion packets
-- ------------------------------------------------------------

create table if not exists
  public.athena_feature_completion_packets (
    id uuid primary key default gen_random_uuid(),

    project_key text not null,
    module_key text not null,

    feature_type text not null
      default 'standard_app_feature',

    feature_name text not null,
    build_session_title text not null,
    route_path text,
    summary text,

    completed text[] not null default '{}',
    files_changed text[] not null default '{}',
    files_created text[] not null default '{}',
    files_modified text[] not null default '{}',
    database_changes text[] not null default '{}',
    decisions text[] not null default '{}',
    security_notes text[] not null default '{}',
    missing text[] not null default '{}',
    next_steps text[] not null default '{}',

    hours_spent numeric,
    estimated_remaining_hours_snapshot numeric,

    status text not null default 'draft',

    qa_run_id uuid,
    completion_event_id uuid,
    build_log_id uuid,

    metadata jsonb not null default '{}',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,

    constraint
      athena_feature_completion_packets_project_module_fkey
      foreign key (
        project_key,
        module_key
      )
      references public.athena_project_modules (
        project_key,
        module_key
      )
      on update cascade
      on delete restrict,

    constraint
      athena_feature_completion_packets_qa_run_fkey
      foreign key (qa_run_id)
      references public.athena_qa_runs (id)
      on delete set null,

    constraint
      athena_feature_completion_packets_completion_event_fkey
      foreign key (completion_event_id)
      references public.athena_feature_completion_events (id)
      on delete set null,

    constraint
      athena_feature_completion_packets_build_log_fkey
      foreign key (build_log_id)
      references public.athena_build_logs (id)
      on delete set null,

    constraint
      athena_feature_completion_packets_unique_session
      unique (
        project_key,
        build_session_title
      ),

    constraint
      athena_feature_completion_packets_unique_qa_run
      unique (qa_run_id),

    constraint
      athena_feature_completion_packets_unique_completion_event
      unique (completion_event_id),

    constraint
      athena_feature_completion_packets_unique_build_log
      unique (build_log_id),

    constraint
      athena_feature_completion_packets_identity_check
      check (
        nullif(btrim(project_key), '') is not null
        and nullif(btrim(module_key), '') is not null
        and nullif(btrim(feature_type), '') is not null
        and nullif(btrim(feature_name), '') is not null
        and nullif(
          btrim(build_session_title),
          ''
        ) is not null
      ),

    constraint
      athena_feature_completion_packets_hours_check
      check (
        hours_spent is null
        or hours_spent >= 0
      ),

    constraint
      athena_feature_completion_packets_remaining_hours_check
      check (
        estimated_remaining_hours_snapshot is null
        or estimated_remaining_hours_snapshot >= 0
      ),

    constraint
      athena_feature_completion_packets_status_check
      check (
        status in (
          'draft',
          'qa_in_progress',
          'ready_to_record',
          'recording',
          'retry_ready',
          'completed',
          'cancelled'
        )
      ),

    constraint
      athena_feature_completion_packets_completed_links_check
      check (
        status <> 'completed'
        or (
          qa_run_id is not null
          and completion_event_id is not null
          and build_log_id is not null
          and completed_at is not null
        )
      )
  );

create index if not exists
  athena_feature_completion_packets_open_idx
on public.athena_feature_completion_packets (
  status,
  updated_at desc
)
where status not in (
  'completed',
  'cancelled'
);

create index if not exists
  athena_feature_completion_packets_module_idx
on public.athena_feature_completion_packets (
  project_key,
  module_key,
  updated_at desc
);

-- ------------------------------------------------------------
-- 3. Cross-record governance validation
-- ------------------------------------------------------------

create or replace function
  public.athena_validate_feature_completion_packet_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qa_record public.athena_qa_runs%rowtype;
  completion_record
    public.athena_feature_completion_events%rowtype;
  build_record public.athena_build_logs%rowtype;
begin
  if new.qa_run_id is not null then
    select *
    into qa_record
    from public.athena_qa_runs
    where id = new.qa_run_id;

    if not found then
      raise exception
        'QA run % does not exist.',
        new.qa_run_id;
    end if;

    if
      qa_record.project_key is distinct from new.project_key
      or qa_record.module_key is distinct from new.module_key
      or qa_record.feature_name is distinct from new.feature_name
      or qa_record.build_session_title
        is distinct from new.build_session_title
      or qa_record.route_path is distinct from new.route_path
    then
      raise exception
        'QA run % does not match completion packet identity.',
        new.qa_run_id;
    end if;
  end if;

  if new.completion_event_id is not null then
    select *
    into completion_record
    from public.athena_feature_completion_events
    where id = new.completion_event_id;

    if not found then
      raise exception
        'Completion event % does not exist.',
        new.completion_event_id;
    end if;

    if
      completion_record.project_key
        is distinct from new.project_key
      or completion_record.module_key
        is distinct from new.module_key
      or completion_record.feature_name
        is distinct from new.feature_name
      or completion_record.build_session_title
        is distinct from new.build_session_title
      or completion_record.route_path
        is distinct from new.route_path
      or completion_record.qa_run_id
        is distinct from new.qa_run_id
    then
      raise exception
        'Completion event % does not match completion packet identity.',
        new.completion_event_id;
    end if;
  end if;

  if new.build_log_id is not null then
    select *
    into build_record
    from public.athena_build_logs
    where id = new.build_log_id;

    if not found then
      raise exception
        'Build log % does not exist.',
        new.build_log_id;
    end if;

    if
      build_record.product_key
        is distinct from new.project_key
      or build_record.session_title
        is distinct from new.build_session_title
    then
      raise exception
        'Build log % does not match completion packet identity.',
        new.build_log_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists
  athena_feature_completion_packets_validate_links
on public.athena_feature_completion_packets;

create trigger
  athena_feature_completion_packets_validate_links
before insert or update
on public.athena_feature_completion_packets
for each row
execute function
  public.athena_validate_feature_completion_packet_links();

-- ------------------------------------------------------------
-- 4. Packet timestamp normalization
-- ------------------------------------------------------------

create or replace function
  public.athena_touch_feature_completion_packet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  if new.status = 'completed' then
    new.completed_at :=
      coalesce(new.completed_at, now());
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists
  athena_feature_completion_packets_touch
on public.athena_feature_completion_packets;

create trigger
  athena_feature_completion_packets_touch
before insert or update
on public.athena_feature_completion_packets
for each row
execute function
  public.athena_touch_feature_completion_packet();

-- ------------------------------------------------------------
-- 5. RLS and service-role-only access
-- ------------------------------------------------------------

alter table
  public.athena_feature_completion_packets
enable row level security;

revoke all
on table public.athena_feature_completion_packets
from public, anon, authenticated;

grant select, insert, update, delete
on table public.athena_feature_completion_packets
to service_role;

revoke all
on function
  public.athena_validate_feature_completion_packet_links()
from public, anon, authenticated;

grant execute
on function
  public.athena_validate_feature_completion_packet_links()
to service_role;

revoke all
on function
  public.athena_touch_feature_completion_packet()
from public, anon, authenticated;

grant execute
on function
  public.athena_touch_feature_completion_packet()
to service_role;

revoke all
on function
  public.athena_normalize_qa_warning_acknowledgement()
from public, anon, authenticated;

grant execute
on function
  public.athena_normalize_qa_warning_acknowledgement()
to service_role;

comment on table
  public.athena_feature_completion_packets
is
  'Persistent Athena CTO completion packets. Every packet must belong to a registered canonical project/module before QA or recording.';

comment on column
  public.athena_qa_check_results.warning_acknowledged_at
is
  'Timestamp proving that a warning was explicitly reviewed and accepted as non-blocking.';

comment on column
  public.athena_qa_check_results.warning_acknowledgement_notes
is
  'Required evidence explaining why an acknowledged warning is non-blocking.';

commit;
