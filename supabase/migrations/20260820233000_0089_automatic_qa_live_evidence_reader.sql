-- ============================================================================
-- Athena CTO Build 0089
-- Automatic-QA live evidence reader
--
-- Forward-only completion-evidence support for:
-- 0089 Build title: Athena Intake External Build Identity Metadata Namespace
-- Collision Repair
--
-- This function is READ ONLY. It exposes machine-verifiable live database
-- evidence to the existing Athena automatic-QA engine without weakening
-- table privileges or browser-role access.
-- ============================================================================

begin;

create or replace function
  public.athena_read_0089_external_identity_repair_qa_evidence()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_ingest_def text;
  v_reconcile_def text;
  v_intake_metadata jsonb;
  v_package public.athena_intake_preparation_packages%rowtype;
  v_reconciliation_count integer := 0;
  v_transition_count integer := 0;
  v_state_count integer := 0;
  v_future_ingestion_namespace_verified boolean := false;
  v_reconciliation_rpc_installed boolean := false;
  v_service_role_rpc_execute boolean := false;
  v_authenticated_rpc_execute boolean := false;
  v_anon_rpc_execute boolean := false;
  v_direct_service_role_intake_update boolean := true;
  v_append_only_evidence_guard boolean := false;
  v_canonical_state_verified boolean := false;
  v_identity_neutral_external_id_absent boolean := false;
  v_verified boolean := false;
