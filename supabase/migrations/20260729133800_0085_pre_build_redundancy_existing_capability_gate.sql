-- Build 0085: Pre-Build Redundancy and Existing-Capability Gate
-- Canonical owner: athena-cto / cross-project-reuse-detector
-- Target Supabase project: voiwlcvfahykdldtjeqy
--
-- This migration adds one mandatory, deterministic, fail-closed gate before
-- canonical build assignment/start. It does not create or start a build merely
-- by being applied.

begin;

do $preflight$
begin
  if to_regclass('public.athena_pre_build_gate_evaluations') is not null
     or to_regclass('public.athena_pre_build_gate_candidate_matches') is not null
     or to_regclass('public.athena_pre_build_gate_overrides') is not null
     or to_regprocedure(
       'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'
     ) is not null
     or to_regprocedure(
       'public.athena_build_lifecycle_gate_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],jsonb)'
     ) is not null then
    raise exception
      'Build 0085 pre-build gate objects already exist. Migration is fail-closed.';
  end if;

  if to_regprocedure(
    'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      'Canonical lifecycle assignment/start RPC is missing.';
  end if;
end;
$preflight$;

create table public.athena_pre_build_gate_evaluations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null,
  request_hash text not null,
  scope_hash text not null,
  intake_id uuid not null,
  preparation_package_id uuid not null,
  project_key text not null,
  module_key text not null,
  module_id uuid not null,
  build_name text not null,
  target_system text not null,
  tracking_system text not null,
  classification text not null,
  decision text not null,
  start_allowed boolean not null,
  requires_override boolean not null,
  top_match_score numeric(8, 6) not null,
  candidate_count integer not null,
  narrowed_scope text not null,
  missing_evidence text[] not null default '{}'::text[],
  blocking_reasons text[] not null default '{}'::text[],
  repository_path text not null,
  repository_head text not null,
  repository_tree text not null,
  repository_evidence_sha256 text not null,
  supabase_project_ref text not null,
  handoff_version text not null,
  handoff_sha256 text not null,
  actor_key text not null,
  actor_display_name text,
  request_evidence jsonb not null default '{}'::jsonb,
  result_snapshot jsonb not null,
  lifecycle_transition_id uuid,
  created_at timestamptz not null default clock_timestamp(),

  constraint athena_pre_build_gate_evaluations_operation_unique
    unique (operation_key),
  constraint athena_pre_build_gate_evaluations_scope_hash_valid
    check (scope_hash ~ '^[0-9a-f]{64}$'),
  constraint athena_pre_build_gate_evaluations_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint athena_pre_build_gate_evaluations_repository_head_valid
    check (repository_head ~ '^[0-9a-f]{40}$'),
  constraint athena_pre_build_gate_evaluations_repository_tree_valid
    check (repository_tree ~ '^[0-9a-f]{40}$'),
  constraint athena_pre_build_gate_evaluations_repository_evidence_valid
    check (repository_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  constraint athena_pre_build_gate_evaluations_handoff_sha_valid
    check (handoff_sha256 ~ '^[0-9a-f]{64}$'),
  constraint athena_pre_build_gate_evaluations_classification_valid
    check (
      classification in (
        'new_capability',
        'repair_existing',
        'extension_existing',
        'duplicate_completed_scope',
        'insufficient_evidence'
      )
    ),
  constraint athena_pre_build_gate_evaluations_decision_valid
    check (decision in ('pass', 'block')),
  constraint athena_pre_build_gate_evaluations_decision_consistent
    check (
      (decision = 'pass' and start_allowed and not requires_override)
      or
      (decision = 'block' and not start_allowed and requires_override)
    ),
  constraint athena_pre_build_gate_evaluations_score_valid
    check (top_match_score between 0 and 1),
  constraint athena_pre_build_gate_evaluations_count_valid
    check (candidate_count >= 0),
  constraint athena_pre_build_gate_evaluations_actor_not_blank
    check (length(btrim(actor_key)) > 0),
  constraint athena_pre_build_gate_evaluations_intake_fkey
    foreign key (intake_id)
    references public.athena_intake_items(id)
    on delete restrict,
  constraint athena_pre_build_gate_evaluations_package_fkey
    foreign key (preparation_package_id)
    references public.athena_intake_preparation_packages(id)
    on delete restrict,
  constraint athena_pre_build_gate_evaluations_module_fkey
    foreign key (module_id)
    references public.athena_project_modules(id)
    on delete restrict,
  constraint athena_pre_build_gate_evaluations_transition_fkey
    foreign key (lifecycle_transition_id)
    references public.athena_build_lifecycle_transitions(id)
    on delete restrict
);

create index athena_pre_build_gate_evaluations_identity_idx
  on public.athena_pre_build_gate_evaluations (
    project_key,
    module_key,
    created_at desc
  );

create index athena_pre_build_gate_evaluations_scope_idx
  on public.athena_pre_build_gate_evaluations (scope_hash, created_at desc);

create table public.athena_pre_build_gate_candidate_matches (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null,
  rank integer not null,
  source_type text not null,
  source_id text not null,
  candidate_project_key text,
  candidate_module_key text,
  candidate_build_id text,
  candidate_title text not null,
  candidate_status text,
  completed boolean not null,
  exact_title_match boolean not null,
  exact_scope_match boolean not null,
  title_overlap numeric(8, 6) not null,
  scope_overlap numeric(8, 6) not null,
  final_score numeric(8, 6) not null,
  matching_tokens text[] not null default '{}'::text[],
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint athena_pre_build_gate_candidate_evaluation_rank_unique
    unique (evaluation_id, rank),
  constraint athena_pre_build_gate_candidate_source_unique
    unique (evaluation_id, source_type, source_id),
  constraint athena_pre_build_gate_candidate_rank_valid
    check (rank > 0),
  constraint athena_pre_build_gate_candidate_title_not_blank
    check (length(btrim(candidate_title)) > 0),
  constraint athena_pre_build_gate_candidate_scores_valid
    check (
      title_overlap between 0 and 1
      and scope_overlap between 0 and 1
      and final_score between 0 and 1
    ),
  constraint athena_pre_build_gate_candidate_evaluation_fkey
    foreign key (evaluation_id)
    references public.athena_pre_build_gate_evaluations(id)
    on delete restrict
);

create index athena_pre_build_gate_candidate_score_idx
  on public.athena_pre_build_gate_candidate_matches (
    evaluation_id,
    final_score desc,
    rank
  );

create table public.athena_pre_build_gate_overrides (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null,
  operation_key text not null,
  scope_hash text not null,
  actor_key text not null,
  actor_display_name text,
  override_reason text not null,
  acknowledged_reason_codes text[] not null,
  lifecycle_transition_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint athena_pre_build_gate_overrides_evaluation_unique
    unique (evaluation_id),
  constraint athena_pre_build_gate_overrides_operation_unique
    unique (operation_key),
  constraint athena_pre_build_gate_overrides_scope_hash_valid
    check (scope_hash ~ '^[0-9a-f]{64}$'),
  constraint athena_pre_build_gate_overrides_actor_not_blank
    check (length(btrim(actor_key)) > 0),
  constraint athena_pre_build_gate_overrides_reason_not_blank
    check (length(btrim(override_reason)) >= 20),
  constraint athena_pre_build_gate_overrides_acknowledgements_present
    check (cardinality(acknowledged_reason_codes) > 0),
  constraint athena_pre_build_gate_overrides_evaluation_fkey
    foreign key (evaluation_id)
    references public.athena_pre_build_gate_evaluations(id)
    on delete restrict,
  constraint athena_pre_build_gate_overrides_transition_fkey
    foreign key (lifecycle_transition_id)
    references public.athena_build_lifecycle_transitions(id)
    on delete restrict
);

alter table public.athena_pre_build_gate_evaluations enable row level security;
alter table public.athena_pre_build_gate_candidate_matches enable row level security;
alter table public.athena_pre_build_gate_overrides enable row level security;

revoke all on table public.athena_pre_build_gate_evaluations
  from public, anon, authenticated;
revoke all on table public.athena_pre_build_gate_candidate_matches
  from public, anon, authenticated;
revoke all on table public.athena_pre_build_gate_overrides
  from public, anon, authenticated;

grant select on table public.athena_pre_build_gate_evaluations
  to service_role;
grant select on table public.athena_pre_build_gate_candidate_matches
  to service_role;
grant select on table public.athena_pre_build_gate_overrides
  to service_role;

create or replace function public.prevent_athena_pre_build_gate_mutation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception
    'Athena pre-build gate evidence is append-only and cannot be updated, deleted, or truncated.';
end;
$function$;

create trigger athena_pre_build_gate_evaluations_append_only
before update or delete on public.athena_pre_build_gate_evaluations
for each row execute function public.prevent_athena_pre_build_gate_mutation();

create trigger athena_pre_build_gate_evaluations_prevent_truncate
before truncate on public.athena_pre_build_gate_evaluations
for each statement execute function public.prevent_athena_pre_build_gate_mutation();

create trigger athena_pre_build_gate_candidates_append_only
before update or delete on public.athena_pre_build_gate_candidate_matches
for each row execute function public.prevent_athena_pre_build_gate_mutation();

create trigger athena_pre_build_gate_candidates_prevent_truncate
before truncate on public.athena_pre_build_gate_candidate_matches
for each statement execute function public.prevent_athena_pre_build_gate_mutation();

create trigger athena_pre_build_gate_overrides_append_only
before update or delete on public.athena_pre_build_gate_overrides
for each row execute function public.prevent_athena_pre_build_gate_mutation();

create trigger athena_pre_build_gate_overrides_prevent_truncate
before truncate on public.athena_pre_build_gate_overrides
for each statement execute function public.prevent_athena_pre_build_gate_mutation();

create or replace function public.enforce_athena_pre_build_gate_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_evaluation public.athena_pre_build_gate_evaluations%rowtype;
  v_override_exists boolean;
begin
  if new.event_type <> 'assigned_started' then
    return new;
  end if;

  select * into v_evaluation
  from public.athena_pre_build_gate_evaluations
  where operation_key = new.operation_key;

  if not found then
    raise exception
      'Canonical lifecycle transition is blocked because no persisted pre-build gate evaluation exists.';
  end if;

  v_override_exists := exists (
    select 1
    from public.athena_pre_build_gate_overrides as override_row
    where override_row.evaluation_id = v_evaluation.id
      and override_row.operation_key = new.operation_key
      and override_row.scope_hash = v_evaluation.scope_hash
      and override_row.actor_key = new.actor_key
  );

  if coalesce((new.request_evidence ->> 'pre_build_gate_verified')::boolean, false) <> true
     or new.request_evidence ->> 'pre_build_gate_scope_hash'
       is distinct from v_evaluation.scope_hash
     or new.request_evidence ->> 'pre_build_gate_classification'
       is distinct from v_evaluation.classification
     or new.intake_id is distinct from v_evaluation.intake_id
     or new.preparation_package_id
       is distinct from v_evaluation.preparation_package_id
     or new.project_key is distinct from v_evaluation.project_key
     or new.module_key is distinct from v_evaluation.module_key
     or new.module_id is distinct from v_evaluation.module_id
     or new.actor_key is distinct from v_evaluation.actor_key
     or new.result_snapshot ->> 'repository_head'
       is distinct from v_evaluation.repository_head
     or new.result_snapshot ->> 'handoff_sha256'
       is distinct from v_evaluation.handoff_sha256 then
    raise exception
      'Canonical lifecycle transition does not match its persisted pre-build gate evidence.';
  end if;

  if v_evaluation.decision = 'pass'
     and v_evaluation.start_allowed
     and not v_evaluation.requires_override then
    return new;
  end if;

  if v_evaluation.decision = 'block'
     and not v_evaluation.start_allowed
     and v_evaluation.requires_override
     and v_override_exists
     and coalesce(
       (new.request_evidence ->> 'pre_build_gate_override_used')::boolean,
       false
     ) = true then
    return new;
  end if;

  raise exception
    'Canonical lifecycle transition is blocked by the persisted pre-build gate decision.';
end;
$function$;

create trigger athena_build_lifecycle_transitions_require_pre_build_gate
before insert on public.athena_build_lifecycle_transitions
for each row execute function public.enforce_athena_pre_build_gate_transition();

create or replace function public.athena_pre_build_normalize_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  with without_prefix as (
    select regexp_replace(
      regexp_replace(
        lower(coalesce(p_value, '')),
        '^[[:space:]]*[0-9]{4}[[:space:]]+build[[:space:]]+title[[:space:]]*:[[:space:]]*',
        '',
        'g'
      ),
      '^[[:space:]]*build[[:space:]]+title[[:space:]]*:[[:space:]]*',
      '',
      'g'
    ) as value
  )
  select btrim(
    regexp_replace(
      regexp_replace(value, '[^a-z0-9]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
  from without_prefix;
$function$;

create or replace function public.athena_pre_build_text_tokens(p_value text)
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select coalesce(array_agg(token order by token), '{}'::text[])
  from (
    select distinct token
    from unnest(
      regexp_split_to_array(
        public.athena_pre_build_normalize_text(p_value),
        '[[:space:]]+'
      )
    ) as token
    where length(token) >= 3
      and token not in (
        'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'build',
        'title', 'athena', 'canonical', 'system', 'project', 'module'
      )
  ) as distinct_tokens;
$function$;

create or replace function public.athena_pre_build_matching_tokens(
  p_left text,
  p_right text
)
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select coalesce(array_agg(token order by token), '{}'::text[])
  from (
    select unnest(public.athena_pre_build_text_tokens(p_left)) as token
    intersect
    select unnest(public.athena_pre_build_text_tokens(p_right)) as token
  ) as matching;
$function$;

create or replace function public.athena_pre_build_overlap_score(
  p_left text,
  p_right text
)
returns numeric
language sql
immutable
set search_path = pg_catalog, public
as $function$
  with left_tokens as (
    select unnest(public.athena_pre_build_text_tokens(p_left)) as token
  ), right_tokens as (
    select unnest(public.athena_pre_build_text_tokens(p_right)) as token
  ), intersection_count as (
    select count(*)::numeric as value
    from (
      select token from left_tokens
      intersect
      select token from right_tokens
    ) as intersection_rows
  ), union_count as (
    select count(*)::numeric as value
    from (
      select token from left_tokens
      union
      select token from right_tokens
    ) as union_rows
  )
  select case
    when union_count.value = 0 then 0::numeric
    else round(intersection_count.value / union_count.value, 6)
  end
  from intersection_count, union_count;
$function$;

create or replace function public.athena_pre_build_classify(
  p_build_name text,
  p_objective text,
  p_acceptance_criteria text[],
  p_missing_information text[],
  p_candidates jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_candidates jsonb := coalesce(p_candidates, '[]'::jsonb);
  v_top jsonb := coalesce(v_candidates -> 0, '{}'::jsonb);
  v_top_score numeric := coalesce((v_top ->> 'final_score')::numeric, 0);
  v_top_completed boolean := coalesce((v_top ->> 'completed')::boolean, false);
  v_top_active boolean := lower(coalesce(v_top ->> 'candidate_status', '')) in (
    'active', 'started', 'in_progress', 'in-progress', 'working', 'partial'
  );
  v_top_title text := coalesce(v_top ->> 'candidate_title', '');
  v_proposed text := public.athena_pre_build_normalize_text(
    concat_ws(
      ' ',
      p_build_name,
      p_objective,
      array_to_string(coalesce(p_acceptance_criteria, '{}'::text[]), ' ')
    )
  );
  v_repair_intent boolean;
  v_extension_intent boolean;
  v_missing text[] := coalesce(p_missing_information, '{}'::text[]);
  v_blocking text[] := '{}'::text[];
  v_classification text;
  v_decision text;
  v_narrowed_scope text;
begin
  v_repair_intent := v_proposed ~
    '\m(repair|fix|correct|restore|bug|defect|broken|reconcile)\M';
  v_extension_intent := v_proposed ~
    '\m(extend|enhance|expand|add|improve|upgrade|integrate|integration)\M';

  if cardinality(coalesce(p_acceptance_criteria, '{}'::text[])) = 0 then
    v_missing := array_append(v_missing, 'acceptance_criteria_missing');
  end if;

  if cardinality(v_missing) > 0 then
    v_classification := 'insufficient_evidence';
    v_blocking := array_append(
      v_blocking,
      'preparation_package_evidence_incomplete'
    );
  elsif v_top_active and v_top_score >= 0.35 then
    v_classification := 'insufficient_evidence';
    v_blocking := array_append(v_blocking, 'active_scope_conflict');
  elsif v_repair_intent and v_top_score >= 0.35 then
    v_classification := 'repair_existing';
  elsif v_extension_intent and v_top_score >= 0.35 then
    v_classification := 'extension_existing';
  elsif v_top_completed and v_top_score >= 0.82 then
    v_classification := 'duplicate_completed_scope';
    v_blocking := array_append(v_blocking, 'duplicate_completed_scope');
  elsif v_top_score >= 0.35 then
    v_classification := 'insufficient_evidence';
    v_blocking := array_append(v_blocking, 'ambiguous_existing_capability_match');
  else
    v_classification := 'new_capability';
  end if;

  v_decision := case
    when v_classification in (
      'new_capability',
      'repair_existing',
      'extension_existing'
    ) then 'pass'
    else 'block'
  end;

  v_narrowed_scope := case v_classification
    when 'repair_existing' then
      format(
        'Repair only the verified defect or missing behavior in existing capability "%s". Preserve all working behavior and do not rebuild the capability.',
        nullif(v_top_title, '')
      )
    when 'extension_existing' then
      format(
        'Extend existing capability "%s" only with the preparation-package delta. Preserve the existing implementation and avoid duplicate parallel paths.',
        nullif(v_top_title, '')
      )
    when 'duplicate_completed_scope' then
      format(
        'No implementation is allowed by default because completed capability "%s" materially matches the proposed scope.',
        nullif(v_top_title, '')
      )
    when 'insufficient_evidence' then
      'No implementation is allowed until missing or ambiguous scope evidence is resolved, unless a governed override is persisted.'
    else
      coalesce(nullif(btrim(p_objective), ''), btrim(p_build_name))
  end;

  return jsonb_build_object(
    'classification', v_classification,
    'decision', v_decision,
    'start_allowed', v_decision = 'pass',
    'requires_override', v_decision = 'block',
    'top_match_score', round(v_top_score, 6),
    'candidate_count', jsonb_array_length(v_candidates),
    'narrowed_scope', v_narrowed_scope,
    'missing_evidence', to_jsonb(v_missing),
    'blocking_reasons', to_jsonb(v_blocking),
    'candidates', v_candidates
  );
end;
$function$;

create or replace function public.athena_pre_build_collect_candidates(
  p_intake_id uuid,
  p_preparation_package_id uuid,
  p_project_key text,
  p_module_key text,
  p_build_name text,
  p_objective text,
  p_acceptance_criteria text[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with proposed as (
    select
      public.athena_pre_build_normalize_text(p_build_name) as title_text,
      public.athena_pre_build_normalize_text(
        concat_ws(
          ' ',
          p_objective,
          array_to_string(coalesce(p_acceptance_criteria, '{}'::text[]), ' ')
        )
      ) as scope_text
  ), source_rows as (
    select
      'lifecycle_transition'::text as source_type,
      transition_row.id::text as source_id,
      transition_row.project_key as candidate_project_key,
      transition_row.module_key as candidate_module_key,
      transition_row.build_id as candidate_build_id,
      transition_row.build_title as candidate_title,
      transition_row.result_snapshot ->> 'lifecycle_status' as candidate_status,
      exists (
        select 1
        from public.athena_feature_completion_events as completion_row
        where lower(coalesce(to_jsonb(completion_row) ->> 'status', '')) = 'completed'
          and (
            coalesce(to_jsonb(completion_row) ->> 'build_session_title', '') =
              transition_row.build_title
            or coalesce(to_jsonb(completion_row) ->> 'feature_name', '') =
              transition_row.build_title
          )
      ) as completed,
      transition_row.build_title as candidate_scope,
      jsonb_build_object(
        'transition_id', transition_row.id,
        'created_at', transition_row.created_at
      ) as evidence
    from public.athena_build_lifecycle_transitions as transition_row
    where transition_row.intake_id <> p_intake_id
      and transition_row.preparation_package_id <> p_preparation_package_id

    union all

    select
      'preparation_package',
      package_row.id::text,
      package_row.project_key,
      package_row.module_key,
      package_row.proposed_build_id,
      coalesce(package_row.proposed_build_title, package_row.package_title),
      lower(coalesce(package_row.metadata ->> 'final_build_status', '')),
      coalesce((package_row.metadata ->> 'formal_build_closed')::boolean, false)
        and lower(coalesce(package_row.metadata ->> 'final_build_status', '')) =
          'completed',
      concat_ws(
        ' ',
        package_row.objective,
        array_to_string(package_row.acceptance_criteria, ' ')
      ),
      jsonb_build_object(
        'package_id', package_row.id,
        'intake_id', package_row.intake_id,
        'created_at', package_row.created_at
      )
    from public.athena_intake_preparation_packages as package_row
    where package_row.id <> p_preparation_package_id

    union all

    select
      'completion_event',
      coalesce(to_jsonb(completion_row) ->> 'id', md5(to_jsonb(completion_row)::text)),
      to_jsonb(completion_row) ->> 'project_key',
      to_jsonb(completion_row) ->> 'module_key',
      null,
      coalesce(
        to_jsonb(completion_row) ->> 'build_session_title',
        to_jsonb(completion_row) ->> 'feature_name',
        'Completion event'
      ),
      lower(coalesce(to_jsonb(completion_row) ->> 'status', '')),
      lower(coalesce(to_jsonb(completion_row) ->> 'status', '')) = 'completed',
      concat_ws(
        ' ',
        to_jsonb(completion_row) ->> 'feature_name',
        to_jsonb(completion_row) ->> 'summary',
        to_jsonb(completion_row) ->> 'build_session_title'
      ),
      jsonb_build_object(
        'id', to_jsonb(completion_row) ->> 'id',
        'status', to_jsonb(completion_row) ->> 'status',
        'created_at', to_jsonb(completion_row) ->> 'created_at',
        'build_session_title',
          to_jsonb(completion_row) ->> 'build_session_title'
      )
    from public.athena_feature_completion_events as completion_row

    union all

    select
      'completion_packet',
      coalesce(to_jsonb(packet_row) ->> 'id', md5(to_jsonb(packet_row)::text)),
      to_jsonb(packet_row) ->> 'project_key',
      to_jsonb(packet_row) ->> 'module_key',
      null,
      coalesce(
        to_jsonb(packet_row) ->> 'build_session_title',
        to_jsonb(packet_row) ->> 'feature_name',
        'Completion packet'
      ),
      lower(coalesce(to_jsonb(packet_row) ->> 'status', '')),
      lower(coalesce(to_jsonb(packet_row) ->> 'status', '')) = 'completed',
      concat_ws(
        ' ',
        to_jsonb(packet_row) ->> 'feature_name',
        to_jsonb(packet_row) ->> 'summary',
        to_jsonb(packet_row) ->> 'build_session_title'
      ),
      jsonb_build_object(
        'id', to_jsonb(packet_row) ->> 'id',
        'status', to_jsonb(packet_row) ->> 'status',
        'created_at', to_jsonb(packet_row) ->> 'created_at',
        'build_session_title',
          to_jsonb(packet_row) ->> 'build_session_title'
      )
    from public.athena_feature_completion_packets as packet_row

    union all

    select
      'build_log',
      coalesce(to_jsonb(log_row) ->> 'id', md5(to_jsonb(log_row)::text)),
      coalesce(
        to_jsonb(log_row) ->> 'product_key',
        to_jsonb(log_row) ->> 'project_key'
      ),
      to_jsonb(log_row) ->> 'module_key',
      coalesce(
        to_jsonb(log_row) ->> 'build_id',
        to_jsonb(log_row) ->> 'build_number'
      ),
      coalesce(
        to_jsonb(log_row) ->> 'session_title',
        to_jsonb(log_row) ->> 'build_session_title',
        to_jsonb(log_row) ->> 'title',
        'Build log'
      ),
      lower(coalesce(to_jsonb(log_row) ->> 'status', '')),
      lower(coalesce(to_jsonb(log_row) ->> 'status', '')) = 'completed',
      concat_ws(
        ' ',
        to_jsonb(log_row) ->> 'summary',
        to_jsonb(log_row) ->> 'title',
        to_jsonb(log_row) ->> 'session_title'
      ),
      jsonb_build_object(
        'id', to_jsonb(log_row) ->> 'id',
        'status', to_jsonb(log_row) ->> 'status',
        'created_at', to_jsonb(log_row) ->> 'created_at',
        'session_title', to_jsonb(log_row) ->> 'session_title'
      )
    from public.athena_build_logs as log_row
  ), normalized as (
    select
      source_rows.*,
      public.athena_pre_build_normalize_text(candidate_title) as normalized_title,
      public.athena_pre_build_normalize_text(candidate_scope) as normalized_scope
    from source_rows
    where nullif(btrim(candidate_title), '') is not null
  ), scored as (
    select
      normalized.*,
      normalized.normalized_title = proposed.title_text as exact_title_match,
      normalized.normalized_scope = proposed.scope_text
        and proposed.scope_text <> '' as exact_scope_match,
      public.athena_pre_build_overlap_score(
        proposed.title_text,
        normalized.normalized_title
      ) as title_overlap,
      public.athena_pre_build_overlap_score(
        proposed.scope_text,
        normalized.normalized_scope
      ) as scope_overlap,
      public.athena_pre_build_matching_tokens(
        proposed.title_text || ' ' || proposed.scope_text,
        normalized.normalized_title || ' ' || normalized.normalized_scope
      ) as matching_tokens
    from normalized, proposed
  ), ranked as (
    select
      scored.*,
      least(
        1::numeric,
        greatest(
          case when exact_title_match then 1::numeric else 0::numeric end,
          case when exact_scope_match then 1::numeric else 0::numeric end,
          round(
            title_overlap * 0.55
            + scope_overlap * 0.35
            + case when candidate_project_key = p_project_key then 0.05 else 0 end
            + case when candidate_module_key = p_module_key then 0.05 else 0 end,
            6
          )
        )
      ) as final_score
    from scored
  ), limited as (
    select
      row_number() over (
        order by final_score desc, completed desc, source_type, source_id
      ) as rank,
      ranked.*
    from ranked
    where final_score >= 0.10
    order by final_score desc, completed desc, source_type, source_id
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', rank,
        'source_type', source_type,
        'source_id', source_id,
        'candidate_project_key', candidate_project_key,
        'candidate_module_key', candidate_module_key,
        'candidate_build_id', candidate_build_id,
        'candidate_title', candidate_title,
        'candidate_status', candidate_status,
        'completed', completed,
        'exact_title_match', exact_title_match,
        'exact_scope_match', exact_scope_match,
        'title_overlap', title_overlap,
        'scope_overlap', scope_overlap,
        'final_score', final_score,
        'matching_tokens', to_jsonb(matching_tokens),
        'evidence', evidence
      )
      order by rank
    ),
    '[]'::jsonb
  )
  from limited;
$function$;

create or replace function public.athena_pre_build_gate_preview(
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
  p_repository_tree text,
  p_repository_evidence_sha256 text,
  p_supabase_project_ref text,
  p_handoff_version text,
  p_handoff_sha256 text,
  p_request_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_intake public.athena_intake_items%rowtype;
  v_package public.athena_intake_preparation_packages%rowtype;
  v_candidates jsonb;
  v_classification jsonb;
  v_scope jsonb;
  v_request jsonb;
  v_scope_hash text;
  v_request_hash text;
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
     or nullif(btrim(p_repository_tree), '') is null
     or nullif(btrim(p_repository_evidence_sha256), '') is null
     or nullif(btrim(p_supabase_project_ref), '') is null
     or nullif(btrim(p_handoff_version), '') is null
     or nullif(btrim(p_handoff_sha256), '') is null then
    raise exception 'All canonical pre-build gate fields are required.';
  end if;

  if btrim(p_repository_head) !~ '^[0-9a-f]{40}$'
     or btrim(p_repository_tree) !~ '^[0-9a-f]{40}$'
     or btrim(p_repository_evidence_sha256) !~ '^[0-9a-f]{64}$'
     or btrim(p_handoff_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception 'Repository or handoff evidence format is invalid.';
  end if;

  if btrim(p_supabase_project_ref) <> 'voiwlcvfahykdldtjeqy' then
    raise exception 'Unexpected Supabase project identity.';
  end if;

  if coalesce((p_request_evidence ->> 'local_handoff_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_head_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_tree_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_evidence_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'tracked_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'staged_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'supabase_project_verified')::boolean, false) <> true then
    raise exception 'Required pre-build gate evidence is absent.';
  end if;

  select * into strict v_intake
  from public.athena_intake_items
  where id = p_intake_id;

  if v_intake.status_key <> 'approved'
     or v_intake.project_key <> btrim(p_project_key)
     or v_intake.module_key <> btrim(p_module_key) then
    raise exception 'The Intake is not the exact approved canonical Intake.';
  end if;

  if (
    select count(*)
    from public.athena_intake_review_history
    where intake_id = p_intake_id
      and to_status_key = 'approved'
      and review_outcome = 'approve'
  ) <> 1 then
    raise exception 'The Intake does not have exactly one immutable approval.';
  end if;

  select * into strict v_package
  from public.athena_intake_preparation_packages
  where id = p_preparation_package_id
    and intake_id = p_intake_id;

  if v_package.project_key <> btrim(p_project_key)
     or v_package.module_key <> btrim(p_module_key) then
    raise exception 'Preparation-package identity does not match the request.';
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
    raise exception 'Canonical project/module registry verification failed.';
  end if;

  v_candidates := public.athena_pre_build_collect_candidates(
    p_intake_id,
    p_preparation_package_id,
    btrim(p_project_key),
    btrim(p_module_key),
    btrim(p_build_name),
    v_package.objective,
    v_package.acceptance_criteria
  );

  v_classification := public.athena_pre_build_classify(
    btrim(p_build_name),
    v_package.objective,
    v_package.acceptance_criteria,
    v_package.missing_information,
    v_candidates
  );

  v_scope := jsonb_build_object(
    'intake_id', p_intake_id,
    'preparation_package_id', p_preparation_package_id,
    'project_key', btrim(p_project_key),
    'module_key', btrim(p_module_key),
    'module_id', p_module_id,
    'build_name', btrim(p_build_name),
    'objective', v_package.objective,
    'acceptance_criteria', to_jsonb(v_package.acceptance_criteria),
    'dependencies', to_jsonb(v_package.dependencies),
    'risks', to_jsonb(v_package.risks),
    'security_notes', to_jsonb(v_package.security_notes),
    'missing_information', to_jsonb(v_package.missing_information)
  );

  v_request := jsonb_build_object(
    'scope', v_scope,
    'target_system', btrim(p_target_system),
    'tracking_system', btrim(p_tracking_system),
    'repository_path', btrim(p_repository_path),
    'repository_head', btrim(p_repository_head),
    'repository_tree', btrim(p_repository_tree),
    'repository_evidence_sha256', btrim(p_repository_evidence_sha256),
    'supabase_project_ref', btrim(p_supabase_project_ref),
    'handoff_version', btrim(p_handoff_version),
    'handoff_sha256', btrim(p_handoff_sha256),
    'request_evidence', coalesce(p_request_evidence, '{}'::jsonb)
  );

  v_scope_hash := encode(
    extensions.digest(convert_to(v_scope::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_request_hash := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return v_classification || jsonb_build_object(
    'status', 'canonical_pre_build_gate_preview',
    'scope_hash', v_scope_hash,
    'request_hash', v_request_hash,
    'repository_head', btrim(p_repository_head),
    'repository_tree', btrim(p_repository_tree),
    'repository_evidence_sha256', btrim(p_repository_evidence_sha256),
    'handoff_sha256', btrim(p_handoff_sha256)
  );
end;
$function$;

create or replace function public.athena_build_lifecycle_gate_and_start(
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
  p_repository_tree text,
  p_repository_evidence_sha256 text,
  p_supabase_project_ref text,
  p_handoff_version text,
  p_handoff_sha256 text,
  p_operator_key text,
  p_operator_display_name text,
  p_operation_key text,
  p_override_reason text default null,
  p_acknowledged_reason_codes text[] default '{}'::text[],
  p_request_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_preview jsonb;
  v_evaluation public.athena_pre_build_gate_evaluations%rowtype;
  v_transition public.athena_build_lifecycle_transitions%rowtype;
  v_evaluation_id uuid := gen_random_uuid();
  v_override_id uuid;
  v_lifecycle_result jsonb;
  v_result jsonb;
  v_candidate jsonb;
  v_blocking_reasons text[];
  v_acknowledged text[];
  v_override_used boolean := false;
  v_transition_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_operator_key), '') is null
     or nullif(btrim(p_operation_key), '') is null then
    raise exception 'Operator and operation key are required.';
  end if;

  if btrim(p_operation_key) !~ '^[a-z0-9][a-z0-9:_-]{15,199}$' then
    raise exception 'Operation-key format is invalid.';
  end if;

  if coalesce((p_request_evidence ->> 'operator_session_verified')::boolean, false) <> true then
    raise exception 'Signed operator-session evidence is required for formal start.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('athena:canonical-build-lifecycle:global-assignment-start', 0)
  );

  v_preview := public.athena_pre_build_gate_preview(
    p_intake_id,
    p_preparation_package_id,
    p_project_key,
    p_module_key,
    p_module_id,
    p_build_name,
    p_target_system,
    p_tracking_system,
    p_repository_path,
    p_repository_head,
    p_repository_tree,
    p_repository_evidence_sha256,
    p_supabase_project_ref,
    p_handoff_version,
    p_handoff_sha256,
    p_request_evidence
  );

  select * into v_transition
  from public.athena_build_lifecycle_transitions
  where operation_key = btrim(p_operation_key);

  if found then
    select * into strict v_evaluation
    from public.athena_pre_build_gate_evaluations
    where operation_key = btrim(p_operation_key);

    if v_evaluation.request_hash <> v_preview ->> 'request_hash'
       or v_evaluation.scope_hash <> v_preview ->> 'scope_hash' then
      raise exception
        'Operation key was already used with contradictory pre-build gate inputs.';
    end if;

    return v_transition.result_snapshot || jsonb_build_object(
      'idempotent_replay', true,
      'replayed_transition_id', v_transition.id,
      'gate_evaluation_id', v_evaluation.id,
      'gate_override_id', (
        select override_row.id
        from public.athena_pre_build_gate_overrides as override_row
        where override_row.evaluation_id = v_evaluation.id
      ),
      'gate_classification', v_evaluation.classification,
      'gate_decision', case
        when exists (
          select 1 from public.athena_pre_build_gate_overrides as override_row
          where override_row.evaluation_id = v_evaluation.id
        ) then 'override'
        else 'pass'
      end,
      'gate_scope_hash', v_evaluation.scope_hash,
      'gate_request_hash', v_evaluation.request_hash,
      'gate_top_match_score', v_evaluation.top_match_score,
      'gate_candidate_count', v_evaluation.candidate_count,
      'gate_narrowed_scope', v_evaluation.narrowed_scope,
      'gate_missing_evidence', to_jsonb(v_evaluation.missing_evidence),
      'gate_blocking_reasons', to_jsonb(v_evaluation.blocking_reasons),
      'gate_override_used', exists (
        select 1 from public.athena_pre_build_gate_overrides as override_row
        where override_row.evaluation_id = v_evaluation.id
      )
    );
  end if;

  select * into v_evaluation
  from public.athena_pre_build_gate_evaluations
  where operation_key = btrim(p_operation_key);

  if found then
    if v_evaluation.request_hash <> v_preview ->> 'request_hash'
       or v_evaluation.scope_hash <> v_preview ->> 'scope_hash' then
      raise exception
        'Operation key was already used with contradictory pre-build gate inputs.';
    end if;

    if v_evaluation.decision <> 'block' then
      raise exception 'Persisted gate state is inconsistent with lifecycle state.';
    end if;

    v_evaluation_id := v_evaluation.id;
    v_preview := v_evaluation.result_snapshot;
  end if;

  v_blocking_reasons := array(
    select jsonb_array_elements_text(v_preview -> 'blocking_reasons')
    order by 1
  );
  v_acknowledged := array(
    select distinct btrim(value)
    from unnest(coalesce(p_acknowledged_reason_codes, '{}'::text[])) as value
    where nullif(btrim(value), '') is not null
    order by 1
  );

  if v_preview ->> 'decision' = 'block' then
    if nullif(btrim(p_override_reason), '') is null then
      if v_evaluation.id is null then
        v_result := jsonb_build_object(
          'status', 'canonical_pre_build_gate_blocked',
          'gate_evaluation_id', v_evaluation_id,
          'gate_classification', v_preview ->> 'classification',
          'gate_decision', 'block',
          'gate_scope_hash', v_preview ->> 'scope_hash',
          'gate_request_hash', v_preview ->> 'request_hash',
          'gate_top_match_score', (v_preview ->> 'top_match_score')::numeric,
          'gate_candidate_count', (v_preview ->> 'candidate_count')::integer,
          'gate_narrowed_scope', v_preview ->> 'narrowed_scope',
          'gate_missing_evidence', v_preview -> 'missing_evidence',
          'gate_blocking_reasons', v_preview -> 'blocking_reasons',
          'gate_override_used', false,
          'idempotent_replay', false,
          'timer_started', false,
          'qa_created', false,
          'completion_created', false,
          'build_log_created', false
        );

        insert into public.athena_pre_build_gate_evaluations (
          id, operation_key, request_hash, scope_hash,
          intake_id, preparation_package_id, project_key, module_key, module_id,
          build_name, target_system, tracking_system,
          classification, decision, start_allowed, requires_override,
          top_match_score, candidate_count, narrowed_scope,
          missing_evidence, blocking_reasons,
          repository_path, repository_head, repository_tree,
          repository_evidence_sha256, supabase_project_ref,
          handoff_version, handoff_sha256,
          actor_key, actor_display_name, request_evidence,
          result_snapshot, lifecycle_transition_id, created_at
        ) values (
          v_evaluation_id, btrim(p_operation_key),
          v_preview ->> 'request_hash', v_preview ->> 'scope_hash',
          p_intake_id, p_preparation_package_id, btrim(p_project_key),
          btrim(p_module_key), p_module_id, btrim(p_build_name),
          btrim(p_target_system), btrim(p_tracking_system),
          v_preview ->> 'classification', 'block', false, true,
          (v_preview ->> 'top_match_score')::numeric,
          (v_preview ->> 'candidate_count')::integer,
          v_preview ->> 'narrowed_scope',
          array(select jsonb_array_elements_text(v_preview -> 'missing_evidence')),
          v_blocking_reasons,
          btrim(p_repository_path), btrim(p_repository_head),
          btrim(p_repository_tree), btrim(p_repository_evidence_sha256),
          btrim(p_supabase_project_ref), btrim(p_handoff_version),
          btrim(p_handoff_sha256), btrim(p_operator_key),
          nullif(btrim(p_operator_display_name), ''),
          coalesce(p_request_evidence, '{}'::jsonb),
          v_preview, null, v_now
        );

        for v_candidate in
          select value from jsonb_array_elements(v_preview -> 'candidates')
        loop
          insert into public.athena_pre_build_gate_candidate_matches (
            evaluation_id, rank, source_type, source_id,
            candidate_project_key, candidate_module_key, candidate_build_id,
            candidate_title, candidate_status, completed,
            exact_title_match, exact_scope_match,
            title_overlap, scope_overlap, final_score,
            matching_tokens, evidence, created_at
          ) values (
            v_evaluation_id,
            (v_candidate ->> 'rank')::integer,
            v_candidate ->> 'source_type',
            v_candidate ->> 'source_id',
            v_candidate ->> 'candidate_project_key',
            v_candidate ->> 'candidate_module_key',
            v_candidate ->> 'candidate_build_id',
            v_candidate ->> 'candidate_title',
            v_candidate ->> 'candidate_status',
            coalesce((v_candidate ->> 'completed')::boolean, false),
            coalesce((v_candidate ->> 'exact_title_match')::boolean, false),
            coalesce((v_candidate ->> 'exact_scope_match')::boolean, false),
            (v_candidate ->> 'title_overlap')::numeric,
            (v_candidate ->> 'scope_overlap')::numeric,
            (v_candidate ->> 'final_score')::numeric,
            array(select jsonb_array_elements_text(v_candidate -> 'matching_tokens')),
            coalesce(v_candidate -> 'evidence', '{}'::jsonb),
            v_now
          );
        end loop;

        return v_result;
      end if;

      return jsonb_build_object(
        'status', 'canonical_pre_build_gate_blocked',
        'gate_evaluation_id', v_evaluation.id,
        'gate_classification', v_evaluation.classification,
        'gate_decision', 'block',
        'gate_scope_hash', v_evaluation.scope_hash,
        'gate_request_hash', v_evaluation.request_hash,
        'gate_top_match_score', v_evaluation.top_match_score,
        'gate_candidate_count', v_evaluation.candidate_count,
        'gate_narrowed_scope', v_evaluation.narrowed_scope,
        'gate_missing_evidence', to_jsonb(v_evaluation.missing_evidence),
        'gate_blocking_reasons', to_jsonb(v_evaluation.blocking_reasons),
        'gate_override_used', false,
        'idempotent_replay', true,
        'timer_started', false,
        'qa_created', false,
        'completion_created', false,
        'build_log_created', false
      );
    end if;

    if length(btrim(p_override_reason)) < 20 then
      raise exception 'Governed override reason must contain at least 20 characters.';
    end if;

    if v_acknowledged is distinct from v_blocking_reasons then
      raise exception
        'Governed override must acknowledge every exact blocking-reason code.';
    end if;

    v_override_used := true;
  elsif nullif(btrim(p_override_reason), '') is not null
     or cardinality(v_acknowledged) > 0 then
    raise exception 'Override evidence was supplied for a passing gate.';
  end if;

  if v_evaluation.id is null then
    insert into public.athena_pre_build_gate_evaluations (
      id, operation_key, request_hash, scope_hash,
      intake_id, preparation_package_id, project_key, module_key, module_id,
      build_name, target_system, tracking_system,
      classification, decision, start_allowed, requires_override,
      top_match_score, candidate_count, narrowed_scope,
      missing_evidence, blocking_reasons,
      repository_path, repository_head, repository_tree,
      repository_evidence_sha256, supabase_project_ref,
      handoff_version, handoff_sha256,
      actor_key, actor_display_name, request_evidence,
      result_snapshot, lifecycle_transition_id, created_at
    ) values (
      v_evaluation_id, btrim(p_operation_key),
      v_preview ->> 'request_hash', v_preview ->> 'scope_hash',
      p_intake_id, p_preparation_package_id, btrim(p_project_key),
      btrim(p_module_key), p_module_id, btrim(p_build_name),
      btrim(p_target_system), btrim(p_tracking_system),
      v_preview ->> 'classification', v_preview ->> 'decision',
      (v_preview ->> 'start_allowed')::boolean,
      (v_preview ->> 'requires_override')::boolean,
      (v_preview ->> 'top_match_score')::numeric,
      (v_preview ->> 'candidate_count')::integer,
      v_preview ->> 'narrowed_scope',
      array(select jsonb_array_elements_text(v_preview -> 'missing_evidence')),
      v_blocking_reasons,
      btrim(p_repository_path), btrim(p_repository_head),
      btrim(p_repository_tree), btrim(p_repository_evidence_sha256),
      btrim(p_supabase_project_ref), btrim(p_handoff_version),
      btrim(p_handoff_sha256), btrim(p_operator_key),
      nullif(btrim(p_operator_display_name), ''),
      coalesce(p_request_evidence, '{}'::jsonb),
      v_preview, null, v_now
    );

    for v_candidate in
      select value from jsonb_array_elements(v_preview -> 'candidates')
    loop
      insert into public.athena_pre_build_gate_candidate_matches (
        evaluation_id, rank, source_type, source_id,
        candidate_project_key, candidate_module_key, candidate_build_id,
        candidate_title, candidate_status, completed,
        exact_title_match, exact_scope_match,
        title_overlap, scope_overlap, final_score,
        matching_tokens, evidence, created_at
      ) values (
        v_evaluation_id,
        (v_candidate ->> 'rank')::integer,
        v_candidate ->> 'source_type',
        v_candidate ->> 'source_id',
        v_candidate ->> 'candidate_project_key',
        v_candidate ->> 'candidate_module_key',
        v_candidate ->> 'candidate_build_id',
        v_candidate ->> 'candidate_title',
        v_candidate ->> 'candidate_status',
        coalesce((v_candidate ->> 'completed')::boolean, false),
        coalesce((v_candidate ->> 'exact_title_match')::boolean, false),
        coalesce((v_candidate ->> 'exact_scope_match')::boolean, false),
        (v_candidate ->> 'title_overlap')::numeric,
        (v_candidate ->> 'scope_overlap')::numeric,
        (v_candidate ->> 'final_score')::numeric,
        array(select jsonb_array_elements_text(v_candidate -> 'matching_tokens')),
        coalesce(v_candidate -> 'evidence', '{}'::jsonb),
        v_now
      );
    end loop;
  end if;

  if v_override_used then
    insert into public.athena_pre_build_gate_overrides (
      evaluation_id, operation_key, scope_hash,
      actor_key, actor_display_name, override_reason,
      acknowledged_reason_codes, lifecycle_transition_id,
      evidence, created_at
    ) values (
      v_evaluation_id, btrim(p_operation_key), v_preview ->> 'scope_hash',
      btrim(p_operator_key), nullif(btrim(p_operator_display_name), ''),
      btrim(p_override_reason), v_acknowledged, null,
      jsonb_build_object(
        'classification', v_preview ->> 'classification',
        'blocking_reasons', v_preview -> 'blocking_reasons',
        'request_hash', v_preview ->> 'request_hash',
        'repository_head', btrim(p_repository_head),
        'handoff_sha256', btrim(p_handoff_sha256),
        'secret_values_recorded', false
      ),
      v_now
    )
    returning id into v_override_id;
  end if;

  if (
    select count(*)
    from public.athena_pre_build_gate_candidate_matches
    where evaluation_id = v_evaluation_id
  ) <> (v_preview ->> 'candidate_count')::integer then
    raise exception 'Persisted candidate count failed read-after-write verification.';
  end if;


  v_lifecycle_result := public.athena_build_lifecycle_assign_and_start(
    p_intake_id,
    p_preparation_package_id,
    p_project_key,
    p_module_key,
    p_module_id,
    p_build_name,
    p_target_system,
    p_tracking_system,
    p_repository_path,
    p_repository_head,
    p_supabase_project_ref,
    p_handoff_version,
    p_handoff_sha256,
    p_operator_key,
    p_operator_display_name,
    p_operation_key,
    coalesce(p_request_evidence, '{}'::jsonb) || jsonb_build_object(
      'pre_build_gate_verified', true,
      'pre_build_gate_scope_hash', v_preview ->> 'scope_hash',
      'pre_build_gate_classification', v_preview ->> 'classification',
      'pre_build_gate_override_used', v_override_used,
      'repository_tree', btrim(p_repository_tree),
      'repository_evidence_sha256', btrim(p_repository_evidence_sha256)
    )
  );

  if v_lifecycle_result ->> 'status' <> 'canonical_build_assigned_and_started' then
    raise exception 'Canonical lifecycle RPC did not return the expected start status.';
  end if;

  v_transition_id := (v_lifecycle_result ->> 'transition_id')::uuid;

  v_result := v_lifecycle_result || jsonb_build_object(
    'gate_evaluation_id', v_evaluation_id,
    'gate_override_id', v_override_id,
    'gate_classification', v_preview ->> 'classification',
    'gate_decision', case when v_override_used then 'override' else 'pass' end,
    'gate_scope_hash', v_preview ->> 'scope_hash',
    'gate_request_hash', v_preview ->> 'request_hash',
    'gate_top_match_score', (v_preview ->> 'top_match_score')::numeric,
    'gate_candidate_count', (v_preview ->> 'candidate_count')::integer,
    'gate_narrowed_scope', v_preview ->> 'narrowed_scope',
    'gate_missing_evidence', v_preview -> 'missing_evidence',
    'gate_blocking_reasons', v_preview -> 'blocking_reasons',
    'gate_override_used', v_override_used
  );

  return v_result;
end;
$function$;

create or replace function public.athena_pre_build_gate_read_qa_evidence(
  p_evaluation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_evaluation public.athena_pre_build_gate_evaluations%rowtype;
  v_old_rpc oid;
  v_wrapper_rpc oid;
begin
  select * into strict v_evaluation
  from public.athena_pre_build_gate_evaluations
  where id = p_evaluation_id;

  v_old_rpc := to_regprocedure(
    'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
  );
  v_wrapper_rpc := to_regprocedure(
    'public.athena_build_lifecycle_gate_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],jsonb)'
  );

  return jsonb_build_object(
    'evaluation', to_jsonb(v_evaluation),
    'candidate_count', (
      select count(*)
      from public.athena_pre_build_gate_candidate_matches
      where evaluation_id = p_evaluation_id
    ),
    'candidates', coalesce((
      select jsonb_agg(to_jsonb(candidate_row) order by candidate_row.rank)
      from public.athena_pre_build_gate_candidate_matches as candidate_row
      where candidate_row.evaluation_id = p_evaluation_id
    ), '[]'::jsonb),
    'override', (
      select to_jsonb(override_row)
      from public.athena_pre_build_gate_overrides as override_row
      where override_row.evaluation_id = p_evaluation_id
    ),
    'linked_transition_id', (
      select transition_row.id
      from public.athena_build_lifecycle_transitions as transition_row
      where transition_row.operation_key = v_evaluation.operation_key
    ),
    'old_rpc_service_role_execute',
      has_function_privilege('service_role', v_old_rpc, 'EXECUTE'),
    'wrapper_service_role_execute',
      has_function_privilege('service_role', v_wrapper_rpc, 'EXECUTE'),
    'transition_gate_trigger_exists', exists (
      select 1
      from pg_catalog.pg_trigger as trigger_row
      where trigger_row.tgrelid =
        'public.athena_build_lifecycle_transitions'::regclass
        and trigger_row.tgname =
          'athena_build_lifecycle_transitions_require_pre_build_gate'
        and not trigger_row.tgisinternal
    ),
    'secret_values_recorded', false
  );
end;
$function$;

-- Historical automatic QA requires service_role execution to remain granted.
-- Bypass prevention is enforced inside the database by the mandatory BEFORE
-- INSERT transition trigger, which requires append-only gate evidence that
-- service_role cannot create directly.
grant execute on function public.athena_build_lifecycle_assign_and_start(
  uuid, uuid, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, jsonb
) to service_role;

revoke all on function public.athena_pre_build_gate_preview(
  uuid, uuid, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.athena_pre_build_gate_preview(
  uuid, uuid, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, jsonb
) to service_role;

revoke all on function public.athena_build_lifecycle_gate_and_start(
  uuid, uuid, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.athena_build_lifecycle_gate_and_start(
  uuid, uuid, text, text, uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text[], jsonb
) to service_role;

revoke all on function public.athena_pre_build_gate_read_qa_evidence(uuid)
  from public, anon, authenticated;
grant execute on function public.athena_pre_build_gate_read_qa_evidence(uuid)
  to service_role;

revoke all on function public.athena_pre_build_collect_candidates(
  uuid, uuid, text, text, text, text, text[]
) from public, anon, authenticated, service_role;
revoke all on function public.athena_pre_build_classify(
  text, text, text[], text[], jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.athena_pre_build_normalize_text(text)
  from public, anon, authenticated, service_role;
revoke all on function public.athena_pre_build_text_tokens(text)
  from public, anon, authenticated, service_role;
revoke all on function public.athena_pre_build_matching_tokens(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.athena_pre_build_overlap_score(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_athena_pre_build_gate_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_athena_pre_build_gate_transition()
  from public, anon, authenticated, service_role;

comment on table public.athena_pre_build_gate_evaluations is
  'Append-only mandatory pre-build redundancy and existing-capability evaluations.';
comment on table public.athena_pre_build_gate_candidate_matches is
  'Append-only transparent candidate scores supporting each pre-build gate evaluation.';
comment on table public.athena_pre_build_gate_overrides is
  'Append-only governed override evidence for blocked pre-build evaluations.';

commit;
