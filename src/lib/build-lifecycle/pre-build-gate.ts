import "server-only";

import type {
  CanonicalBuildIdentityKind,
  CanonicalBuildLifecycleLocalEvidence,
  CanonicalBuildLifecycleRequest,
  CanonicalBuildLifecycleResult,
  CanonicalBuildLifecycleStartResponse,
  CanonicalPreBuildGateBlockedResult,
  CanonicalPreBuildGateCandidate,
  CanonicalPreBuildGateClassification,
  CanonicalPreBuildGateDecision,
  CanonicalPreBuildGatePreviewResult,
} from "@/lib/build-lifecycle/types";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createAthenaCoreClient>;

type GateIdentity = {
  request: CanonicalBuildLifecycleRequest;
  localEvidence: CanonicalBuildLifecycleLocalEvidence;
  operatorKey?: string;
  operatorDisplayName?: string | null;
  operationKey?: string;
  overrideReason?: string;
  acknowledgedReasonCodes?: string[];
  requestEvidence: Record<string, unknown>;
};

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSIFICATIONS = new Set<CanonicalPreBuildGateClassification>([
  "new_capability",
  "repair_existing",
  "extension_existing",
  "duplicate_completed_scope",
  "insufficient_evidence",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Pre-build gate field is not a string array: ${fieldName}.`);
  }

  return value;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Pre-build gate field is missing: ${fieldName}.`);
  }

  return value;
}

function requiredNumber(
  value: unknown,
  fieldName: string,
  options: { integer?: boolean; minimum?: number; maximum?: number } = {},
): number {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    (options.integer === true && !Number.isInteger(parsed)) ||
    (options.minimum !== undefined && parsed < options.minimum) ||
    (options.maximum !== undefined && parsed > options.maximum)
  ) {
    throw new Error(`Pre-build gate field is not a valid number: ${fieldName}.`);
  }

  return parsed;
}

function buildIdentityKindValue(value: unknown): CanonicalBuildIdentityKind {
  if (value !== "numeric" && value !== "external") {
    throw new Error("Canonical build identity kind is invalid.");
  }

  return value;
}

function nullableBuildNumber(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  return requiredNumber(value, "build_number", {
    integer: true,
    minimum: 1,
    maximum: 9999,
  });
}

function classificationValue(value: unknown): CanonicalPreBuildGateClassification {
  if (typeof value !== "string" || !CLASSIFICATIONS.has(
    value as CanonicalPreBuildGateClassification,
  )) {
    throw new Error("Pre-build gate classification is invalid.");
  }

  return value as CanonicalPreBuildGateClassification;
}

function decisionValue(value: unknown): CanonicalPreBuildGateDecision {
  if (value !== "pass" && value !== "block") {
    throw new Error("Pre-build gate decision is invalid.");
  }

  return value;
}

function validateCandidate(
  value: unknown,
  expectedRank: number,
): CanonicalPreBuildGateCandidate {
  if (!isRecord(value)) {
    throw new Error("Pre-build gate candidate is not an object.");
  }

  const rank = requiredNumber(value.rank, "candidate.rank", {
    integer: true,
    minimum: 1,
  });

  if (rank !== expectedRank) {
    throw new Error("Pre-build gate candidate ranking is not deterministic.");
  }

  const titleOverlap = requiredNumber(
    value.title_overlap,
    "candidate.title_overlap",
    { minimum: 0, maximum: 1 },
  );
  const scopeOverlap = requiredNumber(
    value.scope_overlap,
    "candidate.scope_overlap",
    { minimum: 0, maximum: 1 },
  );
  const finalScore = requiredNumber(
    value.final_score,
    "candidate.final_score",
    { minimum: 0, maximum: 1 },
  );

  if (
    typeof value.completed !== "boolean" ||
    typeof value.exact_title_match !== "boolean" ||
    typeof value.exact_scope_match !== "boolean"
  ) {
    throw new Error("Pre-build gate candidate booleans are invalid.");
  }

  return {
    rank,
    source_type: requiredString(value.source_type, "candidate.source_type"),
    source_id: requiredString(value.source_id, "candidate.source_id"),
    candidate_project_key:
      typeof value.candidate_project_key === "string"
        ? value.candidate_project_key
        : null,
    candidate_module_key:
      typeof value.candidate_module_key === "string"
        ? value.candidate_module_key
        : null,
    candidate_build_id:
      typeof value.candidate_build_id === "string"
        ? value.candidate_build_id
        : null,
    candidate_title: requiredString(
      value.candidate_title,
      "candidate.candidate_title",
    ),
    candidate_status:
      typeof value.candidate_status === "string"
        ? value.candidate_status
        : null,
    completed: value.completed,
    exact_title_match: value.exact_title_match,
    exact_scope_match: value.exact_scope_match,
    title_overlap: titleOverlap,
    scope_overlap: scopeOverlap,
    final_score: finalScore,
    matching_tokens: stringArray(
      value.matching_tokens,
      "candidate.matching_tokens",
    ),
    evidence: isRecord(value.evidence) ? value.evidence : {},
  };
}