begin
  if to_regprocedure(
    'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)'
  ) is null then
    return jsonb_build_object(
      'verified', false,
      'error', 'canonical conversation ingestion function is missing'
    );
  end if;

  select pg_get_functiondef(
    'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)'::regprocedure
  )
  into v_ingest_def;

  v_future_ingestion_namespace_verified :=
    position('athena_intake_ingestion_provenance' in v_ingest_def) > 0
    and position('originating_athena_build_id' in v_ingest_def) > 0
    and v_ingest_def
      !~ '''build_id''[[:space:]]*,[[:space:]]*''0082''';

  v_reconciliation_rpc_installed :=
    to_regprocedure(
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'
    ) is not null;

  if v_reconciliation_rpc_installed then
    select pg_get_functiondef(
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
    )
    into v_reconcile_def;
  end if;

  v_service_role_rpc_execute :=
    v_reconciliation_rpc_installed
    and has_function_privilege(
      'service_role',
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE'
    );

  v_authenticated_rpc_execute :=
    v_reconciliation_rpc_installed
    and has_function_privilege(
      'authenticated',
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE'
    );

  v_anon_rpc_execute :=
    v_reconciliation_rpc_installed
    and has_function_privilege(
      'anon',
      'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE'
    );

  v_direct_service_role_intake_update :=
    has_table_privilege(
      'service_role',
      'public.athena_intake_items',
      'UPDATE'
    );

  v_append_only_evidence_guard :=
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
    );

  select i.metadata
  into v_intake_metadata
  from public.athena_intake_items i
  where i.id =
      '4efe63a0-6487-46a9-be26-b5b5e28d19ee'::uuid
    and i.project_key = 'beautydna'
    and i.module_key = 'shopify-cart-integration'
    and i.status_key = 'approved'
    and i.title =
      'BDNA-SHOP-0001 BeautyDNA Offline Shopify Catalog Adapter and Launch Product Linkage Foundation';

  select p.*
  into v_package
  from public.athena_intake_preparation_packages p
  where p.id =
      '05d5afc8-0016-48e7-b102-da411788afa5'::uuid
    and p.intake_id =
      '4efe63a0-6487-46a9-be26-b5b5e28d19ee'::uuid;

  if v_intake_metadata is not null then
    select count(*)
    into v_reconciliation_count
    from jsonb_array_elements(
      coalesce(
        v_intake_metadata -> 'external_build_identity_reconciliations',
        '[]'::jsonb
      )
    ) entry
    where entry ->> 'external_build_id' = 'BDNA-SHOP-0001'
      and entry ->> 'preparation_package_id' =
        '05d5afc8-0016-48e7-b102-da411788afa5'
      and entry ->> 'original_overloaded_build_id' = '0082';
  end if;

  select count(*)
  into v_transition_count
  from public.athena_build_lifecycle_transitions t
  where t.build_id = 'BDNA-SHOP-0001'
     or t.intake_id =
       '4efe63a0-6487-46a9-be26-b5b5e28d19ee'::uuid
     or t.preparation_package_id =
       '05d5afc8-0016-48e7-b102-da411788afa5'::uuid;

  select count(*)
  into v_state_count
  from public.athena_build_lifecycle_state s
  where s.build_id = 'BDNA-SHOP-0001'
     or s.intake_id =
       '4efe63a0-6487-46a9-be26-b5b5e28d19ee'::uuid
     or s.preparation_package_id =
       '05d5afc8-0016-48e7-b102-da411788afa5'::uuid;

  select
    nullif(
      btrim(i.metadata ->> 'canonical_external_build_id'),
      ''
    ) is null
  into v_identity_neutral_external_id_absent
  from public.athena_intake_items i
  where i.id =
    'e0be09fe-f3f4-4714-b2dd-c50c615a20ee'::uuid;

  v_canonical_state_verified :=
    v_intake_metadata is not null
    and v_intake_metadata ->> 'build_id' = 'BDNA-SHOP-0001'
    and v_intake_metadata ->> 'canonical_external_build_id' =
      'BDNA-SHOP-0001'
    and v_intake_metadata ->> 'canonical_external_build_title' =
      'BDNA-SHOP-0001 BeautyDNA Offline Shopify Catalog Adapter and Launch Product Linkage Foundation'
    and v_intake_metadata
      -> 'athena_intake_ingestion_provenance'
      ->> 'originating_athena_build_id' = '0082'
    and v_intake_metadata
      -> 'athena_intake_ingestion_provenance'
      ->> 'producer' = 'athena-os-conversation-research'
    and v_reconciliation_count = 1
    and v_package.id is not null
    and v_package.project_key = 'beautydna'
    and v_package.module_key = 'shopify-cart-integration'
    and v_package.proposed_build_id = 'BDNA-SHOP-0001'
    and v_package.proposed_build_title =
      'BDNA-SHOP-0001 BeautyDNA Offline Shopify Catalog Adapter and Launch Product Linkage Foundation'
    and v_transition_count = 0
    and v_state_count = 0;

  v_verified :=
    v_future_ingestion_namespace_verified
    and v_reconciliation_rpc_installed
    and position(
      'athena_build_lifecycle_transitions'
      in coalesce(v_reconcile_def, '')
    ) > 0
    and position(
      'athena_build_lifecycle_state'
      in coalesce(v_reconcile_def, '')
    ) > 0
    and v_service_role_rpc_execute
    and not v_authenticated_rpc_execute
    and not v_anon_rpc_execute
    and not v_direct_service_role_intake_update
    and v_append_only_evidence_guard
    and v_canonical_state_verified
    and coalesce(
      v_identity_neutral_external_id_absent,
      false
    );

  return jsonb_build_object(
    'verified', v_verified,
    'evidence_version', 'athena-0089-automatic-qa-live-evidence-v1',
    'future_ingestion_namespace_verified',
      v_future_ingestion_namespace_verified,
    'reconciliation_rpc_installed',
      v_reconciliation_rpc_installed,
    'service_role_rpc_execute',
      v_service_role_rpc_execute,
    'authenticated_rpc_execute',
      v_authenticated_rpc_execute,
    'anon_rpc_execute',
      v_anon_rpc_execute,
    'direct_service_role_intake_update',
      v_direct_service_role_intake_update,
    'append_only_evidence_guard',
      v_append_only_evidence_guard,
    'canonical_state_verified',
      v_canonical_state_verified,
    'metadata_build_id',
      v_intake_metadata ->> 'build_id',
    'canonical_external_build_id',
      v_intake_metadata ->> 'canonical_external_build_id',
    'preserved_originating_athena_build_id',
      v_intake_metadata
        -> 'athena_intake_ingestion_provenance'
        ->> 'originating_athena_build_id',
    'reconciliation_entry_count',
      v_reconciliation_count,
    'lifecycle_transition_count',
      v_transition_count,
    'lifecycle_state_count',
      v_state_count,
    'identity_neutral_external_id_absent',
      v_identity_neutral_external_id_absent
  );
end;
$function$;

revoke all
on function
  public.athena_read_0089_external_identity_repair_qa_evidence()
from public, anon, authenticated, service_role;

grant execute
on function
  public.athena_read_0089_external_identity_repair_qa_evidence()
to service_role;

comment on function
  public.athena_read_0089_external_identity_repair_qa_evidence()
is
  'Build 0089 read-only automatic-QA evidence reader for the Intake external-build identity metadata namespace collision repair.';

do $verify$
declare
  v_result jsonb;
begin
  if not has_function_privilege(
    'service_role',
    'public.athena_read_0089_external_identity_repair_qa_evidence()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.athena_read_0089_external_identity_repair_qa_evidence()',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.athena_read_0089_external_identity_repair_qa_evidence()',
    'EXECUTE'
  ) then
    raise exception
      'Build 0089 live-evidence reader privileges are incorrect.';
  end if;

  v_result :=
    public.athena_read_0089_external_identity_repair_qa_evidence();

  if coalesce(
    (v_result ->> 'verified')::boolean,
    false
  ) <> true then
    raise exception
      'Build 0089 live-evidence reader did not verify the canonical repaired state.';
  end if;
end;
$verify$;

commit;
