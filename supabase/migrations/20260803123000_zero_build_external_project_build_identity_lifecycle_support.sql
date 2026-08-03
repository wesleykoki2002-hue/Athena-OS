-- ============================================================================
-- Zero-build control-plane repair
-- Canonical External Project Build Identity Lifecycle Support
--
-- Repair intake:
--   5cee0e7d-901d-480e-a514-d967f945a97d
-- Repair preparation package:
--   7db83870-421f-41cc-bfb4-af600eb5bc9c
--
-- This migration does not assign or reserve Athena Build 0088.
-- It extends the existing canonical lifecycle so approved external product
-- builds can preserve their exact preparation-package identity while Athena's
-- four-digit numeric sequence remains independent.
-- ============================================================================

do $preflight$
begin
  if to_regclass('public.athena_build_lifecycle_state') is null
     or to_regclass('public.athena_build_lifecycle_transitions') is null
     or to_regprocedure(
       'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
     ) is null
     or to_regprocedure(
       'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'
     ) is null
     or to_regprocedure(
       'public.athena_build_lifecycle_gate_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],jsonb)'
     ) is null then
    raise exception
      'Canonical lifecycle prerequisites are missing. External identity repair aborted.';
  end if;

  if not exists (
    select 1
    from public.athena_intake_items i
    join public.athena_intake_preparation_packages p
      on p.intake_id = i.id
    where i.id = '5cee0e7d-901d-480e-a514-d967f945a97d'::uuid
      and i.status_key = 'approved'
      and i.project_key = 'athena-cto'
      and i.module_key = 'build-log-recorder'
      and p.id = '7db83870-421f-41cc-bfb4-af600eb5bc9c'::uuid
      and p.proposed_build_id is null
      and p.proposed_build_title is null
      and coalesce(
        (p.metadata ->> 'zero_build_id_control_plane_repair')::boolean,
        false
      )
      and coalesce(
        (p.metadata ->> 'implementation_authorized')::boolean,
        false
      )
  ) then
    raise exception
      'The approved zero-build external identity repair package was not found.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_state
    where build_id = '0088'
       or build_number = 88
  ) or exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where build_id = '0088'
       or build_number = 88
  ) or exists (
    select 1
    from public.athena_intake_preparation_packages
    where proposed_build_id = '0088'
       or metadata ->> 'assigned_build_id' = '0088'
       or metadata ->> 'build_start_id' = '0088'
  ) then
    raise exception 'Build 0088 is already assigned or reserved.';
  end if;

  if not exists (
    select 1
    from public.athena_intake_items i
    join public.athena_intake_preparation_packages p
      on p.intake_id = i.id
    where i.id = '975cb885-3303-4b54-9cee-e046847591ff'::uuid
      and i.status_key = 'approved'
      and i.project_key = 'beautydna'
      and i.module_key = 'ingredient-intelligence'
      and p.id = '2f808b82-b10d-4dc7-9ebe-56b9d45be60b'::uuid
      and p.proposed_build_id = 'BDNA-ING-0004'
      and p.proposed_build_title =
        'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing'
  ) then
    raise exception 'The exact blocked BDNA-ING-0004 package was not found.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where intake_id = '975cb885-3303-4b54-9cee-e046847591ff'::uuid
       or preparation_package_id =
         '2f808b82-b10d-4dc7-9ebe-56b9d45be60b'::uuid
  ) then
    raise exception 'BDNA-ING-0004 is already started.';
  end if;

  if exists (
    select 1
    from public.athena_build_timer_sessions
    where status in ('active', 'paused', 'idle')
  ) then
    raise exception 'An active, paused, or idle timer exists.';
  end if;
end;
$preflight$;

create or replace function public.athena_normalize_repository_path(
  p_value text
)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select lower(translate(btrim(p_value), '/', chr(92)));
$function$;

revoke all on function public.athena_normalize_repository_path(text)
from public, anon, authenticated;
grant execute on function public.athena_normalize_repository_path(text)
to service_role;

alter table public.athena_build_lifecycle_state
  alter column build_number drop not null;

alter table public.athena_build_lifecycle_transitions
  alter column build_number drop not null;

