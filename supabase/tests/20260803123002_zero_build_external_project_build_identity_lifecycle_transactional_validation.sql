-- Transactional full-control-flow validation.
-- Numeric and external fixture mutations are isolated and rolled back.

-- --------------------------------------------------------------------------
-- A. Numeric Athena lifecycle mode remains unchanged and consumes 0088 only
--    inside this rollback-only transaction.
-- --------------------------------------------------------------------------
begin;

create temporary table numeric_identity_validation_result (
  payload jsonb not null
) on commit drop;

do $numeric_validation$
declare
  v_intake_id uuid := gen_random_uuid();
  v_package_id uuid := gen_random_uuid();
  v_module_id constant uuid :=
    '96007f27-29fa-478f-9e4f-078f774f1709'::uuid;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_operation_key text;
  v_request_evidence jsonb;
  v_preview jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_reasons text[];
  v_override_reason text;
  v_transition_count_before bigint;
  v_timer_count_before bigint;
  v_qa_count_before bigint;
  v_packet_count_before bigint;
  v_event_count_before bigint;
  v_log_count_before bigint;
  v_transition_id uuid;
begin
  if exists (
    select 1
    from public.athena_build_timer_sessions
    where status in ('active', 'paused', 'idle')
  ) then
    raise exception 'Numeric fixture requires no active, paused, or idle timer.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where build_id = '0088'
       or build_number = 88
  ) then
    raise exception 'Build 0088 is already assigned; numeric fixture aborted.';
  end if;

  v_operation_key := 'fixture:numeric-project-identity:' || v_suffix;
  v_request_evidence := jsonb_build_object(
    'local_handoff_verified', true,
    'repository_path_verified', true,
    'repository_branch_verified', true,
    'repository_head_verified', true,
    'repository_tree_verified', true,
    'repository_evidence_verified', true,
    'tracked_diff_empty', true,
    'staged_diff_empty', true,
    'supabase_project_verified', true,
    'target_supabase_project_verified', true,
    'target_supabase_project_ref', 'voiwlcvfahykdldtjeqy',
    'repository_branch', 'fixture/numeric-project-identity',
    'build_identity_kind', 'numeric',
    'canonical_build_id', null,
    'canonical_build_title', null,
    'operator_session_verified', true,
    'preview_only', false,
    'evidence_schema', 'external-project-identity-numeric-fixture-v1'
  );

  insert into public.athena_intake_items (
    id, intake_key, project_key, module_key, title, description,
    source_type, source_reference, submitted_by, status_key,
    duplicate_fingerprint, metadata
  ) values (
    v_intake_id,
    'external-identity-numeric-fixture-' || v_suffix,
    'athena-cto',
    'build-log-recorder',
    'External Identity Numeric Compatibility Fixture ' || v_suffix,
    'Rollback-only numeric lifecycle compatibility fixture.',
    'transactional_qa_fixture',
    'numeric-fixture:' || v_suffix,
    'athena-automatic-qa',
    'approved',
    'external-identity-numeric-fixture-fingerprint-' || v_suffix,
    jsonb_build_object(
      'repository_path', 'C:\supabase\athena-os',
      'supabase_project_ref', 'voiwlcvfahykdldtjeqy',
      'handoff_version', '1.10',
      'transactional_qa_fixture', true
    )
  );

  insert into public.athena_intake_review_history (
    id, intake_id, from_status_key, to_status_key, review_outcome,
    reviewed_by, decision_notes, metadata
  ) values (
    gen_random_uuid(),
    v_intake_id,
    'pending_review',
    'approved',
    'approve',
    'athena-automatic-qa',
    'Rollback-only approval for numeric lifecycle compatibility.',
    jsonb_build_object('transactional_qa_fixture', true)
  );

  insert into public.athena_intake_preparation_packages (
    id, package_key, intake_id, project_key, module_key, package_title,
    proposed_build_id, proposed_build_title, objective,
    acceptance_criteria, dependencies, risks, security_notes,
    missing_information, metadata
  ) values (
    v_package_id,
    'external-identity-numeric-fixture-' || v_suffix,
    v_intake_id,
    'athena-cto',
    'build-log-recorder',
    'External Identity Numeric Compatibility Fixture ' || v_suffix,
    null,
    null,
    'Verify that the existing Athena numeric lifecycle remains unchanged.',
    array['The numeric fixture receives 0088 only inside a rollback transaction.'],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    jsonb_build_object(
      'repository_path', 'C:\supabase\athena-os',
      'supabase_project_ref', 'voiwlcvfahykdldtjeqy',
      'handoff_version', '1.10',
      'transactional_qa_fixture', true
    )
  );

  select count(*) into v_transition_count_before
  from public.athena_build_lifecycle_transitions;
  select count(*) into v_timer_count_before
  from public.athena_build_timer_sessions;
  select count(*) into v_qa_count_before from public.athena_qa_runs;
  select count(*) into v_packet_count_before
  from public.athena_feature_completion_packets;
  select count(*) into v_event_count_before
  from public.athena_feature_completion_events;
  select count(*) into v_log_count_before from public.athena_build_logs;

  v_preview := public.athena_pre_build_gate_preview(
    v_intake_id,
    v_package_id,
    'athena-cto',
    'build-log-recorder',
    v_module_id,
    'External Identity Numeric Compatibility Fixture ' || v_suffix,
    'Athena OS',
    'Athena CTO',
    'C:\supabase\athena-os',
    repeat('1', 40),
    repeat('2', 40),
    repeat('3', 64),
    'voiwlcvfahykdldtjeqy',
    '1.10',
    repeat('4', 64),
    v_request_evidence
  );

  if v_preview ->> 'status' <> 'canonical_pre_build_gate_preview'
     or v_preview ->> 'build_identity_kind' <> 'numeric'
     or v_preview -> 'canonical_build_id' <> 'null'::jsonb
     or v_preview -> 'canonical_build_title' <> 'null'::jsonb
     or v_preview ->> 'target_supabase_project_ref'
       <> 'voiwlcvfahykdldtjeqy' then
    raise exception 'Numeric lifecycle preview verification failed.';
  end if;

  v_reasons := array(
    select value
    from jsonb_array_elements_text(v_preview -> 'blocking_reasons') value
    order by value
  );

  if v_preview ->> 'decision' = 'block' then
    v_override_reason :=
      'Rollback-only governed numeric fixture acknowledges every exact blocking reason.';
  else
    v_override_reason := null;
    v_reasons := '{}'::text[];
  end if;

  v_result := public.athena_build_lifecycle_gate_and_start(
    v_intake_id,
    v_package_id,
    'athena-cto',
    'build-log-recorder',
    v_module_id,
    'External Identity Numeric Compatibility Fixture ' || v_suffix,
    'Athena OS',
    'Athena CTO',
    'C:\supabase\athena-os',
    repeat('1', 40),
    repeat('2', 40),
    repeat('3', 64),
    'voiwlcvfahykdldtjeqy',
    '1.10',
    repeat('4', 64),
    'operator_fixture_numeric_identity',
    'Numeric identity rollback fixture',
    v_operation_key,
    v_override_reason,
    v_reasons,
    v_request_evidence
  );

  if v_result ->> 'status' <> 'canonical_build_assigned_and_started'
     or v_result ->> 'build_identity_kind' <> 'numeric'
     or (v_result ->> 'build_number')::integer <> 88
     or v_result ->> 'build_id' <> '0088'
     or v_result ->> 'assignment_method'
       <> 'canonical_lifecycle_highest_used_plus_one'
     or v_result ->> 'numeric_sequence_candidate_id' <> '0088'
     or coalesce((v_result ->> 'numeric_sequence_consumed')::boolean, false)
       <> true
     or v_result ->> 'target_supabase_project_ref'
       <> 'voiwlcvfahykdldtjeqy' then
    raise exception 'Numeric lifecycle assignment/start result is contradictory.';
  end if;

  v_transition_id := (v_result ->> 'transition_id')::uuid;

  if not exists (
    select 1
    from public.athena_build_lifecycle_state s
    where s.build_number = 88
      and s.build_id = '0088'
      and s.assignment_method = 'canonical_lifecycle_highest_used_plus_one'
  ) or not exists (
    select 1
    from public.athena_build_lifecycle_transitions t
    where t.id = v_transition_id
      and t.build_number = 88
      and t.build_id = '0088'
      and t.assignment_method = 'canonical_lifecycle_highest_used_plus_one'
  ) then
    raise exception 'Numeric lifecycle read-after-write verification failed.';
  end if;

  v_replay := public.athena_build_lifecycle_gate_and_start(
    v_intake_id, v_package_id, 'athena-cto', 'build-log-recorder',
    v_module_id,
    'External Identity Numeric Compatibility Fixture ' || v_suffix,
    'Athena OS', 'Athena CTO', 'C:\supabase\athena-os',
    repeat('1', 40), repeat('2', 40), repeat('3', 64),
    'voiwlcvfahykdldtjeqy', '1.10', repeat('4', 64),
    'operator_fixture_numeric_identity',
    'Numeric identity rollback fixture',
    v_operation_key, v_override_reason, v_reasons, v_request_evidence
  );

  if coalesce((v_replay ->> 'idempotent_replay')::boolean, false) <> true
     or v_replay ->> 'transition_id' <> v_transition_id::text
     or (select count(*) from public.athena_build_lifecycle_transitions)
       <> v_transition_count_before + 1
     or (select count(*) from public.athena_build_timer_sessions)
       <> v_timer_count_before
     or (select count(*) from public.athena_qa_runs) <> v_qa_count_before
     or (select count(*) from public.athena_feature_completion_packets)
       <> v_packet_count_before
     or (select count(*) from public.athena_feature_completion_events)
       <> v_event_count_before
     or (select count(*) from public.athena_build_logs) <> v_log_count_before then
    raise exception 'Numeric lifecycle idempotency or side-effect verification failed.';
  end if;

  insert into numeric_identity_validation_result(payload)
  values (
    jsonb_build_object(
      'status', 'zero_build_external_identity_numeric_compatibility_pass',
      'passed', true,
      'build_id', v_result ->> 'build_id',
      'build_number', (v_result ->> 'build_number')::integer,
      'build_identity_kind', v_result ->> 'build_identity_kind',
      'numeric_sequence_consumed', true,
      'idempotent_replay_pass', true,
      'rollback_required', true
    )
  );
