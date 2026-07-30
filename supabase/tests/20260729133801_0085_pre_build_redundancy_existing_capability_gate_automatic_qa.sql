-- Build 0085 automatic QA and transactional rollback fixture.
-- This test intentionally rolls back all fixture rows.

begin;

do $qa$
declare
  v_state public.athena_build_lifecycle_state%rowtype;
  v_evaluation_id uuid := gen_random_uuid();
  v_operation_key text := 'build-0085-qa:' || md5(clock_timestamp()::text);
  v_candidates jsonb;
  v_result jsonb;
  v_mutation_blocked boolean := false;
  v_transition_blocked boolean := false;
  v_old_rpc oid;
  v_wrapper_rpc oid;
begin
  if to_regclass('public.athena_pre_build_gate_evaluations') is null
     or to_regclass('public.athena_pre_build_gate_candidate_matches') is null
     or to_regclass('public.athena_pre_build_gate_overrides') is null then
    raise exception 'Build 0085 gate relations are missing.';
  end if;

  v_old_rpc := to_regprocedure(
    'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
  );
  v_wrapper_rpc := to_regprocedure(
    'public.athena_build_lifecycle_gate_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],jsonb)'
  );

  if v_old_rpc is null or v_wrapper_rpc is null then
    raise exception 'Required lifecycle RPCs are missing.';
  end if;

  if not has_function_privilege('service_role', v_old_rpc, 'EXECUTE') then
    raise exception 'Historical lifecycle RPC service-role compatibility was unexpectedly removed.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid =
      'public.athena_build_lifecycle_transitions'::regclass
      and trigger_row.tgname =
        'athena_build_lifecycle_transitions_require_pre_build_gate'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Mandatory lifecycle transition gate trigger is missing.';
  end if;

  if not has_function_privilege('service_role', v_wrapper_rpc, 'EXECUTE') then
    raise exception 'The gate-enforced lifecycle wrapper is not executable by service_role.';
  end if;

  begin
    insert into public.athena_build_lifecycle_transitions (
      id, state_id, event_type, operation_key, request_hash, result_hash,
      build_number, build_id, build_title, intake_id, preparation_package_id,
      project_key, module_key, module_id, from_state, to_state, actor_key,
      actor_display_name, assignment_method, start_method, request_evidence,
      result_snapshot, created_at
    )
    select
      gen_random_uuid(), transition_row.state_id, transition_row.event_type,
      v_operation_key || ':ungated', transition_row.request_hash,
      transition_row.result_hash, transition_row.build_number,
      transition_row.build_id, transition_row.build_title,
      transition_row.intake_id, transition_row.preparation_package_id,
      transition_row.project_key, transition_row.module_key,
      transition_row.module_id, transition_row.from_state,
      transition_row.to_state, transition_row.actor_key,
      transition_row.actor_display_name, transition_row.assignment_method,
      transition_row.start_method, '{}'::jsonb,
      transition_row.result_snapshot, clock_timestamp()
    from public.athena_build_lifecycle_transitions as transition_row
    where transition_row.event_type = 'assigned_started'
    order by transition_row.created_at desc
    limit 1;
  exception when others then
    v_transition_blocked := position(
      'no persisted pre-build gate evaluation exists' in sqlerrm
    ) > 0;
  end;

  if not v_transition_blocked then
    raise exception
      'Ungated direct lifecycle transition insert was not rejected by the mandatory gate trigger.';
  end if;

  if has_function_privilege('anon', v_wrapper_rpc, 'EXECUTE')
     or has_function_privilege('authenticated', v_wrapper_rpc, 'EXECUTE') then
    raise exception 'A browser role can execute the gate-enforced lifecycle wrapper.';
  end if;

  v_candidates := jsonb_build_array(
    jsonb_build_object(
      'candidate_title', 'Completed matching capability',
      'completed', true,
      'final_score', 0.90
    )
  );

  v_result := public.athena_pre_build_classify(
    'Create matching capability',
    'Create the same completed capability',
    array['The capability exists'],
    '{}'::text[],
    v_candidates
  );
  if v_result ->> 'classification' <> 'duplicate_completed_scope'
     or v_result ->> 'decision' <> 'block' then
    raise exception 'Duplicate-completed classification fixture failed.';
  end if;

  v_result := public.athena_pre_build_classify(
    'Repair existing workflow',
    'Fix the broken existing workflow',
    array['The defect is corrected'],
    '{}'::text[],
    jsonb_build_array(
      jsonb_build_object(
        'candidate_title', 'Existing workflow',
        'completed', true,
        'candidate_status', 'completed',
        'final_score', 0.95
      )
    )
  );
  if v_result ->> 'classification' <> 'repair_existing'
     or v_result ->> 'decision' <> 'pass' then
    raise exception 'Repair classification fixture failed.';
  end if;

  v_result := public.athena_pre_build_classify(
    'Extend existing workflow',
    'Add a governed extension to the workflow',
    array['The extension works'],
    '{}'::text[],
    jsonb_build_array(
      jsonb_build_object(
        'candidate_title', 'Existing workflow',
        'completed', true,
        'candidate_status', 'completed',
        'final_score', 0.95
      )
    )
  );
  if v_result ->> 'classification' <> 'extension_existing'
     or v_result ->> 'decision' <> 'pass' then
    raise exception 'Extension classification fixture failed.';
  end if;

  v_result := public.athena_pre_build_classify(
    'Overlapping active workflow',
    'Create scope already being implemented by another active build',
    array['No concurrent duplicate implementation'],
    '{}'::text[],
    jsonb_build_array(
      jsonb_build_object(
        'candidate_title', 'Active overlapping workflow',
        'candidate_status', 'started',
        'completed', false,
        'final_score', 0.70
      )
    )
  );
  if v_result ->> 'classification' <> 'insufficient_evidence'
     or v_result ->> 'decision' <> 'block'
     or not (v_result -> 'blocking_reasons' ? 'active_scope_conflict') then
    raise exception 'Active-scope conflict fixture failed.';
  end if;

  v_result := public.athena_pre_build_classify(
    'Distinct capability',
    'Create a genuinely distinct governed capability',
    array['The distinct capability works'],
    '{}'::text[],
    '[]'::jsonb
  );
  if v_result ->> 'classification' <> 'new_capability'
     or v_result ->> 'decision' <> 'pass' then
    raise exception 'New-capability classification fixture failed.';
  end if;

  v_result := public.athena_pre_build_classify(
    'Ambiguous capability',
    'Potentially overlaps another capability',
    '{}'::text[],
    array['Scope owner is unresolved'],
    '[]'::jsonb
  );
  if v_result ->> 'classification' <> 'insufficient_evidence'
     or v_result ->> 'decision' <> 'block' then
    raise exception 'Insufficient-evidence classification fixture failed.';
  end if;

  if public.athena_pre_build_overlap_score('alpha beta', 'alpha beta') <> 1
     or public.athena_pre_build_overlap_score('alpha', 'omega') <> 0
     or public.athena_pre_build_overlap_score('alpha beta', 'alpha') not between 0 and 1 then
    raise exception 'Deterministic overlap-score bounds failed.';
  end if;

  select * into strict v_state
  from public.athena_build_lifecycle_state
  where singleton_key;

  insert into public.athena_pre_build_gate_evaluations (
    id, operation_key, request_hash, scope_hash,
    intake_id, preparation_package_id, project_key, module_key, module_id,
    build_name, target_system, tracking_system,
    classification, decision, start_allowed, requires_override,
    top_match_score, candidate_count, narrowed_scope,
    missing_evidence, blocking_reasons,
    repository_path, repository_head, repository_tree,
    repository_evidence_sha256, supabase_project_ref,
    handoff_version, handoff_sha256,
    actor_key, actor_display_name, request_evidence,
    result_snapshot, lifecycle_transition_id
  ) values (
    v_evaluation_id, v_operation_key, repeat('a', 64), repeat('b', 64),
    v_state.intake_id, v_state.preparation_package_id,
    v_state.project_key, v_state.module_key, v_state.module_id,
    'Build 0085 append-only QA fixture', v_state.target_system,
    v_state.tracking_system, 'insufficient_evidence', 'block', false, true,
    0.50, 1, 'Fixture only', array['fixture_missing'],
    array['preparation_package_evidence_incomplete'],
    v_state.repository_path, v_state.repository_head,
    repeat('c', 40), repeat('d', 64), v_state.supabase_project_ref,
    v_state.handoff_version, v_state.handoff_sha256,
    'build-0085-automatic-qa', 'Build 0085 automatic QA',
    jsonb_build_object('fixture', true),
    jsonb_build_object('fixture', true), null
  );

  insert into public.athena_pre_build_gate_candidate_matches (
    evaluation_id, rank, source_type, source_id,
    candidate_title, completed, exact_title_match, exact_scope_match,
    title_overlap, scope_overlap, final_score, matching_tokens, evidence
  ) values (
    v_evaluation_id, 1, 'qa_fixture', 'qa_fixture_1',
    'QA fixture candidate', false, false, false,
    0.50, 0.50, 0.50, array['fixture'], jsonb_build_object('fixture', true)
  );

  begin
    update public.athena_pre_build_gate_evaluations
    set narrowed_scope = 'Mutation should fail'
    where id = v_evaluation_id;
  exception when others then
    v_mutation_blocked := position('append-only' in sqlerrm) > 0;
  end;
  if not v_mutation_blocked then
    raise exception 'Evaluation append-only trigger did not block mutation.';
  end if;

  v_mutation_blocked := false;
  begin
    delete from public.athena_pre_build_gate_candidate_matches
    where evaluation_id = v_evaluation_id;
  exception when others then
    v_mutation_blocked := position('append-only' in sqlerrm) > 0;
  end;
  if not v_mutation_blocked then
    raise exception 'Candidate append-only trigger did not block deletion.';
  end if;
end;
$qa$;

select jsonb_pretty(
  jsonb_build_object(
    'status', 'build_0085_pre_build_gate_automatic_qa_pass',
    'transactional_fixture', true,
    'fixture_rollback_required', true,
    'old_rpc_service_role_execute', has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'
      ),
      'EXECUTE'
    ),
    'wrapper_service_role_execute', has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.athena_build_lifecycle_gate_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],jsonb)'
      ),
      'EXECUTE'
    ),
    'transition_gate_trigger_exists', exists (
      select 1
      from pg_catalog.pg_trigger as trigger_row
      where trigger_row.tgrelid =
        'public.athena_build_lifecycle_transitions'::regclass
        and trigger_row.tgname =
          'athena_build_lifecycle_transitions_require_pre_build_gate'
        and not trigger_row.tgisinternal
    ),
    'evaluation_rows_inside_fixture', (
      select count(*) from public.athena_pre_build_gate_evaluations
    ),
    'candidate_rows_inside_fixture', (
      select count(*) from public.athena_pre_build_gate_candidate_matches
    )
  )
) as build_0085_pre_build_gate_automatic_qa;

rollback;
