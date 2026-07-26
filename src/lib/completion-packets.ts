export type CompletionPacketStatus =
  | "draft"
  | "qa_in_progress"
  | "ready_to_record"
  | "recording"
  | "retry_ready"
  | "completed"
  | "cancelled";

export type CompletionPacket = {
  id: string;
  project_key: string;
  module_key: string;
  feature_type: string;
  feature_name: string;
  build_session_title: string;
  route_path: string | null;
  summary: string | null;
  completed: string[];
  files_changed: string[];
  files_created: string[];
  files_modified: string[];
  database_changes: string[];
  decisions: string[];
  security_notes: string[];
  missing: string[];
  next_steps: string[];
  hours_spent: number | string | null;
  estimated_remaining_hours_snapshot: number | string | null;
  status: CompletionPacketStatus;
  qa_run_id: string | null;
  completion_event_id: string | null;
  build_log_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function splitPacketLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function joinPacketLines(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.join("\n") : "";
}
