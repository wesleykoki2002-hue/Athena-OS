-- ============================================================================
-- Athena CTO Build 0089
-- Athena Intake External Build Identity Metadata Namespace Collision Repair
--
-- Canonical ownership:
--   project_key: athena-cto
--   module_key:  project-memory
--
-- Forward-only repair:
-- 1. Replaces public.ingest_athena_intake_conversation_candidate without
--    editing the applied Build 0082 migration.
-- 2. Future conversation-ingestion provenance is stored under the explicit
--    metadata.athena_intake_ingestion_provenance namespace instead of the
--    generic metadata.build_id key.
-- 3. Adds a narrow SECURITY DEFINER pre-lifecycle reconciliation RPC for
--    already-approved external-project Intakes affected by the Build 0082
--    provenance collision.
-- 4. Preserves existing external lifecycle gate semantics. The gate continues
--    to treat a non-empty metadata.build_id as canonical external-build
--    identity evidence and therefore remains fail-closed on contradictions.
-- 5. Does not rewrite append-only source evidence or historical migrations.
-- ============================================================================

begin;

do $preflight$
declare
  v_ingest_def text;
  v_gate_def text;
begin
  if to_regclass('public.athena_intake_items') is null
     or to_regclass('public.athena_intake_preparation_packages') is null
     or to_regclass('public.athena_intake_item_evidence') is null
     or to_regclass('public.athena_build_lifecycle_transitions') is null
     or to_regclass('public.athena_build_lifecycle_state') is null then
    raise exception
      'Build 0089 prerequisites are missing. Namespace-collision repair aborted.';
  end if;

  if to_regprocedure(
    'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)'
  ) is null then
    raise exception
      'Build 0089 requires the canonical conversation-ingestion function.';
  end if;

  if to_regprocedure(
    'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      'Build 0089 requires the canonical external-project pre-build gate.';
  end if;

  select pg_get_functiondef(
    'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)'::regprocedure
  )
  into v_ingest_def;

  if (
    v_ingest_def ~ '''build_id''[[:space:]]*,[[:space:]]*''0082'''
    and position('athena_intake_ingestion_provenance' in v_ingest_def) = 0
  ) then
    null; -- exact pre-0089 collision contract
  elsif (
    v_ingest_def !~ '''build_id''[[:space:]]*,[[:space:]]*''0082'''
    and position('athena_intake_ingestion_provenance' in v_ingest_def) > 0
    and position('originating_athena_build_id' in v_ingest_def) > 0
  ) then
    null; -- idempotent replay of the same repaired contract
  else
    raise exception
      'Conversation-ingestion source matches neither the pre-0089 nor repaired Build 0089 contract.';
  end if;

  if to_regprocedure(
    'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'
  ) is not null then
    if position(
      'athena_intake_external_build_identity_metadata_reconciled'
      in pg_get_functiondef(
        'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    ) = 0 then
      raise exception
        'An unexpected reconciliation RPC already occupies the Build 0089 signature.';
    end if;
  end if;

  select pg_get_functiondef(
    'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
  )
  into v_gate_def;

  if position('v_intake.metadata ->> ''build_id''' in v_gate_def) = 0
     or position('Approved external project build identity is invalid.' in v_gate_def) = 0 then
    raise exception
      'External-project gate no longer exposes the fail-closed metadata.build_id identity contract.';
  end if;

  if has_table_privilege(
    'service_role',
    'public.athena_intake_items',
    'UPDATE'
  ) then
    raise exception
      'Build 0089 requires direct service_role Intake UPDATE to remain denied.';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'athena_intake_item_evidence'
      and t.tgname = 'trg_prevent_athena_intake_item_evidence_mutation'
      and not t.tgisinternal
  ) then
    raise exception
      'Build 0089 requires the append-only Intake evidence mutation guard.';
  end if;
end;
$preflight$;

-- --------------------------------------------------------------------------
-- A. Forward replacement of Build 0082 conversation ingestion.
-- --------------------------------------------------------------------------

create or replace function
  public.ingest_athena_intake_conversation_candidate(
    target_project_key text,
    target_module_key text,
    target_title text,
    target_description text,
    target_source_type text,
    target_source_reference text,
    target_submitted_by text,
    target_candidate_category text,
    target_extraction_kind text,
    target_extraction_confidence numeric,
    target_evidence_text text,
    target_evidence_locator jsonb,
    target_missing_information text[],
    target_extraction_method text,
    target_extraction_version text,
    target_metadata jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  canonical_project_count integer;
  canonical_module_count integer;
  computed_candidate_fingerprint text;
  computed_source_fingerprint text;
  candidate_intake_id uuid;
  candidate_intake_key text;
  candidate_status_key text;
  evidence_id uuid;
  existing_evidence_intake_id uuid;
  candidate_result text;
  evidence_result text;
  generated_intake_key text;
  normalized_missing_information text[];
  candidate_metadata jsonb;
  evidence_metadata jsonb;
  ingestion_provenance jsonb;
begin
  if nullif(btrim(target_project_key), '') is null then
    raise exception 'Project key is required.';
  end if;

  if nullif(btrim(target_module_key), '') is null then
    raise exception 'Module key is required.';
  end if;

  if nullif(btrim(target_title), '') is null then
    raise exception 'Candidate title is required.';
  end if;

  if nullif(btrim(target_description), '') is null then
    raise exception 'Candidate description is required.';
  end if;

  if nullif(btrim(target_source_type), '') is null then
    raise exception 'Source type is required.';
  end if;

  if nullif(btrim(target_source_reference), '') is null then
    raise exception
      'Source reference is required for conversation-derived intake.';
  end if;

  if nullif(btrim(target_candidate_category), '') is null then
    raise exception 'Candidate category is required.';
  end if;

  if target_candidate_category not in (
    'feature_request',
    'improvement',
    'reusable_system',
    'decision',
    'risk',
    'unresolved_idea',
    'roadmap_candidate',
    'missing_capability',
    'technical_debt',
    'cross_project_reuse',
    'other'
  ) then
    raise exception
      'Unsupported candidate category: %.',
      target_candidate_category;
  end if;

  if target_extraction_kind not in (
    'explicit_request',
    'inferred_suggestion'
  ) then
    raise exception
      'Extraction kind must be explicit_request or inferred_suggestion.';
  end if;

  if target_extraction_confidence is null
     or target_extraction_confidence < 0
     or target_extraction_confidence > 1 then
    raise exception
      'Extraction confidence must be between 0 and 1.';
  end if;

  if nullif(btrim(target_evidence_text), '') is null then
    raise exception 'Supporting evidence text is required.';
  end if;

  if nullif(btrim(target_extraction_method), '') is null then
    raise exception 'Extraction method is required.';
  end if;

  if nullif(btrim(target_extraction_version), '') is null then
    raise exception 'Extraction version is required.';
  end if;

  if target_evidence_locator is not null
     and jsonb_typeof(target_evidence_locator) <> 'object' then
    raise exception 'Evidence locator must be a JSON object.';
  end if;

  if target_metadata is not null
     and jsonb_typeof(target_metadata) <> 'object' then
    raise exception 'Candidate metadata must be a JSON object.';
  end if;

  select count(*)
  into canonical_project_count
  from public.athena_projects
  where project_key = btrim(target_project_key);

  if canonical_project_count <> 1 then
    raise exception
      'Unknown or non-unique canonical project key: %.',
      target_project_key;
  end if;

  select count(*)
  into canonical_module_count
  from public.athena_project_modules
  where project_key = btrim(target_project_key)
    and module_key = btrim(target_module_key);

  if canonical_module_count <> 1 then
    raise exception
      'Unknown or non-unique canonical module % for project %.',
      target_module_key,
      target_project_key;
  end if;

  if not exists (
    select 1
    from public.athena_intake_statuses
    where status_key = 'pending_review'
      and is_initial
      and is_active
      and not allows_preparation
      and not is_terminal
  ) then
    raise exception
      'The required pending_review initial status is not configured.';
  end if;

  select coalesce(
    array_agg(btrim(item))
      filter (
        where nullif(btrim(item), '') is not null
      ),
    '{}'::text[]
  )
  into normalized_missing_information
  from unnest(
    coalesce(
      target_missing_information,
      '{}'::text[]
    )
  ) as missing(item);

  computed_candidate_fingerprint := md5(
    lower(btrim(target_project_key))
    || '|'
    || lower(btrim(target_module_key))
    || '|'
    || regexp_replace(
         lower(btrim(target_title)),
         '[[:space:][:punct:]]+',
         ' ',
         'g'
       )
    || '|'
    || regexp_replace(
         lower(btrim(target_description)),
         '[[:space:][:punct:]]+',
         ' ',
         'g'
       )
  );

  computed_source_fingerprint := md5(
    lower(btrim(target_source_type))
    || '|'
    || lower(btrim(target_source_reference))
    || '|'
    || computed_candidate_fingerprint
    || '|'
    || lower(btrim(target_candidate_category))
    || '|'
    || lower(btrim(target_extraction_kind))
    || '|'
    || regexp_replace(
         lower(btrim(target_evidence_text)),
         '[[:space:][:punct:]]+',
         ' ',
         'g'
       )
  );

  ingestion_provenance := jsonb_build_object(
    'schema_version',
    'athena-intake-ingestion-provenance-v1',
    'producer',
    'athena-os-conversation-research',
    'originating_athena_build_id',
    '0082'
  );

  candidate_metadata :=
    coalesce(target_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'created_from',
      'athena-os-conversation-research',
      'athena_intake_ingestion_provenance',
      ingestion_provenance,
      'candidate_category',
      btrim(target_candidate_category),
      'extraction_kind',
      btrim(target_extraction_kind),
      'extraction_confidence',
      target_extraction_confidence,
      'missing_information',
      to_jsonb(normalized_missing_information),
      'extraction_method',
      btrim(target_extraction_method),
      'extraction_version',
      btrim(target_extraction_version),
      'automatic_approval',
      false,
      'automatic_preparation',
      false,
      'automatic_build_creation',
      false
    );

  evidence_metadata :=
    coalesce(target_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'created_from',
      'athena-os-conversation-research',
      'athena_intake_ingestion_provenance',
      ingestion_provenance,
      'candidate_fingerprint',
      computed_candidate_fingerprint
    );

  select id
  into candidate_intake_id
  from public.athena_intake_items
  where duplicate_fingerprint = computed_candidate_fingerprint
  limit 1;

  if candidate_intake_id is null then
    generated_intake_key :=
      'athena-intake-' || gen_random_uuid()::text;

    begin
      select public.create_athena_intake_item(
        generated_intake_key,
        btrim(target_project_key),
        btrim(target_module_key),
        btrim(target_title),
        btrim(target_description),
        btrim(target_source_type),
        btrim(target_source_reference),
        nullif(btrim(target_submitted_by), ''),
        candidate_metadata
      )
      into candidate_intake_id;

      candidate_result := 'inserted';
    exception
      when raise_exception then
        if sqlerrm like
          'Duplicate intake blocked. Existing intake id:%'
        then
          select id
          into candidate_intake_id
          from public.athena_intake_items
          where duplicate_fingerprint = computed_candidate_fingerprint
          limit 1;

          if candidate_intake_id is null then
            raise;
          end if;

          candidate_result := 'duplicate';
        else
          raise;
        end if;
    end;
  else
    candidate_result := 'duplicate';
  end if;

  select
    intake_key,
    status_key
  into
    candidate_intake_key,
    candidate_status_key
  from public.athena_intake_items
  where id = candidate_intake_id;

  if not found then
    raise exception
      'The canonical intake item could not be read after ingestion.';
  end if;

  if candidate_result = 'inserted'
     and candidate_status_key <> 'pending_review' then
    raise exception
      'New conversation-derived intake did not enter pending_review.';
  end if;

  insert into public.athena_intake_item_evidence (
    evidence_key,
    intake_id,
    source_type,
    source_reference,
    evidence_text,
    evidence_locator,
    extraction_kind,
    candidate_category,
    extraction_confidence,
    missing_information,
    extraction_method,
    extraction_version,
    source_fingerprint,
    metadata
  )
  values (
    'athena-intake-evidence-' || computed_source_fingerprint,
    candidate_intake_id,
    btrim(target_source_type),
    btrim(target_source_reference),
    btrim(target_evidence_text),
    coalesce(target_evidence_locator, '{}'::jsonb),
    btrim(target_extraction_kind),
    btrim(target_candidate_category),
    target_extraction_confidence,
    normalized_missing_information,
    btrim(target_extraction_method),
    btrim(target_extraction_version),
    computed_source_fingerprint,
    evidence_metadata
  )
  on conflict (source_fingerprint)
  do nothing
  returning id into evidence_id;

  if evidence_id is null then
    select
      id,
      intake_id
    into
      evidence_id,
      existing_evidence_intake_id
    from public.athena_intake_item_evidence
    where source_fingerprint = computed_source_fingerprint;

    if evidence_id is null then
      raise exception
        'Evidence conflict occurred but the existing evidence could not be read.';
    end if;

    if existing_evidence_intake_id <> candidate_intake_id then
      raise exception
        'Evidence fingerprint resolved to a different intake item.';
    end if;

    evidence_result := 'existing';
  else
    evidence_result := 'inserted';
  end if;

  return jsonb_build_object(
    'candidate_result',
    candidate_result,
    'intake_id',
    candidate_intake_id,
    'intake_key',
    candidate_intake_key,
    'status_key',
    candidate_status_key,
    'candidate_fingerprint',
    computed_candidate_fingerprint,
    'evidence_result',
    evidence_result,
    'evidence_id',
    evidence_id,
    'source_fingerprint',
    computed_source_fingerprint,
    'automatic_approval',
    false,
    'automatic_preparation',
    false,
    'automatic_build_creation',
    false
  );
end;
$function$;

revoke all
on function public.ingest_athena_intake_conversation_candidate(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  jsonb,
  text[],
  text,
  text,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.ingest_athena_intake_conversation_candidate(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  jsonb,
  text[],
  text,
  text,
  jsonb
)
to service_role;

comment on function
  public.ingest_athena_intake_conversation_candidate(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    text,
    jsonb,
    text[],
    text,
    text,
    jsonb
  )
is
  'Build 0089 forward replacement of Build 0082 conversation ingestion. Preserves the original ingestion build as namespaced provenance and never writes Build 0082 provenance into generic metadata.build_id.';

-- --------------------------------------------------------------------------
-- B. Governed pre-lifecycle reconciliation for already-approved affected
--    external-project Intakes.
-- --------------------------------------------------------------------------

create or replace function
  public.athena_reconcile_intake_external_build_identity_metadata(
    p_intake_id uuid,
    p_preparation_package_id uuid,
    p_project_key text,
    p_module_key text,
    p_external_build_id text,
    p_external_build_title text,
    p_operator_key text,
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
  v_after public.athena_intake_items%rowtype;
  v_package public.athena_intake_preparation_packages%rowtype;
  v_external_build_id text;
  v_external_build_title text;
  v_original_build_id text;
  v_existing_provenance jsonb;
  v_existing_reconciliations jsonb;
  v_provenance jsonb;
  v_reconciliation jsonb;
  v_new_metadata jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_intake_id is null
     or p_preparation_package_id is null
     or nullif(btrim(p_project_key), '') is null
     or nullif(btrim(p_module_key), '') is null
     or nullif(btrim(p_external_build_id), '') is null
     or nullif(btrim(p_external_build_title), '') is null
     or nullif(btrim(p_operator_key), '') is null
     or nullif(btrim(p_operation_key), '') is null then
    raise exception
      'Exact Intake, preparation, project/module, external identity, operator, and operation inputs are required.';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'Reconciliation evidence must be a JSON object.';
  end if;

  v_external_build_id := btrim(p_external_build_id);
  v_external_build_title := btrim(p_external_build_title);

  if v_external_build_id ~ '^[0-9]{4}$'
     or v_external_build_id !~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'
     or v_external_build_title not like v_external_build_id || ' %' then
    raise exception 'Canonical external build identity format is invalid.';
  end if;

  if btrim(p_operation_key) !~ '^[a-z0-9][a-z0-9:_-]{15,199}$' then
    raise exception 'Reconciliation operation-key format is invalid.';
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
     or nullif(btrim(v_package.proposed_build_id), '') is null
     or nullif(btrim(v_package.proposed_build_title), '') is null
     or btrim(v_package.proposed_build_id) <> v_external_build_id
     or btrim(v_package.proposed_build_title) <> v_external_build_title
     or v_intake.title <> v_external_build_title then
    raise exception
      'Preparation package and Intake do not prove the exact external build identity.';
  end if;

  if nullif(btrim(v_intake.metadata ->> 'canonical_external_build_id'), '') is null
     or btrim(v_intake.metadata ->> 'canonical_external_build_id')
       <> v_external_build_id
     or nullif(btrim(v_intake.metadata ->> 'canonical_external_build_title'), '') is null
     or btrim(v_intake.metadata ->> 'canonical_external_build_title')
       <> v_external_build_title then
    raise exception
      'The Intake lacks exact canonical external build identity evidence.';
  end if;

  if (
    nullif(btrim(v_package.metadata ->> 'canonical_external_build_id'), '') is not null
    and btrim(v_package.metadata ->> 'canonical_external_build_id')
      <> v_external_build_id
  ) or (
    nullif(btrim(v_package.metadata ->> 'canonical_external_build_title'), '') is not null
    and btrim(v_package.metadata ->> 'canonical_external_build_title')
      <> v_external_build_title
  ) then
    raise exception
      'Preparation metadata contradicts the canonical external build identity.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions t
    where t.intake_id = p_intake_id
       or t.preparation_package_id = p_preparation_package_id
       or t.build_id = v_external_build_id
  ) or exists (
    select 1
    from public.athena_build_lifecycle_state s
    where s.intake_id = p_intake_id
       or s.preparation_package_id = p_preparation_package_id
       or s.build_id = v_external_build_id
  ) then
    raise exception
      'External build identity metadata cannot be reconciled after lifecycle evidence exists.';
  end if;

  v_original_build_id :=
    nullif(btrim(v_intake.metadata ->> 'build_id'), '');

  v_existing_provenance :=
    v_intake.metadata -> 'athena_intake_ingestion_provenance';

  v_existing_reconciliations :=
    v_intake.metadata -> 'external_build_identity_reconciliations';

  if v_original_build_id = v_external_build_id then
    if jsonb_typeof(v_existing_provenance) <> 'object'
       or v_existing_provenance ->> 'originating_athena_build_id' <> '0082'
       or v_existing_provenance ->> 'producer'
          <> 'athena-os-conversation-research'
       or jsonb_typeof(v_existing_reconciliations) <> 'array'
       or not exists (
         select 1
         from jsonb_array_elements(v_existing_reconciliations) entry
         where entry ->> 'external_build_id' = v_external_build_id
           and entry ->> 'preparation_package_id'
             = p_preparation_package_id::text
           and entry ->> 'original_overloaded_build_id' = '0082'
       ) then
      raise exception
        'Intake build identity is already canonical but Build 0089 reconciliation provenance is incomplete.';
    end if;

    return jsonb_build_object(
      'status',
      'athena_intake_external_build_identity_metadata_reconciled',
      'intake_id',
      p_intake_id,
      'preparation_package_id',
      p_preparation_package_id,
      'project_key',
      btrim(p_project_key),
      'module_key',
      btrim(p_module_key),
      'external_build_id',
      v_external_build_id,
      'external_build_title',
      v_external_build_title,
      'originating_athena_build_id',
      '0082',
      'idempotent_replay',
      true,
      'lifecycle_mutations',
      false,
      'timer_mutations',
      false
    );
  end if;

  if v_original_build_id is distinct from '0082' then
    raise exception
      'The Intake is not an eligible Build 0082 metadata.build_id collision.';
  end if;

  if v_intake.metadata ->> 'created_from'
       <> 'athena-os-conversation-research' then
    raise exception
      'The Intake does not carry the required conversation-ingestion provenance.';
  end if;

  if v_existing_provenance is not null then
    if jsonb_typeof(v_existing_provenance) <> 'object'
       or (
         nullif(
           btrim(v_existing_provenance ->> 'originating_athena_build_id'),
           ''
         ) is not null
         and v_existing_provenance ->> 'originating_athena_build_id' <> '0082'
       ) then
      raise exception
        'Existing namespaced ingestion provenance is contradictory.';
    end if;
  end if;

  if v_existing_reconciliations is not null
     and jsonb_typeof(v_existing_reconciliations) <> 'array' then
    raise exception
      'Existing external-build reconciliation evidence is not an array.';
  end if;

  v_provenance := jsonb_build_object(
    'schema_version',
    'athena-intake-ingestion-provenance-v1',
    'producer',
    'athena-os-conversation-research',
    'originating_athena_build_id',
    '0082',
    'preserved_from_overloaded_metadata_key',
    'build_id'
  );

  v_reconciliation := jsonb_build_object(
    'schema_version',
    'athena-intake-external-build-identity-reconciliation-v1',
    'operation_key',
    btrim(p_operation_key),
    'operator_key',
    btrim(p_operator_key),
    'reconciled_at',
    v_now,
    'intake_id',
    p_intake_id,
    'preparation_package_id',
    p_preparation_package_id,
    'project_key',
    btrim(p_project_key),
    'module_key',
    btrim(p_module_key),
    'original_overloaded_build_id',
    '0082',
    'external_build_id',
    v_external_build_id,
    'external_build_title',
    v_external_build_title,
    'evidence',
    p_evidence
  );

  v_new_metadata :=
    jsonb_set(
      v_intake.metadata,
      '{athena_intake_ingestion_provenance}',
      v_provenance,
      true
    );

  v_new_metadata :=
    jsonb_set(
      v_new_metadata,
      '{build_id}',
      to_jsonb(v_external_build_id),
      true
    );

  v_new_metadata :=
    jsonb_set(
      v_new_metadata,
      '{external_build_identity_reconciliations}',
      coalesce(v_existing_reconciliations, '[]'::jsonb)
        || jsonb_build_array(v_reconciliation),
      true
    );

  update public.athena_intake_items
  set metadata = v_new_metadata
  where id = p_intake_id
  returning * into strict v_after;

  if v_after.metadata ->> 'build_id' <> v_external_build_id
     or v_after.metadata -> 'athena_intake_ingestion_provenance'
        is distinct from v_provenance
     or v_after.metadata ->> 'canonical_external_build_id'
        <> v_external_build_id
     or v_after.metadata ->> 'canonical_external_build_title'
        <> v_external_build_title
     or (
       v_after.metadata
         - 'build_id'
         - 'athena_intake_ingestion_provenance'
         - 'external_build_identity_reconciliations'
     ) is distinct from (
       v_intake.metadata
         - 'build_id'
         - 'athena_intake_ingestion_provenance'
         - 'external_build_identity_reconciliations'
     ) then
    raise exception
      'Build 0089 Intake metadata reconciliation read-after-write verification failed.';
  end if;

  return jsonb_build_object(
    'status',
    'athena_intake_external_build_identity_metadata_reconciled',
    'intake_id',
    p_intake_id,
    'preparation_package_id',
    p_preparation_package_id,
    'project_key',
    btrim(p_project_key),
    'module_key',
    btrim(p_module_key),
    'external_build_id',
    v_external_build_id,
    'external_build_title',
    v_external_build_title,
    'originating_athena_build_id',
    '0082',
    'operation_key',
    btrim(p_operation_key),
    'idempotent_replay',
    false,
    'lifecycle_mutations',
    false,
    'timer_mutations',
    false
  );
end;
$function$;

revoke all
on function public.athena_reconcile_intake_external_build_identity_metadata(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.athena_reconcile_intake_external_build_identity_metadata(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
to service_role;

comment on function
  public.athena_reconcile_intake_external_build_identity_metadata(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
is
  'Build 0089 service-role-only pre-lifecycle repair for approved external-project Intakes whose generic metadata.build_id was overwritten by Build 0082 conversation-ingestion provenance. Requires exact canonical Intake/package identity, immutable approval evidence, canonical external build ID/title evidence, zero lifecycle rows, and preserves Build 0082 provenance under a namespaced key.';

-- --------------------------------------------------------------------------
-- C. Read-after-DDL verification.
-- --------------------------------------------------------------------------

do $verification$
declare
  v_ingest_def text;
  v_reconcile_def text;
  v_gate_def text;
begin
  select pg_get_functiondef(
    'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)'::regprocedure
  )
  into v_ingest_def;

  if v_ingest_def ~ '''build_id''[[:space:]]*,[[:space:]]*''0082'''
     or position('athena_intake_ingestion_provenance' in v_ingest_def) = 0
     or position('originating_athena_build_id' in v_ingest_def) = 0 then
    raise exception
      'Build 0089 verification failed: future ingestion still exposes the provenance collision.';
  end if;

  select pg_get_functiondef(
    'public.athena_reconcile_intake_external_build_identity_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
  )
  into v_reconcile_def;

  if position('security definer' in lower(v_reconcile_def)) = 0
     or position('originating_athena_build_id' in v_reconcile_def) = 0
     or position('athena_build_lifecycle_transitions' in v_reconcile_def) = 0
     or position('athena_build_lifecycle_state' in v_reconcile_def) = 0 then
    raise exception
      'Build 0089 verification failed: reconciliation RPC contract is incomplete.';
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
      'Build 0089 verification failed: reconciliation execute privileges are incorrect.';
  end if;

  if has_table_privilege(
    'service_role',
    'public.athena_intake_items',
    'UPDATE'
  ) then
    raise exception
      'Build 0089 verification failed: direct service_role Intake UPDATE became available.';
  end if;

  select pg_get_functiondef(
    'public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
  )
  into v_gate_def;

  if position('v_intake.metadata ->> ''build_id''' in v_gate_def) = 0
     or position('Approved external project build identity is invalid.' in v_gate_def) = 0 then
    raise exception
      'Build 0089 verification failed: external identity gate was weakened.';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'athena_intake_item_evidence'
      and t.tgname = 'trg_prevent_athena_intake_item_evidence_mutation'
      and not t.tgisinternal
  ) then
    raise exception
      'Build 0089 verification failed: append-only Intake evidence guard disappeared.';
  end if;
end;
$verification$;

commit;
