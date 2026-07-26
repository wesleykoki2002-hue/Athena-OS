create or replace function public.athena_build_timer_read_qa_evidence(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if p_session_id is null then
    raise exception
      'Timer session ID is required.';
  end if;

  if not exists (
    select 1
    from public.athena_build_timer_sessions session_row
    where session_row.id = p_session_id
  ) then
    raise exception
      'Timer session was not found.';
  end if;

  select jsonb_build_object(
    'session_id',
    p_session_id,
    'events',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sequence_number',
            event_row.sequence_number,
            'event_type',
            event_row.event_type,
            'source',
            event_row.source,
            'active_delta_seconds',
            event_row.active_delta_seconds,
            'raw_active_seconds_after',
            event_row.raw_active_seconds_after,
            'evidence',
            event_row.evidence,
            'reason',
            event_row.reason
          )
          order by event_row.sequence_number
        )
        from public.athena_build_timer_events event_row
        where event_row.session_id = p_session_id
          and (
            event_row.event_type in (
              'helper_token_issued',
              'helper_token_revoked'
            )
            or (
              event_row.event_type = 'heartbeat'
              and event_row.source = 'powershell_helper'
            )
          )
      ),
      '[]'::jsonb
    ),
    'helper_tokens',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            token_row.id,
            'session_id',
            token_row.session_id,
            'expires_at',
            token_row.expires_at,
            'last_used_at',
            token_row.last_used_at,
            'revoked_at',
            token_row.revoked_at,
            'token_hash_length',
            length(token_row.token_hash),
            'token_hash_is_sha256',
            token_row.token_hash ~ '^[0-9a-f]{64}$',
            'raw_token_stored',
            token_row.metadata -> 'raw_token_stored',
            'token_hash_algorithm',
            token_row.metadata ->> 'token_hash_algorithm'
          )
          order by token_row.expires_at, token_row.id
        )
        from public.athena_build_timer_helper_tokens token_row
        where token_row.session_id = p_session_id
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all
on function public.athena_build_timer_read_qa_evidence(
  uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.athena_build_timer_read_qa_evidence(
  uuid
)
to service_role;

comment on function public.athena_build_timer_read_qa_evidence(
  uuid
) is
  'Returns curated hash-only Build Timer runtime evidence for automatic QA without granting direct table access.';
