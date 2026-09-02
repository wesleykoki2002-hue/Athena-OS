-- Static and deployed-contract QA. The transactional suite exercises mutations.
do $qa$
declare
  v_def text;
  v_tests integer := 0;
begin
  select pg_get_functiondef('public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure) into v_def;
  if position('security definer' in lower(v_def)) > 0 then v_tests := v_tests + 1; else raise exception 'QA 1'; end if;
  if position('set search_path to ''pg_catalog'', ''public''' in lower(v_def)) > 0 then v_tests := v_tests + 1; else raise exception 'QA 2'; end if;
  if position('athena_pre_build_gate_evaluations' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 3'; end if;
  if position('athena_build_lifecycle_state' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 4'; end if;
  if position('athena_build_lifecycle_transitions' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 5'; end if;
  if position('athena_build_timer_sessions' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 6'; end if;
  if position('repository_path_reconciliations' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 7'; end if;
  if position('operation key was already used with conflicting arguments' in lower(v_def)) > 0 then v_tests := v_tests + 1; else raise exception 'QA 8'; end if;
  if position('repository path conflicts' in lower(v_def)) > 0 then v_tests := v_tests + 1; else raise exception 'QA 9'; end if;
  if position("to_jsonb(v_after) - 'metadata' - 'updated_at'" in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 10'; end if;
  if has_function_privilege('service_role','public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE') then v_tests := v_tests + 1; else raise exception 'QA 11'; end if;
  if not has_function_privilege('authenticated','public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE') then v_tests := v_tests + 1; else raise exception 'QA 12'; end if;
  if not has_function_privilege('anon','public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE') then v_tests := v_tests + 1; else raise exception 'QA 13'; end if;
  if not has_table_privilege('service_role','public.athena_intake_preparation_packages','UPDATE') then v_tests := v_tests + 1; else raise exception 'QA 14'; end if;
  if position('p_evidence' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 15'; end if;
  if position('worktree_clean' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 16'; end if;
  if position('repository_head' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 17'; end if;
  if position('repository_tree' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 18'; end if;
  if position('structurally invalid' in lower(v_def)) > 0 then v_tests := v_tests + 1; else raise exception 'QA 19'; end if;
  if position('where id = p_preparation_package_id and intake_id = p_intake_id' in lower(v_def)) > 0 then v_tests := v_tests + 1; else raise exception 'QA 20'; end if;
  if position('repository_path_already_canonical' in v_def) > 0 then v_tests := v_tests + 1; else raise exception 'QA 21'; end if;
  if v_tests <> 21 then raise exception 'Expected 21 automatic QA assertions, got %', v_tests; end if;
end;
$qa$;
