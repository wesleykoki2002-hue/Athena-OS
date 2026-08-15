-- Zero-build Athena control-plane compatibility repair.
--
-- Governed Intake:
--   92149b77-88cd-4381-86f1-f2a94d6b28d1
-- Immutable approval review:
--   5defbe4a-d41c-4ef2-88bb-5bdc3cc3d6a6
-- Governed preparation package:
--   3e097da6-a1f3-4d76-b518-6d2e0dcd77d3
--
-- Separate explicit operator authorization:
--   APPROVE ZERO-BUILD ACTIVITY-HEARTBEAT COMPLETION RECONCILIATION REPAIR IMPLEMENTATION
-- Authorized by:
--   Wesley Kato
-- Authorization date:
--   2026-08-15
--
-- Athena has no supported retroactive authorization-write path for an
-- existing preparation package. The protected preparation row is therefore
-- intentionally left unchanged. This migration records the separate
-- operator authorization as provenance without rewriting governance history.
--
-- Scope:
--   Recognize an existing canonical activity timer event as heartbeat
--   evidence only when:
--     event_type = 'activity'
--     evidence.requested_operation = 'activity'
--     event_at = timer.last_heartbeat_at
--
-- Historical timer evidence is not inserted, updated, deleted, backdated,
-- fabricated, restarted, corrected, or otherwise altered.

