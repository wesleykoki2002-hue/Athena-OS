-- Build 0085 automatic QA
-- Gate evidence service_role privilege repair regression test
-- This test is read-only and rolls back its transaction.

begin;

do $test$
declare
  v_bad_privileges text[];
  v_bad_direct_grants text[];
  v_bad_rls text[];
  v_bad_triggers text[];
  v_service_role_bypasses_rls boolean;
begin
  select rolbypassrls
  into v_service_role_bypasses_rls
  from pg_catalog.pg_roles
  where rolname = 'service_role';

  if v_service_role_bypasses_rls is distinct from true then
    raise exception
      'Build 0085 privilege QA failed: service_role bypass-RLS property was not verified.';
  end if;

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
      'Build 0085 privilege QA failed: RLS is not enabled on: %',
      array_to_string(v_bad_rls, ', ');
  end if;

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
    where not has_table_privilege('service_role', target.table_name, 'SELECT')

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

    select table_name || ':browser_role_privilege_present'
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
       or has_table_privilege(
         'authenticated',
         target.table_name,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       )
  ) as failures;

  if cardinality(v_bad_privileges) > 0 then
    raise exception
      'Build 0085 privilege QA failed: effective privilege mismatch: %',
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
      'Build 0085 privilege QA failed: direct service_role write grants remain: %',
      array_to_string(v_bad_direct_grants, ', ');
  end if;

  select coalesce(array_agg(required.trigger_name order by required.trigger_name), '{}'::text[])
  into v_bad_triggers
  from (
    values
      (
        'public.athena_pre_build_gate_evaluations',
        'athena_pre_build_gate_evaluations_append_only'
      ),
      (
        'public.athena_pre_build_gate_candidate_matches',
        'athena_pre_build_gate_candidates_append_only'
      ),
      (
        'public.athena_pre_build_gate_overrides',
        'athena_pre_build_gate_overrides_append_only'
      ),
      (
        'public.athena_build_lifecycle_transitions',
        'athena_build_lifecycle_transitions_require_pre_build_gate'
      )
  ) as required(table_name, trigger_name)
  where not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = to_regclass(required.table_name)
      and trigger_row.tgname = required.trigger_name
      and trigger_row.tgenabled = 'O'
      and not trigger_row.tgisinternal
  );

  if cardinality(v_bad_triggers) > 0 then
    raise exception
      'Build 0085 privilege QA failed: required enabled triggers are missing: %',
      array_to_string(v_bad_triggers, ', ');
  end if;
end;
$test$;

rollback;
