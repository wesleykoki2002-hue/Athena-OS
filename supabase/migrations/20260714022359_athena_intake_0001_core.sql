-- ATHENA-INTAKE-0001
-- Canonical Intake, Review, Approval, Denial, and Preparation Workflow
--
-- Target system:
-- Athena OS application and Athena OS Supabase project voiwlcvfahykdldtjeqy
--
-- Canonical owner:
-- project_key: athena-cto
-- module_key: project-memory
--
-- This migration:
-- - creates canonical intake records
-- - creates data-driven intake statuses
-- - creates append-only review history
-- - prevents duplicate intake records
-- - creates one preparation package per approved intake
-- - does not create build cards, next-step records, QA runs, or completion events

begin;

create table public.athena_intake_statuses (
  status_key text primary key,
  name text not null,
  description text,
  sort_order integer not null,
  is_initial boolean not null default false,
  review_outcome text,
  allows_preparation boolean not null default false,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_intake_statuses_sort_order_check
    check (sort_order >= 0),

  constraint athena_intake_statuses_review_outcome_check
    check (
      review_outcome is null
      or review_outcome in ('approve', 'deny')
    )
);

create unique index athena_intake_statuses_one_initial
  on public.athena_intake_statuses ((is_initial))
  where is_initial and is_active;

create unique index athena_intake_statuses_unique_review_outcome
  on public.athena_intake_statuses (review_outcome)
  where review_outcome is not null and is_active;

insert into public.athena_intake_statuses (
  status_key,
  name,
  description,
  sort_order,
  is_initial,
  review_outcome,
  allows_preparation,
  is_terminal
)
values
  (
    'pending_review',
    'Pending review',
    'The proposal has been captured and is awaiting an operator decision.',
    10,
    true,
    null,
    false,
    false
  ),
  (
    'approved',
    'Approved',
    'The proposal was approved and is eligible for a preparation package.',
    20,
    false,
    'approve',
    true,
    true
  ),
  (
    'denied',
    'Denied',
    'The proposal was denied. Its record and review history remain available.',
    30,
    false,
    'deny',
    false,
    true
  );

