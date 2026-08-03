-- Automatic structural QA for the zero-build external project identity repair.
with checks as (
  select
    'state_build_number_nullable'::text as check_key,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'athena_build_lifecycle_state'
        and column_name = 'build_number'
        and is_nullable = 'YES'
    ) as passed,
    jsonb_build_object(
      'table', 'public.athena_build_lifecycle_state',
      'column', 'build_number'
    ) as evidence

  union all

  select
    'transition_build_number_nullable',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'athena_build_lifecycle_transitions'
        and column_name = 'build_number'
        and is_nullable = 'YES'
    ),
    jsonb_build_object(
      'table', 'public.athena_build_lifecycle_transitions',
      'column', 'build_number'
    )

  union all

  select
    'conditional_identity_constraints_present',
    (
      select count(*) = 8
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname in (
          'athena_build_lifecycle_state',
          'athena_build_lifecycle_transitions'
        )
        and c.conname in (
          'athena_build_lifecycle_state_build_number_range',
          'athena_build_lifecycle_state_build_id_format',
          'athena_build_lifecycle_state_build_identity_match',
          'athena_build_lifecycle_state_title_format',
          'athena_build_lifecycle_transitions_build_number_range',
          'athena_build_lifecycle_transitions_build_id_format',
          'athena_build_lifecycle_transitions_build_identity_match',
          'athena_build_lifecycle_transitions_title_format'
        )
        and pg_get_constraintdef(c.oid, true) like '%build_number is null%'
    ),
    jsonb_build_object(
      'expected_constraint_count', 8
    )

  union all

  select
    'package_identity_guards_present',
    to_regprocedure(
      'public.enforce_athena_build_lifecycle_package_identity()'
    ) is not null
    and exists (
      select 1
      from pg_trigger t
      join pg_class r on r.oid = t.tgrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = 'athena_build_lifecycle_state'
        and t.tgname = 'athena_build_lifecycle_state_identity_guard'
        and not t.tgisinternal
    )
    and exists (
      select 1
      from pg_trigger t
      join pg_class r on r.oid = t.tgrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = 'athena_build_lifecycle_transitions'
        and t.tgname = 'athena_build_lifecycle_transitions_identity_guard'
        and not t.tgisinternal
    )
    and position(
      'v_intake.title is distinct from'
      in pg_get_functiondef(
        'public.enforce_athena_build_lifecycle_package_identity()'::regprocedure
      )
    ) > 0
    and position(
      'zero_build_id_control_plane_repair'
      in pg_get_functiondef(
        'public.enforce_athena_build_lifecycle_package_identity()'::regprocedure
      )
    ) > 0,
    jsonb_build_object(
      'state_trigger', 'athena_build_lifecycle_state_identity_guard',
      'transition_trigger', 'athena_build_lifecycle_transitions_identity_guard'
    )

  union all

  select
    'assign_function_external_mode_present',
    position(
      'canonical_external_project_identity'
      in pg_get_functiondef(
        'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    ) > 0
    and position(
      'numeric_sequence_candidate_id'
      in pg_get_functiondef(
        'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    ) > 0
    and position(
      'target_supabase_project_verified'
      in pg_get_functiondef(
        'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    ) > 0,
    jsonb_build_object(
      'function', 'public.athena_build_lifecycle_assign_and_start'
    )

  union all

  select
    'preview_target_evidence_present',
    position(
      'target_supabase_project_verified'
      in pg_get_functiondef(
        'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    ) > 0
    and position(
      'canonical_build_id'
      in pg_get_functiondef(
        'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    ) > 0,
    jsonb_build_object(
      'function', 'public.athena_pre_build_gate_preview'
    )

  union all

  select
    'historical_numeric_rows_remain_valid',
    not exists (
      select 1
      from public.athena_build_lifecycle_transitions t
      where t.build_number is not null
        and (
          t.build_number not between 1 and 9999
          or t.build_id <> lpad(t.build_number::text, 4, '0')
          or t.build_title not like t.build_id || ' Build title: %'
        )
    ),
    jsonb_build_object(
      'numeric_transition_count', (
        select count(*)
        from public.athena_build_lifecycle_transitions
        where build_number is not null
      )
    )

  union all

  select
    'build_0088_unassigned',
    not exists (
      select 1
      from public.athena_build_lifecycle_transitions
      where build_id = '0088'
         or build_number = 88
    )
    and not exists (
      select 1
      from public.athena_intake_preparation_packages
      where proposed_build_id = '0088'
         or metadata ->> 'assigned_build_id' = '0088'
         or metadata ->> 'build_start_id' = '0088'
    ),
    jsonb_build_object(
      'expected_next_numeric_build', '0088'
    )

  union all

  select
    'bdna_identity_preserved_unstarted',
    exists (
      select 1
      from public.athena_intake_preparation_packages p
      where p.id = '2f808b82-b10d-4dc7-9ebe-56b9d45be60b'::uuid
        and p.proposed_build_id = 'BDNA-ING-0004'
        and p.proposed_build_title =
          'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing'
    )
    and not exists (
      select 1
      from public.athena_build_lifecycle_transitions t
      where t.intake_id = '975cb885-3303-4b54-9cee-e046847591ff'::uuid
         or t.preparation_package_id =
           '2f808b82-b10d-4dc7-9ebe-56b9d45be60b'::uuid
    ),
    jsonb_build_object(
      'build_id', 'BDNA-ING-0004',
      'started', false
    )
)
select jsonb_build_object(
  'status', case when bool_and(passed)
    then 'zero_build_external_project_identity_automatic_qa_pass'
    else 'zero_build_external_project_identity_automatic_qa_fail'
  end,
  'passed', bool_and(passed),
  'checks', jsonb_agg(
    jsonb_build_object(
      'check_key', check_key,
      'passed', passed,
      'evidence', evidence
    )
    order by check_key
  )
) as zero_build_external_project_identity_automatic_qa
from checks;
