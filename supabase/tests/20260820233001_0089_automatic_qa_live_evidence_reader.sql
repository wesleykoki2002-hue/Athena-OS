-- ============================================================================
-- Athena CTO Build 0089
-- Automatic-QA live evidence reader validation
-- READ ONLY
-- ============================================================================

do $validation$
declare
  v_result jsonb;
begin
  v_result :=
    public.athena_read_0089_external_identity_repair_qa_evidence();

  if coalesce(
    (v_result ->> 'verified')::boolean,
    false
  ) <> true then
    raise exception
      'Build 0089 automatic-QA live evidence validation failed.';
  end if;

  if v_result ->> 'metadata_build_id'
       <> 'BDNA-SHOP-0001'
     or v_result ->> 'canonical_external_build_id'
       <> 'BDNA-SHOP-0001'
     or v_result ->> 'preserved_originating_athena_build_id'
       <> '0082'
     or (v_result ->> 'reconciliation_entry_count')::integer
       <> 1
     or (v_result ->> 'lifecycle_transition_count')::integer
       <> 0
     or (v_result ->> 'lifecycle_state_count')::integer
       <> 0
     or (v_result ->> 'direct_service_role_intake_update')::boolean
       <> false
     or (v_result ->> 'authenticated_rpc_execute')::boolean
       <> false
     or (v_result ->> 'anon_rpc_execute')::boolean
       <> false then
    raise exception
      'Build 0089 automatic-QA live evidence returned contradictory canonical values.';
  end if;
end;
$validation$;

select
  public.athena_read_0089_external_identity_repair_qa_evidence()
  as athena_0089_automatic_qa_live_evidence;