alter table public.athena_build_lifecycle_state
  drop constraint athena_build_lifecycle_state_build_number_range,
  drop constraint athena_build_lifecycle_state_build_id_format,
  drop constraint athena_build_lifecycle_state_build_identity_match,
  drop constraint athena_build_lifecycle_state_title_format;

alter table public.athena_build_lifecycle_state
  add constraint athena_build_lifecycle_state_build_number_range
    check (
      build_number is null
      or build_number between 1 and 9999
    ),
  add constraint athena_build_lifecycle_state_build_id_format
    check (
      (
        build_number is not null
        and build_id ~ '^[0-9]{4}$'
      )
      or (
        build_number is null
        and build_id !~ '^[0-9]{4}$'
        and build_id ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
      )
    ),
  add constraint athena_build_lifecycle_state_build_identity_match
    check (
      build_number is null
      or build_id = lpad(build_number::text, 4, '0')
    ),
  add constraint athena_build_lifecycle_state_title_format
    check (
      (
        build_number is not null
        and build_title like build_id || ' Build title: %'
      )
      or (
        build_number is null
        and build_title like build_id || ' %'
      )
    );

alter table public.athena_build_lifecycle_transitions
  drop constraint athena_build_lifecycle_transitions_build_number_range,
  drop constraint athena_build_lifecycle_transitions_build_id_format,
  drop constraint athena_build_lifecycle_transitions_build_identity_match,
  drop constraint athena_build_lifecycle_transitions_title_format;

alter table public.athena_build_lifecycle_transitions
  add constraint athena_build_lifecycle_transitions_build_number_range
    check (
      build_number is null
      or build_number between 1 and 9999
    ),
  add constraint athena_build_lifecycle_transitions_build_id_format
    check (
      (
        build_number is not null
        and build_id ~ '^[0-9]{4}$'
      )
      or (
        build_number is null
        and build_id !~ '^[0-9]{4}$'
        and build_id ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
      )
    ),
  add constraint athena_build_lifecycle_transitions_build_identity_match
    check (
      build_number is null
      or build_id = lpad(build_number::text, 4, '0')
    ),
  add constraint athena_build_lifecycle_transitions_title_format
    check (
      (
        build_number is not null
        and build_title like build_id || ' Build title: %'
      )
      or (
        build_number is null
        and build_title like build_id || ' %'
      )
    );

create or replace function public.enforce_athena_build_lifecycle_package_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_package public.athena_intake_preparation_packages%rowtype;
  v_intake public.athena_intake_items%rowtype;
begin
  select *
  into strict v_package
  from public.athena_intake_preparation_packages
  where id = new.preparation_package_id
    and intake_id = new.intake_id;

  select *
  into strict v_intake
  from public.athena_intake_items
  where id = new.intake_id;

  if v_package.project_key is distinct from new.project_key
     or v_package.module_key is distinct from new.module_key
     or v_intake.project_key is distinct from new.project_key
     or v_intake.module_key is distinct from new.module_key then
    raise exception
      'Lifecycle identity does not match the exact preparation-package owner.';
  end if;

  if new.build_number is not null then
    if v_package.proposed_build_id is not null
       or v_package.proposed_build_title is not null
       or new.build_id is distinct from lpad(new.build_number::text, 4, '0')
       or new.build_title not like new.build_id || ' Build title: %' then
      raise exception
        'Numeric lifecycle identity contradicts its preparation package.';
    end if;
  else
    if v_package.proposed_build_id is null
       or v_package.proposed_build_title is null
       or new.build_id is distinct from btrim(v_package.proposed_build_id)
       or new.build_title is distinct from btrim(v_package.proposed_build_title)
       or v_intake.title is distinct from btrim(v_package.proposed_build_title)
       or (
         nullif(btrim(v_package.metadata ->> 'build_id'), '') is not null
         and btrim(v_package.metadata ->> 'build_id')
           <> btrim(v_package.proposed_build_id)
       )
       or (
         nullif(btrim(v_intake.metadata ->> 'build_id'), '') is not null
         and btrim(v_intake.metadata ->> 'build_id')
           <> btrim(v_package.proposed_build_id)
       )
       or coalesce(
         (v_package.metadata ->> 'zero_build_id_control_plane_repair')::boolean,
         false
       ) then
      raise exception
        'External lifecycle identity does not exactly match its approved preparation package.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_athena_build_lifecycle_package_identity()