create table public.athena_intake_items (
  id uuid primary key default gen_random_uuid(),
  intake_key text not null,
  project_key text not null,
  module_key text not null,
  title text not null,
  description text not null,
  source_type text not null,
  source_reference text,
  submitted_by text,
  status_key text not null,
  duplicate_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_intake_items_intake_key_unique
    unique (intake_key),

  constraint athena_intake_items_duplicate_fingerprint_unique
    unique (duplicate_fingerprint),

  constraint athena_intake_items_project_fkey
    foreign key (project_key)
    references public.athena_projects(project_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_items_project_module_fkey
    foreign key (project_key, module_key)
    references public.athena_project_modules(project_key, module_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_items_status_fkey
    foreign key (status_key)
    references public.athena_intake_statuses(status_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_items_key_not_blank
    check (length(trim(intake_key)) > 0),

  constraint athena_intake_items_title_not_blank
    check (length(trim(title)) > 0),

  constraint athena_intake_items_description_not_blank
    check (length(trim(description)) > 0),

  constraint athena_intake_items_source_type_not_blank
    check (length(trim(source_type)) > 0),

  constraint athena_intake_items_fingerprint_not_blank
    check (length(trim(duplicate_fingerprint)) > 0)
);

create index athena_intake_items_review_queue
  on public.athena_intake_items (
    status_key,
    created_at,
    project_key,
    module_key
  );

create table public.athena_intake_review_history (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null,
  from_status_key text not null,
  to_status_key text not null,
  review_outcome text not null,
  reviewed_by text not null,
  decision_notes text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint athena_intake_review_history_intake_fkey
    foreign key (intake_id)
    references public.athena_intake_items(id)
    on delete cascade,

  constraint athena_intake_review_history_from_status_fkey
    foreign key (from_status_key)
    references public.athena_intake_statuses(status_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_review_history_to_status_fkey
    foreign key (to_status_key)
    references public.athena_intake_statuses(status_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_review_history_unique_transition
    unique (intake_id, from_status_key, to_status_key),

  constraint athena_intake_review_history_outcome_check
    check (review_outcome in ('approve', 'deny')),

  constraint athena_intake_review_history_reviewer_not_blank
    check (length(trim(reviewed_by)) > 0),

  constraint athena_intake_review_history_notes_not_blank
    check (length(trim(decision_notes)) > 0)
);

create index athena_intake_review_history_intake_created
  on public.athena_intake_review_history (
    intake_id,
    created_at
  );

create table public.athena_intake_preparation_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null,
  intake_id uuid not null,
  project_key text not null,
  module_key text not null,
  package_title text not null,
  proposed_build_id text,
  proposed_build_title text,
  objective text not null,
  acceptance_criteria text[] not null default '{}'::text[],
  dependencies text[] not null default '{}'::text[],
  risks text[] not null default '{}'::text[],
  security_notes text[] not null default '{}'::text[],
  missing_information text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_intake_preparation_packages_package_key_unique
    unique (package_key),

  constraint athena_intake_preparation_packages_intake_unique
    unique (intake_id),

  constraint athena_intake_preparation_packages_intake_fkey
    foreign key (intake_id)
    references public.athena_intake_items(id)
    on delete cascade,

  constraint athena_intake_preparation_packages_project_fkey
    foreign key (project_key)
    references public.athena_projects(project_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_preparation_packages_project_module_fkey
    foreign key (project_key, module_key)
    references public.athena_project_modules(project_key, module_key)
    on update cascade
    on delete restrict,

  constraint athena_intake_preparation_packages_key_not_blank
    check (length(trim(package_key)) > 0),

  constraint athena_intake_preparation_packages_title_not_blank
    check (length(trim(package_title)) > 0),

  constraint athena_intake_preparation_packages_objective_not_blank
    check (length(trim(objective)) > 0),

  constraint athena_intake_preparation_packages_build_pair_check
    check (
      (proposed_build_id is null and proposed_build_title is null)
      or
      (
        proposed_build_id is not null
        and proposed_build_title is not null
        and length(trim(proposed_build_id)) > 0
        and length(trim(proposed_build_title)) > 0
      )
    )
);

create or replace function public.prevent_athena_intake_review_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception
    'Athena intake review history is append-only and cannot be updated or deleted.';
end;
$function$;

create trigger trg_prevent_athena_intake_review_history_mutation
before update or delete
on public.athena_intake_review_history
for each row
execute function public.prevent_athena_intake_review_history_mutation();

create trigger trg_athena_intake_statuses_updated_at
before update
on public.athena_intake_statuses
for each row
execute function public.set_updated_at();

create trigger trg_athena_intake_items_updated_at
before update
on public.athena_intake_items
for each row
execute function public.set_updated_at();

create trigger trg_athena_intake_preparation_packages_updated_at
before update
on public.athena_intake_preparation_packages
for each row
execute function public.set_updated_at();

create or replace function public.create_athena_intake_item(
  target_intake_key text,
  target_project_key text,
  target_module_key text,
  target_title text,
  target_description text,
  target_source_type text,
  target_source_reference text,
  target_submitted_by text,
  target_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  initial_status_key text;
  existing_intake_id uuid;
  computed_fingerprint text;
  new_intake_id uuid;
begin
  select status_key
  into initial_status_key
  from public.athena_intake_statuses
  where is_initial
    and is_active;

  if initial_status_key is null then
    raise exception
      'No active initial Athena intake status is configured.';
  end if;

  computed_fingerprint := md5(
    lower(trim(target_project_key))
    || '|'
    || lower(trim(target_module_key))
    || '|'
    || regexp_replace(
         lower(trim(target_title)),
         '[[:space:][:punct:]]+',
         ' ',
         'g'
       )
    || '|'
    || regexp_replace(
         lower(trim(target_description)),
         '[[:space:][:punct:]]+',
         ' ',
         'g'
       )
  );

  select id
  into existing_intake_id
  from public.athena_intake_items
  where intake_key = trim(target_intake_key)
     or duplicate_fingerprint = computed_fingerprint
  limit 1;

  if existing_intake_id is not null then
    raise exception
      'Duplicate intake blocked. Existing intake id: %',
      existing_intake_id;
  end if;

  insert into public.athena_intake_items (
    intake_key,
    project_key,
    module_key,
    title,
    description,
    source_type,
    source_reference,
    submitted_by,
    status_key,
    duplicate_fingerprint,
    metadata
  )
  values (
    trim(target_intake_key),
    trim(target_project_key),
    trim(target_module_key),
    trim(target_title),
    trim(target_description),
    trim(target_source_type),
    nullif(trim(target_source_reference), ''),
    nullif(trim(target_submitted_by), ''),
    initial_status_key,
    computed_fingerprint,
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning id into new_intake_id;

  return new_intake_id;
end;
$function$;

create or replace function public.review_athena_intake_item(
  target_intake_id uuid,
  target_status_key text,
  target_reviewer text,
  target_decision_notes text,
  target_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_status_key text;
  current_is_initial boolean;
  selected_outcome text;
  review_history_id uuid;
begin
  select
    item.status_key,
    status.is_initial
  into
    current_status_key,
    current_is_initial
  from public.athena_intake_items item
  join public.athena_intake_statuses status
    on status.status_key = item.status_key
  where item.id = target_intake_id
  for update of item;

  if current_status_key is null then
    raise exception
      'Athena intake item was not found.';
  end if;

  if not coalesce(current_is_initial, false) then
    raise exception
      'Duplicate review blocked. This intake item has already been reviewed.';
  end if;

  select review_outcome
  into selected_outcome
  from public.athena_intake_statuses
  where status_key = trim(target_status_key)
    and is_active
    and review_outcome is not null;

  if selected_outcome is null then
    raise exception
      'The selected status is not an active intake review decision.';
  end if;

  if length(trim(target_reviewer)) = 0 then
    raise exception
      'Reviewer is required.';
  end if;

  if length(trim(target_decision_notes)) = 0 then
    raise exception
      'Decision notes are required.';
  end if;

  insert into public.athena_intake_review_history (
    intake_id,
    from_status_key,
    to_status_key,
    review_outcome,
    reviewed_by,
    decision_notes,
    metadata
  )
  values (
    target_intake_id,
    current_status_key,
    trim(target_status_key),
    selected_outcome,
    trim(target_reviewer),
    trim(target_decision_notes),
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning id into review_history_id;

  update public.athena_intake_items
  set status_key = trim(target_status_key)
  where id = target_intake_id;

  return review_history_id;
end;
$function$;

create or replace function public.create_athena_intake_preparation_package(
  target_intake_id uuid,
  target_package_key text,
  target_package_title text,
  target_proposed_build_id text,
  target_proposed_build_title text,
  target_objective text,
  target_acceptance_criteria text[],
  target_dependencies text[],
  target_risks text[],
  target_security_notes text[],
  target_missing_information text[],
  target_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  intake_project_key text;
  intake_module_key text;
  intake_allows_preparation boolean;
  existing_package_id uuid;
  new_package_id uuid;
begin
  select
    item.project_key,
    item.module_key,
    status.allows_preparation
  into
    intake_project_key,
    intake_module_key,
    intake_allows_preparation
  from public.athena_intake_items item
  join public.athena_intake_statuses status
    on status.status_key = item.status_key
  where item.id = target_intake_id
  for update of item;

  if intake_project_key is null then
    raise exception
      'Athena intake item was not found.';
  end if;

  if not coalesce(intake_allows_preparation, false) then
    raise exception
      'Preparation package creation is allowed only for an approved intake item.';
  end if;

  select id
  into existing_package_id
  from public.athena_intake_preparation_packages
  where intake_id = target_intake_id
     or package_key = trim(target_package_key)
  limit 1;

  if existing_package_id is not null then
    raise exception
      'Duplicate preparation package blocked. Existing package id: %',
      existing_package_id;
  end if;

  insert into public.athena_intake_preparation_packages (
    package_key,
    intake_id,
    project_key,
    module_key,
    package_title,
    proposed_build_id,
    proposed_build_title,
    objective,
    acceptance_criteria,
    dependencies,
    risks,
    security_notes,
    missing_information,
    metadata
  )
  values (
    trim(target_package_key),
    target_intake_id,
    intake_project_key,
    intake_module_key,
    trim(target_package_title),
    nullif(trim(target_proposed_build_id), ''),
    nullif(trim(target_proposed_build_title), ''),
    trim(target_objective),
    coalesce(target_acceptance_criteria, '{}'::text[]),
    coalesce(target_dependencies, '{}'::text[]),
    coalesce(target_risks, '{}'::text[]),
    coalesce(target_security_notes, '{}'::text[]),
    coalesce(target_missing_information, '{}'::text[]),
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning id into new_package_id;

  return new_package_id;
end;
$function$;

alter table public.athena_intake_statuses
  enable row level security;

alter table public.athena_intake_items
  enable row level security;

alter table public.athena_intake_review_history
  enable row level security;

alter table public.athena_intake_preparation_packages
  enable row level security;

revoke all
on public.athena_intake_statuses,
   public.athena_intake_items,
   public.athena_intake_review_history,
   public.athena_intake_preparation_packages
from public, anon, authenticated, service_role;

grant select
on public.athena_intake_statuses,
   public.athena_intake_items,
   public.athena_intake_review_history,
   public.athena_intake_preparation_packages
to service_role;

revoke all
on function public.create_athena_intake_item(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from public, anon, authenticated;

revoke all
on function public.review_athena_intake_item(
  uuid,
  text,
  text,
  text,
  jsonb
)
from public, anon, authenticated;

revoke all
on function public.create_athena_intake_preparation_package(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.create_athena_intake_item(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
to service_role;

grant execute
on function public.review_athena_intake_item(
  uuid,
  text,
  text,
  text,
  jsonb
)
to service_role;

grant execute
on function public.create_athena_intake_preparation_package(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  jsonb
)
to service_role;

revoke all
on function public.prevent_athena_intake_review_history_mutation()
from public, anon, authenticated, service_role;

commit;
