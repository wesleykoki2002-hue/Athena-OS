-- Build 0090: append-only Intake/preparation chain supersession.
-- This forward migration preserves immutable historical evidence and grants a
-- narrow duplicate exception only to an exact, validated replacement chain.

do $preflight$
begin
  if to_regclass('public.athena_intake_items') is null
     or to_regclass('public.athena_intake_preparation_packages') is null
     or to_regclass('public.athena_intake_review_history') is null
     or to_regclass('public.athena_build_lifecycle_transitions') is null then
    raise exception 'Build 0090 prerequisites are missing.';
  end if;
end;
$preflight$;

create table public.athena_intake_preparation_supersessions (
  id uuid primary key default gen_random_uuid(),
  original_intake_id uuid not null references public.athena_intake_items(id) on delete restrict,
  original_preparation_package_id uuid not null references public.athena_intake_preparation_packages(id) on delete restrict,
  replacement_intake_id uuid not null references public.athena_intake_items(id) on delete restrict,
  replacement_preparation_package_id uuid not null references public.athena_intake_preparation_packages(id) on delete restrict,
  project_key text not null,
  module_key text not null,
  external_build_id text not null,
  external_build_title text not null,
  operator_key text not null,
  reason text not null,
  operation_key text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint athena_intake_preparation_supersessions_original_unique unique (original_intake_id, original_preparation_package_id),
  constraint athena_intake_preparation_supersessions_replacement_unique unique (replacement_intake_id, replacement_preparation_package_id),
  constraint athena_intake_preparation_supersessions_operation_unique unique (operation_key),
  constraint athena_intake_preparation_supersessions_distinct_chain check (
    original_intake_id <> replacement_intake_id
    and original_preparation_package_id <> replacement_preparation_package_id
  ),
  constraint athena_intake_preparation_supersessions_project_module_fkey
    foreign key (project_key, module_key)
    references public.athena_project_modules(project_key, module_key)
    on update restrict on delete restrict,
  constraint athena_intake_preparation_supersessions_external_id_valid check (
    external_build_id !~ '^[0-9]{4}$'
    and external_build_id ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
  ),
  constraint athena_intake_preparation_supersessions_external_title_valid check (
    external_build_title like external_build_id || ' %'
  ),
  constraint athena_intake_preparation_supersessions_operator_not_blank check (length(btrim(operator_key)) > 0),
  constraint athena_intake_preparation_supersessions_reason_not_blank check (length(btrim(reason)) > 0),
  constraint athena_intake_preparation_supersessions_operation_valid check (
    operation_key ~ '^[a-z0-9][a-z0-9:_-]{15,199}$'
  ),
  constraint athena_intake_preparation_supersessions_evidence_object check (jsonb_typeof(evidence) = 'object')
);

create index athena_intake_preparation_supersessions_identity_idx
on public.athena_intake_preparation_supersessions(project_key, module_key, external_build_id);

create or replace function public.prevent_athena_intake_preparation_supersession_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Athena Intake/preparation supersession evidence is append-only and cannot be updated, deleted, or truncated.';
end;
$function$;

create trigger trg_athena_intake_preparation_supersessions_immutable
before update or delete on public.athena_intake_preparation_supersessions
for each row execute function public.prevent_athena_intake_preparation_supersession_mutation();

create trigger trg_athena_intake_preparation_supersessions_no_truncate
before truncate on public.athena_intake_preparation_supersessions
for each statement execute function public.prevent_athena_intake_preparation_supersession_mutation();

alter table public.athena_intake_preparation_supersessions enable row level security;
revoke all on table public.athena_intake_preparation_supersessions from public, anon, authenticated, service_role;
grant select on table public.athena_intake_preparation_supersessions to service_role;

create or replace function public.athena_resolve_intake_preparation_supersession(
  p_replacement_intake_id uuid,
  p_replacement_preparation_package_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'supersession_id', s.id,
    'original_intake_id', s.original_intake_id,
    'original_preparation_package_id', s.original_preparation_package_id,
    'replacement_intake_id', s.replacement_intake_id,
    'replacement_preparation_package_id', s.replacement_preparation_package_id,
    'project_key', s.project_key,
    'module_key', s.module_key,
    'external_build_id', s.external_build_id,
    'external_build_title', s.external_build_title,
    'operation_key', s.operation_key,
    'created_at', s.created_at
  )
  from public.athena_intake_preparation_supersessions s
  where s.replacement_intake_id = p_replacement_intake_id
    and s.replacement_preparation_package_id = p_replacement_preparation_package_id
  limit 1;