from public, anon, authenticated, service_role;

drop trigger if exists athena_build_lifecycle_state_identity_guard
on public.athena_build_lifecycle_state;
create trigger athena_build_lifecycle_state_identity_guard
before insert or update on public.athena_build_lifecycle_state
for each row execute function public.enforce_athena_build_lifecycle_package_identity();

drop trigger if exists athena_build_lifecycle_transitions_identity_guard
on public.athena_build_lifecycle_transitions;
create trigger athena_build_lifecycle_transitions_identity_guard
before insert on public.athena_build_lifecycle_transitions
for each row execute function public.enforce_athena_build_lifecycle_package_identity();

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
  v_project public.athena_projects%rowtype;
  v_module public.athena_project_modules%rowtype;
  v_candidates jsonb;
  v_classification jsonb;
  v_scope jsonb;
  v_request jsonb;
  v_scope_hash text;
  v_request_hash text;
  v_expected_repository_path text;
  v_expected_target_supabase_ref text;
  v_identity_kind text;
  v_canonical_build_id text;
  v_canonical_build_title text;
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
    raise exception 'Unexpected Athena control-plane Supabase project identity.';
  end if;

  if coalesce((p_request_evidence ->> 'local_handoff_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_path_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_branch_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_head_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_tree_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_evidence_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'tracked_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'staged_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'supabase_project_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'target_supabase_project_verified')::boolean, false) <> true then
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

  select * into strict v_project
  from public.athena_projects
  where project_key = btrim(p_project_key)
    and blocked = false;

  select * into strict v_module
  from public.athena_project_modules
  where id = p_module_id
    and project_key = btrim(p_project_key)
    and module_key = btrim(p_module_key);

  v_expected_repository_path := coalesce(
    nullif(btrim(v_package.metadata ->> 'repository_path'), ''),
    nullif(btrim(v_intake.metadata ->> 'repository_path'), ''),
    nullif(btrim(v_project.repo_path), ''),
    nullif(btrim(v_project.local_path), ''),
    nullif(btrim(v_project.metadata ->> 'local_folder'), '')
  );

  if v_expected_repository_path is null
     or public.athena_normalize_repository_path(p_repository_path)
        <> public.athena_normalize_repository_path(v_expected_repository_path)
     or (
       nullif(btrim(v_package.metadata ->> 'repository_path'), '') is not null
       and public.athena_normalize_repository_path(
         v_package.metadata ->> 'repository_path'
       ) <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_intake.metadata ->> 'repository_path'), '') is not null
       and public.athena_normalize_repository_path(
         v_intake.metadata ->> 'repository_path'
       ) <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_project.repo_path), '') is not null
       and public.athena_normalize_repository_path(v_project.repo_path)
         <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_project.local_path), '') is not null
       and public.athena_normalize_repository_path(v_project.local_path)
         <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_project.metadata ->> 'local_folder'), '') is not null
       and public.athena_normalize_repository_path(
         v_project.metadata ->> 'local_folder'
       ) <> public.athena_normalize_repository_path(v_expected_repository_path)
     ) then
    raise exception 'Canonical target repository path verification failed.';
  end if;

  v_expected_target_supabase_ref := coalesce(
    nullif(btrim(v_package.metadata ->> 'supabase_project_ref'), ''),
    nullif(btrim(v_intake.metadata ->> 'supabase_project_ref'), ''),
    nullif(btrim(v_project.supabase_project_ref), ''),
    nullif(btrim(v_project.metadata ->> 'target_supabase_project_ref'), '')
  );

  if v_expected_target_supabase_ref is null
     or p_request_evidence ->> 'target_supabase_project_ref'
        is distinct from v_expected_target_supabase_ref
     or (
       nullif(btrim(v_package.metadata ->> 'supabase_project_ref'), '') is not null
       and btrim(v_package.metadata ->> 'supabase_project_ref')
         <> v_expected_target_supabase_ref
     )
     or (
       nullif(btrim(v_intake.metadata ->> 'supabase_project_ref'), '') is not null
       and btrim(v_intake.metadata ->> 'supabase_project_ref')
         <> v_expected_target_supabase_ref
     )
     or (
       nullif(btrim(v_project.supabase_project_ref), '') is not null
       and btrim(v_project.supabase_project_ref)
         <> v_expected_target_supabase_ref
     )
     or (
       nullif(
         btrim(v_project.metadata ->> 'target_supabase_project_ref'),
         ''
       ) is not null
       and btrim(v_project.metadata ->> 'target_supabase_project_ref')
         <> v_expected_target_supabase_ref
     ) then
    raise exception 'Canonical target Supabase project verification failed.';
  end if;

  if (
    nullif(btrim(v_package.metadata ->> 'handoff_version'), '') is not null
    and btrim(v_package.metadata ->> 'handoff_version') <> btrim(p_handoff_version)
  ) or (
    nullif(btrim(v_intake.metadata ->> 'handoff_version'), '') is not null
    and btrim(v_intake.metadata ->> 'handoff_version') <> btrim(p_handoff_version)
  ) then
    raise exception 'Canonical handoff version verification failed.';
  end if;

  if v_package.proposed_build_id is null
     and v_package.proposed_build_title is null then
    v_identity_kind := 'numeric';
    v_canonical_build_id := null;
    v_canonical_build_title := null;
  elsif v_package.proposed_build_id is not null
     and v_package.proposed_build_title is not null then
    v_identity_kind := 'external';
    v_canonical_build_id := btrim(v_package.proposed_build_id);
    v_canonical_build_title := btrim(v_package.proposed_build_title);

    if btrim(p_project_key) = 'athena-cto'
       or v_canonical_build_id ~ '^[0-9]{4}$'
       or v_canonical_build_id !~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
       or v_canonical_build_title not like v_canonical_build_id || ' %'
       or (
         nullif(btrim(v_package.metadata ->> 'build_id'), '') is not null
         and btrim(v_package.metadata ->> 'build_id') <> v_canonical_build_id
       )
       or (
         nullif(btrim(v_intake.metadata ->> 'build_id'), '') is not null
         and btrim(v_intake.metadata ->> 'build_id') <> v_canonical_build_id
       )
       or v_intake.title is distinct from v_canonical_build_title then
      raise exception 'Approved external project build identity is invalid.';
    end if;
  else
    raise exception 'Preparation-package build identity pair is contradictory.';
  end if;

  if p_request_evidence ->> 'build_identity_kind'
       is distinct from v_identity_kind
     or p_request_evidence ->> 'canonical_build_id'
       is distinct from v_canonical_build_id
     or p_request_evidence ->> 'canonical_build_title'
       is distinct from v_canonical_build_title then
    raise exception 'Server build-identity evidence does not match the package.';
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
    'build_identity_kind', v_identity_kind,
    'canonical_build_id', v_canonical_build_id,
    'canonical_build_title', v_canonical_build_title,
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
    'target_supabase_project_ref', v_expected_target_supabase_ref,
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
    'handoff_sha256', btrim(p_handoff_sha256),
    'target_supabase_project_ref', v_expected_target_supabase_ref,
    'build_identity_kind', v_identity_kind,
    'canonical_build_id', v_canonical_build_id,
    'canonical_build_title', v_canonical_build_title
  );
