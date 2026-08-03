"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { requireLifecycleOperatorSession } from
  "@/lib/auth/require-lifecycle-operator-session";
import {
  verifyCanonicalBuildLifecycleLocalEvidence,
} from "@/lib/build-lifecycle/local-evidence";
import {
  gateAndStartCanonicalBuildLifecycle,
} from "@/lib/build-lifecycle/pre-build-gate";
import type {
  CanonicalBuildLifecycleRequest,
  CanonicalBuildLifecycleResult,
  CanonicalBuildLifecycleStartResponse,
} from "@/lib/build-lifecycle/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const NUMERIC_BUILD_ID_PATTERN = /^[0-9]{4}$/;
const EXTERNAL_BUILD_ID_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

function requiredText(value: FormDataEntryValue | null, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Required lifecycle field is missing: ${name}`);
  }

  return value.trim();
}

function optionalText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateUuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Lifecycle field is not a canonical UUID: ${name}`);
  }

  return value.toLowerCase();
}

function validateKey(value: string, name: string): string {
  if (!KEY_PATTERN.test(value)) {
    throw new Error(`Lifecycle field is not a canonical key: ${name}`);
  }

  return value;
}

function normalizeBuildName(value: string, buildId: string): string {
  let normalized = value
    .replace(/^\s*[0-9]{4}\s+Build title:\s*/i, "")
    .replace(/^\s*Build title:\s*/i, "")
    .trim();

  if (buildId && normalized.toLowerCase().startsWith(`${buildId.toLowerCase()} `)) {
    normalized = normalized.slice(buildId.length + 1).trim();
  }

  if (!normalized) {
    throw new Error("Canonical build name is required.");
  }

  if (normalized.length > 240) {
    throw new Error("Build name exceeds the 240-character governed limit.");
  }

  return normalized;
}

function canonicalJson(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  return JSON.stringify(
    keys.reduce<Record<string, unknown>>((record, key) => {
      record[key] = value[key];
      return record;
    }, {}),
  );
}

function deterministicOperationKey(
  request: CanonicalBuildLifecycleRequest,
  operatorKey: string,
  handoffSha256: string,
  repositoryHead: string,
  repositoryEvidenceSha256: string,
  targetSupabaseProjectRef: string,
): string {
  const requestIdentity = canonicalJson({
    ...request,
    operatorKey,
    handoffSha256,
    repositoryHead,
    repositoryEvidenceSha256,
    targetSupabaseProjectRef,
  });
  const digest = createHash("sha256")
    .update(requestIdentity, "utf8")
    .digest("hex");

  return `build-lifecycle:${digest}`;
}

function parseCanonicalBuildLifecycleRequest(
  formData: FormData,
): CanonicalBuildLifecycleRequest {
  const requestedBuildId = optionalText(formData.get("return_build_id"));

  return {
    intakeId: validateUuid(
      requiredText(formData.get("intake_id"), "intake_id"),
      "intake_id",
    ),
    preparationPackageId: validateUuid(
      requiredText(
        formData.get("preparation_package_id"),
        "preparation_package_id",
      ),
      "preparation_package_id",
    ),
    projectKey: validateKey(
      requiredText(formData.get("project_key"), "project_key"),
      "project_key",
    ),
    moduleKey: validateKey(
      requiredText(formData.get("module_key"), "module_key"),
      "module_key",
    ),
    moduleId: validateUuid(
      requiredText(formData.get("module_id"), "module_id"),
      "module_id",
    ),
    buildName: normalizeBuildName(
      requiredText(formData.get("build_name"), "build_name"),
      requestedBuildId,
    ),
    targetSystem: requiredText(
      formData.get("target_system"),
      "target_system",
    ),
    trackingSystem: requiredText(
      formData.get("tracking_system"),
      "tracking_system",
    ),
  } satisfies CanonicalBuildLifecycleRequest;
}

