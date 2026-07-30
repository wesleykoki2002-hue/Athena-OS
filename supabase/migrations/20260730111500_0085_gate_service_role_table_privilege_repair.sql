-- Build 0085 corrective migration
-- Gate evidence table privilege repair
-- Canonical owner: athena-cto / cross-project-reuse-detector
--
-- The original Build 0085 migration created the correct RLS and append-only
-- triggers, but Supabase's existing/default service_role table grants remained.
-- service_role bypasses RLS, so direct write privileges must be removed.
--
-- This migration changes privileges only. It does not modify gate evidence rows,
-- lifecycle rows, timers, QA, completion records, build logs, registries, or
-- planning values.

begin;

do $repair$
declare
  v_missing_tables text[];
  v_before_evaluations bigint;
  v_before_candidates bigint;
  v_before_overrides bigint;
  v_after_evaluations bigint;
  v_after_candidates bigint;
  v_after_overrides bigint;
  v_bad_rls text[];
  v_bad_privileges text[];
  v_bad_direct_grants text[];
begin
  select coalesce(array_agg(name order by name), '{}'::text[])
  into v_missing_tables
  from (
    values
      ('public.athena_pre_build_gate_evaluations'),
      ('public.athena_pre_build_gate_candidate_matches'),
      ('public.athena_pre_build_gate_overrides')
  ) as required(name)
  where to_regclass(required.name) is null;

  if cardinality(v_missing_tables) > 0 then
    raise exception
      'Build 0085 privilege repair failed: required gate tables are missing: %',
      array_to_string(v_missing_tables, ', ');
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
  ) then
    raise exception
      'Build 0085 privilege repair failed: service_role is missing.';
  end if;

  select count(*)
  into v_before_evaluations
  from public.athena_pre_build_gate_evaluations;

  select count(*)
  into v_before_candidates
  from public.athena_pre_build_gate_candidate_matches;

  select count(*)
  into v_before_overrides
  from public.athena_pre_build_gate_overrides;

  select coalesce(
    array_agg(namespace.nspname || '.' || relation.relname order by relation.relname),
    '{}'::text[]
  )
  into v_bad_rls
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'athena_pre_build_gate_evaluations',
      'athena_pre_build_gate_candidate_matches',
      'athena_pre_build_gate_overrides'
    )
    and relation.relrowsecurity is not true;

  if cardinality(v_bad_rls) > 0 then
    raise exception
      'Build 0085 privilege repair failed: RLS is not enabled on: %',
      array_to_string(v_bad_rls, ', ');
  end if;

  revoke all
  on table
    public.athena_pre_build_gate_evaluations,
    public.athena_pre_build_gate_candidate_matches,
    public.athena_pre_build_gate_overrides
  from public, anon, authenticated, service_role;

  grant select
  on table
    public.athena_pre_build_gate_evaluations,
    public.athena_pre_build_gate_candidate_matches,
    public.athena_pre_build_gate_overrides
  to service_role;

  select coalesce(array_agg(failure order by failure), '{}'::text[])
  into v_bad_privileges
  from (
    select table_name || ':service_role_select_missing' as failure
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where not has_table_privilege(
      'service_role',
      target.table_name,
      'SELECT'
    )

    union all

    select table_name || ':service_role_insert_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege('service_role', target.table_name, 'INSERT')

    union all

    select table_name || ':service_role_update_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege('service_role', target.table_name, 'UPDATE')

    union all

    select table_name || ':service_role_delete_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege('service_role', target.table_name, 'DELETE')

    union all

    select table_name || ':service_role_truncate_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege('service_role', target.table_name, 'TRUNCATE')

    union all

    select table_name || ':service_role_references_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege('service_role', target.table_name, 'REFERENCES')

    union all

    select table_name || ':service_role_trigger_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege('service_role', target.table_name, 'TRIGGER')

    union all

    select table_name || ':anon_privilege_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege(
      'anon',
      target.table_name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )

    union all

    select table_name || ':authenticated_privilege_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where has_table_privilege(
      'authenticated',
      target.table_name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) as failures;

  if cardinality(v_bad_privileges) > 0 then
    raise exception
      'Build 0085 privilege repair failed: effective privilege mismatch: %',
      array_to_string(v_bad_privileges, ', ');
  end if;

  select coalesce(
    array_agg(
      grants.table_name || ':' || grants.privilege_type
      order by grants.table_name, grants.privilege_type
    ),
    '{}'::text[]
  )
  into v_bad_direct_grants
  from information_schema.role_table_grants as grants
  where grants.table_schema = 'public'
    and grants.table_name in (
      'athena_pre_build_gate_evaluations',
      'athena_pre_build_gate_candidate_matches',
      'athena_pre_build_gate_overrides'
    )
    and grants.grantee = 'service_role'
    and grants.privilege_type <> 'SELECT';

  if cardinality(v_bad_direct_grants) > 0 then
    raise exception
      'Build 0085 privilege repair failed: direct service_role write grants remain: %',
      array_to_string(v_bad_direct_grants, ', ');
  end if;

  select count(*)
  into v_after_evaluations
  from public.athena_pre_build_gate_evaluations;

  select count(*)
  into v_after_candidates
  from public.athena_pre_build_gate_candidate_matches;

  select count(*)
  into v_after_overrides
  from public.athena_pre_build_gate_overrides;

  if v_after_evaluations <> v_before_evaluations
     or v_after_candidates <> v_before_candidates
     or v_after_overrides <> v_before_overrides then
    raise exception
      'Build 0085 privilege repair failed: gate row counts changed. evaluations %->%, candidates %->%, overrides %->%',
      v_before_evaluations,
      v_after_evaluations,
      v_before_candidates,
      v_after_candidates,
      v_before_overrides,
      v_after_overrides;
  end if;
end;
$repair$;

comment on table public.athena_pre_build_gate_evaluations is
  'Append-only Build 0085 pre-build gate evaluation evidence. service_role has SELECT only; controlled SECURITY DEFINER RPCs own writes.';

comment on table public.athena_pre_build_gate_candidate_matches is
  'Append-only Build 0085 candidate-match evidence. service_role has SELECT only; controlled SECURITY DEFINER RPCs own writes.';

comment on table public.athena_pre_build_gate_overrides is
  'Append-only Build 0085 governed override evidence. service_role has SELECT only; controlled SECURITY DEFINER RPCs own writes.';

commit;
