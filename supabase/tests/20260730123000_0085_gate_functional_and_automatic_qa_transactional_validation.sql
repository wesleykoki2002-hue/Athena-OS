-- Athena CTO Build 0085
-- Transactional functional and automatic-QA validation
-- Target Supabase project: voiwlcvfahykdldtjeqy
--
-- This script exercises the real Build 0085 functions and triggers using
-- transaction-scoped fixture rows. Every fixture mutation is rolled back before
-- the final result is returned. It does not persist a Build 0086/0087, timer,
-- QA row, completion record, build log, gate evaluation, candidate, or override.

begin;

do $build_0085_functional_qa$
declare
  v_current_state public.athena_build_lifecycle_state%rowtype;
  v_module_id uuid :=
    '50d2c3df-a8d2-4a3b-a15b-4d1dbf0e587c'::uuid;
  v_current_intake_id uuid :=
    '387e2cc0-6427-43ef-8a77-156e4b6f35e2'::uuid;
  v_current_package_id uuid :=
    'ac674c9d-e31c-45ef-bb27-b00a8e5aad35'::uuid;
  v_current_timer_id uuid :=
    '1cd83ad3-23a0-43c0-b993-6ab17a53f664'::uuid;
  v_current_qa_run_id uuid :=
    'b501717b-af63-4504-b519-128702cd1b7b'::uuid;

  v_suffix text :=
    substr(
      md5(clock_timestamp()::text || random()::text),
      1,
      12
    );

  v_pass_intake_id uuid := gen_random_uuid();
  v_pass_package_id uuid := gen_random_uuid();
  v_duplicate_candidate_intake_id uuid := gen_random_uuid();
  v_duplicate_candidate_package_id uuid := gen_random_uuid();
  v_duplicate_intake_id uuid := gen_random_uuid();
  v_duplicate_package_id uuid := gen_random_uuid();

  v_pass_name text;
  v_pass_objective text;
  v_pass_acceptance text;
  v_duplicate_name text;
  v_duplicate_objective text;
  v_duplicate_acceptance text;

  v_request_evidence jsonb;

  v_pass_preview jsonb;
  v_pass_result jsonb;
  v_pass_qa_evidence jsonb;
  v_pass_evaluation_id uuid;
  v_pass_transition_id uuid;

  v_duplicate_preview jsonb;
  v_duplicate_blocked_result jsonb;
  v_duplicate_override_result jsonb;
  v_duplicate_replay_result jsonb;
  v_duplicate_qa_evidence jsonb;
  v_duplicate_evaluation_id uuid;
  v_duplicate_transition_id uuid;
  v_duplicate_blocking_reasons text[];

  v_classification_result jsonb;

  v_review_rows integer;
  v_timer_rows integer;

  v_evaluation_count_before bigint;
  v_candidate_count_before bigint;
  v_override_count_before bigint;
  v_transition_count_before bigint;
  v_qa_count_before bigint;
  v_completion_event_count_before bigint;
  v_completion_packet_count_before bigint;
  v_build_log_count_before bigint;

  v_expected_candidate_rows bigint;

  v_wrong_acknowledgement_rejected boolean := false;
  v_ungated_transition_rejected boolean := false;
  v_evaluation_update_rejected boolean := false;
  v_candidate_delete_rejected boolean := false;
  v_override_delete_rejected boolean := false;