function validatePreviewResult(value: unknown): CanonicalPreBuildGatePreviewResult {
  if (!isRecord(value) || value.status !== "canonical_pre_build_gate_preview") {
    throw new Error("Pre-build gate preview returned no verified result object.");
  }

  const classification = classificationValue(value.classification);
  const decision = decisionValue(value.decision);
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.map((candidate, index) =>
        validateCandidate(candidate, index + 1),
      )
    : null;

  if (!candidates) {
    throw new Error("Pre-build gate candidates are missing.");
  }

  const candidateCount = requiredNumber(
    value.candidate_count,
    "candidate_count",
    { integer: true, minimum: 0 },
  );

  if (candidateCount !== candidates.length) {
    throw new Error("Pre-build gate candidate count does not match its evidence.");
  }

  if (
    typeof value.start_allowed !== "boolean" ||
    typeof value.requires_override !== "boolean" ||
    value.start_allowed !== (decision === "pass") ||
    value.requires_override !== (decision === "block")
  ) {
    throw new Error("Pre-build gate decision flags are contradictory.");
  }

  const scopeHash = requiredString(value.scope_hash, "scope_hash");
  const requestHash = requiredString(value.request_hash, "request_hash");

  if (!HASH_PATTERN.test(scopeHash) || !HASH_PATTERN.test(requestHash)) {
    throw new Error("Pre-build gate hashes are invalid.");
  }

  return {
    status: "canonical_pre_build_gate_preview",
    classification,
    decision,
    start_allowed: value.start_allowed,
    requires_override: value.requires_override,
    scope_hash: scopeHash,
    request_hash: requestHash,
    top_match_score: requiredNumber(
      value.top_match_score,
      "top_match_score",
      { minimum: 0, maximum: 1 },
    ),
    candidate_count: candidateCount,
    narrowed_scope: requiredString(value.narrowed_scope, "narrowed_scope"),
    missing_evidence: stringArray(value.missing_evidence, "missing_evidence"),
    blocking_reasons: stringArray(value.blocking_reasons, "blocking_reasons"),
    candidates,
    repository_head: requiredString(value.repository_head, "repository_head"),
    repository_tree: requiredString(value.repository_tree, "repository_tree"),
    repository_evidence_sha256: requiredString(
      value.repository_evidence_sha256,
      "repository_evidence_sha256",
    ),
    handoff_sha256: requiredString(value.handoff_sha256, "handoff_sha256"),
    target_supabase_project_ref: requiredString(
      value.target_supabase_project_ref,
      "target_supabase_project_ref",
    ),
    build_identity_kind: buildIdentityKindValue(value.build_identity_kind),
    canonical_build_id:
      typeof value.canonical_build_id === "string"
        ? value.canonical_build_id
        : null,
    canonical_build_title:
      typeof value.canonical_build_title === "string"
        ? value.canonical_build_title
        : null,
  };
}