end;
$function$;

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
  v_project public.athena_projects%rowtype;
  v_module public.athena_project_modules%rowtype;
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
  v_numeric_sequence_candidate_id text;
  v_candidate_build_number integer;
  v_candidate_build_id text;
  v_candidate_build_title text;
  v_identity_kind text;
  v_assignment_method text;
  v_current_closed boolean;
  v_from_state jsonb := '{}'::jsonb;
  v_expected_repository_path text;
  v_expected_target_supabase_ref text;
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
    raise exception 'Unexpected Athena control-plane Supabase project identity.';
  end if;

  if coalesce((p_request_evidence ->> 'local_handoff_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_path_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_branch_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'repository_head_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'tracked_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'staged_diff_empty')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'supabase_project_verified')::boolean, false) <> true
     or coalesce((p_request_evidence ->> 'target_supabase_project_verified')::boolean, false) <> true
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
    'target_supabase_project_ref', p_request_evidence ->> 'target_supabase_project_ref',
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

  select * into strict v_project
  from public.athena_projects
  where project_key = btrim(p_project_key)
    and blocked = false;

  select * into strict v_module
  from public.athena_project_modules
  where id = p_module_id
    and project_key = btrim(p_project_key)
    and module_key = btrim(p_module_key);

  v_expected_repository_path := coalesce(
    nullif(btrim(v_package.metadata ->> 'repository_path'), ''),
    nullif(btrim(v_intake.metadata ->> 'repository_path'), ''),
    nullif(btrim(v_project.repo_path), ''),
    nullif(btrim(v_project.local_path), ''),
    nullif(btrim(v_project.metadata ->> 'local_folder'), '')
  );

  if v_expected_repository_path is null
     or public.athena_normalize_repository_path(p_repository_path)
        <> public.athena_normalize_repository_path(v_expected_repository_path)
     or (
       nullif(btrim(v_package.metadata ->> 'repository_path'), '') is not null
       and public.athena_normalize_repository_path(
         v_package.metadata ->> 'repository_path'
       ) <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_intake.metadata ->> 'repository_path'), '') is not null
       and public.athena_normalize_repository_path(
         v_intake.metadata ->> 'repository_path'
       ) <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_project.repo_path), '') is not null
       and public.athena_normalize_repository_path(v_project.repo_path)
         <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_project.local_path), '') is not null
       and public.athena_normalize_repository_path(v_project.local_path)
         <> public.athena_normalize_repository_path(v_expected_repository_path)
     )
     or (
       nullif(btrim(v_project.metadata ->> 'local_folder'), '') is not null
       and public.athena_normalize_repository_path(
         v_project.metadata ->> 'local_folder'
       ) <> public.athena_normalize_repository_path(v_expected_repository_path)
     ) then
    raise exception 'Canonical target repository path verification failed.';
  end if;

  v_expected_target_supabase_ref := coalesce(
    nullif(btrim(v_package.metadata ->> 'supabase_project_ref'), ''),
    nullif(btrim(v_intake.metadata ->> 'supabase_project_ref'), ''),
    nullif(btrim(v_project.supabase_project_ref), ''),
    nullif(btrim(v_project.metadata ->> 'target_supabase_project_ref'), '')
  );

  if v_expected_target_supabase_ref is null
     or p_request_evidence ->> 'target_supabase_project_ref'
        is distinct from v_expected_target_supabase_ref
     or (
       nullif(btrim(v_package.metadata ->> 'supabase_project_ref'), '') is not null
       and btrim(v_package.metadata ->> 'supabase_project_ref')
         <> v_expected_target_supabase_ref
     )
     or (
       nullif(btrim(v_intake.metadata ->> 'supabase_project_ref'), '') is not null
       and btrim(v_intake.metadata ->> 'supabase_project_ref')
         <> v_expected_target_supabase_ref
     )
     or (
       nullif(btrim(v_project.supabase_project_ref), '') is not null
       and btrim(v_project.supabase_project_ref)
         <> v_expected_target_supabase_ref
     )
     or (
       nullif(
         btrim(v_project.metadata ->> 'target_supabase_project_ref'),
         ''
       ) is not null
       and btrim(v_project.metadata ->> 'target_supabase_project_ref')
         <> v_expected_target_supabase_ref
     ) then
    raise exception 'Canonical target Supabase project verification failed.';
  end if;

  if (
    nullif(btrim(v_package.metadata ->> 'handoff_version'), '') is not null
    and btrim(v_package.metadata ->> 'handoff_version') <> btrim(p_handoff_version)
  ) or (
    nullif(btrim(v_intake.metadata ->> 'handoff_version'), '') is not null
    and btrim(v_intake.metadata ->> 'handoff_version') <> btrim(p_handoff_version)
  ) then
    raise exception 'Canonical handoff version verification failed.';
  end if;

  if v_package.proposed_build_id is null
     and v_package.proposed_build_title is null then
    v_identity_kind := 'numeric';
    v_assignment_method := 'canonical_lifecycle_highest_used_plus_one';
  elsif v_package.proposed_build_id is not null
     and v_package.proposed_build_title is not null then
    v_identity_kind := 'external';
    v_assignment_method := 'canonical_external_project_identity';
  else
    raise exception 'Preparation-package build identity pair is contradictory.';
  end if;

  if p_request_evidence ->> 'build_identity_kind'
       is distinct from v_identity_kind then
    raise exception 'Server build identity kind does not match the package.';
  end if;

  select *
  into v_state
  from public.athena_build_lifecycle_state
  where singleton_key
  for update;

  if found then
    v_from_state := to_jsonb(v_state);

    select exists (
      select 1
      from public.athena_intake_preparation_packages package_row
      where package_row.id = v_state.preparation_package_id
        and coalesce(package_row.metadata ->> 'formal_build_closed', 'false') = 'true'
        and lower(coalesce(package_row.metadata ->> 'final_build_status', ''))
          in ('completed', 'paused', 'cancelled')

      union all
      select 1
      from public.athena_feature_completion_events event_row
      where event_row.project_key = v_state.project_key
        and event_row.build_session_title = v_state.build_title
        and lower(coalesce(event_row.status, ''))
          in ('completed', 'paused', 'cancelled')

      union all
      select 1
      from public.athena_feature_completion_packets packet_row
      where packet_row.project_key = v_state.project_key
        and packet_row.build_session_title = v_state.build_title
        and lower(coalesce(packet_row.status, ''))
          in ('completed', 'paused', 'cancelled')

      union all
      select 1
      from public.athena_build_logs log_row
      where lower(coalesce(to_jsonb(log_row) ->> 'status', ''))
          in ('completed', 'paused', 'cancelled')
        and (
          to_jsonb(log_row) ->> 'build_session_title' = v_state.build_title
          or to_jsonb(log_row) ->> 'session_title' = v_state.build_title
          or to_jsonb(log_row) ->> 'title' = v_state.build_title
        )
    ) into v_current_closed;

    if not v_current_closed then
      raise exception
        'Current lifecycle build % is not formally closed in canonical evidence.',
        v_state.build_id;
    end if;
  end if;

  with raw_identifiers(value) as (
    select transition_row.build_id
    from public.athena_build_lifecycle_transitions transition_row
    union all
    select state_row.build_id
    from public.athena_build_lifecycle_state state_row
    union all
    select package_row.proposed_build_id
    from public.athena_intake_preparation_packages package_row
    union all
    select package_row.metadata ->> 'assigned_build_id'
    from public.athena_intake_preparation_packages package_row
    union all
    select package_row.metadata ->> 'build_start_id'
    from public.athena_intake_preparation_packages package_row
    union all
    select package_row.proposed_build_title
    from public.athena_intake_preparation_packages package_row
    union all
    select to_jsonb(qa_row) ->> 'build_number'
    from public.athena_qa_runs qa_row
    union all
    select to_jsonb(qa_row) ->> 'build_id'
    from public.athena_qa_runs qa_row
    union all
    select to_jsonb(qa_row) ->> 'build_session_title'
    from public.athena_qa_runs qa_row
    union all
    select to_jsonb(packet_row) ->> 'build_session_title'
    from public.athena_feature_completion_packets packet_row
    union all
    select to_jsonb(event_row) ->> 'build_session_title'
    from public.athena_feature_completion_events event_row
    union all
    select to_jsonb(event_row) ->> 'feature_name'
    from public.athena_feature_completion_events event_row
    union all
    select to_jsonb(log_row) ->> 'build_id'
    from public.athena_build_logs log_row
    union all
    select to_jsonb(log_row) ->> 'build_number'
    from public.athena_build_logs log_row
    union all
    select to_jsonb(log_row) ->> 'build_session_title'
    from public.athena_build_logs log_row
    union all
    select to_jsonb(log_row) ->> 'title'
    from public.athena_build_logs log_row
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

  if v_highest_build_number >= 9999 then
    raise exception 'No four-digit Athena build identity remains available.';
  end if;

  v_numeric_sequence_candidate_id :=
    lpad((v_highest_build_number + 1)::text, 4, '0');

  if v_identity_kind = 'numeric' then
    v_candidate_build_number := v_highest_build_number + 1;
    v_candidate_build_id := v_numeric_sequence_candidate_id;
    v_candidate_build_title :=
      v_candidate_build_id || ' Build title: ' || btrim(p_build_name);

    if v_package.proposed_build_id is not null
       or v_package.proposed_build_title is not null then
      raise exception 'Numeric lifecycle mode requires an unassigned package.';
    end if;
  else
    v_candidate_build_number := null;
    v_candidate_build_id := btrim(v_package.proposed_build_id);
    v_candidate_build_title := btrim(v_package.proposed_build_title);

    if btrim(p_project_key) = 'athena-cto'
       or v_candidate_build_id ~ '^[0-9]{4}$'
       or v_candidate_build_id !~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
       or v_candidate_build_title not like v_candidate_build_id || ' %'
       or (
         nullif(btrim(v_package.metadata ->> 'build_id'), '') is not null
         and btrim(v_package.metadata ->> 'build_id') <> v_candidate_build_id
       )
       or (
         nullif(btrim(v_intake.metadata ->> 'build_id'), '') is not null
         and btrim(v_intake.metadata ->> 'build_id') <> v_candidate_build_id
       )
       or v_intake.title is distinct from v_candidate_build_title
       or p_request_evidence ->> 'canonical_build_id'
          is distinct from v_candidate_build_id
       or p_request_evidence ->> 'canonical_build_title'
          is distinct from v_candidate_build_title
       or btrim(p_build_name) not in (
         v_candidate_build_title,
         btrim(substr(
           v_candidate_build_title,
           char_length(v_candidate_build_id) + 2
         ))
       ) then
      raise exception 'Approved external project build identity is invalid.';
    end if;
  end if;

  select count(*)
  into v_conflict_count
  from public.athena_build_lifecycle_transitions transition_row
  where transition_row.build_id = v_candidate_build_id
     or transition_row.intake_id = p_intake_id
     or transition_row.preparation_package_id = p_preparation_package_id;

  v_conflict_count := v_conflict_count + (
    select count(*)
    from public.athena_intake_preparation_packages package_row
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
  from public.athena_intake_items intake_row
  where intake_row.id = p_intake_id;

  select md5(to_jsonb(package_row)::text)
  into v_package_hash_before
  from public.athena_intake_preparation_packages package_row
  where package_row.id = p_preparation_package_id;

  select md5(to_jsonb(project_row)::text)
  into v_project_hash_before
  from public.athena_projects project_row
  where project_row.project_key = btrim(p_project_key);

  select md5(to_jsonb(module_row)::text)
  into v_module_hash_before
  from public.athena_project_modules module_row
  where module_row.id = p_module_id;

  select count(*) into v_qa_count_before from public.athena_qa_runs;
  select count(*) into v_packet_count_before from public.athena_feature_completion_packets;
  select count(*) into v_event_count_before from public.athena_feature_completion_events;
  select count(*) into v_log_count_before from public.athena_build_logs;
  select count(*) into v_transition_count_before from public.athena_build_lifecycle_transitions;
  select count(*) into v_state_count_before from public.athena_build_lifecycle_state;

  if v_state.id is null then
    v_state_id := gen_random_uuid();

    insert into public.athena_build_lifecycle_state (
      id, singleton_key, build_number, build_id, build_title,
      lifecycle_status, intake_id, preparation_package_id,
      project_key, module_key, module_id, target_system, tracking_system,
      repository_path, repository_head, supabase_project_ref,
      handoff_version, handoff_sha256, assigned_at, started_at,
      assigned_by, started_by, assignment_method, start_method,
      operation_key, request_hash, evidence
    ) values (
      v_state_id, true, v_candidate_build_number, v_candidate_build_id,
      v_candidate_build_title, 'started', p_intake_id,
      p_preparation_package_id, btrim(p_project_key), btrim(p_module_key),
      p_module_id, btrim(p_target_system), btrim(p_tracking_system),
      btrim(p_repository_path), btrim(p_repository_head),
      btrim(p_supabase_project_ref), btrim(p_handoff_version),
      btrim(p_handoff_sha256), v_now, v_now, btrim(p_operator_key),
      btrim(p_operator_key), v_assignment_method,
      'canonical_atomic_assign_and_start', btrim(p_operation_key),
      v_request_hash, coalesce(p_request_evidence, '{}'::jsonb)
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
      assignment_method = v_assignment_method,
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
    'build_identity_kind', v_identity_kind,
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
    'target_supabase_project_ref', v_expected_target_supabase_ref,
    'handoff_version', btrim(p_handoff_version),
    'handoff_sha256', btrim(p_handoff_sha256),
    'assigned_at', v_now,
    'started_at', v_now,
    'assigned_by', btrim(p_operator_key),
    'started_by', btrim(p_operator_key),
    'assignment_method', v_assignment_method,
    'start_method', 'canonical_atomic_assign_and_start',
    'operation_key', btrim(p_operation_key),
    'request_hash', v_request_hash,
    'idempotent_replay', false,
    'numeric_sequence_candidate_id', v_numeric_sequence_candidate_id,
    'numeric_sequence_consumed', v_identity_kind = 'numeric',
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
    id, state_id, event_type, operation_key, request_hash, result_hash,
    build_number, build_id, build_title, intake_id,
    preparation_package_id, project_key, module_key, module_id,
    from_state, to_state, actor_key, actor_display_name,
    assignment_method, start_method, request_evidence,
    result_snapshot, created_at
  ) values (
    v_transition_id, v_state_id, 'assigned_started', btrim(p_operation_key),
    v_request_hash, v_result_hash, v_candidate_build_number,
    v_candidate_build_id, v_candidate_build_title, p_intake_id,
    p_preparation_package_id, btrim(p_project_key), btrim(p_module_key),
    p_module_id, v_from_state, v_result, btrim(p_operator_key),
    nullif(btrim(p_operator_display_name), ''), v_assignment_method,
    'canonical_atomic_assign_and_start',
    coalesce(p_request_evidence, '{}'::jsonb), v_result, v_now
  );

  select * into strict v_state
  from public.athena_build_lifecycle_state
  where id = v_state_id;

  select * into strict v_transition
  from public.athena_build_lifecycle_transitions
  where id = v_transition_id;

  if v_state.build_number is distinct from v_candidate_build_number
     or v_state.build_id <> v_candidate_build_id
     or v_state.build_title <> v_candidate_build_title
     or v_state.lifecycle_status <> 'started'
     or v_state.intake_id <> p_intake_id
     or v_state.preparation_package_id <> p_preparation_package_id
     or v_state.operation_key <> btrim(p_operation_key)
     or v_state.request_hash <> v_request_hash
     or v_transition.build_number is distinct from v_candidate_build_number
     or v_transition.build_id <> v_candidate_build_id
     or v_transition.build_title <> v_candidate_build_title
     or v_transition.operation_key <> btrim(p_operation_key)
     or v_transition.request_hash <> v_request_hash
     or v_transition.result_hash <> v_result_hash
     or v_transition.result_snapshot <> v_result then
    raise exception
      'Canonical lifecycle read-after-write verification failed.';
  end if;

  select md5(to_jsonb(intake_row)::text)
  into v_intake_hash_after
  from public.athena_intake_items intake_row
  where intake_row.id = p_intake_id;

  select md5(to_jsonb(package_row)::text)
  into v_package_hash_after
  from public.athena_intake_preparation_packages package_row
  where package_row.id = p_preparation_package_id;

  select md5(to_jsonb(project_row)::text)
  into v_project_hash_after
  from public.athena_projects project_row
  where project_row.project_key = btrim(p_project_key);

  select md5(to_jsonb(module_row)::text)
  into v_module_hash_after
  from public.athena_project_modules module_row
  where module_row.id = p_module_id;

  select count(*) into v_timer_count_after
  from public.athena_build_timer_sessions
  where status in ('active', 'paused', 'idle');
  select count(*) into v_qa_count_after from public.athena_qa_runs;
  select count(*) into v_packet_count_after from public.athena_feature_completion_packets;
  select count(*) into v_event_count_after from public.athena_feature_completion_events;
  select count(*) into v_log_count_after from public.athena_build_logs;
  select count(*) into v_transition_count_after from public.athena_build_lifecycle_transitions;
  select count(*) into v_state_count_after from public.athena_build_lifecycle_state;

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

comment on function public.athena_build_lifecycle_assign_and_start(
  uuid, uuid, text, text, uuid, text, text, text, text, text,
  text, text, text, text, text, text, jsonb
) is
  'Atomically preserves an approved external project build identity or derives the next Athena numeric build identity, persists canonical lifecycle state and append-only transition evidence, and creates no timer, QA, completion, or build-log side effects.';

comment on table public.athena_build_lifecycle_state is
  'Singleton current lifecycle state. Numeric Athena builds use a non-null build_number; approved external project builds use a null build_number and their exact preparation-package identity.';

comment on table public.athena_build_lifecycle_transitions is
  'Append-only canonical lifecycle transitions for numeric Athena builds and approved external project build identities.';
