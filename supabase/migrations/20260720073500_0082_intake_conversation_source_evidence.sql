-- Build 0082
-- Athena Intake Conversation Research and Canonical Suggestion Ingestion
--
-- Canonical ownership:
-- project_key: athena-cto
-- module_key: project-memory
--
-- Target:
-- Athena OS application and Athena OS Supabase
--
-- This migration:
-- - reuses public.athena_intake_items as the canonical intake registry
-- - adds append-only source evidence linked to canonical intake items
-- - preserves evidence for inserted and duplicate candidates
-- - keeps protected writes service-role-only
-- - never approves, denies, prepares, creates builds, or changes planning

begin;

do $preflight$
declare
  canonical_project_count integer;
  canonical_module_count integer;
  pending_status_count integer;
begin
  select count(*)
  into canonical_project_count
  from public.athena_projects
  where project_key = 'athena-cto';

  if canonical_project_count <> 1 then
    raise exception
      'Build 0082 requires exactly one canonical athena-cto project. Found %.',
      canonical_project_count;
  end if;

  select count(*)
  into canonical_module_count
  from public.athena_project_modules
  where project_key = 'athena-cto'
    and module_key = 'project-memory';

  if canonical_module_count <> 1 then
    raise exception
      'Build 0082 requires exactly one canonical athena-cto/project-memory module. Found %.',
      canonical_module_count;
  end if;

  if to_regclass('public.athena_intake_items') is null
     or to_regclass('public.athena_intake_statuses') is null
     or to_regclass('public.athena_intake_review_history') is null
     or to_regclass('public.athena_intake_preparation_packages') is null
  then
    raise exception
      'Build 0082 requires the completed ATHENA-INTAKE-0001 foundation.';
  end if;

  if to_regprocedure(
    'public.create_athena_intake_item(text,text,text,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      'Build 0082 requires public.create_athena_intake_item.';
  end if;

  select count(*)
  into pending_status_count
  from public.athena_intake_statuses
  where status_key = 'pending_review'
    and is_initial
    and is_active
    and not allows_preparation
    and not is_terminal;

  if pending_status_count <> 1 then
    raise exception
      'Build 0082 requires pending_review to be the active initial non-preparation status.';
  end if;

  if to_regclass('public.athena_intake_item_evidence') is not null then
    raise exception
      'Build 0082 stopped because public.athena_intake_item_evidence already exists.';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'ingest_athena_intake_conversation_candidate',
        'prevent_athena_intake_item_evidence_mutation'
      )
  ) then
    raise exception
      'Build 0082 stopped because one or more intended functions already exist.';
  end if;
end;
$preflight$;

create table public.athena_intake_item_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null,
  intake_id uuid not null,
  source_type text not null,
  source_reference text not null,
  evidence_text text not null,
  evidence_locator jsonb not null default '{}'::jsonb,
  extraction_kind text not null,
  candidate_category text not null,
  extraction_confidence numeric(5, 4) not null,
  missing_information text[] not null default '{}'::text[],
  extraction_method text not null,
  extraction_version text not null,
  source_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint athena_intake_item_evidence_key_unique
    unique (evidence_key),

  constraint athena_intake_item_evidence_source_fingerprint_unique
    unique (source_fingerprint),

  constraint athena_intake_item_evidence_intake_fkey
    foreign key (intake_id)
    references public.athena_intake_items(id)
    on update cascade
    on delete restrict,

  constraint athena_intake_item_evidence_key_not_blank
    check (nullif(btrim(evidence_key), '') is not null),

  constraint athena_intake_item_evidence_source_type_not_blank
    check (nullif(btrim(source_type), '') is not null),

  constraint athena_intake_item_evidence_source_reference_not_blank
    check (nullif(btrim(source_reference), '') is not null),

  constraint athena_intake_item_evidence_text_not_blank
    check (nullif(btrim(evidence_text), '') is not null),

  constraint athena_intake_item_evidence_kind_check
    check (
      extraction_kind in (
        'explicit_request',
        'inferred_suggestion'
      )
    ),

  constraint athena_intake_item_evidence_category_check
    check (
      candidate_category in (
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
      )
    ),

  constraint athena_intake_item_evidence_confidence_check
    check (
      extraction_confidence >= 0
      and extraction_confidence <= 1
    ),

  constraint athena_intake_item_evidence_method_not_blank
    check (nullif(btrim(extraction_method), '') is not null),

  constraint athena_intake_item_evidence_version_not_blank
    check (nullif(btrim(extraction_version), '') is not null),

  constraint athena_intake_item_evidence_fingerprint_check
    check (source_fingerprint ~ '^[0-9a-f]{32}$'),

  constraint athena_intake_item_evidence_locator_object_check
    check (jsonb_typeof(evidence_locator) = 'object'),

  constraint athena_intake_item_evidence_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index athena_intake_item_evidence_intake_created_idx
