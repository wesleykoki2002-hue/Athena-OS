-- ============================================================================
-- Athena CTO Build 0089
-- Reproducible transactional validation after permanent reconciliation
-- Database: Athena OS / CTO
-- Project ref: voiwlcvfahykdldtjeqy
-- Persistent writes: NONE
-- ============================================================================

create temporary table if not exists
  athena_0089_transactional_validation_result_temp (
    payload jsonb not null
  );

truncate table athena_0089_transactional_validation_result_temp;

do $validation$
declare
  v_intake_id constant uuid :=
    '4efe63a0-6487-46a9-be26-b5b5e28d19ee'::uuid;
  v_package_id constant uuid :=
    '05d5afc8-0016-48e7-b102-da411788afa5'::uuid;
  v_identity_neutral_intake_id constant uuid :=
    'e0be09fe-f3f4-4714-b2dd-c50c615a20ee'::uuid;
  v_external_build_id constant text := 'BDNA-SHOP-0001';
  v_external_build_title constant text :=
    'BDNA-SHOP-0001 BeautyDNA Offline Shopify Catalog Adapter and Launch Product Linkage Foundation';

  v_canonical_metadata jsonb;
  v_after_idempotent_metadata jsonb;
  v_legacy_fixture_metadata jsonb;
  v_repaired_fixture_metadata jsonb;

  v_before_evidence_hash text;
  v_after_evidence_hash text;
  v_before_reconciliation_count integer;
  v_after_reconciliation_count integer;

  v_idempotent_result jsonb;
  v_fixture_result jsonb;

  v_identity_neutral_rejected boolean := false;
  v_fixture_repair_verified boolean := false;
