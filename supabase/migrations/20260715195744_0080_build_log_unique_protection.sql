-- ============================================================
-- Build 0080
-- Build Log Recorder database-level duplicate protection
--
-- Target:
-- Athena OS application and Athena OS Supabase
--
-- Canonical duplicate identity:
-- public.athena_build_logs(product_key, session_title)
--
-- This migration fails safely if duplicate records already exist.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from public.athena_build_logs
    group by product_key, session_title
    having count(*) > 1
  ) then
    raise exception
      'Cannot add build-log duplicate protection because duplicate product_key/session_title records already exist.';
  end if;
end
$$;

create unique index if not exists
  athena_build_logs_product_key_session_title_uidx
on public.athena_build_logs (
  product_key,
  session_title
);

comment on index
  public.athena_build_logs_product_key_session_title_uidx
is
  'Build 0080: prevents duplicate Athena CTO build logs for the same canonical project and build session title.';