function validateGateFields(value: Record<string, unknown>) {
  const evaluationId = requiredString(
    value.gate_evaluation_id,
    "gate_evaluation_id",
  );
  const scopeHash = requiredString(value.gate_scope_hash, "gate_scope_hash");
  const requestHash = requiredString(
    value.gate_request_hash,
    "gate_request_hash",
  );

  if (
    !UUID_PATTERN.test(evaluationId) ||
    !HASH_PATTERN.test(scopeHash) ||
    !HASH_PATTERN.test(requestHash)
  ) {
    throw new Error("Gate-enforced lifecycle evidence identity is invalid.");
  }

  return {
    evaluationId,
    classification: classificationValue(value.gate_classification),
    scopeHash,
    requestHash,
    topMatchScore: requiredNumber(
      value.gate_top_match_score,
      "gate_top_match_score",
      { minimum: 0, maximum: 1 },
    ),
    candidateCount: requiredNumber(
      value.gate_candidate_count,
      "gate_candidate_count",
      { integer: true, minimum: 0 },
    ),
    narrowedScope: requiredString(
      value.gate_narrowed_scope,
      "gate_narrowed_scope",
    ),
    missingEvidence: stringArray(
      value.gate_missing_evidence,
      "gate_missing_evidence",
    ),
    blockingReasons: stringArray(
      value.gate_blocking_reasons,
      "gate_blocking_reasons",
    ),
  };
}

function validateStartResponse(value: unknown): CanonicalBuildLifecycleStartResponse {
  if (!isRecord(value)) {
    throw new Error("Gate-enforced lifecycle RPC returned no verified result object.");
  }

  const gate = validateGateFields(value);

  if (value.status === "canonical_pre_build_gate_blocked") {
    if (
      value.gate_decision !== "block" ||
      value.gate_override_used !== false ||
      typeof value.idempotent_replay !== "boolean" ||
      value.timer_started !== false ||
      value.qa_created !== false ||
      value.completion_created !== false ||
      value.build_log_created !== false
    ) {
      throw new Error("Blocked pre-build gate result is contradictory.");
    }

    return {
      status: "canonical_pre_build_gate_blocked",
      gate_evaluation_id: gate.evaluationId,
      gate_classification: gate.classification,
      gate_decision: "block",
      gate_scope_hash: gate.scopeHash,
      gate_request_hash: gate.requestHash,
      gate_top_match_score: gate.topMatchScore,
      gate_candidate_count: gate.candidateCount,
      gate_narrowed_scope: gate.narrowedScope,
      gate_missing_evidence: gate.missingEvidence,
      gate_blocking_reasons: gate.blockingReasons,
      gate_override_used: false,
      idempotent_replay: value.idempotent_replay,
      timer_started: false,
      qa_created: false,
      completion_created: false,
      build_log_created: false,
    } satisfies CanonicalPreBuildGateBlockedResult;
  }

  if (value.status !== "canonical_build_assigned_and_started") {
    throw new Error("Gate-enforced lifecycle RPC returned an unknown status.");
  }

  if (
    (value.gate_decision !== "pass" && value.gate_decision !== "override") ||
    typeof value.gate_override_used !== "boolean" ||
    value.gate_override_used !== (value.gate_decision === "override")
  ) {
    throw new Error("Started lifecycle gate decision is contradictory.");
  }

  const buildIdentityKind = buildIdentityKindValue(
    value.build_identity_kind,
  );
  const buildNumber = nullableBuildNumber(value.build_number);
  const buildId = requiredString(value.build_id, "build_id");
  const buildTitle = requiredString(value.build_title, "build_title");
  const assignmentMethod = requiredString(
    value.assignment_method,
    "assignment_method",
  );
  const nextNumericBuildId = requiredString(
    value.numeric_sequence_candidate_id,
    "numeric_sequence_candidate_id",
  );

  if (!/^[0-9]{4}$/.test(nextNumericBuildId)) {
    throw new Error("Next numeric build identity is invalid.");
  }

  if (
    typeof value.numeric_sequence_consumed !== "boolean" ||
    (buildIdentityKind === "numeric" &&
      (buildNumber === null ||
        buildId !== String(buildNumber).padStart(4, "0") ||
        assignmentMethod !== "canonical_lifecycle_highest_used_plus_one" ||
        value.numeric_sequence_consumed !== true)) ||
    (buildIdentityKind === "external" &&
      (buildNumber !== null ||
        !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(buildId) ||
        assignmentMethod !== "canonical_external_project_identity" ||
        value.numeric_sequence_consumed !== false))
  ) {
    throw new Error("Started lifecycle build identity is contradictory.");
  }

  return {
    ...value,
    build_number: buildNumber,
    build_identity_kind: buildIdentityKind,
    build_id: buildId,
    build_title: buildTitle,
    assignment_method: assignmentMethod,
    numeric_sequence_candidate_id: nextNumericBuildId,
  } as CanonicalBuildLifecycleResult;
}