create or replace function
  public.athena_read_feature_completion_reconciliation(
    p_packet_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_packet public.athena_feature_completion_packets%rowtype;
  v_event public.athena_feature_completion_events%rowtype;
  v_build_log public.athena_build_logs%rowtype;
  v_qa_run public.athena_qa_runs%rowtype;
  v_transition public.athena_build_lifecycle_transitions%rowtype;
  v_package public.athena_intake_preparation_packages%rowtype;
  v_timer public.athena_build_timer_sessions%rowtype;
  v_start_event public.athena_build_timer_events%rowtype;
  v_heartbeat_event public.athena_build_timer_events%rowtype;
  v_correction_event public.athena_build_timer_events%rowtype;
  v_final_timer_event public.athena_build_timer_events%rowtype;
  v_timer_session_id uuid;
  v_correction_chain_verified boolean := false;
  v_post_correction_chain_valid boolean := true;
  v_post_correction_active_delta_seconds bigint := 0;
  v_expected_hours numeric;
  v_zero_time_explained boolean := false;
  v_identity_verified boolean := false;
  v_timer_verified boolean := false;
  v_links_verified boolean := false;
  v_hours_verified boolean := false;
  v_package_verified boolean := false;
  v_qa_verified boolean := false;
  v_verified boolean := false;
begin
  if p_packet_id is null then
    raise exception
      'Completion packet id is required.';
  end if;

  select packet_row.*
  into v_packet
  from public.athena_feature_completion_packets
    as packet_row
  where packet_row.id = p_packet_id;

  if v_packet.id is null then
    raise exception
      'Completion packet % was not found.',
      p_packet_id;
  end if;

  if v_packet.completion_event_id is not null then
    select event_row.*
    into v_event
    from public.athena_feature_completion_events
      as event_row
    where event_row.id = v_packet.completion_event_id;
  end if;

  if v_packet.build_log_id is not null then
    select build_row.*
    into v_build_log
    from public.athena_build_logs
      as build_row
    where build_row.id = v_packet.build_log_id;
  end if;

  if v_packet.qa_run_id is not null then
    select qa_row.*
    into v_qa_run
    from public.athena_qa_runs
      as qa_row
    where qa_row.id = v_packet.qa_run_id;
  end if;

  select transition_row.*
  into v_transition
  from public.athena_build_lifecycle_transitions
    as transition_row
  where transition_row.project_key = v_packet.project_key
    and transition_row.module_key = v_packet.module_key
    and transition_row.build_title =
      v_packet.build_session_title
  order by transition_row.created_at desc
  limit 1;

  if v_transition.id is not null then
    select package_row.*
    into v_package
    from public.athena_intake_preparation_packages
      as package_row
    where package_row.id =
      v_transition.preparation_package_id;
  end if;

  begin
    v_timer_session_id :=
      nullif(
        v_packet.metadata ->> 'timer_session_id',
        ''
      )::uuid;
  exception
    when invalid_text_representation then
      v_timer_session_id := null;
  end;

  if v_timer_session_id is not null then
    select timer_row.*
    into v_timer
    from public.athena_build_timer_sessions
      as timer_row
    where timer_row.id = v_timer_session_id;
  end if;

  if v_timer.id is not null then
    select event_row.*
    into v_start_event
    from public.athena_build_timer_events
      as event_row
    where event_row.session_id = v_timer.id
      and event_row.event_type = 'start'
    order by
      event_row.sequence_number asc,
      event_row.event_at asc
    limit 1;

    select event_row.*
    into v_heartbeat_event
    from public.athena_build_timer_events
      as event_row
    where event_row.session_id = v_timer.id
      and (
        event_row.event_type = 'heartbeat'
        or (
          event_row.event_type = 'idle_detected'
          and event_row.evidence ->>
            'requested_operation' = 'heartbeat'
          and event_row.event_at =
            v_timer.last_heartbeat_at
        )
        or (
          event_row.event_type = 'activity'
          and event_row.evidence ->>
            'requested_operation' = 'activity'
          and event_row.event_at =
            v_timer.last_heartbeat_at
        )
      )
    order by
      event_row.sequence_number desc,
      event_row.event_at desc
    limit 1;

    select event_row.*
    into v_correction_event
    from public.athena_build_timer_events
      as event_row
    where event_row.session_id = v_timer.id
      and event_row.event_type = 'manual_correction'
    order by
      event_row.sequence_number desc,
      event_row.event_at desc
    limit 1;

    select event_row.*
    into v_final_timer_event
    from public.athena_build_timer_events
      as event_row
    where event_row.session_id = v_timer.id
    order by
      event_row.sequence_number desc,
      event_row.event_at desc,
      event_row.id desc
    limit 1;

    if v_correction_event.id is not null then
      select
        coalesce(
          bool_and(
            chain_row.active_delta_seconds >= 0
            and chain_row.raw_active_seconds_after
              is not distinct from
                chain_row.expected_raw_active_seconds_after
          ),
          true
        ),
        coalesce(
          sum(chain_row.active_delta_seconds),
          0
        )
      into
        v_post_correction_chain_valid,
        v_post_correction_active_delta_seconds
      from (
        select
          coalesce(
            event_row.active_delta_seconds,
            0
          )::bigint as active_delta_seconds,
          event_row.raw_active_seconds_after,
          v_correction_event.correction_new_active_seconds
            + sum(
                coalesce(
                  event_row.active_delta_seconds,
                  0
                )::bigint
              ) over (
                order by
                  event_row.sequence_number,
                  event_row.event_at,
                  event_row.id
                rows between unbounded preceding
                  and current row
              )
            as expected_raw_active_seconds_after
        from public.athena_build_timer_events
          as event_row
        where event_row.session_id = v_timer.id
          and event_row.sequence_number >
            v_correction_event.sequence_number
      ) as chain_row;
    end if;

    v_correction_chain_verified := coalesce(
      v_final_timer_event.id is not null
      and (
        v_final_timer_event.event_type = 'stop'
        or (
          v_correction_event.id is not null
          and v_final_timer_event.id =
            v_correction_event.id
          and v_correction_event.new_status =
            'stopped'
        )
      )
      and v_final_timer_event.new_status
        is not distinct from v_timer.status
      and v_final_timer_event.raw_active_seconds_after
        is not distinct from v_timer.active_seconds
      and v_final_timer_event.raw_paused_seconds_after
        is not distinct from v_timer.paused_seconds
      and v_final_timer_event.raw_idle_seconds_after
        is not distinct from v_timer.idle_seconds
      and (
        v_correction_event.id is null
        or (
          v_correction_event.source =
            'operator_correction'
          and v_correction_event.operator_key
            is not distinct from v_timer.operator_key
          and v_correction_event.correction_previous_active_seconds
            is not null
          and v_correction_event.correction_new_active_seconds
            is not null
          and v_correction_event.correction_difference_seconds
            is not null
          and v_correction_event.raw_active_seconds_after
            is not distinct from
              v_correction_event.correction_new_active_seconds
          and v_correction_event.correction_difference_seconds
            = v_correction_event.correction_new_active_seconds
              - v_correction_event.correction_previous_active_seconds
          and v_correction_event.previous_status in (
            'paused',
            'stopped'
          )
          and v_correction_event.new_status
            is not distinct from
              v_correction_event.previous_status
          and nullif(
            btrim(v_correction_event.reason),
            ''
          ) is not null
          and nullif(
            btrim(v_correction_event.operation_key),
            ''
          ) is not null
          and v_correction_event.correction_new_active_seconds
            <= v_timer.active_seconds
          and v_post_correction_chain_valid
          and v_correction_event.correction_new_active_seconds
            + v_post_correction_active_delta_seconds
            = v_timer.active_seconds
        )
      ),
      false
    );

    v_expected_hours :=
      round(
        v_timer.active_seconds::numeric / 3600,
        2
      );

    v_zero_time_explained :=
      v_timer.active_seconds > 0
      or (
        nullif(
          btrim(
            v_packet.metadata ->>
              'zero_time_completion_reason'
          ),
          ''
        ) is not null
        and length(
          btrim(
            v_packet.metadata ->>
              'zero_time_completion_reason'
          )
        ) >= 20
        and coalesce(
          v_packet.metadata ->
            'zero_time_completion_evidence',
          '{}'::jsonb
        ) <> '{}'::jsonb
      );
  end if;

  v_identity_verified := coalesce(
    v_transition.id is not null
    and v_transition.event_type =
      'assigned_started'
    and v_transition.project_key =
      v_packet.project_key
    and v_transition.module_key =
      v_packet.module_key
    and v_transition.build_title =
      v_packet.build_session_title
    and v_package.id is not null
    and v_package.project_key =
      v_packet.project_key
    and v_package.module_key =
      v_packet.module_key
    and (
      v_package.proposed_build_id is null
      or v_package.proposed_build_id =
        v_transition.build_id
    )
    and (
      v_package.proposed_build_title is null
      or v_package.proposed_build_title =
        v_transition.build_title
    ),
    false
  );

  v_timer_verified := coalesce(
    v_timer.id is not null
    and v_timer.project_key =
      v_packet.project_key
    and v_timer.module_key =
      v_packet.module_key
    and v_timer.build_session_title =
      v_packet.build_session_title
    and v_timer.status = 'stopped'
    and v_timer.stopped_at is not null
    and v_timer.started_at is not null
    and v_timer.last_heartbeat_at is not null
    and v_start_event.id is not null
    and v_heartbeat_event.id is not null
    and v_zero_time_explained
    and v_correction_chain_verified,
    false
  );

  v_links_verified := coalesce(
    v_packet.status = 'completed'
    and v_packet.completed_at is not null
    and v_packet.qa_run_id is not null
    and v_packet.completion_event_id is not null
    and v_packet.build_log_id is not null
    and v_event.id = v_packet.completion_event_id
    and v_event.project_key = v_packet.project_key
    and v_event.module_key = v_packet.module_key
    and v_event.feature_name = v_packet.feature_name
    and v_event.build_session_title =
      v_packet.build_session_title
    and v_event.route_path is not distinct from
      v_packet.route_path
    and v_event.qa_run_id = v_packet.qa_run_id
    and v_event.status = 'completed'
    and v_event.cto_recorded
    and v_event.memory_check_closed
    and v_build_log.id = v_packet.build_log_id
    and v_build_log.product_key =
      v_packet.project_key
    and v_build_log.session_title =
      v_packet.build_session_title
    and v_qa_run.id = v_packet.qa_run_id
    and v_qa_run.project_key =
      v_packet.project_key
    and v_qa_run.module_key =
      v_packet.module_key
    and v_qa_run.feature_name =
      v_packet.feature_name
    and v_qa_run.build_session_title =
      v_packet.build_session_title
    and v_qa_run.route_path is not distinct from
      v_packet.route_path,
    false
  );

  v_hours_verified := coalesce(
    v_expected_hours is not null
    and v_packet.hours_spent is not null
    and v_build_log.hours_spent is not null
    and v_packet.hours_spent =
      v_expected_hours
    and v_build_log.hours_spent =
      v_expected_hours
    and (
      v_packet.metadata ->>
        'timer_active_seconds'
    )::bigint = v_timer.active_seconds
    and (
      v_packet.metadata ->>
        'completion_hours'
    )::numeric = v_expected_hours
    and (
      v_build_log.metadata ->>
        'timer_active_seconds'
    )::bigint = v_timer.active_seconds
    and (
      v_build_log.metadata ->>
        'completion_hours'
    )::numeric = v_expected_hours,
    false
  );

  v_package_verified := coalesce(
    v_package.id is not null
    and v_package.metadata ->>
      'completion_packet_id' =
        v_packet.id::text
    and v_package.metadata ->>
      'completion_event_id' =
        v_event.id::text
    and v_package.metadata ->>
      'build_log_id' =
        v_build_log.id::text
    and v_package.metadata ->>
      'timer_session_id' =
        v_timer.id::text
    and (
      v_package.metadata ->>
        'timer_active_seconds'
    )::bigint = v_timer.active_seconds
    and (
      v_package.metadata ->>
        'hours_spent'
    )::numeric = v_expected_hours
    and v_package.metadata ->>
      'completion_reconciliation_verified' =
        'true'
    and nullif(
      v_package.metadata ->> 'completed_at',
      ''
    ) is not null,
    false
  );

  v_qa_verified := coalesce(
    v_qa_run.status = 'pass'
    and v_qa_run.completed_at is not null
    and not exists (
      select 1
      from public.athena_qa_check_results
        as check_row
      where check_row.qa_run_id =
        v_packet.qa_run_id
        and not (
          check_row.status in (
            'pass',
            'not_applicable',
            'n/a'
          )
          or (
            check_row.status = 'warning'
            and check_row.warning_acknowledged_at
              is not null
            and nullif(
              btrim(
                check_row.warning_acknowledged_by
              ),
              ''
            ) is not null
            and nullif(
              btrim(
                check_row.warning_acknowledgement_notes
              ),
              ''
            ) is not null
          )
        )
    ),
    false
  );

  v_verified :=
    v_identity_verified
    and v_timer_verified
    and v_links_verified
    and v_hours_verified
    and v_package_verified
    and v_qa_verified;

  return jsonb_build_object(
    'verified',
      v_verified,
    'reconciliation_version',
      '0086-v1',
    'packet_id',
      v_packet.id,
    'packet_status',
      v_packet.status,
    'completed_at',
      v_packet.completed_at,
    'qa_run_id',
      v_packet.qa_run_id,
    'completion_event_id',
      v_packet.completion_event_id,
    'build_log_id',
      v_packet.build_log_id,
    'lifecycle_transition_id',
      v_transition.id,
    'build_id',
      v_transition.build_id,
    'preparation_package_id',
      v_package.id,
    'timer_session_id',
      v_timer.id,
    'timer_status',
      v_timer.status,
    'timer_started_at',
      v_timer.started_at,
    'timer_last_heartbeat_at',
      v_timer.last_heartbeat_at,
    'timer_stopped_at',
      v_timer.stopped_at,
    'timer_active_seconds',
      v_timer.active_seconds,
    'timer_paused_seconds',
      v_timer.paused_seconds,
    'timer_idle_seconds',
      v_timer.idle_seconds,
    'timer_start_event_id',
      v_start_event.id,
    'timer_heartbeat_event_id',
      v_heartbeat_event.id,
    'latest_correction_event_id',
      v_correction_event.id,
    'latest_correction_operation_key',
      v_correction_event.operation_key,
    'final_timer_event_id',
      v_final_timer_event.id,
    'timer_event_chain_verified',
      v_correction_chain_verified,
    'post_correction_active_delta_seconds',
      v_post_correction_active_delta_seconds,
    'hours_spent',
      v_expected_hours,
    'identity_verified',
      v_identity_verified,
    'timer_verified',
      v_timer_verified,
    'links_verified',
      v_links_verified,
    'hours_verified',
      v_hours_verified,
    'preparation_package_verified',
      v_package_verified,
    'qa_verified',
      v_qa_verified,
    'success_message',
      case
        when v_verified then
          format(
            'Verified completion packet %s, QA run %s, completion event %s, build log %s, preparation package %s, and timer session %s at %s hours.',
            v_packet.id,
            v_packet.qa_run_id,
            v_packet.completion_event_id,
            v_packet.build_log_id,
            v_package.id,
            v_timer.id,
            v_expected_hours
          )
        else
          null
      end
  );
exception
  when invalid_text_representation then
    return jsonb_build_object(
      'verified',
        false,
      'reconciliation_version',
        '0086-v1',
      'packet_id',
        p_packet_id,
      'verification_error',
        'Persisted reconciliation metadata contains an invalid identifier or numeric value.'
    );
end;
$function$;


create or replace function
  public.athena_reconcile_feature_completion(
    p_packet_id uuid,
    p_completion_event_id uuid,
    p_build_log_id uuid,
    p_operator_key text,
    p_operation_key text,
    p_zero_time_reason text default null,
    p_evidence jsonb default '{}'::jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_packet public.athena_feature_completion_packets%rowtype;
  v_event public.athena_feature_completion_events%rowtype;
  v_build_log public.athena_build_logs%rowtype;
  v_qa_run public.athena_qa_runs%rowtype;
  v_transition public.athena_build_lifecycle_transitions%rowtype;
  v_package public.athena_intake_preparation_packages%rowtype;
  v_timer public.athena_build_timer_sessions%rowtype;
  v_start_event public.athena_build_timer_events%rowtype;
  v_heartbeat_event public.athena_build_timer_events%rowtype;
  v_correction_event public.athena_build_timer_events%rowtype;
  v_final_timer_event public.athena_build_timer_events%rowtype;
  v_post_correction_chain_valid boolean := true;
  v_post_correction_active_delta_seconds bigint := 0;
  v_completed_packet
    public.athena_feature_completion_packets%rowtype;
  v_timer_session_id uuid;
  v_hours numeric;
  v_memory_check_id uuid;
  v_replay jsonb;
  v_zero_time_evidence jsonb;
begin
  if p_packet_id is null
    or p_completion_event_id is null
    or p_build_log_id is null
    or nullif(btrim(p_operator_key), '') is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception
      'Packet, completion event, build log, operator, and operation key are required.';
  end if;

  if btrim(p_operation_key) !~
    '^[a-z0-9][a-z0-9:_-]{15,199}$'
  then
    raise exception
      'The completion reconciliation operation key is invalid.';
  end if;

  if jsonb_typeof(
    coalesce(p_evidence, '{}'::jsonb)
  ) <> 'object'
  then
    raise exception
      'Completion reconciliation evidence must be a JSON object.';
  end if;

  select packet_row.*
  into v_packet
  from public.athena_feature_completion_packets
    as packet_row
  where packet_row.id = p_packet_id
  for update;

  if v_packet.id is null then
    raise exception
      'Completion packet % was not found.',
      p_packet_id;
  end if;

  if v_packet.metadata ->>
    'completion_reconciliation_operation_key' =
      btrim(p_operation_key)
  then
    v_replay :=
      public.athena_read_feature_completion_reconciliation(
        v_packet.id
      );

    return v_replay || jsonb_build_object(
      'idempotent_replay',
        true,
      'write_status',
        'previous_write_replayed'
    );
  end if;

  if v_packet.status not in (
    'recording',
    'retry_ready',
    'completed'
  )
  then
    raise exception
      'Completion packet % is %, not recording, retry_ready, or completed.',
      v_packet.id,
      v_packet.status;
  end if;

  if v_packet.qa_run_id is null then
    raise exception
      'Completion packet % has no linked QA run.',
      v_packet.id;
  end if;

  select transition_row.*
  into v_transition
  from public.athena_build_lifecycle_transitions
    as transition_row
  where transition_row.project_key =
      v_packet.project_key
    and transition_row.module_key =
      v_packet.module_key
    and transition_row.build_title =
      v_packet.build_session_title
  order by transition_row.created_at desc
  limit 1;

  if v_transition.id is null
    or v_transition.event_type <>
      'assigned_started'
  then
    raise exception
      'No canonical assigned_started lifecycle transition matches completion packet %.',
      v_packet.id;
  end if;

  select package_row.*
  into v_package
  from public.athena_intake_preparation_packages
    as package_row
  where package_row.id =
    v_transition.preparation_package_id
  for update;

  if v_package.id is null
    or v_package.project_key is distinct from
      v_packet.project_key
    or v_package.module_key is distinct from
      v_packet.module_key
  then
    raise exception
      'The lifecycle preparation package does not match completion packet %.',
      v_packet.id;
  end if;

  if v_package.proposed_build_id is not null
    and v_package.proposed_build_id <>
      v_transition.build_id
  then
    raise exception
      'The preparation-package build id does not match lifecycle build %.',
      v_transition.build_id;
  end if;

  if v_package.proposed_build_title is not null
    and v_package.proposed_build_title <>
      v_transition.build_title
  then
    raise exception
      'The preparation-package build title does not match lifecycle build %.',
      v_transition.build_title;
  end if;

  select event_row.*
  into v_event
  from public.athena_feature_completion_events
    as event_row
  where event_row.id = p_completion_event_id
  for update;

  if v_event.id is null
    or v_event.project_key is distinct from
      v_packet.project_key
    or v_event.module_key is distinct from
      v_packet.module_key
    or v_event.feature_name is distinct from
      v_packet.feature_name
    or v_event.build_session_title is distinct from
      v_packet.build_session_title
    or v_event.route_path is distinct from
      v_packet.route_path
    or v_event.qa_run_id is distinct from
      v_packet.qa_run_id
  then
    raise exception
      'Completion event % does not match packet %.',
      p_completion_event_id,
      v_packet.id;
  end if;

  select build_row.*
  into v_build_log
  from public.athena_build_logs
    as build_row
  where build_row.id = p_build_log_id
  for update;

  if v_build_log.id is null
    or v_build_log.product_key is distinct from
      v_packet.project_key
    or v_build_log.session_title is distinct from
      v_packet.build_session_title
    or v_build_log.metadata ->>
      'project_key' is distinct from
        v_packet.project_key
    or v_build_log.metadata ->>
      'module_key' is distinct from
        v_packet.module_key
    or v_build_log.metadata ->>
      'canonical_registry_verified' is distinct from
        'true'
  then
    raise exception
      'Build log % does not verify the canonical packet identity.',
      p_build_log_id;
  end if;

  select qa_row.*
  into v_qa_run
  from public.athena_qa_runs
    as qa_row
  where qa_row.id = v_packet.qa_run_id
  for update;

  if v_qa_run.id is null
    or v_qa_run.project_key is distinct from
      v_packet.project_key
    or v_qa_run.module_key is distinct from
      v_packet.module_key
    or v_qa_run.feature_name is distinct from
      v_packet.feature_name
    or v_qa_run.build_session_title is distinct from
      v_packet.build_session_title
    or v_qa_run.route_path is distinct from
      v_packet.route_path
  then
    raise exception
      'QA run % does not match packet %.',
      v_packet.qa_run_id,
      v_packet.id;
  end if;

  select timer_row.*
  into v_timer
  from public.athena_build_timer_sessions
    as timer_row
  where timer_row.project_key =
      v_packet.project_key
    and timer_row.module_key =
      v_packet.module_key
    and timer_row.build_session_title =
      v_packet.build_session_title
    and timer_row.operator_key =
      btrim(p_operator_key)
  for update;

  if v_timer.id is null then
    raise exception
      'No timer session matches the exact packet build identity and operator.';
  end if;

  begin
    v_timer_session_id :=
      nullif(
        v_packet.metadata ->> 'timer_session_id',
        ''
      )::uuid;
  exception
    when invalid_text_representation then
      raise exception
        'The packet timer_session_id is invalid.';
  end;

  if v_timer_session_id is not null
    and v_timer_session_id <> v_timer.id
  then
    raise exception
      'The packet timer session does not match the canonical build timer.';
  end if;

  if v_timer.status <> 'stopped'
    or v_timer.stopped_at is null
  then
    raise exception
      'Stop the exact build timer before completion reconciliation.';
  end if;

  select event_row.*
  into v_start_event
  from public.athena_build_timer_events
    as event_row
  where event_row.session_id = v_timer.id
    and event_row.event_type = 'start'
  order by
    event_row.sequence_number asc,
    event_row.event_at asc
  limit 1;

  select event_row.*
  into v_heartbeat_event
  from public.athena_build_timer_events
    as event_row
  where event_row.session_id = v_timer.id
    and (
      event_row.event_type = 'heartbeat'
      or (
        event_row.event_type = 'idle_detected'
        and event_row.evidence ->>
          'requested_operation' = 'heartbeat'
        and event_row.event_at =
          v_timer.last_heartbeat_at
      )
      or (
        event_row.event_type = 'activity'
        and event_row.evidence ->>
          'requested_operation' = 'activity'
        and event_row.event_at =
          v_timer.last_heartbeat_at
      )
    )
  order by
    event_row.sequence_number desc,
    event_row.event_at desc
  limit 1;

  if v_start_event.id is null
    or v_heartbeat_event.id is null
    or v_timer.last_heartbeat_at is null
  then
    raise exception
      'Verified timer activation and heartbeat evidence are required before completion.';
  end if;

  select event_row.*
  into v_correction_event
  from public.athena_build_timer_events
    as event_row
  where event_row.session_id = v_timer.id
    and event_row.event_type = 'manual_correction'
  order by
    event_row.sequence_number desc,
    event_row.event_at desc
  limit 1;

  select event_row.*
  into v_final_timer_event
  from public.athena_build_timer_events
    as event_row
  where event_row.session_id = v_timer.id
  order by
    event_row.sequence_number desc,
    event_row.event_at desc,
    event_row.id desc
  limit 1;

  if v_final_timer_event.id is null
    or not (
      v_final_timer_event.event_type = 'stop'
      or (
        v_correction_event.id is not null
        and v_final_timer_event.id =
          v_correction_event.id
        and v_correction_event.new_status =
          'stopped'
      )
    )
    or v_final_timer_event.new_status
      is distinct from v_timer.status
    or v_final_timer_event.raw_active_seconds_after
      is distinct from v_timer.active_seconds
    or v_final_timer_event.raw_paused_seconds_after
      is distinct from v_timer.paused_seconds
    or v_final_timer_event.raw_idle_seconds_after
      is distinct from v_timer.idle_seconds
  then
    raise exception
      'The final append-only timer event does not match the stopped timer session totals.';
  end if;

  if v_correction_event.id is not null then
    if v_correction_event.source <>
        'operator_correction'
      or v_correction_event.operator_key
        is distinct from v_timer.operator_key
      or v_correction_event.correction_previous_active_seconds
        is null
      or v_correction_event.correction_new_active_seconds
        is null
      or v_correction_event.correction_difference_seconds
        is null
      or v_correction_event.raw_active_seconds_after
        is distinct from
          v_correction_event.correction_new_active_seconds
      or v_correction_event.correction_difference_seconds <>
        v_correction_event.correction_new_active_seconds
          - v_correction_event.correction_previous_active_seconds
      or v_correction_event.previous_status not in (
        'paused',
        'stopped'
      )
      or v_correction_event.new_status
        is distinct from
          v_correction_event.previous_status
      or nullif(
        btrim(v_correction_event.reason),
        ''
      ) is null
      or nullif(
        btrim(v_correction_event.operation_key),
        ''
      ) is null
      or v_correction_event.correction_new_active_seconds >
        v_timer.active_seconds
    then
      raise exception
        'The latest append-only timer correction is internally invalid.';
    end if;

    select
      coalesce(
        bool_and(
          chain_row.active_delta_seconds >= 0
          and chain_row.raw_active_seconds_after
            is not distinct from
              chain_row.expected_raw_active_seconds_after
        ),
        true
      ),
      coalesce(
        sum(chain_row.active_delta_seconds),
        0
      )
    into
      v_post_correction_chain_valid,
      v_post_correction_active_delta_seconds
    from (
      select
        coalesce(
          event_row.active_delta_seconds,
          0
        )::bigint as active_delta_seconds,
        event_row.raw_active_seconds_after,
        v_correction_event.correction_new_active_seconds
          + sum(
              coalesce(
                event_row.active_delta_seconds,
                0
              )::bigint
            ) over (
              order by
                event_row.sequence_number,
                event_row.event_at,
                event_row.id
              rows between unbounded preceding
                and current row
            )
          as expected_raw_active_seconds_after
      from public.athena_build_timer_events
        as event_row
      where event_row.session_id = v_timer.id
        and event_row.sequence_number >
          v_correction_event.sequence_number
    ) as chain_row;

    if not v_post_correction_chain_valid
      or v_correction_event.correction_new_active_seconds
        + v_post_correction_active_delta_seconds
        <> v_timer.active_seconds
    then
      raise exception
        'Post-correction timer events do not reconcile to the stopped timer session total.';
    end if;
  end if;

  v_hours :=
    round(
      v_timer.active_seconds::numeric / 3600,
      2
    );

  if v_timer.active_seconds = 0 then
    v_zero_time_evidence :=
      coalesce(
        p_evidence -> 'zero_time_evidence',
        '{}'::jsonb
      );

    if nullif(
      btrim(p_zero_time_reason),
      ''
    ) is null
      or length(
        btrim(p_zero_time_reason)
      ) < 20
      or jsonb_typeof(v_zero_time_evidence) <>
        'object'
      or v_zero_time_evidence = '{}'::jsonb
    then
      raise exception
        'Zero-time completion is blocked until a reason of at least 20 characters and non-empty zero_time_evidence are supplied.';
    end if;
  else
    v_zero_time_evidence := null;
  end if;

  update public.athena_qa_check_results
  set
    status = 'pass',
    actual_result = format(
      '%s was verified against build log %s, timer session %s, lifecycle transition %s, and preparation package %s.',
      v_packet.build_session_title,
      v_build_log.id,
      v_timer.id,
      v_transition.id,
      v_package.id
    ),
    evidence = coalesce(evidence, '{}'::jsonb)
      || jsonb_build_object(
        'automatic',
          true,
        'reconciliation_version',
          '0086-v1',
        'completion_packet_id',
          v_packet.id,
        'completion_event_id',
          v_event.id,
        'build_log_id',
          v_build_log.id,
        'timer_session_id',
          v_timer.id,
        'lifecycle_transition_id',
          v_transition.id,
        'preparation_package_id',
          v_package.id,
        'timer_active_seconds',
          v_timer.active_seconds,
        'hours_spent',
          v_hours
      ),
    notes =
      'Automatically marked pass by Build 0086 transactional completion reconciliation.',
    warning_acknowledged_at = null,
    warning_acknowledged_by = null,
    warning_acknowledgement_notes = null,
    updated_at = v_now
  where qa_run_id = v_packet.qa_run_id
    and check_key =
      'athena_cto_memory_recorded'
  returning id
  into v_memory_check_id;

  if v_memory_check_id is null then
    raise exception
      'The athena_cto_memory_recorded QA check was not found.';
  end if;

  if exists (
    select 1
    from public.athena_qa_check_results
      as check_row
    where check_row.qa_run_id =
      v_packet.qa_run_id
      and not (
        check_row.status in (
          'pass',
          'not_applicable',
          'n/a'
        )
        or (
          check_row.status = 'warning'
          and check_row.warning_acknowledged_at
            is not null
          and nullif(
            btrim(
              check_row.warning_acknowledged_by
            ),
            ''
          ) is not null
          and nullif(
            btrim(
              check_row.warning_acknowledgement_notes
            ),
            ''
          ) is not null
        )
      )
  )
  then
    raise exception
      'QA still contains blocking, pending, or unacknowledged checks.';
  end if;

  update public.athena_qa_runs
  set
    status = 'pass',
    completed_at =
      coalesce(completed_at, v_now),
    updated_at = v_now
  where id = v_qa_run.id;

  update public.athena_feature_completion_events
  set
    status = 'completed',
    cto_recorded = true,
    memory_check_closed = true,
    notes = format(
      'Build 0086 reconciliation verified packet %s, QA run %s, build log %s, timer %s, lifecycle transition %s, and preparation package %s.',
      v_packet.id,
      v_qa_run.id,
      v_build_log.id,
      v_timer.id,
      v_transition.id,
      v_package.id
    ),
    updated_at = v_now
  where id = v_event.id;

  update public.athena_feature_completion_packets
  set
    completion_event_id = v_event.id,
    build_log_id = v_build_log.id,
    hours_spent = v_hours,
    status = 'completed',
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'hours_source',
          'verified_build_timer',
        'timer_identity_verified',
          true,
        'timer_activation_verified',
          true,
        'timer_heartbeat_verified',
          true,
        'timer_session_id',
          v_timer.id,
        'timer_status',
          v_timer.status,
        'timer_started_at',
          v_timer.started_at,
        'timer_last_heartbeat_at',
          v_timer.last_heartbeat_at,
        'timer_stopped_at',
          v_timer.stopped_at,
        'timer_active_seconds',
          v_timer.active_seconds,
        'timer_paused_seconds',
          v_timer.paused_seconds,
        'timer_idle_seconds',
          v_timer.idle_seconds,
        'timer_version',
          v_timer.timer_version,
        'calculation_version',
          v_timer.calculation_version,
        'completion_hours',
          v_hours,
        'completion_rounding',
          'nearest_0.01_hour',
        'timer_start_event_id',
          v_start_event.id,
        'timer_heartbeat_event_id',
          v_heartbeat_event.id,
        'latest_timer_correction_event_id',
          v_correction_event.id,
        'latest_timer_correction_operation_key',
          v_correction_event.operation_key,
        'final_timer_event_id',
          v_final_timer_event.id,
        'timer_event_chain_verified',
          true,
        'post_correction_active_delta_seconds',
          v_post_correction_active_delta_seconds,
        'lifecycle_transition_id',
          v_transition.id,
        'build_id',
          v_transition.build_id,
        'preparation_package_id',
          v_package.id,
        'completion_reconciliation_version',
          '0086-v1',
        'completion_reconciliation_operation_key',
          btrim(p_operation_key),
        'completion_reconciliation_written_at',
          v_now,
        'completion_reconciliation_evidence',
          coalesce(p_evidence, '{}'::jsonb),
        'zero_time_completion_reason',
          case
            when v_timer.active_seconds = 0
            then btrim(p_zero_time_reason)
            else null
          end,
        'zero_time_completion_evidence',
          case
            when v_timer.active_seconds = 0
            then v_zero_time_evidence
            else null
          end
      )
  where id = v_packet.id
  returning *
  into v_completed_packet;

  if v_completed_packet.id is null
    or v_completed_packet.status <>
      'completed'
    or v_completed_packet.completed_at is null
    or v_completed_packet.completion_event_id <>
      v_event.id
    or v_completed_packet.build_log_id <>
      v_build_log.id
    or v_completed_packet.hours_spent <>
      v_hours
  then
    raise exception
      'Transactional completion packet update did not verify.';
  end if;

  update public.athena_build_logs
  set
    hours_spent = v_hours,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completion_reconciliation_version',
          '0086-v1',
        'completion_reconciliation_operation_key',
          btrim(p_operation_key),
        'completion_reconciliation_written_at',
          v_now,
        'completion_packet_id',
          v_completed_packet.id,
        'completion_event_id',
          v_event.id,
        'qa_run_id',
          v_qa_run.id,
        'lifecycle_transition_id',
          v_transition.id,
        'build_id',
          v_transition.build_id,
        'preparation_package_id',
          v_package.id,
        'timer_session_id',
          v_timer.id,
        'timer_active_seconds',
          v_timer.active_seconds,
        'timer_paused_seconds',
          v_timer.paused_seconds,
        'timer_idle_seconds',
          v_timer.idle_seconds,
        'timer_last_heartbeat_at',
          v_timer.last_heartbeat_at,
        'latest_timer_correction_event_id',
          v_correction_event.id,
        'latest_timer_correction_operation_key',
          v_correction_event.operation_key,
        'final_timer_event_id',
          v_final_timer_event.id,
        'timer_event_chain_verified',
          true,
        'post_correction_active_delta_seconds',
          v_post_correction_active_delta_seconds,
        'completion_hours',
          v_hours,
        'completed_at',
          v_completed_packet.completed_at
      )
  where id = v_build_log.id;

  update public.athena_intake_preparation_packages
  set
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completion_reconciliation_version',
          '0086-v1',
        'completion_reconciliation_operation_key',
          btrim(p_operation_key),
        'completion_reconciliation_verified',
          true,
        'completion_reconciliation_written_at',
          v_now,
        'assigned_build_id',
          v_transition.build_id,
        'assigned_build_title',
          v_transition.build_title,
        'build_started',
          true,
        'implementation_started',
          true,
        'completion_packet_id',
          v_completed_packet.id,
        'completion_event_id',
          v_event.id,
        'qa_run_id',
          v_qa_run.id,
        'build_log_id',
          v_build_log.id,
        'timer_session_id',
          v_timer.id,
        'timer_active_seconds',
          v_timer.active_seconds,
        'latest_timer_correction_event_id',
          v_correction_event.id,
        'latest_timer_correction_operation_key',
          v_correction_event.operation_key,
        'final_timer_event_id',
          v_final_timer_event.id,
        'timer_event_chain_verified',
          true,
        'post_correction_active_delta_seconds',
          v_post_correction_active_delta_seconds,
        'hours_spent',
          v_hours,
        'completed_at',
          v_completed_packet.completed_at
      )
  where id = v_package.id;

  return jsonb_build_object(
    'write_status',
      'transactional_reconciliation_written',
    'external_read_after_write_required',
      true,
    'idempotent_replay',
      false,
    'reconciliation_version',
      '0086-v1',
    'operation_key',
      btrim(p_operation_key),
    'packet_id',
      v_completed_packet.id,
    'qa_run_id',
      v_qa_run.id,
    'completion_event_id',
      v_event.id,
    'build_log_id',
      v_build_log.id,
    'lifecycle_transition_id',
      v_transition.id,
    'build_id',
      v_transition.build_id,
    'preparation_package_id',
      v_package.id,
    'timer_session_id',
      v_timer.id,
    'timer_active_seconds',
      v_timer.active_seconds,
    'final_timer_event_id',
      v_final_timer_event.id,
    'timer_event_chain_verified',
      true,
    'post_correction_active_delta_seconds',
      v_post_correction_active_delta_seconds,
    'hours_spent',
      v_hours,
    'completed_at',
      v_completed_packet.completed_at
  );
exception
  when unique_violation then
    raise exception
      'The completion reconciliation operation key conflicts with another packet.';
end;
$function$;
