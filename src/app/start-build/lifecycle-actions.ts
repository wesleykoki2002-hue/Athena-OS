"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { requireLifecycleOperatorSession } from
  "@/lib/auth/require-lifecycle-operator-session";
import {
  verifyCanonicalBuildLifecycleLocalEvidence,
} from "@/lib/build-lifecycle/local-evidence";
import type {
  CanonicalBuildLifecycleRequest,
  CanonicalBuildLifecycleResult,
} from "@/lib/build-lifecycle/types";
import { createAthenaCoreClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const BUILD_ID_PATTERN = /^[0-9]{4}$/;

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

function normalizeBuildName(value: string): string {
  const normalized = value
    .replace(/^\s*[0-9]{4}\s+Build title:\s*/i, "")
    .replace(/^\s*Build title:\s*/i, "")
    .trim();

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
): string {
  const requestIdentity = canonicalJson({
    ...request,
    operatorKey,
    handoffSha256,
    repositoryHead,
  });
  const digest = createHash("sha256")
    .update(requestIdentity, "utf8")
    .digest("hex");

  return `build-lifecycle:${digest}`;
}

function parseRequest(formData: FormData): CanonicalBuildLifecycleRequest {
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
  repositoryHead: string,
  handoffSha256: string,
): boolean {
  return (
    result.status === "canonical_build_assigned_and_started" &&
    BUILD_ID_PATTERN.test(result.build_id) &&
    result.build_title ===
      `${result.build_id} Build title: ${request.buildName}` &&
    result.intake_id === request.intakeId &&
    result.preparation_package_id === request.preparationPackageId &&
    result.project_key === request.projectKey &&
    result.module_key === request.moduleKey &&
    result.module_id === request.moduleId &&
    result.repository_head === repositoryHead &&
    result.handoff_sha256 === handoffSha256 &&
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
): Promise<CanonicalBuildLifecycleResult> {
  const request = parseRequest(formData);
  const operator = await requireLifecycleOperatorSession();
  const localEvidence =
    await verifyCanonicalBuildLifecycleLocalEvidence();
  const operationKey = deterministicOperationKey(
    request,
    operator.operatorKey,
    localEvidence.handoffSha256,
    localEvidence.repositoryHead,
  );

  const requestEvidence = {
    local_handoff_verified: true,
    repository_head_verified: true,
    tracked_diff_empty: localEvidence.trackedDiffEmpty,
    staged_diff_empty: localEvidence.stagedDiffEmpty,
    supabase_project_verified: true,
    operator_session_verified: true,
    handoff_path: localEvidence.handoffPath,
    evidence_schema: "canonical-build-lifecycle-server-evidence-v1",
  };

  const supabase = createAthenaCoreClient();
  const { data, error } = await supabase.rpc(
    "athena_build_lifecycle_assign_and_start",
    {
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
      p_supabase_project_ref: localEvidence.supabaseProjectRef,
      p_handoff_version: localEvidence.handoffVersion,
      p_handoff_sha256: localEvidence.handoffSha256,
      p_operator_key: operator.operatorKey,
      p_operator_display_name: operator.operatorDisplayName,
      p_operation_key: operationKey,
      p_request_evidence: requestEvidence,
    },
  );

  if (error) {
    throw new Error(
      `Canonical build lifecycle RPC failed: ${error.message}`,
    );
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      "Canonical build lifecycle RPC returned no verified result object.",
    );
  }

  const result = data as CanonicalBuildLifecycleResult;

  if (
    !readAfterWriteMatches(
      result,
      request,
      localEvidence.repositoryHead,
      localEvidence.handoffSha256,
    )
  ) {
    throw new Error(
      "Canonical build lifecycle result failed server-side read-after-write verification.",
    );
  }

  return result;
}

export async function startCanonicalBuildLifecycleAndRedirect(
  formData: FormData,
): Promise<never> {
  const parameters = returnSearchParameters(formData);
  let result: CanonicalBuildLifecycleResult | null = null;
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

  const promptBuildTitle = result.build_title.startsWith(
    `${result.build_id} `,
  )
    ? result.build_title.slice(result.build_id.length + 1)
    : result.build_title;

  parameters.set("build_id", result.build_id);
  parameters.set("build_title", promptBuildTitle);
  parameters.set("lifecycle_status", "started");
  parameters.set("lifecycle_build_id", result.build_id);
  parameters.set("lifecycle_transition_id", result.transition_id);
  parameters.set(
    "lifecycle_idempotent_replay",
    String(result.idempotent_replay),
  );
  parameters.delete("lifecycle_error");

  redirect(`/start-build?${parameters.toString()}`);
}
