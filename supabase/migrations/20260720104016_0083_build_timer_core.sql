-- Build 0083
-- Athena Build Timer and Automatic Hours Recording
--
-- Canonical owner:
--   project_key: athena-cto
--   module_key: build-log-recorder
--
-- This migration creates the core timer evidence model only.
-- It does not modify planning estimates, remaining hours, progress,
-- priority, roadmap order, projects, or modules.

create table public.athena_build_timer_settings (
  settings_key text primary key,
  idle_threshold_seconds integer not null,
  heartbeat_interval_seconds integer not null,
  stale_timeout_seconds integer not null,
  completion_rounding_scale integer not null,
  one_active_session_per_operator boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint athena_build_timer_settings_key_not_blank
    check (length(btrim(settings_key)) > 0),

  constraint athena_build_timer_idle_threshold_positive
    check (idle_threshold_seconds > 0),

  constraint athena_build_timer_heartbeat_interval_positive
    check (heartbeat_interval_seconds > 0),

  constraint athena_build_timer_stale_timeout_valid
    check (
      stale_timeout_seconds > heartbeat_interval_seconds
    ),

  constraint athena_build_timer_rounding_scale_valid
    check (
      completion_rounding_scale between 0 and 6
    )
);

insert into public.athena_build_timer_settings (
  settings_key,
  idle_threshold_seconds,
  heartbeat_interval_seconds,
  stale_timeout_seconds,
  completion_rounding_scale,
  one_active_session_per_operator,
  metadata
)
values (
  'canonical',
  600,
  60,
  180,
  2,
  true,
  jsonb_build_object(
    'build_id',
    '0083',
    'idle_threshold_minutes',
    10,
    'heartbeat_interval_seconds',
    60,
    'stale_timeout_seconds',
    180,
    'duration_storage_unit',
    'seconds',
    'completion_hours_rounding',
    'nearest_0.01_hour',
    'approved_at',
    clock_timestamp()
  )
);

create table public.athena_build_timer_sessions (
  id uuid primary key default gen_random_uuid(),

  project_key text not null,
  module_key text not null,
  build_session_title text not null,

  operator_key text not null,
  operator_display_name text,

  status text not null default 'active',

  started_at timestamptz not null default clock_timestamp(),
  last_state_changed_at timestamptz not null default clock_timestamp(),
  last_accounted_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz,
  last_heartbeat_at timestamptz,
  stopped_at timestamptz,

  active_seconds bigint not null default 0,
  paused_seconds bigint not null default 0,
  idle_seconds bigint not null default 0,

  timer_version bigint not null default 1,
  calculation_version text not null default '0083-v1',

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint athena_build_timer_session_project_not_blank
    check (length(btrim(project_key)) > 0),

  constraint athena_build_timer_session_module_not_blank
    check (length(btrim(module_key)) > 0),

  constraint athena_build_timer_session_title_not_blank
    check (length(btrim(build_session_title)) > 0),

  constraint athena_build_timer_session_operator_not_blank
    check (length(btrim(operator_key)) > 0),

  constraint athena_build_timer_session_status_valid
    check (
      status in (
        'active',
        'paused',
        'idle',
        'stopped'
      )
    ),

  constraint athena_build_timer_session_active_seconds_valid
    check (active_seconds >= 0),

  constraint athena_build_timer_session_paused_seconds_valid
    check (paused_seconds >= 0),

  constraint athena_build_timer_session_idle_seconds_valid
    check (idle_seconds >= 0),

  constraint athena_build_timer_session_version_valid
    check (timer_version > 0),

  constraint athena_build_timer_session_stopped_state_valid
    check (
      (
        status = 'stopped'
        and stopped_at is not null
      )
      or
      (
        status <> 'stopped'
        and stopped_at is null
      )
    ),

  constraint athena_build_timer_session_unique_identity
    unique (
      project_key,
      module_key,
      build_session_title,
      operator_key
    )
);

create unique index
  athena_build_timer_one_running_session_per_operator
on public.athena_build_timer_sessions (
  operator_key
)
where status in (
  'active',
  'idle'
);