begin
  select *
  into strict v_current_state
  from public.athena_build_lifecycle_state
  where id =
      '55a13a94-8af2-446f-b94e-5df30b112fce'::uuid
    and singleton_key
    and build_id = '0085'
    and build_title =
      '0085 Build title: Pre-Build Redundancy and Existing-Capability Gate'
    and lifecycle_status = 'started'
    and intake_id = v_current_intake_id
    and preparation_package_id = v_current_package_id
    and project_key = 'athena-cto'
    and module_key = 'cross-project-reuse-detector'
    and module_id = v_module_id;

  if (
    select count(*)
    from public.athena_build_timer_sessions
    where id = v_current_timer_id
      and status = 'active'
  ) <> 1 then
    raise exception
      'Build 0085 functional QA precondition failed: exact active timer was not found.';
  end if;

  if (
    select count(*)
    from public.athena_qa_runs
    where id = v_current_qa_run_id
      and status = 'pending'
  ) <> 1 then
    raise exception
      'Build 0085 functional QA precondition failed: exact pending QA run was not found.';
  end if;

  if (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id = v_current_qa_run_id
  ) <> 12
  or (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id = v_current_qa_run_id
      and status = 'pass'
  ) <> 4
  or (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id = v_current_qa_run_id
      and status = 'pending'
  ) <> 8 then
    raise exception
      'Build 0085 functional QA precondition failed: QA counts are not exactly 4 pass and 8 pending.';
  end if;

  select count(*)
  into v_evaluation_count_before
  from public.athena_pre_build_gate_evaluations;

  select count(*)
  into v_candidate_count_before
  from public.athena_pre_build_gate_candidate_matches;

  select count(*)
  into v_override_count_before
  from public.athena_pre_build_gate_overrides;

  select count(*)
  into v_transition_count_before
  from public.athena_build_lifecycle_transitions;

  select count(*)
  into v_qa_count_before
  from public.athena_qa_runs;

  select count(*)
  into v_completion_event_count_before
  from public.athena_feature_completion_events;

  select count(*)
  into v_completion_packet_count_before
  from public.athena_feature_completion_packets;

  select count(*)
  into v_build_log_count_before
  from public.athena_build_logs;

  if not has_table_privilege(
    'service_role',
    'public.athena_pre_build_gate_evaluations',
    'SELECT'
  )
  or not has_table_privilege(
    'service_role',
    'public.athena_pre_build_gate_candidate_matches',
    'SELECT'
  )
  or not has_table_privilege(
    'service_role',
    'public.athena_pre_build_gate_overrides',
    'SELECT'
  ) then
    raise exception
      'Build 0085 functional QA failed: service_role SELECT is missing.';
  end if;

  if has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_evaluations',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_evaluations',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_evaluations',
       'DELETE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_evaluations',
       'TRUNCATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_evaluations',
       'REFERENCES'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_evaluations',
       'TRIGGER'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_candidate_matches',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_candidate_matches',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_candidate_matches',
       'DELETE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_candidate_matches',
       'TRUNCATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_candidate_matches',
       'REFERENCES'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_candidate_matches',
       'TRIGGER'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_overrides',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_overrides',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_overrides',
       'DELETE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_overrides',
       'TRUNCATE'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_overrides',
       'REFERENCES'
     )
     or has_table_privilege(
       'service_role',
       'public.athena_pre_build_gate_overrides',
       'TRIGGER'
     ) then
    raise exception
      'Build 0085 functional QA failed: service_role still has a write-capable gate-table privilege.';
  end if;

  v_pass_name :=
    'qzv' || v_suffix || 'xkp';
  v_pass_objective :=
    'mnr' || v_suffix || 'tcf';
  v_pass_acceptance :=
    'wgb' || v_suffix || 'jhs';

  v_duplicate_name :=
    'dup' || v_suffix || 'capability';
  v_duplicate_objective :=
    'dup' || v_suffix || 'objective';
  v_duplicate_acceptance :=
    'dup' || v_suffix || 'acceptance';

  v_request_evidence := jsonb_build_object(
    'local_handoff_verified', true,
    'repository_head_verified', true,
    'repository_tree_verified', true,
    'repository_evidence_verified', true,
    'tracked_diff_empty', true,
    'staged_diff_empty', true,
    'supabase_project_verified', true,
    'operator_session_verified', true,
    'transactional_qa_fixture', true,
    'fixture_persistence_allowed', false,
    'secret_values_recorded', false
  );

  -- Transactionally simulate formal closure of Build 0085 so the real wrapper
  -- can exercise the next-build path. The outer ROLLBACK restores this row.
  update public.athena_intake_preparation_packages
  set metadata =
    metadata ||
    jsonb_build_object(
      'formal_build_closed', true,
      'final_build_status', 'completed',
      'build_0085_transactional_qa_only', true
    )
  where id = v_current_package_id;

  if not found then
    raise exception
      'Build 0085 functional QA failed: current preparation package was not updated inside the rollback fixture.';
  end if;

  -- Transactionally stop the exact active timer. The outer ROLLBACK restores it.
  update public.athena_build_timer_sessions
  set
    status = 'stopped',
    stopped_at = clock_timestamp(),
    last_state_changed_at = clock_timestamp(),
    last_accounted_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    metadata =
      metadata ||
      jsonb_build_object(
        'build_0085_transactional_qa_only',
        true
      )
  where id = v_current_timer_id
    and status = 'active';

  get diagnostics v_timer_rows = row_count;

  if v_timer_rows <> 1 then
    raise exception
      'Build 0085 functional QA failed: exact active timer was not transactionally stopped.';
  end if;

  -- A completed exact-match candidate used by the duplicate fixture.
  insert into public.athena_intake_items (
    id,
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
  ) values (
    v_duplicate_candidate_intake_id,
    'build-0085-qa-duplicate-candidate-intake-' || v_suffix,
    'athena-cto',
    'cross-project-reuse-detector',
    v_duplicate_name,
    v_duplicate_objective,
    'build_0085_transactional_qa',
    'duplicate_candidate:' || v_suffix,
    'build-0085-functional-qa',
    'approved',
    'build-0085-qa-duplicate-candidate-fingerprint-' || v_suffix,
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  );

  insert into public.athena_intake_preparation_packages (
    id,
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
  ) values (
    v_duplicate_candidate_package_id,
    'build-0085-qa-duplicate-candidate-package-' || v_suffix,
    v_duplicate_candidate_intake_id,
    'athena-cto',
    'cross-project-reuse-detector',
    v_duplicate_name,
    null,
    null,
    v_duplicate_objective,
    array[v_duplicate_acceptance],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    jsonb_build_object(
      'formal_build_closed',
      true,
      'final_build_status',
      'completed',
      'transactional_qa_fixture',
      true
    )
  );

  -- Passing new-capability fixture.
  insert into public.athena_intake_items (
    id,
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
  ) values (
    v_pass_intake_id,
    'build-0085-qa-pass-intake-' || v_suffix,
    'athena-cto',
    'cross-project-reuse-detector',
    v_pass_name,
    v_pass_objective,
    'build_0085_transactional_qa',
    'pass:' || v_suffix,
    'build-0085-functional-qa',
    'approved',
    'build-0085-qa-pass-fingerprint-' || v_suffix,
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  );

  insert into public.athena_intake_review_history (
    id,
    intake_id,
    from_status_key,
    to_status_key,
    review_outcome,
    reviewed_by,
    decision_notes,
    metadata
  )
  select
    gen_random_uuid(),
    v_pass_intake_id,
    review_row.from_status_key,
    review_row.to_status_key,
    review_row.review_outcome,
    'build-0085-functional-qa',
    'Transactional approval fixture for Build 0085 automatic QA.',
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  from public.athena_intake_review_history as review_row
  where review_row.intake_id = v_current_intake_id
    and review_row.to_status_key = 'approved'
    and review_row.review_outcome = 'approve'
  order by review_row.created_at
  limit 1;

  get diagnostics v_review_rows = row_count;

  if v_review_rows <> 1 then
    raise exception
      'Build 0085 functional QA failed: pass fixture approval was not created exactly once.';
  end if;

  insert into public.athena_intake_preparation_packages (
    id,
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
  ) values (
    v_pass_package_id,
    'build-0085-qa-pass-package-' || v_suffix,
    v_pass_intake_id,
    'athena-cto',
    'cross-project-reuse-detector',
    v_pass_name,
    null,
    null,
    v_pass_objective,
    array[v_pass_acceptance],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  );

  v_pass_preview := public.athena_pre_build_gate_preview(
    v_pass_intake_id,
    v_pass_package_id,
    'athena-cto',
    'cross-project-reuse-detector',
    v_module_id,
    v_pass_name,
    'Athena OS',
    'Athena CTO',
    'C:\supabase\athena-os',
    '8f720277971aa0be16d1b75eab79c211287cac0a',
    'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
    '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
    'voiwlcvfahykdldtjeqy',
    'v1.8',
    '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
    v_request_evidence
  );

  if v_pass_preview ->> 'status' <> 'canonical_pre_build_gate_preview'
     or v_pass_preview ->> 'classification' <> 'new_capability'
     or v_pass_preview ->> 'decision' <> 'pass'
     or (v_pass_preview ->> 'start_allowed')::boolean is distinct from true
     or (v_pass_preview ->> 'requires_override')::boolean is distinct from false then
    raise exception
      'Build 0085 functional QA failed: new-capability preview did not pass.';
  end if;

  v_pass_result := public.athena_build_lifecycle_gate_and_start(
    v_pass_intake_id,
    v_pass_package_id,
    'athena-cto',
    'cross-project-reuse-detector',
    v_module_id,
    v_pass_name,
    'Athena OS',
    'Athena CTO',
    'C:\supabase\athena-os',
    '8f720277971aa0be16d1b75eab79c211287cac0a',
    'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
    '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
    'voiwlcvfahykdldtjeqy',
    'v1.8',
    '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
    'build-0085-functional-qa',
    'Build 0085 functional QA',
    'build-0085-qa-pass:' || v_suffix,
    null,
    '{}'::text[],
    v_request_evidence
  );

  if v_pass_result ->> 'status' <> 'canonical_build_assigned_and_started'
     or v_pass_result ->> 'gate_classification' <> 'new_capability'
     or v_pass_result ->> 'gate_decision' <> 'pass'
     or (v_pass_result ->> 'gate_override_used')::boolean is distinct from false
     or (v_pass_result ->> 'build_number')::integer
       <> v_current_state.build_number + 1
     or (v_pass_result ->> 'timer_started')::boolean is distinct from false
     or (v_pass_result ->> 'qa_created')::boolean is distinct from false
     or (v_pass_result ->> 'completion_created')::boolean is distinct from false
     or (v_pass_result ->> 'build_log_created')::boolean is distinct from false then
    raise exception
      'Build 0085 functional QA failed: passing wrapper path did not preserve its contract.';
  end if;

  v_pass_evaluation_id :=
    (v_pass_result ->> 'gate_evaluation_id')::uuid;
  v_pass_transition_id :=
    (v_pass_result ->> 'transition_id')::uuid;

  v_pass_qa_evidence :=
    public.athena_pre_build_gate_read_qa_evidence(
      v_pass_evaluation_id
    );

  if (v_pass_qa_evidence ->> 'linked_transition_id')::uuid
       is distinct from v_pass_transition_id
     or (
       v_pass_qa_evidence -> 'evaluation' ->> 'classification'
     ) <> 'new_capability'
     or (
       v_pass_qa_evidence ->> 'candidate_count'
     )::integer <> (
       v_pass_result ->> 'gate_candidate_count'
     )::integer
     or (v_pass_qa_evidence ->> 'old_rpc_service_role_execute')::boolean
       is distinct from true
     or (v_pass_qa_evidence ->> 'wrapper_service_role_execute')::boolean
       is distinct from true
     or (v_pass_qa_evidence ->> 'transition_gate_trigger_exists')::boolean
       is distinct from true then
    raise exception
      'Build 0085 functional QA failed: passing-path automatic QA evidence did not read back.';
  end if;

  -- Formally close the passing fixture inside the transaction so the governed
  -- override fixture can exercise a second lifecycle start. ROLLBACK removes it.
  update public.athena_intake_preparation_packages
  set metadata =
    metadata ||
    jsonb_build_object(
      'formal_build_closed',
      true,
      'final_build_status',
      'completed',
      'assigned_build_id',
      v_pass_result ->> 'build_id',
      'build_start_id',
      v_pass_result ->> 'build_id',
      'transactional_qa_fixture',
      true
    )
  where id = v_pass_package_id;

  if not found then
    raise exception
      'Build 0085 functional QA failed: passing fixture was not transactionally closed.';
  end if;

  -- Duplicate-completed fixture.
  insert into public.athena_intake_items (
    id,
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
  ) values (
    v_duplicate_intake_id,
    'build-0085-qa-duplicate-intake-' || v_suffix,
    'athena-cto',
    'cross-project-reuse-detector',
    v_duplicate_name,
    v_duplicate_objective,
    'build_0085_transactional_qa',
    'duplicate:' || v_suffix,
    'build-0085-functional-qa',
    'approved',
    'build-0085-qa-duplicate-fingerprint-' || v_suffix,
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  );

  insert into public.athena_intake_review_history (
    id,
    intake_id,
    from_status_key,
    to_status_key,
    review_outcome,
    reviewed_by,
    decision_notes,
    metadata
  )
  select
    gen_random_uuid(),
    v_duplicate_intake_id,
    review_row.from_status_key,
    review_row.to_status_key,
    review_row.review_outcome,
    'build-0085-functional-qa',
    'Transactional duplicate approval fixture for Build 0085 automatic QA.',
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  from public.athena_intake_review_history as review_row
  where review_row.intake_id = v_current_intake_id
    and review_row.to_status_key = 'approved'
    and review_row.review_outcome = 'approve'
  order by review_row.created_at
  limit 1;

  get diagnostics v_review_rows = row_count;

  if v_review_rows <> 1 then
    raise exception
      'Build 0085 functional QA failed: duplicate fixture approval was not created exactly once.';
  end if;

  insert into public.athena_intake_preparation_packages (
    id,
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
  ) values (
    v_duplicate_package_id,
    'build-0085-qa-duplicate-package-' || v_suffix,
    v_duplicate_intake_id,
    'athena-cto',
    'cross-project-reuse-detector',
    v_duplicate_name,
    null,
    null,
    v_duplicate_objective,
    array[v_duplicate_acceptance],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    jsonb_build_object(
      'transactional_qa_fixture',
      true
    )
  );

  v_duplicate_preview := public.athena_pre_build_gate_preview(
    v_duplicate_intake_id,
    v_duplicate_package_id,
    'athena-cto',
    'cross-project-reuse-detector',
    v_module_id,
    v_duplicate_name,
    'Athena OS',
    'Athena CTO',
    'C:\supabase\athena-os',
    '8f720277971aa0be16d1b75eab79c211287cac0a',
    'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
    '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
    'voiwlcvfahykdldtjeqy',
    'v1.8',
    '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
    v_request_evidence
  );

  if v_duplicate_preview ->> 'classification'
       <> 'duplicate_completed_scope'
     or v_duplicate_preview ->> 'decision' <> 'block'
     or (v_duplicate_preview ->> 'start_allowed')::boolean
       is distinct from false
     or (v_duplicate_preview ->> 'requires_override')::boolean
       is distinct from true
     or not (
       v_duplicate_preview -> 'blocking_reasons'
       ? 'duplicate_completed_scope'
     )
     or (v_duplicate_preview ->> 'top_match_score')::numeric <> 1 then
    raise exception
      'Build 0085 functional QA failed: exact completed duplicate was not blocked.';
  end if;

  v_duplicate_blocked_result :=
    public.athena_build_lifecycle_gate_and_start(
      v_duplicate_intake_id,
      v_duplicate_package_id,
      'athena-cto',
      'cross-project-reuse-detector',
      v_module_id,
      v_duplicate_name,
      'Athena OS',
      'Athena CTO',
      'C:\supabase\athena-os',
      '8f720277971aa0be16d1b75eab79c211287cac0a',
      'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
      '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
      'voiwlcvfahykdldtjeqy',
      'v1.8',
      '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
      'build-0085-functional-qa',
      'Build 0085 functional QA',
      'build-0085-qa-duplicate:' || v_suffix,
      null,
      '{}'::text[],
      v_request_evidence
    );

  if v_duplicate_blocked_result ->> 'status'
       <> 'canonical_pre_build_gate_blocked'
     or v_duplicate_blocked_result ->> 'gate_decision' <> 'block'
     or (v_duplicate_blocked_result ->> 'gate_override_used')::boolean
       is distinct from false
     or (v_duplicate_blocked_result ->> 'timer_started')::boolean
       is distinct from false
     or (v_duplicate_blocked_result ->> 'qa_created')::boolean
       is distinct from false
     or (v_duplicate_blocked_result ->> 'completion_created')::boolean
       is distinct from false
     or (v_duplicate_blocked_result ->> 'build_log_created')::boolean
       is distinct from false then
    raise exception
      'Build 0085 functional QA failed: duplicate block result was invalid.';
  end if;

  v_duplicate_evaluation_id :=
    (v_duplicate_blocked_result ->> 'gate_evaluation_id')::uuid;

  if exists (
    select 1
    from public.athena_build_lifecycle_transitions
    where operation_key =
      'build-0085-qa-duplicate:' || v_suffix
  ) then
    raise exception
      'Build 0085 functional QA failed: blocked duplicate created a lifecycle transition.';
  end if;

  begin
    perform public.athena_build_lifecycle_gate_and_start(
      v_duplicate_intake_id,
      v_duplicate_package_id,
      'athena-cto',
      'cross-project-reuse-detector',
      v_module_id,
      v_duplicate_name,
      'Athena OS',
      'Athena CTO',
      'C:\supabase\athena-os',
      '8f720277971aa0be16d1b75eab79c211287cac0a',
      'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
      '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
      'voiwlcvfahykdldtjeqy',
      'v1.8',
      '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
      'build-0085-functional-qa',
      'Build 0085 functional QA',
      'build-0085-qa-duplicate:' || v_suffix,
      'This deliberately incomplete acknowledgement must be rejected.',
      array['wrong_reason_code'],
      v_request_evidence
    );
  exception
    when others then
      v_wrong_acknowledgement_rejected :=
        position(
          'acknowledge every exact blocking-reason code'
          in sqlerrm
        ) > 0;
  end;

  if not v_wrong_acknowledgement_rejected then
    raise exception
      'Build 0085 functional QA failed: incomplete override acknowledgement was not rejected.';
  end if;

  v_duplicate_blocking_reasons := array(
    select jsonb_array_elements_text(
      v_duplicate_preview -> 'blocking_reasons'
    )
    order by 1
  );

  v_duplicate_override_result :=
    public.athena_build_lifecycle_gate_and_start(
      v_duplicate_intake_id,
      v_duplicate_package_id,
      'athena-cto',
      'cross-project-reuse-detector',
      v_module_id,
      v_duplicate_name,
      'Athena OS',
      'Athena CTO',
      'C:\supabase\athena-os',
      '8f720277971aa0be16d1b75eab79c211287cac0a',
      'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
      '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
      'voiwlcvfahykdldtjeqy',
      'v1.8',
      '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
      'build-0085-functional-qa',
      'Build 0085 functional QA',
      'build-0085-qa-duplicate:' || v_suffix,
      'Transactional governed override confirms exact reason acknowledgement.',
      v_duplicate_blocking_reasons,
      v_request_evidence
    );

  if v_duplicate_override_result ->> 'status'
       <> 'canonical_build_assigned_and_started'
     or v_duplicate_override_result ->> 'gate_classification'
       <> 'duplicate_completed_scope'
     or v_duplicate_override_result ->> 'gate_decision' <> 'override'
     or (v_duplicate_override_result ->> 'gate_override_used')::boolean
       is distinct from true
     or (v_duplicate_override_result ->> 'build_number')::integer
       <> (v_pass_result ->> 'build_number')::integer + 1
     or nullif(
       v_duplicate_override_result ->> 'gate_override_id',
       ''
     ) is null then
    raise exception
      'Build 0085 functional QA failed: governed override path did not start correctly.';
  end if;

  v_duplicate_transition_id :=
    (v_duplicate_override_result ->> 'transition_id')::uuid;

  v_duplicate_replay_result :=
    public.athena_build_lifecycle_gate_and_start(
      v_duplicate_intake_id,
      v_duplicate_package_id,
      'athena-cto',
      'cross-project-reuse-detector',
      v_module_id,
      v_duplicate_name,
      'Athena OS',
      'Athena CTO',
      'C:\supabase\athena-os',
      '8f720277971aa0be16d1b75eab79c211287cac0a',
      'b3e09d7d4cbc62c24cd8e781594c89819895b84b',
      '1f64c6390170c921cac2bdbd090e378ab6b9197ce2fd7c8fc501794e6794e967',
      'voiwlcvfahykdldtjeqy',
      'v1.8',
      '64821945ad1422b495bf866cc2d95d69a2393e4b88840653e811ef9b0215407f',
      'build-0085-functional-qa',
      'Build 0085 functional QA',
      'build-0085-qa-duplicate:' || v_suffix,
      'Transactional governed override confirms exact reason acknowledgement.',
      v_duplicate_blocking_reasons,
      v_request_evidence
    );

  if (v_duplicate_replay_result ->> 'idempotent_replay')::boolean
       is distinct from true
     or (
       v_duplicate_replay_result ->> 'replayed_transition_id'
     )::uuid is distinct from v_duplicate_transition_id
     or (
       v_duplicate_replay_result ->> 'gate_evaluation_id'
     )::uuid is distinct from v_duplicate_evaluation_id
     or (v_duplicate_replay_result ->> 'gate_override_used')::boolean
       is distinct from true then
    raise exception
      'Build 0085 functional QA failed: governed override replay was not idempotent.';
  end if;

  v_duplicate_qa_evidence :=
    public.athena_pre_build_gate_read_qa_evidence(
      v_duplicate_evaluation_id
    );

  if (v_duplicate_qa_evidence ->> 'linked_transition_id')::uuid
       is distinct from v_duplicate_transition_id
     or v_duplicate_qa_evidence -> 'override' is null
     or (
       v_duplicate_qa_evidence -> 'evaluation' ->> 'decision'
     ) <> 'block'
     or (
       v_duplicate_qa_evidence ->> 'candidate_count'
     )::integer <> (
       v_duplicate_override_result ->> 'gate_candidate_count'
     )::integer then
    raise exception
      'Build 0085 functional QA failed: governed override QA evidence did not read back.';
  end if;

  -- Deterministic classification matrix.
  v_classification_result :=
    public.athena_pre_build_classify(
      'Repair existing workflow',
      'Fix the broken existing workflow',
      array['The defect is corrected'],
      '{}'::text[],
      jsonb_build_array(
        jsonb_build_object(
          'candidate_title',
          'Existing workflow',
          'completed',
          true,
          'candidate_status',
          'completed',
          'final_score',
          0.95
        )
      )
    );

  if v_classification_result ->> 'classification' <> 'repair_existing'
     or v_classification_result ->> 'decision' <> 'pass'
     or v_classification_result ->> 'narrowed_scope'
       not like 'Repair only the verified defect%' then
    raise exception
      'Build 0085 functional QA failed: repair classification/narrowing failed.';
  end if;

  v_classification_result :=
    public.athena_pre_build_classify(
      'Extend existing workflow',
      'Add a governed extension to the workflow',
      array['The extension works'],
      '{}'::text[],
      jsonb_build_array(
        jsonb_build_object(
          'candidate_title',
          'Existing workflow',
          'completed',
          true,
          'candidate_status',
          'completed',
          'final_score',
          0.95
        )
      )
    );

  if v_classification_result ->> 'classification' <> 'extension_existing'
     or v_classification_result ->> 'decision' <> 'pass'
     or v_classification_result ->> 'narrowed_scope'
       not like 'Extend existing capability%' then
    raise exception
      'Build 0085 functional QA failed: extension classification/narrowing failed.';
  end if;

  v_classification_result :=
    public.athena_pre_build_classify(
      'Overlapping active workflow',
      'Create scope already being implemented by another active build',
      array['No concurrent duplicate implementation'],
      '{}'::text[],
      jsonb_build_array(
        jsonb_build_object(
          'candidate_title',
          'Active overlapping workflow',
          'candidate_status',
          'started',
          'completed',
          false,
          'final_score',
          0.70
        )
      )
    );

  if v_classification_result ->> 'classification'
       <> 'insufficient_evidence'
     or v_classification_result ->> 'decision' <> 'block'
     or not (
       v_classification_result -> 'blocking_reasons'
       ? 'active_scope_conflict'
     ) then
    raise exception
      'Build 0085 functional QA failed: active-scope conflict was not blocked.';
  end if;

  v_classification_result :=
    public.athena_pre_build_classify(
      'Ambiguous capability',
      'Potentially overlaps another capability',
      '{}'::text[],
      array['Scope owner is unresolved'],
      '[]'::jsonb
    );

  if v_classification_result ->> 'classification'
       <> 'insufficient_evidence'
     or v_classification_result ->> 'decision' <> 'block'
     or not (
       v_classification_result -> 'blocking_reasons'
       ? 'preparation_package_evidence_incomplete'
     ) then
    raise exception
      'Build 0085 functional QA failed: insufficient evidence was not blocked.';
  end if;

  if public.athena_pre_build_overlap_score(
       'alpha beta',
       'alpha beta'
     ) <> 1
     or public.athena_pre_build_overlap_score(
       'alpha',
       'omega'
     ) <> 0
     or public.athena_pre_build_overlap_score(
       'alpha beta',
       'alpha'
     ) not between 0 and 1 then
    raise exception
      'Build 0085 functional QA failed: deterministic overlap score bounds failed.';
  end if;

  -- Direct historical RPC bypass attempt: the mandatory transition trigger
  -- must reject a transition that has no persisted gate evaluation.
  begin
    insert into public.athena_build_lifecycle_transitions (
      id,
      state_id,
      event_type,
      operation_key,
      request_hash,
      result_hash,
      build_number,
      build_id,
      build_title,
      intake_id,
      preparation_package_id,
      project_key,
      module_key,
      module_id,
      from_state,
      to_state,
      actor_key,
      actor_display_name,
      assignment_method,
      start_method,
      request_evidence,
      result_snapshot,
      created_at
    )
    select
      gen_random_uuid(),
      transition_row.state_id,
      transition_row.event_type,
      'build-0085-qa-ungated:' || v_suffix,
      transition_row.request_hash,
      transition_row.result_hash,
      transition_row.build_number,
      transition_row.build_id,
      transition_row.build_title,
      transition_row.intake_id,
      transition_row.preparation_package_id,
      transition_row.project_key,
      transition_row.module_key,
      transition_row.module_id,
      transition_row.from_state,
      transition_row.to_state,
      'build-0085-functional-qa',
      'Build 0085 functional QA',
      transition_row.assignment_method,
      transition_row.start_method,
      '{}'::jsonb,
      transition_row.result_snapshot,
      clock_timestamp()
    from public.athena_build_lifecycle_transitions
      as transition_row
    order by transition_row.created_at desc
    limit 1;
  exception
    when others then
      v_ungated_transition_rejected :=
        position(
          'no persisted pre-build gate evaluation exists'
          in sqlerrm
        ) > 0;
  end;

  if not v_ungated_transition_rejected then
    raise exception
      'Build 0085 functional QA failed: ungated transition bypass was not rejected.';
  end if;

  begin
    update public.athena_pre_build_gate_evaluations
    set narrowed_scope = 'Mutation must be rejected'
    where id = v_pass_evaluation_id;
  exception
    when others then
      v_evaluation_update_rejected :=
        position('append-only' in sqlerrm) > 0;
  end;

  if not v_evaluation_update_rejected then
    raise exception
      'Build 0085 functional QA failed: evaluation append-only update guard failed.';
  end if;

  begin
    delete from public.athena_pre_build_gate_candidate_matches
    where evaluation_id = v_duplicate_evaluation_id;
  exception
    when others then
      v_candidate_delete_rejected :=
        position('append-only' in sqlerrm) > 0;
  end;

  if not v_candidate_delete_rejected then
    raise exception
      'Build 0085 functional QA failed: candidate append-only delete guard failed.';
  end if;

  begin
    delete from public.athena_pre_build_gate_overrides
    where evaluation_id = v_duplicate_evaluation_id;
  exception
    when others then
      v_override_delete_rejected :=
        position('append-only' in sqlerrm) > 0;
  end;

  if not v_override_delete_rejected then
    raise exception
      'Build 0085 functional QA failed: override append-only delete guard failed.';
  end if;

  v_expected_candidate_rows :=
    v_candidate_count_before
    + (v_pass_result ->> 'gate_candidate_count')::integer
    + (v_duplicate_override_result ->> 'gate_candidate_count')::integer;

  if (
    select count(*)
    from public.athena_pre_build_gate_evaluations
  ) <> v_evaluation_count_before + 2
  or (
    select count(*)
    from public.athena_pre_build_gate_candidate_matches
  ) <> v_expected_candidate_rows
  or (
    select count(*)
    from public.athena_pre_build_gate_overrides
  ) <> v_override_count_before + 1
  or (
    select count(*)
    from public.athena_build_lifecycle_transitions
  ) <> v_transition_count_before + 2
  or (
    select count(*)
    from public.athena_qa_runs
  ) <> v_qa_count_before
  or (
    select count(*)
    from public.athena_feature_completion_events
  ) <> v_completion_event_count_before
  or (
    select count(*)
    from public.athena_feature_completion_packets
  ) <> v_completion_packet_count_before
  or (
    select count(*)
    from public.athena_build_logs
  ) <> v_build_log_count_before then
    raise exception
      'Build 0085 functional QA failed: transactional fixture row-count contract failed.';
  end if;

  if (
    select count(*)
    from public.athena_build_timer_sessions
    where status in ('active', 'paused', 'idle')
  ) <> 0 then
    raise exception
      'Build 0085 functional QA failed: a lifecycle wrapper unexpectedly created or reactivated a timer.';
  end if;

  if (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id = v_current_qa_run_id
      and status = 'pass'
  ) <> 4
  or (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id = v_current_qa_run_id
      and status = 'pending'
  ) <> 8 then
    raise exception
      'Build 0085 functional QA failed: the transactional fixture changed the active QA run.';
  end if;