begin
  select metadata
  into strict v_canonical_metadata
  from public.athena_intake_items
  where id = v_intake_id
    and project_key = 'beautydna'
    and module_key = 'shopify-cart-integration'
    and status_key = 'approved'
    and title = v_external_build_title;

  if v_canonical_metadata ->> 'build_id' <> v_external_build_id
     or v_canonical_metadata ->> 'canonical_external_build_id' <> v_external_build_id
     or v_canonical_metadata ->> 'canonical_external_build_title' <> v_external_build_title
     or v_canonical_metadata
          -> 'athena_intake_ingestion_provenance'
          ->> 'originating_athena_build_id' <> '0082'
     or v_canonical_metadata
          -> 'athena_intake_ingestion_provenance'
          ->> 'producer' <> 'athena-os-conversation-research' then
    raise exception
      'Build 0089 canonical post-reconciliation Intake state is invalid.';
  end if;

  if jsonb_typeof(
    v_canonical_metadata -> 'external_build_identity_reconciliations'
  ) <> 'array' then
    raise exception
      'Build 0089 canonical reconciliation evidence array is missing.';
  end if;

  select count(*)
  into v_before_reconciliation_count
  from jsonb_array_elements(
    v_canonical_metadata -> 'external_build_identity_reconciliations'
  ) entry
  where entry ->> 'external_build_id' = v_external_build_id
    and entry ->> 'preparation_package_id' = v_package_id::text
    and entry ->> 'original_overloaded_build_id' = '0082';

  if v_before_reconciliation_count <> 1 then
    raise exception
      'Expected exactly one canonical Build 0089 reconciliation evidence record.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where build_id = v_external_build_id
       or intake_id = v_intake_id
       or preparation_package_id = v_package_id
  ) or exists (
    select 1
    from public.athena_build_lifecycle_state
    where build_id = v_external_build_id
       or intake_id = v_intake_id
       or preparation_package_id = v_package_id
  ) then
    raise exception
      'BDNA-SHOP-0001 must remain pre-lifecycle during Build 0089 validation.';
  end if;

  select md5(
    coalesce(
      string_agg(to_jsonb(e)::text, '|' order by e.id::text),
      ''
    )
  )
  into v_before_evidence_hash
  from public.athena_intake_item_evidence e
  where e.intake_id = v_intake_id;

  v_idempotent_result :=
    public.athena_reconcile_intake_external_build_identity_metadata(
      v_intake_id,
      v_package_id,
      'beautydna',
      'shopify-cart-integration',
      v_external_build_id,
      v_external_build_title,
      'athena-0089-transactional-validation',
      'athena-0089:transactional-validation:idempotent:v2',
      jsonb_build_object(
        'athena_build_id', '0089',
        'validation_only', true,
        'expected_database_mutation', false
      )
    );

  if v_idempotent_result ->> 'status'
       <> 'athena_intake_external_build_identity_metadata_reconciled'
     or coalesce(
       (v_idempotent_result ->> 'idempotent_replay')::boolean,
       false
     ) <> true then
    raise exception
      'Canonical Build 0089 reconciliation did not use the idempotent path.';
  end if;

  select metadata
  into strict v_after_idempotent_metadata
  from public.athena_intake_items
  where id = v_intake_id;

  if v_after_idempotent_metadata
       is distinct from v_canonical_metadata then
    raise exception
      'Idempotent Build 0089 reconciliation unexpectedly mutated Intake metadata.';
  end if;

  begin
    update public.athena_intake_items
    set metadata =
      (
        metadata
          - 'athena_intake_ingestion_provenance'
          - 'external_build_identity_reconciliations'
      )
      || jsonb_build_object('build_id', '0082')
    where id = v_intake_id;

    select metadata
    into strict v_legacy_fixture_metadata
    from public.athena_intake_items
    where id = v_intake_id;

    if v_legacy_fixture_metadata ->> 'build_id' <> '0082'
       or v_legacy_fixture_metadata ? 'athena_intake_ingestion_provenance'
       or v_legacy_fixture_metadata ? 'external_build_identity_reconciliations'
       or v_legacy_fixture_metadata ->> 'canonical_external_build_id'
            <> v_external_build_id
       or v_legacy_fixture_metadata ->> 'canonical_external_build_title'
            <> v_external_build_title then
      raise exception
        'Historical Build 0082 collision fixture could not be reconstructed safely.';
    end if;

    v_fixture_result :=
      public.athena_reconcile_intake_external_build_identity_metadata(
        v_intake_id,
        v_package_id,
        'beautydna',
        'shopify-cart-integration',
        v_external_build_id,
        v_external_build_title,
        'athena-0089-transactional-validation',
        'athena-0089:transactional-validation:legacy-repair:v2',
        jsonb_build_object(
          'athena_build_id', '0089',
          'validation_only', true,
          'historical_fixture', true,
          'rollback_required', true
        )
      );

    if v_fixture_result ->> 'status'
         <> 'athena_intake_external_build_identity_metadata_reconciled'
       or coalesce(
         (v_fixture_result ->> 'idempotent_replay')::boolean,
         true
       ) <> false then
      raise exception
        'Historical Build 0082 collision fixture was not repaired through the mutation path.';
    end if;

    select metadata
    into strict v_repaired_fixture_metadata
    from public.athena_intake_items
    where id = v_intake_id;

    if v_repaired_fixture_metadata ->> 'build_id'
         <> v_external_build_id
       or v_repaired_fixture_metadata
            -> 'athena_intake_ingestion_provenance'
            ->> 'originating_athena_build_id' <> '0082'
       or v_repaired_fixture_metadata
            -> 'athena_intake_ingestion_provenance'
            ->> 'producer' <> 'athena-os-conversation-research'
       or jsonb_typeof(
         v_repaired_fixture_metadata
           -> 'external_build_identity_reconciliations'
       ) <> 'array' then
      raise exception
        'Historical Build 0082 collision fixture repair did not restore canonical identity and provenance.';
    end if;

    v_fixture_repair_verified := true;

    raise exception using
      errcode = 'A8902',
      message = 'ATHENA_0089_ROLLBACK_LEGACY_FIXTURE';

  exception
    when sqlstate 'A8902' then
      null;
  end;

  if not v_fixture_repair_verified then
    raise exception
      'Historical Build 0082 correction path was not verified.';
  end if;

  select metadata
  into strict v_after_idempotent_metadata
  from public.athena_intake_items
  where id = v_intake_id;

  if v_after_idempotent_metadata
       is distinct from v_canonical_metadata then
    raise exception
      'Rollback of the historical collision fixture did not restore canonical metadata.';
  end if;

  begin
    perform
      public.athena_reconcile_intake_external_build_identity_metadata(
        v_identity_neutral_intake_id,
        v_package_id,
        'beautydna',
        'shopify-cart-integration',
        v_external_build_id,
        v_external_build_title,
        'athena-0089-transactional-validation',
        'athena-0089:transactional-validation:identity-neutral-reject:v2',
        jsonb_build_object(
          'athena_build_id', '0089',
          'validation_only', true,
          'expected_rejection', true
        )
      );

    raise exception
      'Identity-neutral predecessor Intake was incorrectly accepted.';

  exception
    when others then
      if sqlerrm =
        'Identity-neutral predecessor Intake was incorrectly accepted.' then
        raise;
      end if;

      v_identity_neutral_rejected := true;
  end;

  if not v_identity_neutral_rejected then
    raise exception
      'Identity-neutral predecessor rejection was not verified.';
  end if;

  select md5(
    coalesce(
      string_agg(to_jsonb(e)::text, '|' order by e.id::text),
      ''
    )
  )
  into v_after_evidence_hash
  from public.athena_intake_item_evidence e
  where e.intake_id = v_intake_id;

  if v_after_evidence_hash
       is distinct from v_before_evidence_hash then
    raise exception
      'Append-only Intake source evidence changed during Build 0089 transactional validation.';
  end if;

  select count(*)
  into v_after_reconciliation_count
  from jsonb_array_elements(
    (
      select metadata
      from public.athena_intake_items
      where id = v_intake_id
    ) -> 'external_build_identity_reconciliations'
  ) entry
  where entry ->> 'external_build_id' = v_external_build_id
    and entry ->> 'preparation_package_id' = v_package_id::text
    and entry ->> 'original_overloaded_build_id' = '0082';

  if v_after_reconciliation_count
       <> v_before_reconciliation_count then
    raise exception
      'Transactional validation changed canonical reconciliation evidence.';
  end if;

  if has_table_privilege(
    'service_role',
    'public.athena_intake_items',
    'UPDATE'
  ) then
    raise exception
      'Direct service_role Intake UPDATE unexpectedly became available.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'Build 0089 reconciliation RPC execution privileges are incorrect.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where build_id = v_external_build_id
       or intake_id = v_intake_id
       or preparation_package_id = v_package_id
  ) or exists (
    select 1
    from public.athena_build_lifecycle_state
    where build_id = v_external_build_id
       or intake_id = v_intake_id
       or preparation_package_id = v_package_id
  ) then
    raise exception
      'Build 0089 transactional validation unexpectedly created lifecycle evidence.';
  end if;

  insert into pg_temp.athena_0089_transactional_validation_result_temp(
    payload
  )
  values (
    jsonb_build_object(
      'status', 'athena_0089_transactional_validation_pass',
      'passed', true,
      'canonical_post_reconciliation_state_verified', true,
      'idempotent_replay_verified', true,
      'historical_collision_repair_path_verified', true,
      'historical_fixture_rolled_back', true,
      'identity_neutral_rejected', true,
      'append_only_evidence_preserved', true,
      'canonical_reconciliation_evidence_preserved', true,
      'direct_service_role_update_denied', true,
      'service_role_rpc_execute', true,
      'browser_role_rpc_execute', false,
      'lifecycle_mutations', false,
      'persistent_validation_writes', false
    )
  );
end;
$validation$;

select payload
as athena_0089_transactional_validation
from pg_temp.athena_0089_transactional_validation_result_temp;