function readAfterWriteMatches(
  result: CanonicalBuildLifecycleResult,
  request: CanonicalBuildLifecycleRequest,
  localEvidence: Awaited<
    ReturnType<typeof verifyCanonicalBuildLifecycleLocalEvidence>
  >,
): boolean {
  const numericIdentityMatches =
    result.build_identity_kind === "numeric" &&
    result.build_number !== null &&
    NUMERIC_BUILD_ID_PATTERN.test(result.build_id) &&
    result.build_id === String(result.build_number).padStart(4, "0") &&
    result.build_title ===
      `${result.build_id} Build title: ${request.buildName}` &&
    result.assignment_method === "canonical_lifecycle_highest_used_plus_one" &&
    result.numeric_sequence_consumed === true;

  const externalIdentityMatches =
    result.build_identity_kind === "external" &&
    result.build_number === null &&
    EXTERNAL_BUILD_ID_PATTERN.test(result.build_id) &&
    result.build_id === localEvidence.canonicalBuildId &&
    result.build_title === localEvidence.canonicalBuildTitle &&
    result.assignment_method === "canonical_external_project_identity" &&
    result.numeric_sequence_consumed === false;

  return (
    result.status === "canonical_build_assigned_and_started" &&
    (numericIdentityMatches || externalIdentityMatches) &&
    NUMERIC_BUILD_ID_PATTERN.test(result.numeric_sequence_candidate_id) &&
    result.intake_id === request.intakeId &&
    result.preparation_package_id === request.preparationPackageId &&
    result.project_key === request.projectKey &&
    result.module_key === request.moduleKey &&
    result.module_id === request.moduleId &&
    result.repository_path === localEvidence.repositoryPath &&
    result.repository_head === localEvidence.repositoryHead &&
    result.supabase_project_ref === localEvidence.supabaseProjectRef &&
    result.target_supabase_project_ref ===
      localEvidence.targetSupabaseProjectRef &&
    result.handoff_sha256 === localEvidence.handoffSha256 &&
    /^[0-9a-f]{64}$/.test(result.gate_scope_hash) &&
    /^[0-9a-f]{64}$/.test(result.gate_request_hash) &&
    Boolean(result.gate_evaluation_id) &&
    result.timer_started === false &&
    result.qa_created === false &&
    result.completion_created === false &&
    result.build_log_created === false
  );
}

function returnSearchParameters(formData: FormData): URLSearchParams {
  const parameters = new URLSearchParams();
  const mappings: Array<[string, string]> = [
    ["project_name", "return_project_name"],
    ["project_key", "project_key"],
    ["module_key", "module_key"],
    ["intake_id", "intake_id"],
    ["preparation_package_id", "preparation_package_id"],
    ["build_id", "return_build_id"],
    ["build_title", "build_name"],
    ["target_system", "target_system"],
    ["tracking_system", "tracking_system"],
    ["local_folder", "return_local_folder"],
    ["goal", "return_goal"],
    ["separation_notes", "return_separation_notes"],
  ];

  for (const [targetName, sourceName] of mappings) {
    const value = optionalText(formData.get(sourceName));
    if (value) {
      parameters.set(targetName, value);
    }
  }

  return parameters;
}

function publicFailureMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Canonical lifecycle request failed without a verified error message.";

  return message.replace(/[\r\n\t]+/g, " ").slice(0, 600);
}