end;
$build_0085_functional_qa$;

-- Every fixture row and the temporary 0086/0087 lifecycle state are removed.
rollback;

-- Independent post-rollback verification.
do $build_0085_post_rollback$
declare
  v_bad_privileges text[];
begin
  if (
    select count(*)
    from public.athena_pre_build_gate_evaluations
  ) <> 0
  or (
    select count(*)
    from public.athena_pre_build_gate_candidate_matches
  ) <> 0
  or (
    select count(*)
    from public.athena_pre_build_gate_overrides
  ) <> 0 then
    raise exception
      'Build 0085 post-rollback verification failed: a transactional gate fixture persisted.';
  end if;

  if (
    select count(*)
    from public.athena_build_lifecycle_state
    where id =
        '55a13a94-8af2-446f-b94e-5df30b112fce'::uuid
      and singleton_key
      and build_id = '0085'
      and build_title =
        '0085 Build title: Pre-Build Redundancy and Existing-Capability Gate'
      and lifecycle_status = 'started'
      and intake_id =
        '387e2cc0-6427-43ef-8a77-156e4b6f35e2'::uuid
      and preparation_package_id =
        'ac674c9d-e31c-45ef-bb27-b00a8e5aad35'::uuid
      and project_key = 'athena-cto'
      and module_key = 'cross-project-reuse-detector'
      and module_id =
        '50d2c3df-a8d2-4a3b-a15b-4d1dbf0e587c'::uuid
  ) <> 1 then
    raise exception
      'Build 0085 post-rollback verification failed: canonical lifecycle state was not restored.';
  end if;

  if (
    select count(*)
    from public.athena_build_lifecycle_transitions
    where id =
      '148fddb5-420f-449c-873b-6b6a1d7496b5'::uuid
      and build_id = '0085'
      and event_type = 'assigned_started'
  ) <> 1 then
    raise exception
      'Build 0085 post-rollback verification failed: canonical transition was not preserved.';
  end if;

  if (
    select count(*)
    from public.athena_build_timer_sessions
    where id =
      '1cd83ad3-23a0-43c0-b993-6ab17a53f664'::uuid
      and status = 'active'
  ) <> 1 then
    raise exception
      'Build 0085 post-rollback verification failed: active timer was not restored.';
  end if;

  if (
    select count(*)
    from public.athena_qa_runs
    where id =
      'b501717b-af63-4504-b519-128702cd1b7b'::uuid
      and status = 'pending'
  ) <> 1
  or (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id =
      'b501717b-af63-4504-b519-128702cd1b7b'::uuid
      and status = 'pass'
  ) <> 4
  or (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id =
      'b501717b-af63-4504-b519-128702cd1b7b'::uuid
      and status = 'pending'
  ) <> 8
  or (
    select count(*)
    from public.athena_qa_check_results
    where qa_run_id =
      'b501717b-af63-4504-b519-128702cd1b7b'::uuid
  ) <> 12 then
    raise exception
      'Build 0085 post-rollback verification failed: QA state was not preserved.';
  end if;

  if (
    select count(*)
    from public.athena_feature_completion_events
    where coalesce(
      to_jsonb(athena_feature_completion_events)
        ->> 'build_session_title',
      ''
    ) =
      '0085 Build title: Pre-Build Redundancy and Existing-Capability Gate'
  ) <> 0
  or (
    select count(*)
    from public.athena_feature_completion_packets
    where coalesce(
      to_jsonb(athena_feature_completion_packets)
        ->> 'build_session_title',
      ''
    ) =
      '0085 Build title: Pre-Build Redundancy and Existing-Capability Gate'
  ) <> 0
  or (
    select count(*)
    from public.athena_build_logs
    where coalesce(
      to_jsonb(athena_build_logs) ->> 'session_title',
      to_jsonb(athena_build_logs) ->> 'build_session_title',
      ''
    ) =
      '0085 Build title: Pre-Build Redundancy and Existing-Capability Gate'
  ) <> 0 then
    raise exception
      'Build 0085 post-rollback verification failed: completion or build-log state changed.';
  end if;

  select coalesce(
    array_agg(failure order by failure),
    '{}'::text[]
  )
  into v_bad_privileges
  from (
    select table_name || ':select_missing' as failure
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    where not has_table_privilege(
      'service_role',
      target.table_name,
      'SELECT'
    )

    union all

    select table_name || ':' || privilege_name || '_present'
    from (
      values
        ('public.athena_pre_build_gate_evaluations'),
        ('public.athena_pre_build_gate_candidate_matches'),
        ('public.athena_pre_build_gate_overrides')
    ) as target(table_name)
    cross join (
      values
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'service_role',
      target.table_name,
      privileges.privilege_name
    )
  ) as failures;

  if cardinality(v_bad_privileges) > 0 then
    raise exception
      'Build 0085 post-rollback verification failed: privilege boundary drifted: %',
      array_to_string(v_bad_privileges, ', ');
  end if;