create index athena_build_timer_sessions_build_identity_idx
on public.athena_build_timer_sessions (
  project_key,
  module_key,
  build_session_title
);

create index athena_build_timer_sessions_status_idx
on public.athena_build_timer_sessions (
  status,
  updated_at desc
);

create table public.athena_build_timer_events (
  id uuid primary key default gen_random_uuid(),

  sequence_number bigint generated always as identity,

  session_id uuid not null
    references public.athena_build_timer_sessions(id),

  event_type text not null,
  source text not null,
  operator_key text not null,

  event_at timestamptz not null default clock_timestamp(),

  previous_status text,
  new_status text,

  interval_started_at timestamptz,
  interval_ended_at timestamptz,

  active_delta_seconds bigint not null default 0,
  paused_delta_seconds bigint not null default 0,
  idle_delta_seconds bigint not null default 0,

  raw_active_seconds_after bigint not null,
  raw_paused_seconds_after bigint not null,
  raw_idle_seconds_after bigint not null,

  correction_previous_active_seconds bigint,
  correction_new_active_seconds bigint,
  correction_difference_seconds bigint,

  reason text,
  evidence jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default clock_timestamp(),

  constraint athena_build_timer_event_sequence_unique
    unique (
      session_id,
      sequence_number
    ),

  constraint athena_build_timer_event_type_valid
    check (
      event_type in (
        'start',
        'pause',
        'resume',
        'stop',
        'heartbeat',
        'activity',
        'idle_detected',
        'recovery',
        'manual_correction',
        'helper_token_issued',
        'helper_token_revoked'
      )
    ),

  constraint athena_build_timer_event_source_valid
    check (
      source in (
        'athena_os_ui',
        'browser_activity',
        'powershell_helper',
        'server_recovery',
        'completion_workflow',
        'operator_correction',
        'system'
      )
    ),

  constraint athena_build_timer_event_operator_not_blank
    check (length(btrim(operator_key)) > 0),

  constraint athena_build_timer_event_previous_status_valid
    check (
      previous_status is null
      or previous_status in (
        'active',
        'paused',
        'idle',
        'stopped'
      )
    ),

  constraint athena_build_timer_event_new_status_valid
    check (
      new_status is null
      or new_status in (
        'active',
        'paused',
        'idle',
        'stopped'
      )
    ),

  constraint athena_build_timer_event_interval_valid
    check (
      interval_started_at is null
      or interval_ended_at is null
      or interval_ended_at >= interval_started_at
    ),

  constraint athena_build_timer_event_active_delta_valid
    check (active_delta_seconds >= 0),

  constraint athena_build_timer_event_paused_delta_valid
    check (paused_delta_seconds >= 0),

  constraint athena_build_timer_event_idle_delta_valid
    check (idle_delta_seconds >= 0),

  constraint athena_build_timer_event_active_total_valid
    check (raw_active_seconds_after >= 0),

  constraint athena_build_timer_event_paused_total_valid
    check (raw_paused_seconds_after >= 0),

  constraint athena_build_timer_event_idle_total_valid
    check (raw_idle_seconds_after >= 0),

  constraint athena_build_timer_manual_correction_valid
    check (
      event_type <> 'manual_correction'
      or (
        nullif(btrim(reason), '') is not null
        and correction_previous_active_seconds is not null
        and correction_new_active_seconds is not null
        and correction_difference_seconds is not null
        and correction_previous_active_seconds >= 0
        and correction_new_active_seconds >= 0
        and correction_difference_seconds =
          correction_new_active_seconds -
          correction_previous_active_seconds
      )
    )
);

create index athena_build_timer_events_session_time_idx
on public.athena_build_timer_events (
  session_id,
  event_at,
  sequence_number
);

create index athena_build_timer_events_type_time_idx
on public.athena_build_timer_events (
  event_type,
  event_at desc
);