export async function startCanonicalBuildLifecycle(
  formData: FormData,
): Promise<CanonicalBuildLifecycleStartResponse> {
  const request = parseCanonicalBuildLifecycleRequest(formData);
  const operator = await requireLifecycleOperatorSession();
  const localEvidence =
    await verifyCanonicalBuildLifecycleLocalEvidence(request);
  const operationKey = deterministicOperationKey(
    request,
    operator.operatorKey,
    localEvidence.handoffSha256,
    localEvidence.repositoryHead,
    localEvidence.repositoryEvidenceSha256,
    localEvidence.targetSupabaseProjectRef,
  );

  const requestEvidence = {
    local_handoff_verified: true,
    repository_path_verified: true,
    repository_branch_verified: true,
    repository_head_verified: true,
    repository_tree_verified: true,
    repository_evidence_verified: true,
    tracked_diff_empty: localEvidence.trackedDiffEmpty,
    staged_diff_empty: localEvidence.stagedDiffEmpty,
    supabase_project_verified: true,
    target_supabase_project_verified: true,
    target_supabase_project_ref: localEvidence.targetSupabaseProjectRef,
    repository_branch: localEvidence.repositoryBranch,
    build_identity_kind: localEvidence.buildIdentityKind,
    canonical_build_id: localEvidence.canonicalBuildId,
    canonical_build_title: localEvidence.canonicalBuildTitle,
    operator_session_verified: true,
    handoff_path: localEvidence.handoffPath,
    evidence_schema: "canonical-pre-build-gate-server-evidence-v2",
  };

  const result = await gateAndStartCanonicalBuildLifecycle({
    request,
    localEvidence,
    operatorKey: operator.operatorKey,
    operatorDisplayName: operator.operatorDisplayName,
    operationKey,
    overrideReason: optionalText(formData.get("override_reason")),
    acknowledgedReasonCodes: formData
      .getAll("override_acknowledged_reason_codes")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
    requestEvidence,
  });

  if (
    result.status === "canonical_build_assigned_and_started" &&
    !readAfterWriteMatches(
      result,
      request,
      localEvidence,
    )
  ) {
    throw new Error(
      "Gate-enforced lifecycle result failed server-side read-after-write verification.",
    );
  }

  return result;
}

export async function startCanonicalBuildLifecycleAndRedirect(
  formData: FormData,
): Promise<never> {
  const parameters = returnSearchParameters(formData);
  let result: CanonicalBuildLifecycleStartResponse | null = null;
  let failureMessage = "";

  try {
    result = await startCanonicalBuildLifecycle(formData);
  } catch (error) {
    failureMessage = publicFailureMessage(error);
  }

  if (!result) {
    parameters.set("lifecycle_status", "error");
    parameters.set("lifecycle_error", failureMessage);
    redirect(`/start-build?${parameters.toString()}`);
  }

  parameters.set("gate_evaluation_id", result.gate_evaluation_id);
  parameters.set("gate_classification", result.gate_classification);
  parameters.set("gate_decision", result.gate_decision);
  parameters.set("gate_scope_hash", result.gate_scope_hash);
  parameters.set("gate_override_used", String(result.gate_override_used));
  parameters.set("gate_narrowed_scope", result.gate_narrowed_scope);

  if (result.status === "canonical_pre_build_gate_blocked") {
    parameters.set("lifecycle_status", "blocked");
    parameters.set("lifecycle_idempotent_replay", String(result.idempotent_replay));
    parameters.set("gate_blocking_reasons", result.gate_blocking_reasons.join("|"));
    redirect(`/start-build?${parameters.toString()}`);
  }

  const startedResult: CanonicalBuildLifecycleResult = result;
  const promptBuildTitle = startedResult.build_title.startsWith(
    `${startedResult.build_id} `,
  )
    ? startedResult.build_title.slice(startedResult.build_id.length + 1)
    : startedResult.build_title;

  parameters.set("build_id", startedResult.build_id);
  parameters.set("build_title", promptBuildTitle);
  parameters.set("lifecycle_status", "started");
  parameters.set("lifecycle_build_id", startedResult.build_id);
  parameters.set("lifecycle_transition_id", startedResult.transition_id);
  parameters.set(
    "lifecycle_idempotent_replay",
    String(startedResult.idempotent_replay),
  );
  parameters.delete("lifecycle_error");

  redirect(`/start-build?${parameters.toString()}`);
}
