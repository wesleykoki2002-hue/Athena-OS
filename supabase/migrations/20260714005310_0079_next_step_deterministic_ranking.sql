create or replace view public.athena_cto_top_next_steps as
select
  project_key,
  project_name,
  project_status,
  project_priority,
  project_progress,
  project_remaining_hours,
  closest_to_launch,
  revenue_ready,
  module_key,
  module_name,
  module_description,
  module_status,
  module_priority,
  module_progress,
  module_remaining_hours,
  reusable,
  module_notes,
  next_step_score,
  reason_category,
  recommended_action,
  effort_size,
  project_notes,
  updated_at
from public.athena_cto_next_step_candidates
order by
  next_step_score desc,
  case module_priority
    when 'P0' then 1
    when 'P1' then 2
    when 'P2' then 3
    when 'P3' then 4
    else 5
  end,
  module_remaining_hours,
  project_key,
  module_key
limit 12;
