-- Zero-build Athena control-plane repair: narrowly reconcile a preparation
-- package repository path before any gate, lifecycle, timer, or completion.

do $preflight$
begin
  if to_regclass('public.athena_intake_items') is null
     or to_regclass('public.athena_intake_preparation_packages') is null
     or to_regclass('public.athena_projects') is null
     or to_regclass('public.athena_project_modules') is null
     or to_regclass('public.athena_pre_build_gate_evaluations') is null
     or to_regclass('public.athena_build_lifecycle_state') is null
     or to_regclass('public.athena_build_lifecycle_transitions') is null
     or to_regclass('public.athena_build_timer_sessions') is null then
    raise exception 'Required canonical Athena relations are missing.';
  end if;
  if to_regprocedure('public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)') is not null then
    raise exception 'athena_reconcile_intake_repository_path_metadata already exists.';
  end if;
end;
$preflight$;

create function public.athena_reconcile_intake_repository_path_metadata(
  p_intake_id uuid,
  p_preparation_package_id uuid,
  p_project_key text,
  p_module_key text,
  p_repository_path text,
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
  v_intake public.athena_intake_items%rowtype;
  v_before public.athena_intake_preparation_packages%rowtype;
  v_after public.athena_intake_preparation_packages%rowtype;
  v_project jsonb;
  v_module_count integer;
  v_path text := btrim(p_repository_path);
  v_existing_path text;
  v_project_path text;
  v_entries jsonb;
  v_existing_operation jsonb;
  v_record jsonb;
  v_new_metadata jsonb;
  v_now timestamptz := clock_timestamp();
  v_relation text;
  v_has_intake boolean;
  v_has_package boolean;
begin
  if p_intake_id is null or p_preparation_package_id is null
     or nullif(btrim(p_project_key), '') is null
     or nullif(btrim(p_module_key), '') is null
     or nullif(v_path, '') is null
     or nullif(btrim(p_operator_key), '') is null
     or nullif(btrim(p_reason), '') is null
     or nullif(btrim(p_operation_key), '') is null then
    raise exception 'Exact Intake, preparation, project/module, repository path, operator, reason, and operation inputs are required.';
  end if;
  if length(btrim(p_reason)) < 20 then
    raise exception 'Correction reason must contain at least 20 characters.';
  end if;
  if btrim(p_operation_key) !~ '^[a-z0-9][a-z0-9:_-]{15,199}$' then
    raise exception 'Reconciliation operation-key format is invalid.';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Correction evidence must be a JSON object.';
  end if;
  if v_path !~ '^[A-Za-z]:\\[^:*?"<>|]+$'
     and v_path !~ '^/[^[:cntrl:]]+$' then
    raise exception 'Repository path is structurally invalid.';
  end if;
  if coalesce((p_evidence ->> 'repository_path_verified')::boolean, false) is not true
     or p_evidence ->> 'repository_path' is distinct from v_path
     or coalesce(p_evidence ->> 'repository_head', '') !~ '^[0-9a-f]{40}$'
     or coalesce(p_evidence ->> 'repository_tree', '') !~ '^[0-9a-f]{40}$'
     or nullif(btrim(p_evidence ->> 'repository_remote'), '') is null
     or coalesce((p_evidence ->> 'worktree_clean')::boolean, false) is not true then
    raise exception 'Repository path lacks exact canonical verified repository evidence.';
  end if;

  select * into strict v_intake
  from public.athena_intake_items where id = p_intake_id for update;
  if v_intake.status_key <> 'approved'
     or v_intake.project_key <> btrim(p_project_key)
     or v_intake.module_key <> btrim(p_module_key) then
    raise exception 'The Intake is not the exact approved canonical project/module Intake.';
  end if;
  if (select count(*) from public.athena_intake_review_history
      where intake_id = p_intake_id and to_status_key = 'approved'
        and review_outcome = 'approve') <> 1 then
    raise exception 'The Intake does not have exactly one immutable approval review.';
  end if;

  select to_jsonb(p) into strict v_project
  from public.athena_projects p where p.project_key = btrim(p_project_key);
  select count(*) into v_module_count
  from public.athena_project_modules m
  where m.project_key = btrim(p_project_key) and m.module_key = btrim(p_module_key);
  if v_module_count <> 1 then
    raise exception 'Canonical project/module identity does not exist exactly once.';
  end if;
  v_project_path := coalesce(
    nullif(btrim(v_project ->> 'repo_path'), ''),
    nullif(btrim(v_project ->> 'local_path'), ''),
    nullif(btrim(v_project #>> '{metadata,repository_path}'), ''),
    nullif(btrim(v_project #>> '{metadata,local_folder}'), '')
  );
  if v_project_path is not null and lower(replace(v_project_path, '/', chr(92)))
       <> lower(replace(v_path, '/', chr(92))) then
    raise exception 'Repository path conflicts with canonical project evidence.';
  end if;

  select * into strict v_before
  from public.athena_intake_preparation_packages
  where id = p_preparation_package_id and intake_id = p_intake_id for update;
  if v_before.project_key <> btrim(p_project_key)
     or v_before.module_key <> btrim(p_module_key) then
    raise exception 'Preparation-package project/module identity does not match the Intake.';
  end if;

  if exists (select 1 from public.athena_pre_build_gate_evaluations
             where intake_id = p_intake_id or preparation_package_id = p_preparation_package_id)
     or exists (select 1 from public.athena_build_lifecycle_state
                where intake_id = p_intake_id or preparation_package_id = p_preparation_package_id)
     or exists (select 1 from public.athena_build_lifecycle_transitions
                where intake_id = p_intake_id or preparation_package_id = p_preparation_package_id) then
    raise exception 'Repository path cannot be reconciled after gate or lifecycle evidence exists.';
  end if;

  if exists (
    select 1 from public.athena_build_timer_sessions s
    where s.metadata @> jsonb_build_object('intake_id', p_intake_id::text)
       or s.metadata @> jsonb_build_object('preparation_package_id', p_preparation_package_id::text)
  ) then
    raise exception 'Repository path cannot be reconciled after timer evidence exists.';
  end if;

  foreach v_relation in array array[
    'athena_feature_completion_packets', 'athena_feature_completion_events',
    'athena_feature_build_logs', 'athena_feature_qa_runs'
  ] loop
    if to_regclass('public.' || v_relation) is not null then
      select exists(select 1 from pg_attribute where attrelid = to_regclass('public.' || v_relation) and attname = 'intake_id' and not attisdropped),
             exists(select 1 from pg_attribute where attrelid = to_regclass('public.' || v_relation) and attname = 'preparation_package_id' and not attisdropped)
      into v_has_intake, v_has_package;
      if v_has_intake then
        execute format('select exists(select 1 from public.%I where intake_id = $1)', v_relation)
          into v_has_intake using p_intake_id;
      end if;
      if v_has_package then
        execute format('select exists(select 1 from public.%I where preparation_package_id = $1)', v_relation)
          into v_has_package using p_preparation_package_id;
      end if;
      if v_has_intake or v_has_package then
        raise exception 'Repository path cannot be reconciled after completion or build-log evidence exists.';
      end if;
    end if;
  end loop;

  v_entries := coalesce(v_before.metadata -> 'repository_path_reconciliations', '[]'::jsonb);
  if jsonb_typeof(v_entries) <> 'array' then
    raise exception 'Existing repository-path reconciliation provenance is invalid.';
  end if;
  select entry into v_existing_operation
  from public.athena_intake_preparation_packages p,
       jsonb_array_elements(coalesce(p.metadata -> 'repository_path_reconciliations', '[]'::jsonb)) entry
  where entry ->> 'operation_key' = btrim(p_operation_key)
  limit 1;
  if v_existing_operation is not null then
    if v_existing_operation ->> 'intake_id' <> p_intake_id::text
       or v_existing_operation ->> 'preparation_package_id' <> p_preparation_package_id::text
       or v_existing_operation ->> 'project_key' <> btrim(p_project_key)
       or v_existing_operation ->> 'module_key' <> btrim(p_module_key)
       or v_existing_operation ->> 'repository_path' <> v_path
       or v_existing_operation ->> 'operator_key' <> btrim(p_operator_key)
       or v_existing_operation ->> 'reason' <> btrim(p_reason)
       or v_existing_operation -> 'evidence' is distinct from p_evidence then
      raise exception 'Operation key was already used with conflicting arguments.';
    end if;
    return jsonb_build_object('status','repository_path_reconciled','idempotent_replay',true,
      'intake_id',p_intake_id,'preparation_package_id',p_preparation_package_id,'repository_path',v_path);
  end if;

  v_existing_path := nullif(btrim(v_before.metadata ->> 'repository_path'), '');
  if v_existing_path is not null and lower(replace(v_existing_path, '/', chr(92)))
       <> lower(replace(v_path, '/', chr(92))) then
    raise exception 'Existing repository path conflicts with the requested canonical path.';
  end if;
  if v_existing_path is not null then
    return jsonb_build_object('status','repository_path_already_canonical','idempotent_replay',true,
      'intake_id',p_intake_id,'preparation_package_id',p_preparation_package_id,'repository_path',v_existing_path);
  end if;

  v_record := jsonb_build_object(
    'schema_version','athena-pre-lifecycle-repository-path-reconciliation-v1',
    'classification','pre_lifecycle_administrative_correction',
    'operation_key',btrim(p_operation_key),'operator_key',btrim(p_operator_key),
    'reason',btrim(p_reason),'reconciled_at',v_now,'intake_id',p_intake_id,
    'preparation_package_id',p_preparation_package_id,'project_key',btrim(p_project_key),
    'module_key',btrim(p_module_key),'previous_repository_path',null,
    'repository_path',v_path,'evidence',p_evidence
  );
  v_new_metadata := jsonb_set(coalesce(v_before.metadata, '{}'::jsonb), '{repository_path}', to_jsonb(v_path), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{repository_path_reconciliations}', v_entries || jsonb_build_array(v_record), true);

  update public.athena_intake_preparation_packages set metadata = v_new_metadata
  where id = p_preparation_package_id returning * into strict v_after;
  if (to_jsonb(v_after) - 'metadata' - 'updated_at') is distinct from
       (to_jsonb(v_before) - 'metadata' - 'updated_at')
     or (v_after.metadata - 'repository_path' - 'repository_path_reconciliations') is distinct from
        (v_before.metadata - 'repository_path' - 'repository_path_reconciliations')
     or v_after.metadata ->> 'repository_path' <> v_path then
    raise exception 'Repository-path reconciliation read-after-write verification failed.';
  end if;
  return jsonb_build_object('status','repository_path_reconciled','idempotent_replay',false,
    'intake_id',p_intake_id,'preparation_package_id',p_preparation_package_id,
    'project_key',btrim(p_project_key),'module_key',btrim(p_module_key),
    'repository_path',v_path,'operation_key',btrim(p_operation_key),
    'gate_mutations',false,'lifecycle_mutations',false,'timer_mutations',false);
end;
$function$;

revoke all on function public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)
to service_role;

comment on function public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb) is
  'Service-role-only, fail-closed reconciliation of preparation metadata.repository_path before gate/lifecycle/timer/completion evidence; preserves all unrelated package state and records structured provenance.';

do $verification$
declare v_definition text;
begin
  select pg_get_functiondef('public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure) into v_definition;
  if position('security definer' in lower(v_definition)) = 0
     or not has_function_privilege('service_role','public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
     or has_table_privilege('service_role','public.athena_intake_preparation_packages','UPDATE') then
    raise exception 'Repository-path reconciliation security verification failed.';
  end if;
end;
$verification$;
