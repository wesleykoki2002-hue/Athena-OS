export type CanonicalBuildLifecycleRequest = {
  intakeId: string;
  preparationPackageId: string;
  projectKey: string;
  moduleKey: string;
  moduleId: string;
  buildName: string;
  targetSystem: string;
  trackingSystem: string;
};

export type CanonicalBuildLifecycleLocalEvidence = {
  handoffPath: string;
  handoffVersion: string;
  handoffSha256: string;
  repositoryPath: string;
  repositoryHead: string;
  supabaseProjectRef: string;
  trackedDiffEmpty: true;
  stagedDiffEmpty: true;
};

export type CanonicalBuildLifecycleResult = {
  status: "canonical_build_assigned_and_started";
  state_id: string;
  transition_id: string;
  build_number: number;
  build_id: string;
  build_title: string;
  lifecycle_status: "started";
  intake_id: string;
  preparation_package_id: string;
  project_key: string;
  module_key: string;
  module_id: string;
  target_system: string;
  tracking_system: string;
  repository_path: string;
  repository_head: string;
  supabase_project_ref: string;
  handoff_version: string;
  handoff_sha256: string;
  assigned_at: string;
  started_at: string;
  assigned_by: string;
  started_by: string;
  assignment_method: "canonical_lifecycle_highest_used_plus_one";
  start_method: "canonical_atomic_assign_and_start";
  operation_key: string;
  request_hash: string;
  idempotent_replay: boolean;
  timer_started: false;
  qa_created: false;
  completion_created: false;
  build_log_created: false;
};
