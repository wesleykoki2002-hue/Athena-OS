-- Zero-build Athena lifecycle reliability repair.
-- Reconciles missing canonical handoff identity into the existing
-- preparation-package JSONB metadata without replacing the Intake.

do $preflight$
begin
  if to_regclass('public.athena_intake_items') is null then
    raise exception
      'Required table public.athena_intake_items is missing.';
  end if;

  if to_regclass(
    'public.athena_intake_preparation_packages'
  ) is null then
    raise exception
      'Required table public.athena_intake_preparation_packages is missing.';
  end if;

  if to_regclass('public.athena_intake_statuses') is null then
    raise exception
      'Required table public.athena_intake_statuses is missing.';
  end if;

  if to_regprocedure(
    'public.athena_reconcile_intake_handoff_metadata(uuid,uuid,text,text)'
  ) is not null then
    raise exception
      'public.athena_reconcile_intake_handoff_metadata already exists.';
  end if;
end;
$preflight$;

create function public.athena_reconcile_intake_handoff_metadata(
  p_intake_id uuid,
  p_preparation_package_id uuid,
  p_handoff_version text,
  p_handoff_filename text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_intake public.athena_intake_items%rowtype;
  v_package public.athena_intake_preparation_packages%rowtype;

  v_allows_preparation boolean;

  v_handoff_version text;
  v_handoff_filename text;

  v_existing_version text;
  v_existing_filename text;

  v_changed boolean;
begin
  if p_intake_id is null
     or p_preparation_package_id is null then
    raise exception
      'Intake id and preparation-package id are required.';
  end if;

  v_handoff_version :=
    nullif(btrim(p_handoff_version), '');

  v_handoff_filename :=
    nullif(btrim(p_handoff_filename), '');

  if v_handoff_version is null then
    raise exception
      'Canonical handoff version is required.';
  end if;

  if v_handoff_filename is null then
    raise exception
      'Canonical handoff filename is required.';
  end if;

  if position('/' in v_handoff_filename) > 0
     or position(chr(92) in v_handoff_filename) > 0 then
    raise exception
      'Canonical handoff filename must be a filename only and cannot contain directory separators.';
  end if;

  select item.*
  into v_intake
  from public.athena_intake_items as item
  where item.id = p_intake_id
  for update;

  if not found then
    raise exception
      'Canonical Intake was not found.';
  end if;

  select status.allows_preparation
  into v_allows_preparation
  from public.athena_intake_statuses as status
  where status.status_key = v_intake.status_key
    and status.is_active = true;

  if not coalesce(v_allows_preparation, false) then
    raise exception
      'Canonical Intake is not approved for preparation.';
  end if;

  select package.*
  into v_package
  from public.athena_intake_preparation_packages as package
  where package.id = p_preparation_package_id
  for update;

  if not found then
    raise exception
      'Canonical preparation package was not found.';
  end if;

  if v_package.intake_id <> p_intake_id then
    raise exception
      'Preparation package does not belong to the supplied Intake.';
  end if;

  if v_package.project_key <> v_intake.project_key
     or v_package.module_key <> v_intake.module_key then
    raise exception
      'Preparation-package project/module identity does not match the Intake.';
  end if;

  v_existing_version :=
    nullif(
      btrim(
        coalesce(
          v_package.metadata ->> 'handoff_version',
          ''
        )
      ),
      ''
    );

  v_existing_filename :=
    nullif(
      btrim(
        coalesce(
          v_package.metadata ->> 'handoff_filename',
          ''
        )
      ),
      ''
    );

  if v_existing_version is not null
     and v_existing_version <> v_handoff_version then
    raise exception
      'Existing canonical handoff version contradicts the supplied version.';
  end if;

  if v_existing_filename is not null
     and v_existing_filename <> v_handoff_filename then
    raise exception
      'Existing canonical handoff filename contradicts the supplied filename.';
  end if;

  v_changed :=
    v_existing_version is distinct from v_handoff_version
    or
    v_existing_filename is distinct from v_handoff_filename;

  if v_changed then
    update public.athena_intake_preparation_packages
    set metadata =
      coalesce(metadata, '{}'::jsonb)
      ||
      jsonb_build_object(
        'handoff_version',
        v_handoff_version,
        'handoff_filename',
        v_handoff_filename
      )
    where id = p_preparation_package_id;
  end if;

  return jsonb_build_object(
    'status',
    'canonical_intake_handoff_metadata_reconciled',
    'intake_id',
    p_intake_id,
    'preparation_package_id',
    p_preparation_package_id,
    'project_key',
    v_intake.project_key,
    'module_key',
    v_intake.module_key,
    'handoff_version',
    v_handoff_version,
    'handoff_filename',
    v_handoff_filename,
    'changed',
    v_changed
  );
end;
$function$;

revoke all
on function public.athena_reconcile_intake_handoff_metadata(
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.athena_reconcile_intake_handoff_metadata(
  uuid,
  uuid,
  text,
  text
)
to postgres, service_role;