end;
$numeric_validation$;

select payload
from numeric_identity_validation_result;

rollback;

-- --------------------------------------------------------------------------
-- B. Approved external project identity is preserved without consuming 0088.
-- --------------------------------------------------------------------------
begin;

create temporary table external_identity_validation_result (
  payload jsonb not null
) on commit drop;

do $validation$
declare
  v_intake_id constant uuid :=
    '975cb885-3303-4b54-9cee-e046847591ff'::uuid;
  v_package_id constant uuid :=
    '2f808b82-b10d-4dc7-9ebe-56b9d45be60b'::uuid;
  v_module_id constant uuid :=
    '6d9d9d5e-f5d9-4435-a511-8fbd0fe04d6e'::uuid;
  v_operation_key constant text :=
    'fixture:external-project-identity:bdna-ing-0004:v1';
  v_request_evidence jsonb := jsonb_build_object(
    'local_handoff_verified', true,
    'repository_path_verified', true,
    'repository_branch_verified', true,
    'repository_head_verified', true,
    'repository_tree_verified', true,
    'repository_evidence_verified', true,
    'tracked_diff_empty', true,
    'staged_diff_empty', true,
    'supabase_project_verified', true,
    'target_supabase_project_verified', true,
    'target_supabase_project_ref', 'hidsyvanaipxxyyhjgmc',
    'repository_branch', 'fixture/external-project-identity',
    'build_identity_kind', 'external',
    'canonical_build_id', 'BDNA-ING-0004',
    'canonical_build_title',
      'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing',
    'operator_session_verified', true,
    'preview_only', false,
    'evidence_schema', 'external-project-identity-transactional-fixture-v1'
  );
  v_preview jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_reasons text[];
  v_override_reason text;
  v_state_id uuid;
  v_transition_id uuid;
  v_before_transition_count bigint;
  v_before_timer_count bigint;
  v_before_qa_count bigint;
  v_before_packet_count bigint;
  v_before_event_count bigint;
  v_before_log_count bigint;
  v_after_transition_count bigint;
  v_identity_guard_rejected boolean := false;
  v_wrong_target_rejected boolean := false;