on public.athena_intake_item_evidence (
  intake_id,
  created_at desc
);

create index athena_intake_item_evidence_source_reference_idx
on public.athena_intake_item_evidence (
  source_type,
  source_reference,
  created_at desc
);

create or replace function
  public.prevent_athena_intake_item_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception
    'Athena intake source evidence is append-only and cannot be updated or deleted.';
end;
$function$;

create trigger trg_prevent_athena_intake_item_evidence_mutation
before update or delete
on public.athena_intake_item_evidence
for each row
execute function
  public.prevent_athena_intake_item_evidence_mutation();

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
     or target_extraction_confidence > 1
  then
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
     and jsonb_typeof(target_evidence_locator) <> 'object'
  then
    raise exception 'Evidence locator must be a JSON object.';
  end if;

  if target_metadata is not null
     and jsonb_typeof(target_metadata) <> 'object'
  then
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

  candidate_metadata :=
    coalesce(target_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'created_from',
      'athena-os-conversation-research',
      'build_id',
      '0082',
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
      'build_id',
      '0082',
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
     and candidate_status_key <> 'pending_review'
  then
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

alter table public.athena_intake_item_evidence
  enable row level security;

revoke all
on table public.athena_intake_item_evidence
from public, anon, authenticated, service_role;

grant select
on table public.athena_intake_item_evidence
to service_role;

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
from public, anon, authenticated;

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

revoke all
on function
  public.prevent_athena_intake_item_evidence_mutation()
from public, anon, authenticated, service_role;

comment on table public.athena_intake_item_evidence is
  'Build 0082 append-only source evidence for canonical Athena Intake items. This is not a second intake or suggestion registry.';

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
  'Build 0082 idempotent conversation-candidate ingestion. Inserts canonical pending-review intake items or links new evidence to an existing duplicate.';

do $verification$
declare
  function_count integer;
  trigger_count integer;
  evidence_row_count bigint;
begin
  if to_regclass(
    'public.athena_intake_item_evidence'
  ) is null then
    raise exception
      'Build 0082 verification failed: evidence table is missing.';
  end if;

  select count(*)
  into function_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname =
      'ingest_athena_intake_conversation_candidate';

  if function_count <> 1 then
    raise exception
      'Build 0082 verification failed: expected one ingestion function, found %.',
      function_count;
  end if;

  select count(*)
  into trigger_count
  from pg_trigger
  where tgrelid =
    'public.athena_intake_item_evidence'::regclass
    and tgname =
      'trg_prevent_athena_intake_item_evidence_mutation'
    and not tgisinternal;

  if trigger_count <> 1 then
    raise exception
      'Build 0082 verification failed: append-only trigger is missing.';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname =
        'athena_intake_item_evidence'
      and c.relrowsecurity
  ) then
    raise exception
      'Build 0082 verification failed: RLS is not enabled.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename =
        'athena_intake_item_evidence'
  ) then
    raise exception
      'Build 0082 verification failed: unexpected RLS policy exists.';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.athena_intake_item_evidence',
    'SELECT'
  ) then
    raise exception
      'Build 0082 verification failed: service_role lacks evidence read access.';
  end if;

  if has_table_privilege(
    'service_role',
    'public.athena_intake_item_evidence',
    'INSERT'
  )
     or has_table_privilege(
       'service_role',
       'public.athena_intake_item_evidence',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_intake_item_evidence',
       'DELETE'
     )
  then
    raise exception
      'Build 0082 verification failed: service_role has unintended direct evidence write access.';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.athena_intake_item_evidence',
    'SELECT'
  )
     or has_table_privilege(
       'anon',
       'public.athena_intake_item_evidence',
       'SELECT'
     )
  then
    raise exception
      'Build 0082 verification failed: browser roles have direct evidence access.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ingest_athena_intake_conversation_candidate(text,text,text,text,text,text,text,text,text,numeric,text,jsonb,text[],text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'Build 0082 verification failed: service_role cannot execute ingestion.';
  end if;

  select count(*)
  into evidence_row_count
  from public.athena_intake_item_evidence;

  if evidence_row_count <> 0 then
    raise exception
      'Build 0082 verification failed: the new evidence table was not empty at creation.';
  end if;
end;
$verification$;

commit;