function rpcArguments(identity: GateIdentity) {
  const { request, localEvidence } = identity;

  return {
    p_intake_id: request.intakeId,
    p_preparation_package_id: request.preparationPackageId,
    p_project_key: request.projectKey,
    p_module_key: request.moduleKey,
    p_module_id: request.moduleId,
    p_build_name: request.buildName,
    p_target_system: request.targetSystem,
    p_tracking_system: request.trackingSystem,
    p_repository_path: localEvidence.repositoryPath,
    p_repository_head: localEvidence.repositoryHead,
    p_repository_tree: localEvidence.repositoryTree,
    p_repository_evidence_sha256: localEvidence.repositoryEvidenceSha256,
    p_supabase_project_ref: localEvidence.supabaseProjectRef,
    p_handoff_version: localEvidence.handoffVersion,
    p_handoff_sha256: localEvidence.handoffSha256,
    p_request_evidence: identity.requestEvidence,
  };
}

export async function previewCanonicalPreBuildGate(input: {
  supabase?: SupabaseClient;
  request: CanonicalBuildLifecycleRequest;
  localEvidence: CanonicalBuildLifecycleLocalEvidence;
  requestEvidence: Record<string, unknown>;
}): Promise<CanonicalPreBuildGatePreviewResult> {
  const supabase = input.supabase || createAthenaCoreClient();
  const { data, error } = await supabase.rpc(
    "athena_pre_build_gate_preview",
    rpcArguments(input),
  );

  if (error) {
    throw new Error(`Pre-build gate preview failed: ${error.message}`);
  }

  const result = validatePreviewResult(data);

  if (
    result.repository_head !== input.localEvidence.repositoryHead ||
    result.repository_tree !== input.localEvidence.repositoryTree ||
    result.repository_evidence_sha256 !==
      input.localEvidence.repositoryEvidenceSha256 ||
    result.handoff_sha256 !== input.localEvidence.handoffSha256 ||
    result.target_supabase_project_ref !==
      input.localEvidence.targetSupabaseProjectRef ||
    result.build_identity_kind !== input.localEvidence.buildIdentityKind ||
    result.canonical_build_id !== input.localEvidence.canonicalBuildId ||
    result.canonical_build_title !== input.localEvidence.canonicalBuildTitle
  ) {
    throw new Error("Pre-build gate preview evidence identity did not match local evidence.");
  }

  return result;
}

export async function gateAndStartCanonicalBuildLifecycle(
  input: GateIdentity & {
    operatorKey: string;
    operationKey: string;
  },
): Promise<CanonicalBuildLifecycleStartResponse> {
  const supabase = createAthenaCoreClient();
  const { data, error } = await supabase.rpc(
    "athena_build_lifecycle_gate_and_start",
    {
      ...rpcArguments(input),
      p_operator_key: input.operatorKey,
      p_operator_display_name: input.operatorDisplayName || null,
      p_operation_key: input.operationKey,
      p_override_reason: input.overrideReason?.trim() || null,
      p_acknowledged_reason_codes: input.acknowledgedReasonCodes || [],
    },
  );

  if (error) {
    throw new Error(`Gate-enforced lifecycle RPC failed: ${error.message}`);
  }

  return validateStartResponse(data);
}
