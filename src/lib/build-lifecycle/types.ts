import type { CanonicalTargetSupabaseApplicability } from "./supabase-applicability";

export type CanonicalBuildIdentityKind = "numeric" | "external";

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
  buildIdentityKind: CanonicalBuildIdentityKind;
  canonicalBuildId: string | null;
  canonicalBuildTitle: string | null;
  handoffPath: string;
  handoffVersion: string;
  handoffSha256: string;
  repositoryPath: string;
  repositoryBranch: string;
  repositoryHead: string;
  repositoryTree: string;
  repositoryEvidenceSha256: string;
  supabaseProjectRef: string;
  targetSupabaseProjectRef: string;
  targetSupabaseApplicability: CanonicalTargetSupabaseApplicability;
  targetSupabaseProjectVerified: true;
  targetSupabaseRepositoryLinkVerified: boolean;
  targetSupabaseUsage: string | null;
  productDatabase: string | null;
  trackedDiffEmpty: true;
  stagedDiffEmpty: true;
};

export type CanonicalPreBuildGateClassification =
  | "new_capability"
  | "repair_existing"
  | "extension_existing"
  | "duplicate_completed_scope"
  | "insufficient_evidence";

export type CanonicalPreBuildGateDecision = "pass" | "block";

export type CanonicalPreBuildGateCandidate = {
  rank: number;
  source_type: string;
  source_id: string;
  candidate_project_key: string | null;
  candidate_module_key: string | null;
  candidate_build_id: string | null;
  candidate_title: string;
  candidate_status: string | null;
  completed: boolean;
  exact_title_match: boolean;
  exact_scope_match: boolean;
  title_overlap: number;
  scope_overlap: number;
  final_score: number;
  matching_tokens: string[];
  evidence: Record<string, unknown>;
};

export type CanonicalPreBuildGatePreviewResult = {
  status: "canonical_pre_build_gate_preview";
  classification: CanonicalPreBuildGateClassification;
  decision: CanonicalPreBuildGateDecision;
  start_allowed: boolean;
  requires_override: boolean;
  scope_hash: string;
  request_hash: string;
  top_match_score: number;
  candidate_count: number;
  narrowed_scope: string;
  missing_evidence: string[];
  blocking_reasons: string[];
  candidates: CanonicalPreBuildGateCandidate[];
  repository_head: string;
  repository_tree: string;
  repository_evidence_sha256: string;
  handoff_sha256: string;
  target_supabase_project_ref: string;
  build_identity_kind: CanonicalBuildIdentityKind;
  canonical_build_id: string | null;
  canonical_build_title: string | null;
};

export type CanonicalPreBuildGateBlockedResult = {
  status: "canonical_pre_build_gate_blocked";
  gate_evaluation_id: string;
  gate_classification: CanonicalPreBuildGateClassification;
  gate_decision: "block";
  gate_scope_hash: string;
  gate_request_hash: string;
  gate_top_match_score: number;
  gate_candidate_count: number;
  gate_narrowed_scope: string;
  gate_missing_evidence: string[];
  gate_blocking_reasons: string[];
  gate_override_used: false;
  idempotent_replay: boolean;
  timer_started: false;
  qa_created: false;
  completion_created: false;
  build_log_created: false;
};

export type CanonicalBuildLifecycleResult = {
  status: "canonical_build_assigned_and_started";
  state_id: string;
  transition_id: string;
  build_number: number | null;
  build_identity_kind: CanonicalBuildIdentityKind;
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
  target_supabase_project_ref: string;
  handoff_version: string;
  handoff_sha256: string;
  assigned_at: string;
  started_at: string;
  assigned_by: string;
  started_by: string;
  assignment_method:
    | "canonical_lifecycle_highest_used_plus_one"
    | "canonical_external_project_identity";
  start_method: "canonical_atomic_assign_and_start";
  operation_key: string;
  request_hash: string;
  idempotent_replay: boolean;
  numeric_sequence_candidate_id: string;
  numeric_sequence_consumed: boolean;
  timer_started: false;
  qa_created: false;
  completion_created: false;
  build_log_created: false;
  gate_evaluation_id: string;
  gate_override_id: string | null;
  gate_classification: CanonicalPreBuildGateClassification;
  gate_decision: "pass" | "override";
  gate_scope_hash: string;
  gate_request_hash: string;
  gate_top_match_score: number;
  gate_candidate_count: number;
  gate_narrowed_scope: string;
  gate_missing_evidence: string[];
  gate_blocking_reasons: string[];
  gate_override_used: boolean;
};

export type CanonicalBuildLifecycleStartResponse =
  | CanonicalBuildLifecycleResult
  | CanonicalPreBuildGateBlockedResult;