$function$;

revoke all on function public.athena_resolve_intake_preparation_supersession(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.athena_supersede_intake_preparation_chain(
  p_original_intake_id uuid,
  p_original_preparation_package_id uuid,
  p_replacement_intake_id uuid,
  p_replacement_preparation_package_id uuid,
  p_project_key text,
  p_module_key text,
  p_external_build_id text,
  p_external_build_title text,
  p_operator_key text,
  p_reason text,
  p_operation_key text,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_original_intake public.athena_intake_items%rowtype;
  v_replacement_intake public.athena_intake_items%rowtype;
  v_original_package public.athena_intake_preparation_packages%rowtype;
  v_replacement_package public.athena_intake_preparation_packages%rowtype;
  v_existing public.athena_intake_preparation_supersessions%rowtype;
  v_row public.athena_intake_preparation_supersessions%rowtype;
  v_request jsonb;
begin
  if p_original_intake_id is null or p_original_preparation_package_id is null
     or p_replacement_intake_id is null or p_replacement_preparation_package_id is null
     or nullif(btrim(p_project_key), '') is null or nullif(btrim(p_module_key), '') is null
     or nullif(btrim(p_external_build_id), '') is null or nullif(btrim(p_external_build_title), '') is null
     or nullif(btrim(p_operator_key), '') is null or nullif(btrim(p_reason), '') is null
     or nullif(btrim(p_operation_key), '') is null then
    raise exception 'All canonical supersession identity, reason, operator, and operation fields are required.';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Supersession evidence must be a JSON object.';
  end if;
  if p_original_intake_id = p_replacement_intake_id
     or p_original_preparation_package_id = p_replacement_preparation_package_id then
    raise exception 'Self-supersession is forbidden.';
  end if;
  if btrim(p_external_build_id) ~ '^[0-9]{4}$'
     or btrim(p_external_build_id) !~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
     or btrim(p_external_build_title) not like btrim(p_external_build_id) || ' %' then
    raise exception 'Canonical external build identity is invalid.';
  end if;
  if btrim(p_operation_key) !~ '^[a-z0-9][a-z0-9:_-]{15,199}$' then
    raise exception 'Supersession operation-key format is invalid.';
  end if;

  v_request := jsonb_build_object(
    'original_intake_id', p_original_intake_id,
    'original_preparation_package_id', p_original_preparation_package_id,
    'replacement_intake_id', p_replacement_intake_id,
    'replacement_preparation_package_id', p_replacement_preparation_package_id,
    'project_key', btrim(p_project_key), 'module_key', btrim(p_module_key),
    'external_build_id', btrim(p_external_build_id),
    'external_build_title', btrim(p_external_build_title),
    'operator_key', btrim(p_operator_key), 'reason', btrim(p_reason),
    'operation_key', btrim(p_operation_key), 'evidence', p_evidence
  );

  perform pg_advisory_xact_lock(hashtextextended('athena:intake-preparation-supersession:' || btrim(p_external_build_id), 0));
  select * into v_existing from public.athena_intake_preparation_supersessions where operation_key = btrim(p_operation_key);
  if found then
    if to_jsonb(v_existing) - 'id' - 'created_at' is distinct from
       jsonb_build_object(
         'original_intake_id', p_original_intake_id,
         'original_preparation_package_id', p_original_preparation_package_id,
         'replacement_intake_id', p_replacement_intake_id,
         'replacement_preparation_package_id', p_replacement_preparation_package_id,
         'project_key', btrim(p_project_key), 'module_key', btrim(p_module_key),
         'external_build_id', btrim(p_external_build_id),
         'external_build_title', btrim(p_external_build_title),
         'operator_key', btrim(p_operator_key), 'reason', btrim(p_reason),
         'operation_key', btrim(p_operation_key), 'evidence', p_evidence
       ) then
      raise exception 'Operation key was already used with contradictory supersession inputs.';
    end if;
    return jsonb_build_object('status', 'canonical_intake_preparation_chain_superseded', 'supersession_id', v_existing.id, 'idempotent_replay', true, 'lineage', v_request);
  end if;

  select * into strict v_original_intake from public.athena_intake_items where id = p_original_intake_id;
  select * into strict v_replacement_intake from public.athena_intake_items where id = p_replacement_intake_id;
  select * into strict v_original_package from public.athena_intake_preparation_packages where id = p_original_preparation_package_id and intake_id = p_original_intake_id;
  select * into strict v_replacement_package from public.athena_intake_preparation_packages where id = p_replacement_preparation_package_id and intake_id = p_replacement_intake_id;

  if v_original_intake.status_key <> 'approved' or v_replacement_intake.status_key <> 'approved'
     or (select count(*) from public.athena_intake_review_history where intake_id = p_original_intake_id and to_status_key = 'approved' and review_outcome = 'approve') <> 1
     or (select count(*) from public.athena_intake_review_history where intake_id = p_replacement_intake_id and to_status_key = 'approved' and review_outcome = 'approve') <> 1 then
    raise exception 'Both supersession chains require exactly one immutable approval.';
  end if;
  if v_original_intake.project_key <> btrim(p_project_key) or v_replacement_intake.project_key <> btrim(p_project_key)
     or v_original_package.project_key <> btrim(p_project_key) or v_replacement_package.project_key <> btrim(p_project_key)
     or v_original_intake.module_key <> btrim(p_module_key) or v_replacement_intake.module_key <> btrim(p_module_key)
     or v_original_package.module_key <> btrim(p_module_key) or v_replacement_package.module_key <> btrim(p_module_key) then
    raise exception 'Cross-project or cross-module supersession is forbidden.';
  end if;
  if btrim(v_original_package.proposed_build_id) <> btrim(p_external_build_id)
     or btrim(v_replacement_package.proposed_build_id) <> btrim(p_external_build_id)
     or btrim(v_replacement_package.proposed_build_title) <> btrim(p_external_build_title)
     or v_replacement_intake.title <> btrim(p_external_build_title) then
    raise exception 'Original and replacement external build identities are incompatible.';
  end if;
  if exists (select 1 from public.athena_build_lifecycle_transitions where intake_id in (p_original_intake_id, p_replacement_intake_id) or preparation_package_id in (p_original_preparation_package_id, p_replacement_preparation_package_id))
     or exists (select 1 from public.athena_build_lifecycle_state where intake_id in (p_original_intake_id, p_replacement_intake_id) or preparation_package_id in (p_original_preparation_package_id, p_replacement_preparation_package_id)) then
    raise exception 'Supersession must be recorded before either chain has lifecycle evidence.';
  end if;
  if exists (
    select 1 from public.athena_intake_preparation_supersessions s
    where p_original_intake_id in (s.original_intake_id, s.replacement_intake_id)
       or p_replacement_intake_id in (s.original_intake_id, s.replacement_intake_id)
       or p_original_preparation_package_id in (s.original_preparation_package_id, s.replacement_preparation_package_id)
       or p_replacement_preparation_package_id in (s.original_preparation_package_id, s.replacement_preparation_package_id)
  ) then
    raise exception 'A supersession endpoint already participates in canonical lineage.';
  end if;

  insert into public.athena_intake_preparation_supersessions(
    original_intake_id, original_preparation_package_id,
    replacement_intake_id, replacement_preparation_package_id,
    project_key, module_key, external_build_id, external_build_title,
    operator_key, reason, operation_key, evidence
  ) values (
    p_original_intake_id, p_original_preparation_package_id,
    p_replacement_intake_id, p_replacement_preparation_package_id,
    btrim(p_project_key), btrim(p_module_key), btrim(p_external_build_id),
    btrim(p_external_build_title), btrim(p_operator_key), btrim(p_reason),
    btrim(p_operation_key), p_evidence
  ) returning * into strict v_row;

  return jsonb_build_object('status', 'canonical_intake_preparation_chain_superseded', 'supersession_id', v_row.id, 'idempotent_replay', false, 'lineage', v_request, 'created_at', v_row.created_at);
exception
  when unique_violation then
    raise exception 'Supersession graph or operation identity conflicts with existing canonical evidence.';
end;
$function$;

revoke all on function public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)
to service_role;

-- Patch only the exact current candidate/gate/lifecycle definitions. Each
-- replacement is counted and fails closed if repository/deployed drift exists.
do $patch$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.athena_pre_build_collect_candidates(uuid,uuid,text,text,text,text,text[])'::regprocedure) into v_def;
  v_new := replace(v_def,
    'where package_row.id <> p_preparation_package_id',
    $r$where package_row.id <> p_preparation_package_id
      and not exists (
        select 1 from public.athena_intake_preparation_supersessions supersession
        where supersession.original_intake_id = package_row.intake_id
          and supersession.original_preparation_package_id = package_row.id
          and supersession.replacement_intake_id = p_intake_id
          and supersession.replacement_preparation_package_id = p_preparation_package_id
      )$r$);
  if v_new = v_def then raise exception 'Build 0090 candidate collector patch anchor drifted.'; end if;
  execute v_new;

  select pg_get_functiondef('public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure) into v_def;
  v_new := replace(v_def, '  v_canonical_build_title text;', '  v_canonical_build_title text;' || E'\n  v_supersession jsonb;');
  v_new := replace(v_new,
    '  v_candidates := public.athena_pre_build_collect_candidates(',
    $r$  v_supersession := public.athena_resolve_intake_preparation_supersession(
    p_intake_id, p_preparation_package_id
  );

  v_candidates := public.athena_pre_build_collect_candidates($r$);
  v_new := replace(v_new,
    $$    'preparation_package_id', p_preparation_package_id,$$,
    $$    'preparation_package_id', p_preparation_package_id,
    'supersession', v_supersession,$$);
  v_new := replace(v_new,
    $$    'canonical_build_title', v_canonical_build_title
  );$$,
    $$    'canonical_build_title', v_canonical_build_title,
    'supersession', v_supersession
  );$$);
  if v_new = v_def or position('v_supersession' in v_new) = 0 then raise exception 'Build 0090 gate preview patch anchor drifted.'; end if;
  execute v_new;

  select pg_get_functiondef('public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure) into v_def;
  v_new := replace(v_def, '  v_conflict_count bigint;', '  v_conflict_count bigint;' || E'\n  v_supersession jsonb;');
  v_new := replace(v_new,
    $r$  select count(*)
  into v_conflict_count
  from public.athena_build_lifecycle_transitions transition_row$r$,
    $r$  v_supersession := public.athena_resolve_intake_preparation_supersession(
    p_intake_id, p_preparation_package_id
  );

  select count(*)
  into v_conflict_count
  from public.athena_build_lifecycle_transitions transition_row$r$);
  v_new := replace(v_new,
    $$    where package_row.id <> p_preparation_package_id
      and ($$,
    $$    where package_row.id <> p_preparation_package_id
      and not (
        v_supersession is not null
        and package_row.id = (v_supersession ->> 'original_preparation_package_id')::uuid
        and package_row.intake_id = (v_supersession ->> 'original_intake_id')::uuid
      )
      and ($$);
  v_new := replace(v_new,
    $$  v_result := jsonb_build_object(
    'status', 'canonical_build_assigned_and_started',$$,
    $$  v_result := jsonb_build_object(
    'status', 'canonical_build_assigned_and_started',
    'supersession', v_supersession,$$);
  if v_new = v_def
     or position('original_preparation_package_id' in v_new) = 0
     or position('''supersession'', v_supersession' in v_new) = 0 then
    raise exception 'Build 0090 lifecycle patch anchor drifted.';
  end if;
  execute v_new;
end;
$patch$;

revoke all on function public.athena_pre_build_collect_candidates(uuid,uuid,text,text,text,text,text[]) from public, anon, authenticated, service_role;
revoke all on function public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb) to service_role;

comment on table public.athena_intake_preparation_supersessions is
  'Build 0090 immutable authority linking one defective approved external-build Intake/preparation chain to its exact validated replacement.';
comment on function public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb) is
  'Build 0090 service-role-only idempotent append-only Intake/preparation supersession operation.';

do $verify$
declare
  v_collect text;
  v_preview text;
  v_start text;
begin
  select pg_get_functiondef('public.athena_pre_build_collect_candidates(uuid,uuid,text,text,text,text,text[])'::regprocedure) into v_collect;
  select pg_get_functiondef('public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure) into v_preview;
  select pg_get_functiondef('public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure) into v_start;
  if position('athena_intake_preparation_supersessions' in v_collect) = 0
     or position('v_supersession' in v_preview) = 0
     or position('original_preparation_package_id' in v_start) = 0 then
    raise exception 'Build 0090 function replacement verification failed.';
  end if;
  if has_function_privilege('anon', 'public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'Build 0090 RPC privilege verification failed.';
  end if;
end;
$verify$;
