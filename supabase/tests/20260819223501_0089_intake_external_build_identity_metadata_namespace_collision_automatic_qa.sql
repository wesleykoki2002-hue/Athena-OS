-- ============================================================================
-- Athena CTO Build 0089
-- Automatic structural QA
-- READ ONLY
-- ============================================================================

with function_defs as (
  select
    pg_get_functiondef(
      'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)'::regprocedure
    ) as ingest_def,
    pg_get_functiondef(
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
    ) as reconcile_def,
    pg_get_functiondef(
      'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
    ) as gate_def
),
checks as (
  select
    'future_ingestion_generic_0082_build_id_removed'::text as check_key,
    ingest_def !~ '''build_id''[[:space:]]*,[[:space:]]*''0082'''
      and position('athena_intake_ingestion_provenance' in ingest_def) > 0
      and position('originating_athena_build_id' in ingest_def) > 0
      as passed,
    jsonb_build_object(
      'function', 'public.ingest_athena_intake_conversation_candidate',
      'namespaced_key', 'athena_intake_ingestion_provenance'
    ) as evidence
  from function_defs

  union all

  select
    'reconciliation_rpc_security_boundary',
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid =
          'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
        and p.prosecdef
        and 'search_path=pg_catalog, public' = any(coalesce(p.proconfig, '{}'::text[]))
    )
    and has_function_privilege(
      'service_role',
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE'
    ),
    jsonb_build_object(
      'function', 'public.athena_reconcile_intake_external_build_identity_metadata',
      'service_role_execute', true,
      'browser_role_execute', false
    )
  from function_defs

  union all

  select
    'direct_intake_update_still_denied',
    not has_table_privilege(
      'service_role',
      'public.athena_intake_items',
      'UPDATE'
    ),
    jsonb_build_object(
      'table', 'public.athena_intake_items',
      'role', 'service_role',
      'update_expected', false
    )
  from function_defs

  union all

  select
    'reconciliation_requires_zero_lifecycle_and_exact_identity',
    position('athena_build_lifecycle_transitions' in reconcile_def) > 0
      and position('athena_build_lifecycle_state' in reconcile_def) > 0
      and position('canonical_external_build_id' in reconcile_def) > 0
      and position('canonical_external_build_title' in reconcile_def) > 0
      and position('proposed_build_id' in reconcile_def) > 0
      and position('proposed_build_title' in reconcile_def) > 0,
    jsonb_build_object(
      'function', 'public.athena_reconcile_intake_external_build_identity_metadata'
    )
  from function_defs

  union all

  select
    'external_gate_fail_closed_contract_preserved',
    position('v_intake.metadata ->> ''build_id''' in gate_def) > 0
      and position('v_package.metadata ->> ''build_id''' in gate_def) > 0
      and position('Approved external project build identity is invalid.' in gate_def) > 0,
    jsonb_build_object(
      'function', 'public.athena_pre_build_gate_preview',
      'gate_modified_by_0089', false
    )
  from function_defs

  union all

  select
    'append_only_source_evidence_guard_preserved',
    exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'athena_intake_item_evidence'
        and t.tgname = 'trg_prevent_athena_intake_item_evidence_mutation'
        and not t.tgisinternal
    )
    and not has_table_privilege(
      'service_role',
      'public.athena_intake_item_evidence',
      'UPDATE'
    )
    and not has_table_privilege(
      'service_role',
      'public.athena_intake_item_evidence',
      'DELETE'
    ),
    jsonb_build_object(
      'table', 'public.athena_intake_item_evidence',
      'append_only', true
    )
  from function_defs

  union all

  select
    'bdna_shop_0001_still_pre_lifecycle',
    not exists (
      select 1
      from public.athena_build_lifecycle_transitions t
      where t.build_id = 'BDNA-SHOP-0001'
         or t.intake_id =
           '4efe63a0-6487-46a9-be26-b5b5e28d19ee'::uuid
         or t.preparation_package_id =
           '05d5afc8-0016-48e7-b102-da411788afa5'::uuid
    ),
    jsonb_build_object(
      'build_id', 'BDNA-SHOP-0001',
      'expected_transition_count', 0
    )
  from function_defs
)
select jsonb_build_object(
  'status',
  case when bool_and(passed)
    then 'athena_0089_structural_automatic_qa_pass'
    else 'athena_0089_structural_automatic_qa_fail'
  end,
  'passed',
  bool_and(passed),
  'checks',
  jsonb_agg(
    jsonb_build_object(
      'check_key', check_key,
      'passed', passed,
      'evidence', evidence
    )
    order by check_key
  )
) as athena_0089_structural_automatic_qa
from checks;