create table public.athena_build_timer_helper_tokens (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.athena_build_timer_sessions(id),

  token_hash text not null unique,
  issued_to_operator text not null,

  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint athena_build_timer_helper_hash_valid
    check (
      token_hash ~ '^[0-9a-f]{64}$'
    ),

  constraint athena_build_timer_helper_operator_not_blank
    check (
      length(btrim(issued_to_operator)) > 0
    ),

  constraint athena_build_timer_helper_expiry_valid
    check (
      expires_at > created_at
    ),

  constraint athena_build_timer_helper_revocation_valid
    check (
      revoked_at is null
      or revoked_at >= created_at
    )
);

create index athena_build_timer_helper_tokens_session_idx
on public.athena_build_timer_helper_tokens (
  session_id,
  expires_at desc
);

create or replace function
  public.athena_touch_build_timer_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

create or replace function
  public.prevent_athena_build_timer_event_mutation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  raise exception
    'Athena build timer events are append-only and cannot be updated or deleted.';
end;
$function$;

create trigger athena_build_timer_settings_touch
before update
on public.athena_build_timer_settings
for each row
execute function public.athena_touch_build_timer_updated_at();

create trigger athena_build_timer_sessions_touch
before update
on public.athena_build_timer_sessions
for each row
execute function public.athena_touch_build_timer_updated_at();

create trigger athena_build_timer_helper_tokens_touch
before update
on public.athena_build_timer_helper_tokens
for each row
execute function public.athena_touch_build_timer_updated_at();

create trigger athena_build_timer_events_append_only
before update or delete
on public.athena_build_timer_events
for each row
execute function
  public.prevent_athena_build_timer_event_mutation();

create view public.athena_build_timer_session_summary
with (security_invoker = true)
as
select
  session.id,
  session.project_key,
  session.module_key,
  session.build_session_title,
  session.operator_key,
  session.operator_display_name,
  session.status,
  session.started_at,
  session.last_state_changed_at,
  session.last_activity_at,
  session.last_heartbeat_at,
  session.stopped_at,
  session.active_seconds,
  session.paused_seconds,
  session.idle_seconds,
  round(
    session.active_seconds::numeric / 3600,
    settings.completion_rounding_scale
  ) as verified_active_hours,
  settings.idle_threshold_seconds,
  settings.heartbeat_interval_seconds,
  settings.stale_timeout_seconds,
  (
    session.status in ('active', 'idle')
    and session.last_heartbeat_at is not null
    and session.last_heartbeat_at <
      clock_timestamp() -
      make_interval(
        secs => settings.stale_timeout_seconds
      )
  ) as heartbeat_is_stale,
  session.timer_version,
  session.calculation_version,
  session.metadata,
  session.created_at,
  session.updated_at
from public.athena_build_timer_sessions session
cross join public.athena_build_timer_settings settings
where settings.settings_key = 'canonical';

alter table public.athena_build_timer_settings
  enable row level security;

alter table public.athena_build_timer_sessions
  enable row level security;

alter table public.athena_build_timer_events
  enable row level security;

alter table public.athena_build_timer_helper_tokens
  enable row level security;

revoke all
on table public.athena_build_timer_settings
from public, anon, authenticated, service_role;

revoke all
on table public.athena_build_timer_sessions
from public, anon, authenticated, service_role;

revoke all
on table public.athena_build_timer_events
from public, anon, authenticated, service_role;

revoke all
on table public.athena_build_timer_helper_tokens
from public, anon, authenticated, service_role;

revoke all
on table public.athena_build_timer_session_summary
from public, anon, authenticated, service_role;

revoke all
on function public.athena_touch_build_timer_updated_at()
from public, anon, authenticated, service_role;

revoke all
on function public.prevent_athena_build_timer_event_mutation()
from public, anon, authenticated, service_role;

comment on table public.athena_build_timer_settings is
  'Canonical configurable thresholds and duration rules for Athena Build Timer.';

comment on table public.athena_build_timer_sessions is
  'Mutable current-state record for one canonical operator and build-session timer.';

comment on table public.athena_build_timer_events is
  'Append-only raw evidence for Athena Build Timer operations and corrections.';

comment on table public.athena_build_timer_helper_tokens is
  'Hashed short-lived tokens for authenticated local timer heartbeat helpers.';

comment on view public.athena_build_timer_session_summary is
  'Read model exposing raw timer seconds and deterministic completion hours.';