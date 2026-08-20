-- ============================================================================
-- Canonical reusable audit
-- Athena CTO Build 0089
-- Intake external build identity metadata namespace collision
--
-- READ ONLY.
-- Database: Athena OS / CTO
-- Supabase project ref: voiwlcvfahykdldtjeqy
-- ============================================================================

with candidate_rows as (
  select
    i.id as intake_id,
    i.intake_key,
    i.project_key,
    i.module_key,
    i.status_key,
    i.title,
    i.metadata as intake_metadata,
    p.id as preparation_package_id,
    p.package_key,
    p.proposed_build_id,
    p.proposed_build_title,
    p.metadata as package_metadata,
    (
      select count(*)
      from public.athena_build_lifecycle_transitions t
      where t.intake_id = i.id
         or t.preparation_package_id = p.id
         or (
           p.proposed_build_id is not null
           and t.build_id = p.proposed_build_id
         )
    ) as lifecycle_transition_count,
    (
      select count(*)
      from public.athena_intake_review_history r
      where r.intake_id = i.id
        and r.to_status_key = 'approved'
        and r.review_outcome = 'approve'
    ) as immutable_approval_count
  from public.athena_intake_items i
  left join public.athena_intake_preparation_packages p
    on p.intake_id = i.id
  where i.metadata ->> 'created_from'
          = 'athena-os-conversation-research'
    and nullif(btrim(i.metadata ->> 'build_id'), '') is not null
),
classified as (
  select
    *,
    case
      when status_key <> 'approved'
        then 'not_approved'
      when immutable_approval_count <> 1
        then 'approval_evidence_not_exactly_one'
      when preparation_package_id is null
        then 'no_matching_preparation_package'
      when proposed_build_id is null
        or proposed_build_title is null
        then 'identity_neutral_or_numeric_preparation'
      when intake_metadata ->> 'canonical_external_build_id'
          is distinct from proposed_build_id
        then 'canonical_external_build_id_missing_or_mismatch'
      when intake_metadata ->> 'canonical_external_build_title'
          is distinct from proposed_build_title
        then 'canonical_external_build_title_missing_or_mismatch'
      when title is distinct from proposed_build_title
        then 'intake_title_mismatch'
      when lifecycle_transition_count <> 0
        then 'lifecycle_already_exists'
      when intake_metadata ->> 'build_id' = proposed_build_id
        then 'already_canonical'
      when intake_metadata ->> 'build_id' = '0082'
        then 'eligible_build_0082_namespace_collision'
      else 'other_build_id_contradiction'
    end as reconciliation_classification
  from candidate_rows
)
select
  intake_id,
  intake_key,
  project_key,
  module_key,
  status_key,
  title,
  preparation_package_id,
  package_key,
  proposed_build_id,
  proposed_build_title,
  intake_metadata ->> 'build_id' as metadata_build_id,
  intake_metadata ->> 'canonical_external_build_id'
    as canonical_external_build_id,
  intake_metadata ->> 'canonical_external_build_title'
    as canonical_external_build_title,
  intake_metadata -> 'athena_intake_ingestion_provenance'
    as namespaced_ingestion_provenance,
  intake_metadata -> 'external_build_identity_reconciliations'
    as reconciliation_evidence,
  immutable_approval_count,
  lifecycle_transition_count,
  reconciliation_classification
from classified
order by
  case reconciliation_classification
    when 'eligible_build_0082_namespace_collision' then 0
    when 'already_canonical' then 1
    else 2
  end,
  project_key,
  module_key,
  intake_id;
