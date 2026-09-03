begin;

-- Build 0090 automatic QA. All fixture writes are transaction-isolated.
do $qa$
declare
  v_original_intake constant uuid := '90000000-0000-4000-8000-000000000001';
  v_original_package constant uuid := '90000000-0000-4000-8000-000000000002';
  v_replacement_intake constant uuid := '90000000-0000-4000-8000-000000000003';
  v_replacement_package constant uuid := '90000000-0000-4000-8000-000000000004';
  v_third_intake constant uuid := '90000000-0000-4000-8000-000000000005';
  v_third_package constant uuid := '90000000-0000-4000-8000-000000000006';
  v_result jsonb;
  v_candidates_before jsonb;
  v_candidates_after jsonb;
  v_classification jsonb;
  v_original_hash text;
  v_original_hash_after text;
begin
  -- Deterministic BDNA-GOV-0001 semantic reproduction fixture.
  insert into public.athena_intake_items
    (id,intake_key,project_key,module_key,title,description,source_type,status_key,duplicate_fingerprint,metadata)
  values
    (v_original_intake,'qa-0090-original','beautydna','repository-governance','BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Build 0090 defective predecessor fixture.','automatic_qa','approved','qa0090-original',jsonb_build_object('build_id','BDNA-GOV-0001')),
    (v_replacement_intake,'qa-0090-replacement','beautydna','repository-governance','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Build 0090 valid replacement fixture.','automatic_qa','approved','qa0090-replacement',jsonb_build_object('build_id','BDNA-GOV-0001'));

  insert into public.athena_intake_review_history
    (intake_id,from_status_key,to_status_key,review_outcome,reviewed_by,decision_notes,metadata)
  select id,'pending_review','approved','approve','qa-0090','transaction fixture','{}'::jsonb
  from public.athena_intake_items where id in (v_original_intake,v_replacement_intake);

  insert into public.athena_intake_preparation_packages
    (id,package_key,intake_id,project_key,module_key,package_title,proposed_build_id,proposed_build_title,objective,acceptance_criteria,dependencies,risks,security_notes,missing_information,metadata)
  values
    (v_original_package,'qa-0090-original-package',v_original_intake,'beautydna','repository-governance','QA original','BDNA-GOV-0001','BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence'],'{}','{}','{}','{}','{}'),
    (v_replacement_package,'qa-0090-replacement-package',v_replacement_intake,'beautydna','repository-governance','QA replacement','BDNA-GOV-0001','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence'],'{}','{}','{}','{}','{}');

  select md5(to_jsonb(i)::text || to_jsonb(p)::text) into v_original_hash
  from public.athena_intake_items i join public.athena_intake_preparation_packages p on p.intake_id=i.id
  where i.id=v_original_intake;

  v_candidates_before := public.athena_pre_build_collect_candidates(v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence']);

  -- QA-01 ordinary/same-ID duplicate remains visible and blocks before supersession.
  if not exists (select 1 from jsonb_array_elements(v_candidates_before) c where c->>'source_id'=v_original_package::text) then raise exception 'QA-01 failed'; end if;
  v_classification := public.athena_pre_build_classify('BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence'],'{}'::text[],v_candidates_before);
  if coalesce((v_classification->>'start_allowed')::boolean,true) then raise exception 'QA-01 failed'; end if;

  -- QA-02 self-supersession fails.
  begin
    perform public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_original_intake,v_original_package,'beautydna','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 x','qa','self forbidden','qa-0090:self-forbidden','{}');
    raise exception 'QA-02 failed'; exception when others then if sqlerrm='QA-02 failed' then raise; end if;
  end;
  -- QA-03 nonexistent replacement fails.
  begin
    perform public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,'90000000-0000-4000-8000-000000000099','90000000-0000-4000-8000-000000000098','beautydna','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 x','qa','missing replacement','qa-0090:missing-replacement','{}');
    raise exception 'QA-03 failed'; exception when others then if sqlerrm='QA-03 failed' then raise; end if;
  end;
  -- QA-04 nonexistent original fails.
  begin
    perform public.athena_supersede_intake_preparation_chain('90000000-0000-4000-8000-000000000097','90000000-0000-4000-8000-000000000096',v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 x','qa','missing original','qa-0090:missing-original','{}');
    raise exception 'QA-04 failed'; exception when others then if sqlerrm='QA-04 failed' then raise; end if;
  end;
  -- QA-05 cross-project fails.
  begin
    perform public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_replacement_intake,v_replacement_package,'athena-cto','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 x','qa','cross project','qa-0090:cross-project','{}');
    raise exception 'QA-05 failed'; exception when others then if sqlerrm='QA-05 failed' then raise; end if;
  end;
  -- QA-06 cross-module fails.
  begin
    perform public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_replacement_intake,v_replacement_package,'beautydna','project-memory','BDNA-GOV-0001','BDNA-GOV-0001 x','qa','cross module','qa-0090:cross-module','{}');
    raise exception 'QA-06 failed'; exception when others then if sqlerrm='QA-06 failed' then raise; end if;
  end;
  -- QA-07 incompatible external identity fails.
  begin
    perform public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-9999','BDNA-GOV-9999 x','qa','wrong identity','qa-0090:wrong-identity','{}');
    raise exception 'QA-07 failed'; exception when others then if sqlerrm='QA-07 failed' then raise; end if;
  end;

  v_result := public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','qa-0090-operator','Correct immutable malformed predecessor title.','qa-0090:valid-supersession','{"fixture":"BDNA-GOV-0001"}');
  -- QA-08 valid canonical supersession is created.
  if v_result->>'idempotent_replay' <> 'false' then raise exception 'QA-08 failed'; end if;
  -- QA-09 exact replay is idempotent.
  v_result := public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','qa-0090-operator','Correct immutable malformed predecessor title.','qa-0090:valid-supersession','{"fixture":"BDNA-GOV-0001"}');
  if v_result->>'idempotent_replay' <> 'true' then raise exception 'QA-09 failed'; end if;
  -- QA-10 conflicting replay fails closed.
  begin
    perform public.athena_supersede_intake_preparation_chain(v_original_intake,v_original_package,v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','qa-0090-operator','Contradictory reason','qa-0090:valid-supersession','{"fixture":"BDNA-GOV-0001"}');
    raise exception 'QA-10 failed'; exception when others then if sqlerrm='QA-10 failed' then raise; end if;
  end;

  v_candidates_after := public.athena_pre_build_collect_candidates(v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence']);
  -- QA-11 exact predecessor is excluded and replacement becomes eligible.
  if exists (select 1 from jsonb_array_elements(v_candidates_after) c where c->>'source_id'=v_original_package::text) then raise exception 'QA-11 failed'; end if;
  v_classification := public.athena_pre_build_classify('BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence'],'{}'::text[],v_candidates_after);
  if not coalesce((v_classification->>'start_allowed')::boolean,false) then raise exception 'QA-11 failed'; end if;

  insert into public.athena_intake_items
    (id,intake_key,project_key,module_key,title,description,source_type,status_key,duplicate_fingerprint,metadata)
  values (v_third_intake,'qa-0090-third','beautydna','repository-governance','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation — third duplicate','Build 0090 unsuperseded third duplicate fixture.','automatic_qa','approved','qa0090-third',jsonb_build_object('build_id','BDNA-GOV-0001'));
  insert into public.athena_intake_review_history
    (intake_id,from_status_key,to_status_key,review_outcome,reviewed_by,decision_notes,metadata)
  values (v_third_intake,'pending_review','approved','approve','qa-0090','transaction fixture','{}');
  insert into public.athena_intake_preparation_packages
    (id,package_key,intake_id,project_key,module_key,package_title,proposed_build_id,proposed_build_title,objective,acceptance_criteria,dependencies,risks,security_notes,missing_information,metadata)
  values (v_third_package,'qa-0090-third-package',v_third_intake,'beautydna','repository-governance','QA third','BDNA-GOV-0001','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation — third duplicate','Repository lineage reconciliation',array['Preserve evidence'],'{}','{}','{}','{}','{}');
  v_candidates_after := public.athena_pre_build_collect_candidates(v_replacement_intake,v_replacement_package,'beautydna','repository-governance','BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence']);
  -- QA-12 third unsuperseded duplicate remains visible and blocks.
  if not exists (select 1 from jsonb_array_elements(v_candidates_after) c where c->>'source_id'=v_third_package::text) then raise exception 'QA-12 failed'; end if;
  v_classification := public.athena_pre_build_classify('BDNA-GOV-0001 BeautyDNA Canonical Git Baseline, Unauthorized Mutation, and Repository Lineage Reconciliation','Repository lineage reconciliation',array['Preserve evidence'],'{}'::text[],v_candidates_after);
  if coalesce((v_classification->>'start_allowed')::boolean,true) then raise exception 'QA-12 failed'; end if;
  -- QA-13 original Intake/preparation evidence remains byte-equivalent.
  select md5(to_jsonb(i)::text || to_jsonb(p)::text) into v_original_hash_after
  from public.athena_intake_items i join public.athena_intake_preparation_packages p on p.intake_id=i.id
  where i.id=v_original_intake;
  if v_original_hash_after <> v_original_hash then raise exception 'QA-13 failed'; end if;
  -- QA-14 resolver exposes exact replacement lineage.
  if public.athena_resolve_intake_preparation_supersession(v_replacement_intake,v_replacement_package)->>'original_intake_id' <> v_original_intake::text then raise exception 'QA-14 failed'; end if;
  -- QA-15 append-only UPDATE protection.
  begin update public.athena_intake_preparation_supersessions set reason='forbidden'; raise exception 'QA-15 failed'; exception when others then if sqlerrm='QA-15 failed' then raise; end if; end;
  -- QA-16 direct writes are denied to public roles and RPC is service-role-only.
  if has_table_privilege('anon','public.athena_intake_preparation_supersessions','INSERT') or has_table_privilege('authenticated','public.athena_intake_preparation_supersessions','INSERT')
     or has_function_privilege('anon','public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.athena_supersede_intake_preparation_chain(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)','EXECUTE') then raise exception 'QA-16 failed'; end if;
  -- QA-17 candidate/gate/lifecycle definitions all contain authoritative lineage.
  if position('athena_intake_preparation_supersessions' in pg_get_functiondef('public.athena_pre_build_collect_candidates(uuid,uuid,text,text,text,text,text[])'::regprocedure))=0
     or position('v_supersession' in pg_get_functiondef('public.athena_pre_build_gate_preview(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure))=0
     or position('original_preparation_package_id' in pg_get_functiondef('public.athena_build_lifecycle_assign_and_start(uuid,uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure))=0 then raise exception 'QA-17 failed'; end if;
end;
$qa$;

rollback;
