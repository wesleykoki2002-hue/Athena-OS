-- Athena CTO canonical build lifecycle automatic QA draft
-- NOT AUTHORIZED FOR LIVE EXECUTION.
-- This script performs structural verification only until a separate runtime
-- QA authorization supplies an approved non-control-plane preparation package.

with expected_function as (
  select to_regprocedure(
    'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
  ) as oid
), checks as (
  select 'state_relation_exists'::text as check_key,
         to_regclass('public.athena_build_lifecycle_state') is not null as passed,
         jsonb_build_object('relation', 'public.athena_build_lifecycle_state') as evidence
  union all
  select 'transition_relation_exists',
         to_regclass('public.athena_build_lifecycle_transitions') is not null,
         jsonb_build_object('relation', 'public.athena_build_lifecycle_transitions')
  union all
  select 'rpc_exists',
         expected_function.oid is not null,
         jsonb_build_object('rpc', expected_function.oid::text)
  from expected_function
  union all
  select 'rpc_security_definer',
         coalesce(proc.prosecdef, false),
         jsonb_build_object('security_definer', proc.prosecdef)
  from expected_function
  left join pg_proc as proc on proc.oid = expected_function.oid
  union all
  select 'rpc_safe_search_path',
         coalesce(
           array_to_string(proc.proconfig, ',')
             like '%search_path=pg_catalog, public, extensions%',
           false
         ),
         jsonb_build_object(
           'proconfig', proc.proconfig,
           'definition_md5', md5(pg_get_functiondef(expected_function.oid))
         )
  from expected_function
  left join pg_proc as proc on proc.oid = expected_function.oid
  union all
  select 'anon_cannot_execute',
         not coalesce(
           has_function_privilege('anon', expected_function.oid, 'EXECUTE'),
           true
         ),
         jsonb_build_object(
           'anon_execute',
           has_function_privilege('anon', expected_function.oid, 'EXECUTE')
         )
  from expected_function
  union all
  select 'authenticated_cannot_execute',
         not coalesce(
           has_function_privilege(
             'authenticated',
             expected_function.oid,
             'EXECUTE'
           ),
           true
         ),
         jsonb_build_object(
           'authenticated_execute',
           has_function_privilege(
             'authenticated',
             expected_function.oid,
             'EXECUTE'
           )
         )
  from expected_function
  union all
  select 'service_role_can_execute',
         coalesce(
           has_function_privilege(
             'service_role',
             expected_function.oid,
             'EXECUTE'
           ),
           false
         ),
         jsonb_build_object(
           'service_role_execute',
           has_function_privilege(
             'service_role',
             expected_function.oid,
             'EXECUTE'
           )
         )
  from expected_function
  union all
  select 'transition_append_only_trigger',
         count(*) = 1,
         jsonb_build_object('trigger_count', count(*))
  from information_schema.triggers
  where event_object_schema = 'public'
    and event_object_table = 'athena_build_lifecycle_transitions'
    and trigger_name = 'athena_build_lifecycle_transitions_append_only'
  union all
  select 'state_updated_at_trigger',
         count(*) = 1,
         jsonb_build_object('trigger_count', count(*))
  from information_schema.triggers
  where event_object_schema = 'public'
    and event_object_table = 'athena_build_lifecycle_state'
    and trigger_name = 'athena_build_lifecycle_state_updated_at'
  union all
  select 'required_unique_constraints',
         count(*) = 4,
         jsonb_build_object(
           'unique_constraint_count', count(*),
           'constraint_names', jsonb_agg(conname order by conname)
         )
  from pg_constraint
  where conrelid = to_regclass(
          'public.athena_build_lifecycle_transitions'
        )
    and contype = 'u'
    and conname in (
      'athena_build_lifecycle_transitions_operation_key',
      'athena_build_lifecycle_transitions_build_id',
      'athena_build_lifecycle_transitions_intake',
      'athena_build_lifecycle_transitions_package'
    )
  union all
  select 'no_open_timer',
         count(*) = 0,
         jsonb_build_object('open_timer_count', count(*))
  from public.athena_build_timer_sessions
  where status in ('active', 'paused', 'idle')
)
select jsonb_pretty(
  jsonb_build_object(
    'status',
      case when bool_and(passed)
        then 'structural_automatic_qa_pass'
        else 'structural_automatic_qa_fail'
      end,
    'all_checks_passed', bool_and(passed),
    'check_count', count(*),
    'checks', jsonb_agg(
      jsonb_build_object(
        'check_key', check_key,
        'passed', passed,
        'evidence', evidence
      ) order by check_key
    ),
    'read_only', true,
    'runtime_assignment_fixture_executed', false,
    'runtime_assignment_fixture_blocked_reason',
      'A separate live-runtime QA authorization and an approved non-control-plane preparation package are required.',
    'build_0085_assigned_or_started', false
  )
) as canonical_build_lifecycle_structural_qa
from checks;