end;
$build_0085_post_rollback$;

select jsonb_pretty(
  jsonb_build_object(
    'status',
      'build_0085_gate_functional_and_automatic_qa_transactional_validation_pass',
    'target_supabase_project_ref',
      'voiwlcvfahykdldtjeqy',
    'transactional_fixture',
      true,
    'fixture_rollback_verified',
      true,
    'persistent_build_0086_created',
      false,
    'persistent_build_0087_created',
      false,
    'functional_matrix',
      jsonb_build_object(
        'new_capability_preview_pass',
          true,
        'new_capability_wrapper_start_pass',
          true,
        'repair_existing_narrowed_scope_pass',
          true,
        'extension_existing_narrowed_scope_pass',
          true,
        'duplicate_completed_scope_block_pass',
          true,
        'insufficient_evidence_block_pass',
          true,
        'active_scope_conflict_block_pass',
          true,
        'governed_override_exact_acknowledgement_pass',
          true,
        'governed_override_incomplete_acknowledgement_rejected',
          true,
        'governed_override_idempotent_replay_pass',
          true,
        'automatic_qa_evidence_rpc_readback_pass',
          true,
        'deterministic_overlap_score_bounds_pass',
          true
      ),
    'security_matrix',
      jsonb_build_object(
        'service_role_exact_select_only_gate_tables',
          true,
        'browser_roles_no_gate_table_access',
          true,
        'ungated_transition_rejected',
          true,
        'evaluation_append_only_update_rejected',
          true,
        'candidate_append_only_delete_rejected',
          true,
        'override_append_only_delete_rejected',
          true,
        'transition_gate_trigger_verified',
          true
      ),
    'preserved_live_state',
      jsonb_build_object(
        'lifecycle_build_id',
          '0085',
        'timer_status',
          'active',
        'qa_total',
          12,
        'qa_pass',
          4,
        'qa_pending',
          8,
        'completion_event_count',
          0,
        'completion_packet_count',
          0,
        'build_log_count',
          0,
        'gate_evaluation_count',
          0,
        'gate_candidate_count',
          0,
        'gate_override_count',
          0
      ),
    'persistent_mutations',
      jsonb_build_object(
        'database',
          false,
        'timer',
          false,
        'qa',
          false,
        'completion',
          false,
        'build_log',
          false,
        'git',
          false
      ),
    'next_required_state',
      'refresh_build_0085_automatic_qa_and_verify_all_machine_checks'
  )
) as build_0085_gate_functional_and_automatic_qa_transactional_validation;