begin
  if exists (
    select 1
    from public.athena_build_timer_sessions
    where status in ('active', 'paused', 'idle')
  ) then
    raise exception 'Fixture requires no active, paused, or idle timer.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where intake_id = v_intake_id
       or preparation_package_id = v_package_id
       or build_id = 'BDNA-ING-0004'
  ) then
    raise exception 'BDNA-ING-0004 is already started; rollback fixture aborted.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where build_id = '0088'
       or build_number = 88
  ) then
    raise exception 'Build 0088 is already assigned; rollback fixture aborted.';
  end if;

  select count(*) into v_before_transition_count
  from public.athena_build_lifecycle_transitions;
  select count(*) into v_before_timer_count
  from public.athena_build_timer_sessions;
  select count(*) into v_before_qa_count
  from public.athena_qa_runs;
  select count(*) into v_before_packet_count
  from public.athena_feature_completion_packets;
  select count(*) into v_before_event_count
  from public.athena_feature_completion_events;
  select count(*) into v_before_log_count
  from public.athena_build_logs;

  v_preview := public.athena_pre_build_gate_preview(
    v_intake_id,
    v_package_id,
    'beautydna',
    'ingredient-intelligence',
    v_module_id,
    'Japanese Ingredient Identity Normalization and Review-Queue Processing',
    'Beauty OS / BeautyDNA',
    'Athena CTO',
    'C:\supabase\beauty-os',
    repeat('a', 40),
    repeat('b', 40),
    repeat('c', 64),
    'voiwlcvfahykdldtjeqy',
    '1.0',
    repeat('d', 64),
    v_request_evidence
  );

  if v_preview ->> 'status' <> 'canonical_pre_build_gate_preview'
     or v_preview ->> 'build_identity_kind' <> 'external'
     or v_preview ->> 'canonical_build_id' <> 'BDNA-ING-0004'
     or v_preview ->> 'canonical_build_title' <>
       'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing'
     or v_preview ->> 'target_supabase_project_ref' <>
       'hidsyvanaipxxyyhjgmc' then
    raise exception 'External identity preview verification failed.';
  end if;

  v_reasons := array(
    select value
    from jsonb_array_elements_text(v_preview -> 'blocking_reasons') value
    order by value
  );

  if v_preview ->> 'decision' = 'block' then
    v_override_reason :=
      'Rollback-only governed fixture acknowledges every exact blocking reason and persists no final lifecycle state.';
  else
    v_override_reason := null;
    v_reasons := '{}'::text[];
  end if;

  v_result := public.athena_build_lifecycle_gate_and_start(
    v_intake_id,
    v_package_id,
    'beautydna',
    'ingredient-intelligence',
    v_module_id,
    'Japanese Ingredient Identity Normalization and Review-Queue Processing',
    'Beauty OS / BeautyDNA',
    'Athena CTO',
    'C:\supabase\beauty-os',
    repeat('a', 40),
    repeat('b', 40),
    repeat('c', 64),
    'voiwlcvfahykdldtjeqy',
    '1.0',
    repeat('d', 64),
    'operator_fixture_external_identity',
    'External identity rollback fixture',
    v_operation_key,
    v_override_reason,
    v_reasons,
    v_request_evidence
  );

  if v_result ->> 'status' <> 'canonical_build_assigned_and_started'
     or v_result ->> 'build_identity_kind' <> 'external'
     or v_result -> 'build_number' <> 'null'::jsonb
     or v_result ->> 'build_id' <> 'BDNA-ING-0004'
     or v_result ->> 'build_title' <>
       'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing'
     or v_result ->> 'assignment_method' <>
       'canonical_external_project_identity'
     or v_result ->> 'numeric_sequence_candidate_id' <> '0088'
     or (v_result ->> 'numeric_sequence_consumed')::boolean
     or v_result ->> 'target_supabase_project_ref' <>
       'hidsyvanaipxxyyhjgmc'
     or (v_result ->> 'timer_started')::boolean
     or (v_result ->> 'qa_created')::boolean
     or (v_result ->> 'completion_created')::boolean
     or (v_result ->> 'build_log_created')::boolean then
    raise exception 'External lifecycle assignment/start result is contradictory.';
  end if;

  v_state_id := (v_result ->> 'state_id')::uuid;
  v_transition_id := (v_result ->> 'transition_id')::uuid;

  if not exists (
    select 1
    from public.athena_build_lifecycle_state s
    where s.id = v_state_id
      and s.build_number is null
      and s.build_id = 'BDNA-ING-0004'
      and s.build_title =
        'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing'
      and s.assignment_method = 'canonical_external_project_identity'
      and s.repository_path = 'C:\supabase\beauty-os'
      and s.supabase_project_ref = 'voiwlcvfahykdldtjeqy'
      and s.evidence ->> 'target_supabase_project_ref' =
        'hidsyvanaipxxyyhjgmc'
  ) then
    raise exception 'External lifecycle state read-after-write verification failed.';
  end if;

  if not exists (
    select 1
    from public.athena_build_lifecycle_transitions t
    where t.id = v_transition_id
      and t.build_number is null
      and t.build_id = 'BDNA-ING-0004'
      and t.build_title =
        'BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing'
      and t.assignment_method = 'canonical_external_project_identity'
      and t.request_evidence ->> 'target_supabase_project_ref' =
        'hidsyvanaipxxyyhjgmc'
  ) then
    raise exception 'External lifecycle transition read-after-write verification failed.';
  end if;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where build_id = '0088'
       or build_number = 88
  ) then
    raise exception 'External lifecycle start consumed or reserved Build 0088.';
  end if;

  select count(*) into v_after_transition_count
  from public.athena_build_lifecycle_transitions;

  if v_after_transition_count <> v_before_transition_count + 1
     or (select count(*) from public.athena_build_timer_sessions)
        <> v_before_timer_count
     or (select count(*) from public.athena_qa_runs)
        <> v_before_qa_count
     or (select count(*) from public.athena_feature_completion_packets)
        <> v_before_packet_count
     or (select count(*) from public.athena_feature_completion_events)
        <> v_before_event_count
     or (select count(*) from public.athena_build_logs)
        <> v_before_log_count then
    raise exception 'Unexpected side effect occurred during external lifecycle fixture.';
  end if;

  v_replay := public.athena_build_lifecycle_gate_and_start(
    v_intake_id,
    v_package_id,
    'beautydna',
    'ingredient-intelligence',
    v_module_id,
    'Japanese Ingredient Identity Normalization and Review-Queue Processing',
    'Beauty OS / BeautyDNA',
    'Athena CTO',
    'C:\supabase\beauty-os',
    repeat('a', 40),
    repeat('b', 40),
    repeat('c', 64),
    'voiwlcvfahykdldtjeqy',
    '1.0',
    repeat('d', 64),
    'operator_fixture_external_identity',
    'External identity rollback fixture',
    v_operation_key,
    v_override_reason,
    v_reasons,
    v_request_evidence
  );

  if coalesce((v_replay ->> 'idempotent_replay')::boolean, false) <> true
     or v_replay ->> 'transition_id' <> v_transition_id::text
     or (select count(*) from public.athena_build_lifecycle_transitions)
        <> v_after_transition_count then
    raise exception 'External lifecycle idempotent replay verification failed.';
  end if;

  begin
    update public.athena_build_lifecycle_state
    set build_title = 'BDNA-ING-0004 Contradictory title'
    where id = v_state_id;

    raise exception 'Identity guard did not reject contradictory external title.';
  exception
    when others then
      if sqlerrm = 'Identity guard did not reject contradictory external title.' then
        raise;
      end if;
      v_identity_guard_rejected := true;
  end;

  begin
    perform public.athena_pre_build_gate_preview(
      v_intake_id,
      v_package_id,
      'beautydna',
      'ingredient-intelligence',
      v_module_id,
      'Japanese Ingredient Identity Normalization and Review-Queue Processing',
      'Beauty OS / BeautyDNA',
      'Athena CTO',
      'C:\supabase\beauty-os',
      repeat('a', 40),
      repeat('b', 40),
      repeat('c', 64),
      'voiwlcvfahykdldtjeqy',
      '1.0',
      repeat('d', 64),
      jsonb_set(
        v_request_evidence,
        '{target_supabase_project_ref}',
        to_jsonb('wrongprojectref00000'::text)
      )
    );

    raise exception 'Wrong target Supabase project was not rejected.';
  exception
    when others then
      if sqlerrm = 'Wrong target Supabase project was not rejected.' then
        raise;
      end if;
      v_wrong_target_rejected := true;
  end;

  if not v_identity_guard_rejected or not v_wrong_target_rejected then
    raise exception 'Negative fixture verification did not complete.';
  end if;

  insert into external_identity_validation_result(payload)
  values (
    jsonb_build_object(
      'status',
        'zero_build_external_project_identity_transactional_validation_pass',
      'passed', true,
      'build_id', v_result ->> 'build_id',
      'build_number', v_result -> 'build_number',
      'build_identity_kind', v_result ->> 'build_identity_kind',
      'numeric_sequence_candidate_id',
        v_result ->> 'numeric_sequence_candidate_id',
      'numeric_sequence_consumed',
        (v_result ->> 'numeric_sequence_consumed')::boolean,
      'target_supabase_project_ref',
        v_result ->> 'target_supabase_project_ref',
      'idempotent_replay_pass', true,
      'identity_guard_rejection_pass', v_identity_guard_rejected,
      'wrong_target_supabase_rejection_pass', v_wrong_target_rejected,
      'timer_side_effect_count', 0,
      'qa_side_effect_count', 0,
      'completion_side_effect_count', 0,
      'build_log_side_effect_count', 0,
      'rollback_required', true
    )
  );
end;
$validation$;

select payload
from external_identity_validation_result;

rollback;
