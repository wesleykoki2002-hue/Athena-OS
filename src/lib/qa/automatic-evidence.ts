import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  lookupCompletionHours
} from "@/lib/build-timer/completion-hours";
import type { CompletionPacket } from "@/lib/completion-packets";
import { computeQaStatus } from "@/lib/qa-status";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createAthenaCoreClient>;

type AutomaticQaStatus =
  | "pass"
  | "warning"
  | "fail"
  | "pending"
  | "not_applicable";

type AutomaticQaUpdate = {
  status: AutomaticQaStatus;
  actual_result: string;
  notes: string;
  evidence: Record<string, unknown>;
};

type QaCheckRow = {
  id: string;
  check_key: string;
  status: string;
  actual_result: string | null;
  notes: string | null;
  evidence: Record<string, unknown> | null;
  warning_acknowledged_at: string | null;
  warning_acknowledged_by: string | null;
  warning_acknowledgement_notes: string | null;
};

type ModuleRow = {
  project_key: string;
  module_key: string;
  status: string | null;
  priority: string | null;
  progress_percent: number | string | null;
  hours_spent: number | string | null;
  estimated_hours: number | string | null;
  estimated_remaining_hours: number | string | null;
};

type TimerEventRow = {
  sequence_number: number | string | null;
  event_type: string;
  source: string;
  active_delta_seconds: number | string | null;
  raw_active_seconds_after: number | string | null;
  evidence: Record<string, unknown> | null;
  reason: string | null;
};

type HelperTokenEvidenceRow = {
  id: string;
  session_id: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  token_hash_length: number | string | null;
  token_hash_is_sha256: boolean;
  raw_token_stored: boolean | string | null;
  token_hash_algorithm: string | null;
};


export type AutomaticQaEvidenceResult = {
  qa_run_id: string;
  overall_status: string;
  pre_recording_status: string;
  packet_status: string;
  counts: Record<string, number>;
  updated_check_keys: string[];
};

const BUILD_TIMER_ROUTE_FILES = [
  "src/app/build-timer/page.tsx",
  "src/app/build-timer/actions.ts",
  "src/app/build-timer/BuildTimerPanel.tsx",
  "src/app/build-timer/helper-token-actions.ts",
  "src/app/api/build-timer/helper-heartbeat/route.ts",
  "src/lib/auth/timer-operator-session.ts",
  "src/lib/build-timer/completion-hours.ts",
  "scripts/Invoke-AthenaBuildTimerHeartbeat.ps1"
];

const BUILD_TIMER_MIGRATIONS = [
  "supabase/migrations/20260720104016_0083_build_timer_core.sql",
  "supabase/migrations/20260720110400_0083_build_timer_operations.sql",
  "supabase/migrations/20260721143000_0083_build_timer_helper_token_operations.sql",
  "supabase/migrations/20260721170000_0083_build_timer_automatic_qa_evidence_rpc.sql",
  "supabase/migrations/20260723100000_0083_build_timer_helper_security_automatic_qa.sql"
];


const PRE_BUILD_GATE_FILES = [
  "src/app/start-build/lifecycle-actions.ts",
  "src/app/start-build/page.tsx",
  "src/lib/build-lifecycle/types.ts",
  "src/lib/build-lifecycle/local-evidence.ts",
  "src/lib/build-lifecycle/pre-build-gate.ts",
  "src/lib/qa/automatic-evidence.ts",
  "src/lib/qa/build-lifecycle-automatic-evidence.ts",
  "supabase/migrations/20260729133800_0085_pre_build_redundancy_existing_capability_gate.sql",
  "supabase/tests/20260729133801_0085_pre_build_redundancy_existing_capability_gate_automatic_qa.sql",
  "supabase/migrations/20260730111500_0085_gate_service_role_table_privilege_repair.sql",
  "supabase/tests/20260730111501_0085_gate_service_role_table_privilege_repair_automatic_qa.sql",
  "supabase/tests/20260730123000_0085_gate_functional_and_automatic_qa_transactional_validation.sql",
  "supabase/tests/evidence/20260730_0085_source_build_validation.json",
  "supabase/tests/evidence/20260730_0085_database_post_verification.json",
  "supabase/tests/evidence/20260730_0085_functional_validation.json"
];

const CORE_ROUTE_FILES = [
  "src/app/page.tsx",
  "src/app/update/page.tsx",
  "src/app/logs/page.tsx",
  "src/app/next/page.tsx",
  "src/app/reusable/page.tsx",
  "src/app/qa/page.tsx"
];

const CORE_ROUTE_PATHS = [
  "/update",
  "/logs",
  "/next",
  "/reusable",
  "/qa"
];

function asRecord(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseJsonRecord(
  content: string
) {
  try {
    return asRecord(
      JSON.parse(content)
    );
  } catch {
    return null;
  }
}

function asFiniteNonNegative(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) &&
    numberValue >= 0
    ? numberValue
    : null;
}

function isExplicitFalse(value: unknown) {
  return value === false || value === "false";
}

function sha256(value: string) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function makeSignature(update: AutomaticQaUpdate) {
  return sha256(
    JSON.stringify({
      status: update.status,
      actual_result: update.actual_result,
      notes: update.notes,
      evidence: update.evidence
    })
  );
}

function timestampMatches(
  left: string | null,
  right: string | null
) {
  if (left === null || right === null) {
    return left === right;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  return Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime === rightTime;
}

function safeRepoPath(
  repoRoot: string,
  relativePath: string
) {
  const normalized = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  const [topLevel, ...segments] =
    normalized.split("/");

  let scopedRoot: string;

  if (topLevel === "src") {
    scopedRoot = path.join(
      repoRoot,
      "src"
    );
  } else if (topLevel === "scripts") {
    scopedRoot = path.join(
      repoRoot,
      "scripts"
    );
  } else if (topLevel === "supabase") {
    scopedRoot = path.join(
      repoRoot,
      "supabase"
    );
  } else {
    throw new Error(
      `Automatic QA cannot read outside approved repository roots: ${relativePath}`
    );
  }

  const resolved = path.resolve(
    scopedRoot,
    ...segments
  );

  const rootWithSeparator =
    scopedRoot.endsWith(path.sep)
      ? scopedRoot
      : `${scopedRoot}${path.sep}`;

  if (
    resolved !== scopedRoot &&
    !resolved.startsWith(rootWithSeparator)
  ) {
    throw new Error(
      `Path escaped the approved repository root: ${relativePath}`
    );
  }

  return resolved;
}

async function readRepoFile(
  repoRoot: string,
  relativePath: string
) {
  try {
    const fullPath = safeRepoPath(
      repoRoot,
      relativePath
    );

    const content = await readFile(
      fullPath,
      "utf8"
    );

    return {
      relative_path: relativePath,
      exists: true,
      sha256: sha256(content),
      content
    };
  } catch {
    return {
      relative_path: relativePath,
      exists: false,
      sha256: null,
      content: ""
    };
  }
}

async function readRepoFiles(
  repoRoot: string,
  relativePaths: string[]
) {
  return Promise.all(
    relativePaths.map((relativePath) =>
      readRepoFile(repoRoot, relativePath)
    )
  );
}

type KnownQaLogName =
  | "0083_helper_ui_build.txt"
  | "0083_helper_ui_eslint.txt"
  | "0086_completion_reconciliation_build.txt"
  | "0086_completion_reconciliation_eslint.txt";

async function readKnownQaLog(
  repoRoot: string,
  fileName: KnownQaLogName
) {
  try {
    const fullPath = path.join(
      repoRoot,
      fileName
    );

    const content = await readFile(
      fullPath,
      "utf8"
    );

    return {
      name: fileName,
      sha256: sha256(content),
      content
    };
  } catch {
    return null;
  }
}

function includesAll(
  content: string,
  tokens: string[]
) {
  return tokens.every((token) =>
    content.includes(token)
  );
}

function unresolvedText(packet: CompletionPacket) {
  return [
    ...(packet.missing || []),
    ...(packet.next_steps || [])
  ]
    .join("\n")
    .toLowerCase();
}

function buildTimerProfileApplies(
  packet: CompletionPacket
) {
  return (
    packet.project_key === "athena-cto" &&
    packet.module_key ===
      "build-log-recorder" &&
    packet.route_path === "/build-timer"
  );
}


function preBuildGateProfileApplies(
  packet: CompletionPacket
) {
  return (
    packet.project_key === "athena-cto" &&
    packet.module_key ===
      "cross-project-reuse-detector" &&
    packet.route_path === "/start-build"
  );
}

function completionReconciliationProfileApplies(
  packet: CompletionPacket
) {
  return (
    packet.project_key === "athena-cto" &&
    packet.module_key ===
      "cross-project-reuse-detector" &&
    packet.build_session_title ===
      "0086 Build title: Automatic Completion Reconciliation and Timer Reliability"
  );
}

function update(
  status: AutomaticQaStatus,
  actualResult: string,
  notes: string,
  evidence: Record<string, unknown>
): AutomaticQaUpdate {
  return {
    status,
    actual_result: actualResult,
    notes,
    evidence: {
      automatic_qa: true,
      evidence_version:
        "0083-automatic-qa-evidence-v1",
      ...evidence
    }
  };
}

async function buildGenericEvidence(input: {
  supabase: SupabaseClient;
  packet: CompletionPacket;
  repoRoot: string;
}) {
  const {
    supabase,
    packet,
    repoRoot
  } = input;

  const updates: Record<
    string,
    AutomaticQaUpdate
  > = {};

  const {
    data: moduleRow,
    error: moduleError
  } = await supabase
    .from("athena_project_modules")
    .select(
      "project_key, module_key, status, priority, progress_percent, hours_spent, estimated_hours, estimated_remaining_hours"
    )
    .eq("project_key", packet.project_key)
    .eq("module_key", packet.module_key)
    .maybeSingle<ModuleRow>();

  const numericSnapshot = moduleRow
    ? {
        progress_percent:
          asFiniteNonNegative(
            moduleRow.progress_percent
          ),
        hours_spent:
          asFiniteNonNegative(
            moduleRow.hours_spent
          ),
        estimated_hours:
          asFiniteNonNegative(
            moduleRow.estimated_hours
          ),
        estimated_remaining_hours:
          asFiniteNonNegative(
            moduleRow.estimated_remaining_hours
          )
      }
    : null;

  const moduleVerified =
    !moduleError &&
    Boolean(moduleRow) &&
    moduleRow?.project_key ===
      packet.project_key &&
    moduleRow?.module_key ===
      packet.module_key;

  updates.no_negative_values = moduleVerified &&
    numericSnapshot &&
    Object.values(numericSnapshot).every(
      (value) => value !== null
    )
    ? update(
        "pass",
        "Canonical module planning values are finite and non-negative.",
        "Automatic evidence read the exact project/module row from Athena OS Supabase and validated all numeric planning fields.",
        {
          source:
            "athena_project_modules",
          project_key:
            packet.project_key,
          module_key:
            packet.module_key,
          values: numericSnapshot
        }
      )
    : update(
        "fail",
        "Canonical module planning values could not be verified as finite and non-negative.",
        moduleError?.message ||
          "The exact project/module row or one of its numeric values was unavailable.",
        {
          source:
            "athena_project_modules",
          project_key:
            packet.project_key,
          module_key:
            packet.module_key,
          values: numericSnapshot
        }
      );

  const completionHours =
    await lookupCompletionHours({
      projectKey: packet.project_key,
      moduleKey: packet.module_key,
      buildSessionTitle:
        packet.build_session_title
    });

  if (
    completionHours.source ===
      "verified_timer"
  ) {
    const rawSeconds =
      completionHours.timer_session
        .active_seconds;

    const expectedHours =
      Math.round(
        (rawSeconds / 3600) * 100
      ) / 100;

    const calculationMatches =
      rawSeconds >= 0 &&
      completionHours.hours_spent ===
        expectedHours &&
      completionHours.timer_session
        .status === "stopped" &&
      Boolean(
        completionHours.timer_session
          .last_heartbeat_at
      );

    updates.calculation_verified =
      calculationMatches
        ? update(
            "pass",
            `Stopped timer calculation verified: ${rawSeconds} raw active seconds = ${expectedHours.toFixed(
              2
            )} completion hours.`,
            "Automatic evidence used the exact stopped timer matching the packet project, module, build title, and signed operator, and verified recorded heartbeat evidence. A zero-active-seconds completion remains governed by the transactional completion step.",
            {
              source:
                "verified_build_timer",
              timer_session_id:
                completionHours.timer_session.id,
              timer_status:
                completionHours.timer_session
                  .status,
              raw_active_seconds:
                rawSeconds,
              expected_hours:
                expectedHours,
              calculated_hours:
                completionHours.hours_spent,
              calculation_version:
                completionHours.timer_session
                  .calculation_version,
              timer_last_heartbeat_at:
                completionHours.timer_session
                  .last_heartbeat_at,
              timer_heartbeat_verified:
                true,
              zero_time_requires_completion_evidence:
                rawSeconds === 0
            }
          )
        : update(
            "fail",
            "The authoritative timer, heartbeat, or governed seconds-to-hours evidence did not verify.",
            "Automatic evidence requires exact stopped timer identity, a recorded heartbeat, and canonical rounding. Zero-time explanation is enforced transactionally during completion.",
            {
              source:
                "verified_build_timer",
              timer_session_id:
                completionHours.timer_session.id,
              raw_active_seconds:
                rawSeconds,
              expected_hours:
                expectedHours,
              calculated_hours:
                completionHours.hours_spent,
              timer_last_heartbeat_at:
                completionHours.timer_session
                  .last_heartbeat_at
            }
          );
  } else {
    updates.calculation_verified = update(
      "pending",
      "No valid stopped timer is currently available for authoritative completion-hour verification.",
      completionHours.warning,
      {
        source:
          "completion_hours_lookup",
        timer_lookup_source:
          completionHours.source,
        warning:
          completionHours.warning
      }
    );
  }

  const changedSourceFiles = (
    packet.files_changed || []
  ).filter(
    (file) =>
      file.startsWith("src/") &&
      (
        file.endsWith(".ts") ||
        file.endsWith(".tsx")
      )
  );

  const sourceFiles =
    await readRepoFiles(
      repoRoot,
      changedSourceFiles
    );

  const joinedSource = sourceFiles
    .filter((file) => file.exists)
    .map((file) => file.content)
    .join("\n");

  const planningWritePattern =
    /\.from\(\s*["']athena_project_modules["']\s*\)[\s\S]{0,900}\.(update|insert|upsert)\s*\(/;

  const planningWriteDetected =
    planningWritePattern.test(joinedSource);

  const snapshotRemaining =
    asFiniteNonNegative(
      packet.estimated_remaining_hours_snapshot
    );

  const currentRemaining =
    numericSnapshot
      ?.estimated_remaining_hours ??
    null;

  const remainingMatches =
    snapshotRemaining !== null &&
    currentRemaining !== null &&
    snapshotRemaining ===
      currentRemaining;

  updates.no_hardcoded_planning_values =
    moduleVerified &&
    !planningWriteDetected &&
    remainingMatches
      ? update(
          "pass",
          "Timer and completion implementation does not write canonical module planning fields, and the remaining-hours snapshot still matches the canonical module row.",
          "Automatic source inspection found no athena_project_modules mutation in the changed TypeScript files. Direct database evidence confirmed the packet remaining-hours snapshot is unchanged.",
          {
            source:
              "source_and_module_snapshot",
            inspected_files:
              sourceFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            planning_write_detected:
              planningWriteDetected,
            packet_remaining_hours:
              snapshotRemaining,
            current_remaining_hours:
              currentRemaining
          }
        )
      : update(
          "warning",
          "Automatic planning-isolation evidence is incomplete or detected a possible planning-table mutation.",
          "Review is required only if the listed source or remaining-hours comparison cannot be resolved automatically.",
          {
            source:
              "source_and_module_snapshot",
            inspected_files:
              sourceFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            planning_write_detected:
              planningWriteDetected,
            packet_remaining_hours:
              snapshotRemaining,
            current_remaining_hours:
              currentRemaining
          }
        );

  const completionReconciliationProfile =
    completionReconciliationProfileApplies(
      packet
    );

  const buildLog =
    await readKnownQaLog(
      repoRoot,
      completionReconciliationProfile
        ? "0086_completion_reconciliation_build.txt"
        : "0083_helper_ui_build.txt"
    );

  const eslintLog =
    await readKnownQaLog(
      repoRoot,
      completionReconciliationProfile
        ? "0086_completion_reconciliation_eslint.txt"
        : "0083_helper_ui_eslint.txt"
    );

  const buildPassed = Boolean(
    buildLog &&
    buildLog.content.includes(
      "Compiled successfully"
    ) &&
    buildLog.content.includes(
      "Finished TypeScript"
    )
  );

  const eslintPassed = Boolean(
    eslintLog &&
    (
      eslintLog.content.trim() === "" ||
      !/\berror\b/i.test(
        eslintLog.content
      )
    )
  );

  updates.terminal_build_clean =
    buildPassed && eslintPassed
      ? update(
          "pass",
          "Targeted ESLint and the Next.js production build completed successfully.",
          "Automatic evidence read the standardized local QA logs produced during Build 0083 verification.",
          {
            source:
              "standardized_local_qa_logs",
            build_log: buildLog
              ? {
                  name: buildLog.name,
                  sha256:
                    buildLog.sha256,
                  compiled_successfully:
                    true,
                  typescript_finished:
                    true
                }
              : null,
            eslint_log: eslintLog
              ? {
                  name:
                    eslintLog.name,
                  sha256:
                    eslintLog.sha256,
                  clean: eslintPassed
                }
              : null
          }
        )
      : update(
          "pending",
          "Standardized build or ESLint evidence was not available or did not show a clean result.",
          "Regenerate the standardized logs through the governed validation command, then rerun automatic QA evidence.",
          {
            source:
              "standardized_local_qa_logs",
            build_log: buildLog
              ? {
                  name: buildLog.name,
                  sha256:
                    buildLog.sha256,
                  compiled_successfully:
                    buildPassed
                }
              : null,
            eslint_log: eslintLog
              ? {
                  name:
                    eslintLog.name,
                  sha256:
                    eslintLog.sha256,
                  clean: eslintPassed
                }
              : null
          }
        );

  const coreFiles =
    await readRepoFiles(
      repoRoot,
      CORE_ROUTE_FILES
    );

  const coreSourcesExist =
    coreFiles.every((file) => file.exists);

  const buildMapContainsRoutes =
    Boolean(
      buildLog &&
      includesAll(
        buildLog.content,
        CORE_ROUTE_PATHS
      )
    );

  updates.core_pages_regression_checked =
    coreSourcesExist &&
    buildMapContainsRoutes
      ? update(
          "pass",
          "Core Athena OS routes remain present in source and in the successful production-build route map.",
          "Automatic evidence verified /, /update, /logs, /next, /reusable, and /qa through their source files and the successful Next.js route map.",
          {
            source:
              "route_source_and_build_map",
            route_files:
              coreFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            build_log:
              buildLog?.name || null,
            route_map_contains:
              CORE_ROUTE_PATHS
          }
        )
      : update(
          "pending",
          "Core-route regression evidence is incomplete.",
          "One or more core route source files or production-build route entries could not be verified automatically.",
          {
            source:
              "route_source_and_build_map",
            route_files:
              coreFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            build_log:
              buildLog?.name || null,
            build_map_contains_routes:
              buildMapContainsRoutes
          }
        );

  if (
    packet.status === "completed" &&
    packet.build_log_id
  ) {
    const {
      data: reconciliationData,
      error: reconciliationError
    } = await supabase.rpc(
      "athena_read_feature_completion_reconciliation",
      {
        p_packet_id: packet.id
      }
    );

    const reconciliation =
      asRecord(reconciliationData);

    const reconciliationVerified =
      !reconciliationError &&
      reconciliation?.verified === true &&
      reconciliation.packet_id ===
        packet.id &&
      reconciliation.build_log_id ===
        packet.build_log_id &&
      reconciliation.qa_run_id ===
        packet.qa_run_id &&
      reconciliation.completion_event_id ===
        packet.completion_event_id;

    updates.athena_cto_memory_recorded =
      reconciliationVerified
        ? update(
            "pass",
            "Athena CTO completion memory and all Build 0086 reconciliation links are freshly verified.",
            "Automatic evidence called the service-role read-after-write verifier for packet, QA, event, build log, lifecycle transition, preparation package, timer, hours, and correction synchronization.",
            {
              source:
                "athena_read_feature_completion_reconciliation",
              reconciliation
            }
          )
        : update(
            "fail",
            "The completed packet did not pass Build 0086 reconciliation verification.",
            reconciliationError?.message ||
              (typeof reconciliation
                ?.verification_error ===
                "string"
                ? reconciliation
                    .verification_error
                : "The reconciliation verifier returned false or mismatched links."),
            {
              source:
                "athena_read_feature_completion_reconciliation",
              packet_id:
                packet.id,
              reconciliation
            }
          );
  } else {
    updates.athena_cto_memory_recorded =
      update(
        "pending",
        "Athena CTO memory remains pending until transactional completion reconciliation creates and verifies every canonical link.",
        "This is the only intentionally deferred QA check before CTO recording. Build 0086 marks it pass inside the transactional reconciliation and then verifies it through a separate read.",
        {
          source:
            "completion_packet",
          packet_id: packet.id,
          packet_status:
            packet.status,
          build_log_id:
            packet.build_log_id
        }
      );
  }

  return {
    updates,
    moduleRow,
    numericSnapshot,
    completionHours,
    buildLog,
    eslintLog
  };
}

async function addBuildTimerEvidence(input: {
  supabase: SupabaseClient;
  packet: CompletionPacket;
  qaRunId: string;
  repoRoot: string;
  updates: Record<
    string,
    AutomaticQaUpdate
  >;
  moduleRow: ModuleRow | null;
  completionHours: Awaited<
    ReturnType<typeof lookupCompletionHours>
  >;
}) {
  const {
    supabase,
    packet,
    qaRunId,
    repoRoot,
    updates,
    moduleRow,
    completionHours
  } = input;

  const routeFiles =
    await readRepoFiles(
      repoRoot,
      BUILD_TIMER_ROUTE_FILES
    );

  const migrationFiles =
    await readRepoFiles(
      repoRoot,
      BUILD_TIMER_MIGRATIONS
    );

  const allRouteFilesExist =
    routeFiles.every((file) => file.exists);

  const allMigrationsExist =
    migrationFiles.every(
      (file) => file.exists
    );

  const routeMapAvailable =
    updates.terminal_build_clean
      ?.status === "pass";

  updates.route_or_function_exists =
    allRouteFilesExist &&
    allMigrationsExist &&
    routeMapAvailable
      ? update(
          "pass",
          "The Build Timer page, API route, server actions, PowerShell helper, completion-hours helper, and all required Build 0083 database migrations exist and passed the production-build route map.",
          "Automatic evidence verified the exact governed Build 0083 implementation paths.",
          {
            source:
              "repository_and_build_map",
            route_files:
              routeFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            migration_files:
              migrationFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              }))
          }
        )
      : update(
          "fail",
          "One or more required Build Timer routes, helpers, migrations, or build-map entries could not be verified.",
          "The exact missing paths are included in structured evidence.",
          {
            source:
              "repository_and_build_map",
            route_files:
              routeFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            migration_files:
              migrationFiles.map((file) => ({
                path:
                  file.relative_path,
                exists: file.exists,
                sha256: file.sha256
              })),
            route_map_available:
              routeMapAvailable
          }
        );

  const panelFile = routeFiles.find(
    (file) =>
      file.relative_path.endsWith(
        "BuildTimerPanel.tsx"
      )
  );

  const uiTokens = [
    "issueBuildTimerHelperToken",
    "revokeBuildTimerHelperToken",
    "Issue Helper Token",
    "Copy Raw Token",
    "Clear Raw Token",
    "Revoke Helper Token",
    "Hash-only database storage"
  ];

  const uiContractVerified = Boolean(
    panelFile?.exists &&
    includesAll(
      panelFile.content,
      uiTokens
    ) &&
    !panelFile.content.includes(
      "localStorage"
    ) &&
    !panelFile.content.includes(
      "sessionStorage"
    ) &&
    !panelFile.content.includes(
      "SUPABASE_SERVICE_ROLE_KEY"
    )
  );

  const automaticRestoreTokens = [
    "automatic_timer_restore",
    "window.history.replaceState",
    "initialRestoreKey",
    "lookupExistingTimer",
    "Existing timer session restored automatically."
  ];

  const automaticRestoreVerified = Boolean(
    panelFile?.exists &&
    includesAll(
      panelFile.content,
      automaticRestoreTokens
    )
  );

  const unresolved =
    unresolvedText(packet);

  const packetRefreshDefectRecorded =
    unresolved.includes(
      "automatically restore"
    ) ||
    (
      unresolved.includes(
        "find existing timer"
      ) &&
      unresolved.includes("refresh")
    );

  const refreshDefectOpen =
    packetRefreshDefectRecorded &&
    !automaticRestoreVerified;

  updates.ui_shows_expected_new_fields =
    uiContractVerified
      ? update(
          refreshDefectOpen
            ? "warning"
            : "pass",
          refreshDefectOpen
            ? "The expected Build Timer and helper-token UI fields exist, but automatic restoration of the exact timer after refresh remains unresolved."
            : automaticRestoreVerified
              ? "The Build Timer preserves the exact canonical identity in the URL and automatically restores the matching existing timer after refresh."
              : "The expected Build Timer and helper-token UI fields exist without forbidden token storage or service-role exposure.",
          refreshDefectOpen
            ? "Automatic UI source evidence passed, but the packet explicitly records the refresh workflow as unresolved and no verified automatic-restore implementation was found."
            : automaticRestoreVerified
              ? "Automatic source evidence verified URL identity persistence, one-time restoration from the initial canonical query identity, and reuse of the existing timer lookup action."
              : "Automatic source evidence verified all expected controls and forbidden-token protections.",
          {
            source:
              "BuildTimerPanel.tsx",
            sha256:
              panelFile?.sha256 || null,
            required_tokens:
              uiTokens,
            forbidden_tokens_absent:
              uiContractVerified,
            automatic_restore_tokens:
              automaticRestoreTokens,
            automatic_restore_verified:
              automaticRestoreVerified,
            packet_refresh_defect_recorded:
              packetRefreshDefectRecorded,
            refresh_defect_open:
              refreshDefectOpen
          }
        )
      : update(
          "fail",
          "The expected helper-token UI contract could not be verified.",
          "One or more required controls are absent or a forbidden browser/service-role token pattern was found.",
          {
            source:
              "BuildTimerPanel.tsx",
            sha256:
              panelFile?.sha256 || null,
            required_tokens:
              uiTokens
          }
        );

  if (
    completionHours.source !==
      "verified_timer"
  ) {
    updates.database_read_verified =
      update(
        "pending",
        "The exact stopped Build 0083 timer session is not currently available for database-read verification.",
        completionHours.warning,
        {
          source:
            "completion_hours_lookup",
          warning:
            completionHours.warning
        }
      );

    updates.database_write_verified =
      update(
        "pending",
        "Timer write evidence cannot be linked until the exact stopped timer session is available.",
        completionHours.warning,
        {
          source:
            "completion_hours_lookup",
          warning:
            completionHours.warning
        }
      );

    updates.saved_row_verified =
      update(
        "pending",
        "Saved timer and helper-token rows cannot be linked until the exact stopped timer session is available.",
        completionHours.warning,
        {
          source:
            "completion_hours_lookup",
          warning:
            completionHours.warning
        }
      );

    updates.rls_policy_reviewed =
      update(
        "pending",
        "Runtime helper-token security evidence cannot be linked until the exact timer session is available.",
        completionHours.warning,
        {
          source:
            "completion_hours_lookup",
          warning:
            completionHours.warning
        }
      );

    return;
  }

  const session =
    completionHours.timer_session;

  const {
    data: qaEvidenceData,
    error: qaEvidenceError
  } = await supabase.rpc(
    "athena_build_timer_read_qa_evidence",
    {
      p_session_id: session.id
    }
  );

  const qaEvidenceRecord =
    asRecord(qaEvidenceData);

  const events =
    qaEvidenceRecord &&
    Array.isArray(
      qaEvidenceRecord.events
    )
      ? qaEvidenceRecord.events
          .map((value) =>
            asRecord(value)
          )
          .filter(
            (
              value
            ): value is Record<
              string,
              unknown
            > => Boolean(value)
          )
          .map(
            (value): TimerEventRow => ({
              sequence_number:
                typeof value
                  .sequence_number ===
                    "number" ||
                typeof value
                  .sequence_number ===
                    "string"
                  ? value.sequence_number
                  : null,
              event_type:
                typeof value.event_type ===
                  "string"
                  ? value.event_type
                  : "",
              source:
                typeof value.source ===
                  "string"
                  ? value.source
                  : "",
              active_delta_seconds:
                typeof value
                  .active_delta_seconds ===
                    "number" ||
                typeof value
                  .active_delta_seconds ===
                    "string"
                  ? value
                      .active_delta_seconds
                  : null,
              raw_active_seconds_after:
                typeof value
                  .raw_active_seconds_after ===
                    "number" ||
                typeof value
                  .raw_active_seconds_after ===
                    "string"
                  ? value
                      .raw_active_seconds_after
                  : null,
              evidence:
                asRecord(
                  value.evidence
                ),
              reason:
                typeof value.reason ===
                  "string"
                  ? value.reason
                  : null
            })
          )
      : [];

  const tokens =
    qaEvidenceRecord &&
    Array.isArray(
      qaEvidenceRecord.helper_tokens
    )
      ? qaEvidenceRecord
          .helper_tokens
          .map((value) =>
            asRecord(value)
          )
          .filter(
            (
              value
            ): value is Record<
              string,
              unknown
            > => Boolean(value)
          )
          .map(
            (
              value
            ): HelperTokenEvidenceRow => ({
              id:
                typeof value.id ===
                  "string"
                  ? value.id
                  : "",
              session_id:
                typeof value.session_id ===
                  "string"
                  ? value.session_id
                  : "",
              expires_at:
                typeof value.expires_at ===
                  "string"
                  ? value.expires_at
                  : "",
              last_used_at:
                typeof value.last_used_at ===
                  "string"
                  ? value.last_used_at
                  : null,
              revoked_at:
                typeof value.revoked_at ===
                  "string"
                  ? value.revoked_at
                  : null,
              token_hash_length:
                typeof value
                  .token_hash_length ===
                    "number" ||
                typeof value
                  .token_hash_length ===
                    "string"
                  ? value
                      .token_hash_length
                  : null,
              token_hash_is_sha256:
                value
                  .token_hash_is_sha256 ===
                true,
              raw_token_stored:
                value.raw_token_stored ===
                  false ||
                value.raw_token_stored ===
                  "false"
                  ? false
                  : value
                      .raw_token_stored ===
                    true ||
                    value
                      .raw_token_stored ===
                      "true"
                    ? true
                    : null,
              token_hash_algorithm:
                typeof value
                  .token_hash_algorithm ===
                  "string"
                  ? value
                      .token_hash_algorithm
                  : null
            })
          )
      : [];

  const issuedEvent = events.find(
    (event) =>
      event.event_type ===
      "helper_token_issued"
  );

  const helperHeartbeat = events.find(
    (event) =>
      event.event_type === "heartbeat" &&
      event.source ===
        "powershell_helper"
  );

  const revokedEvent = events.find(
    (event) =>
      event.event_type ===
      "helper_token_revoked"
  );

  const validTokenRecord =
    tokens.find((token) => {
      return (
        token.session_id ===
          session.id &&
        Number(
          token.token_hash_length
        ) === 64 &&
        token.token_hash_is_sha256 ===
          true &&
        Boolean(token.last_used_at) &&
        Boolean(token.revoked_at) &&
        isExplicitFalse(
          token.raw_token_stored
        ) &&
        token.token_hash_algorithm ===
          "sha256"
      );
    }) || null;

  const heartbeatEvidence =
    asRecord(helperHeartbeat?.evidence);

  const issuedEvidence =
    asRecord(issuedEvent?.evidence);

  const rawTokenStoredFalse =
    issuedEvent
      ? isExplicitFalse(
          issuedEvidence
            ?.raw_token_stored
        )
      : false;

  const offlineReplayFalse =
    helperHeartbeat
      ? isExplicitFalse(
          heartbeatEvidence
            ?.offline_replay
        )
      : false;

  const eventChainVerified =
    !qaEvidenceError &&
    Boolean(issuedEvent) &&
    Boolean(helperHeartbeat) &&
    Boolean(revokedEvent);

  const tokenRowVerified =
    !qaEvidenceError &&
    Boolean(validTokenRecord);

  updates.database_read_verified =
    moduleRow &&
    session.project_key ===
      packet.project_key &&
    session.module_key ===
      packet.module_key &&
    session.build_session_title ===
      packet.build_session_title
      ? update(
          "pass",
          "The completion workflow read the exact canonical module and stopped Build 0083 timer session from Athena OS Supabase.",
          "Automatic evidence matched project, module, build title, timer identity, and stopped status.",
          {
            source:
              "athena_project_modules_and_timer_session",
            project_key:
              session.project_key,
            module_key:
              session.module_key,
            build_session_title:
              session.build_session_title,
            timer_session_id:
              session.id,
            timer_status:
              session.status
          }
        )
      : update(
          "fail",
          "The exact canonical module and timer-session identity did not match the completion packet.",
          "Automatic evidence requires an exact project, module, build-title, and stopped-session match.",
          {
            source:
              "athena_project_modules_and_timer_session",
            timer_session_id:
              session.id,
            timer_project_key:
              session.project_key,
            timer_module_key:
              session.module_key,
            timer_build_session_title:
              session.build_session_title
          }
        );

  updates.database_write_verified =
    eventChainVerified &&
    rawTokenStoredFalse &&
    offlineReplayFalse
      ? update(
          "pass",
          "Governed writes were verified for helper-token issuance, one PowerShell heartbeat, and helper-token revocation.",
          "Automatic evidence read the append-only event chain and confirmed raw-token storage and offline replay were disabled.",
          {
            source:
              "athena_build_timer_events",
            timer_session_id:
              session.id,
            event_types: [
              issuedEvent?.event_type,
              helperHeartbeat?.event_type,
              revokedEvent?.event_type
            ],
            event_sources: [
              issuedEvent?.source,
              helperHeartbeat?.source,
              revokedEvent?.source
            ],
            raw_token_stored:
              rawTokenStoredFalse
                ? false
                : null,
            offline_replay:
              offlineReplayFalse
                ? false
                : null
          }
        )
      : update(
          "fail",
          "The complete helper-token issuance, heartbeat, and revocation write chain could not be verified.",
          qaEvidenceError?.message ||
            "One or more required append-only events or security flags were absent.",
          {
            source:
              "athena_build_timer_events",
            timer_session_id:
              session.id,
            event_count:
              events.length,
            issued_event:
              Boolean(issuedEvent),
            powershell_heartbeat:
              Boolean(helperHeartbeat),
            revoked_event:
              Boolean(revokedEvent),
            raw_token_stored_false:
              rawTokenStoredFalse,
            offline_replay_false:
              offlineReplayFalse
          }
        );

  updates.saved_row_verified =
    tokenRowVerified &&
    eventChainVerified
      ? update(
          "pass",
          "Direct database reads verified the stopped timer, hash-only helper-token row, successful-use timestamp, revocation timestamp, and append-only runtime events.",
          "Automatic evidence confirmed a 64-character SHA-256 token hash and no persisted raw token.",
          {
            source:
              "timer_session_helper_token_and_events",
            timer_session_id:
              session.id,
            helper_token_id:
              validTokenRecord?.id ||
              null,
            token_hash_length:
              Number(
                validTokenRecord
                  ?.token_hash_length
              ) || null,
            last_used_at:
              validTokenRecord
                ?.last_used_at ||
              null,
            revoked_at:
              validTokenRecord
                ?.revoked_at ||
              null,
            event_count:
              events.length
          }
        )
      : update(
          "fail",
          "The saved helper-token row or append-only event chain could not be verified.",
          qaEvidenceError?.message ||
            "The expected persisted rows were not returned.",
          {
            source:
              "timer_session_helper_token_and_events",
            timer_session_id:
              session.id,
            helper_token_count:
              tokens.length,
            event_count:
              events.length
          }
        );

  const helperMigration =
    migrationFiles.find(
      (file) =>
        file.relative_path.includes(
          "helper_token_operations"
        )
    );

  const securitySourceTokens = [
    "athena_build_timer_issue_helper_token",
    "athena_build_timer_revoke_helper_token",
    "athena_build_timer_apply_helper_heartbeat",
    "security definer",
    "revoke all on function",
    "from public, anon, authenticated, service_role",
    "grant execute on function",
    "to service_role"
  ];

  const forbiddenSecurityGrantTokens = [
    "to public;",
    "to anon;",
    "to authenticated;"
  ];

  const normalizedMigration =
    (
      helperMigration?.content
        .toLowerCase() || ""
    )
      .replace(/\s+/g, " ")
      .trim();

  const sourceSecurityVerified =
    helperMigration?.exists === true &&
    includesAll(
      normalizedMigration,
      securitySourceTokens
    ) &&
    (
      normalizedMigration
        .split("security definer")
        .length - 1
    ) >= 3 &&
    (
      normalizedMigration
        .split("to service_role;")
        .length - 1
    ) >= 3 &&
    !forbiddenSecurityGrantTokens.some(
      (token) =>
        normalizedMigration.includes(token)
    );

  const securityTestKey = [
    packet.id,
    qaRunId,
    "helper-security-v1"
  ].join(":");

  const {
    data: securityQaData,
    error: securityQaError
  } = await supabase.rpc(
    "athena_build_timer_run_helper_security_qa",
    {
      p_session_id: session.id,
      p_test_key: securityTestKey
    }
  );

  const securityQaRecord =
    asRecord(securityQaData);

  const expiredTokenRejected =
    securityQaRecord
      ?.expired_token_rejected === true;

  const expiredTokenNotUsed =
    securityQaRecord
      ?.expired_token_not_used === true;

  const expiredTokenNoHeartbeatEvent =
    securityQaRecord
      ?.expired_token_no_heartbeat_event ===
    true;

  const wrongOperatorRejected =
    securityQaRecord
      ?.wrong_operator_rejected === true;

  const securityQaPersisted =
    typeof securityQaRecord
      ?.evidence_id === "string" &&
    Boolean(securityQaRecord.evidence_id);

  const automaticSecurityTestsVerified =
    !securityQaError &&
    expiredTokenRejected &&
    expiredTokenNotUsed &&
    expiredTokenNoHeartbeatEvent &&
    wrongOperatorRejected &&
    securityQaPersisted;

  const runtimeSecurityVerified =
    sourceSecurityVerified &&
    tokenRowVerified &&
    eventChainVerified &&
    rawTokenStoredFalse &&
    offlineReplayFalse &&
    automaticSecurityTestsVerified;

  updates.rls_policy_reviewed =
    runtimeSecurityVerified
      ? update(
          "pass",
          "Helper-token RPC grants, hash-only storage, no replay, revocation rejection, expired-token rejection, and wrong-operator rejection are verified.",
          "Automatic source evidence and persisted service-role-only runtime self-tests verified the governed helper-token security boundary.",
          {
            source:
              "migration_runtime_and_security_self_test",
            helper_migration_sha256:
              helperMigration?.sha256 ||
              null,
            service_role_only_source:
              sourceSecurityVerified,
            security_definer_function_count:
              normalizedMigration
                .split("security definer")
                .length - 1,
            service_role_grant_count:
              normalizedMigration
                .split("to service_role;")
                .length - 1,
            forbidden_direct_grant_present:
              forbiddenSecurityGrantTokens.some(
                (token) =>
                  normalizedMigration.includes(
                    token
                  )
              ),
            hash_only_storage:
              tokenRowVerified,
            raw_token_stored:
              false,
            offline_replay:
              false,
            revocation_event:
              Boolean(revokedEvent),
            security_test_key:
              securityTestKey,
            security_test_evidence_id:
              securityQaRecord
                ?.evidence_id || null,
            security_test_idempotent_replay:
              securityQaRecord
                ?.idempotent_replay === true,
            expired_token_rejected:
              expiredTokenRejected,
            expired_token_not_used:
              expiredTokenNotUsed,
            expired_token_no_heartbeat_event:
              expiredTokenNoHeartbeatEvent,
            expired_token_error:
              securityQaRecord
                ?.expired_token_error || null,
            expired_token_sqlstate:
              securityQaRecord
                ?.expired_token_sqlstate || null,
            wrong_operator_rejected:
              wrongOperatorRejected,
            wrong_operator_error:
              securityQaRecord
                ?.wrong_operator_error || null,
            wrong_operator_sqlstate:
              securityQaRecord
                ?.wrong_operator_sqlstate || null
          }
        )
      : update(
          "fail",
          "The helper-token security boundary could not be fully verified from source and persisted runtime evidence.",
          securityQaError?.message ||
            "Required service-role-only controls, hash-only storage, no-replay evidence, revocation evidence, or automatic rejection tests were absent.",
          {
            source:
              "migration_runtime_and_security_self_test",
            helper_migration_sha256:
              helperMigration?.sha256 ||
              null,
            service_role_only_source:
              sourceSecurityVerified,
            security_definer_function_count:
              normalizedMigration
                .split("security definer")
                .length - 1,
            service_role_grant_count:
              normalizedMigration
                .split("to service_role;")
                .length - 1,
            forbidden_direct_grant_present:
              forbiddenSecurityGrantTokens.some(
                (token) =>
                  normalizedMigration.includes(
                    token
                  )
              ),
            hash_only_storage:
              tokenRowVerified,
            event_chain:
              eventChainVerified,
            raw_token_stored_false:
              rawTokenStoredFalse,
            offline_replay_false:
              offlineReplayFalse,
            automatic_security_tests_verified:
              automaticSecurityTestsVerified,
            security_test_key:
              securityTestKey,
            security_test_error:
              securityQaError?.message || null,
            expired_token_rejected:
              expiredTokenRejected,
            expired_token_not_used:
              expiredTokenNotUsed,
            expired_token_no_heartbeat_event:
              expiredTokenNoHeartbeatEvent,
            wrong_operator_rejected:
              wrongOperatorRejected
          }
        );
}


async function addPreBuildGateEvidence(input: {
  supabase: SupabaseClient;
  packet: CompletionPacket;
  repoRoot: string;
  updates: Record<
    string,
    AutomaticQaUpdate
  >;
}) {
  const {
    supabase,
    packet,
    repoRoot,
    updates
  } = input;

  const files = await readRepoFiles(
    repoRoot,
    PRE_BUILD_GATE_FILES
  );
  const fileByPath = new Map(
    files.map((file) => [
      file.relative_path,
      file
    ])
  );
  const allFilesExist = files.every(
    (file) => file.exists
  );
  const migration = fileByPath.get(
    "supabase/migrations/20260729133800_0085_pre_build_redundancy_existing_capability_gate.sql"
  );
  const sqlTest = fileByPath.get(
    "supabase/tests/20260729133801_0085_pre_build_redundancy_existing_capability_gate_automatic_qa.sql"
  );
  const privilegeRepairMigration =
    fileByPath.get(
      "supabase/migrations/20260730111500_0085_gate_service_role_table_privilege_repair.sql"
    );
  const privilegeRepairTest =
    fileByPath.get(
      "supabase/tests/20260730111501_0085_gate_service_role_table_privilege_repair_automatic_qa.sql"
    );
  const functionalSqlTest =
    fileByPath.get(
      "supabase/tests/20260730123000_0085_gate_functional_and_automatic_qa_transactional_validation.sql"
    );
  const sourceBuildEvidence =
    fileByPath.get(
      "supabase/tests/evidence/20260730_0085_source_build_validation.json"
    );
  const databasePostVerificationEvidence =
    fileByPath.get(
      "supabase/tests/evidence/20260730_0085_database_post_verification.json"
    );
  const functionalValidationEvidence =
    fileByPath.get(
      "supabase/tests/evidence/20260730_0085_functional_validation.json"
    );
  const lifecycleAction = fileByPath.get(
    "src/app/start-build/lifecycle-actions.ts"
  );
  const page = fileByPath.get(
    "src/app/start-build/page.tsx"
  );
  const gateModule = fileByPath.get(
    "src/lib/build-lifecycle/pre-build-gate.ts"
  );

  const requiredMigrationTokens = [
    "athena_pre_build_gate_evaluations",
    "athena_pre_build_gate_candidate_matches",
    "athena_pre_build_gate_overrides",
    "athena_pre_build_gate_preview",
    "athena_build_lifecycle_gate_and_start",
    "athena_pre_build_gate_read_qa_evidence",
    "duplicate_completed_scope",
    "insufficient_evidence",
    "athena_build_lifecycle_transitions_require_pre_build_gate",
    "enable row level security",
    "append-only"
  ];
  const migrationContractVerified = Boolean(
    migration?.exists &&
    includesAll(
      migration.content.toLowerCase(),
      requiredMigrationTokens.map(
        (token) => token.toLowerCase()
      )
    )
  );
  const actionContractVerified = Boolean(
    lifecycleAction?.exists &&
    includesAll(
      lifecycleAction.content,
      [
        "gateAndStartCanonicalBuildLifecycle",
        "override_acknowledged_reason_codes",
        "gate_scope_hash",
        "canonical_pre_build_gate_blocked"
      ]
    ) &&
    !lifecycleAction.content.includes(
      '"athena_build_lifecycle_assign_and_start"'
    )
  );
  const gateModuleVerified = Boolean(
    gateModule?.exists &&
    includesAll(
      gateModule.content,
      [
        "athena_pre_build_gate_preview",
        "athena_build_lifecycle_gate_and_start",
        "validatePreviewResult"
      ]
    )
  );

  const privilegeRepairContractVerified =
    Boolean(
      privilegeRepairMigration?.exists &&
      includesAll(
        privilegeRepairMigration.content.toLowerCase(),
        [
          "revoke all",
          "from public, anon, authenticated, service_role",
          "grant select",
          "to service_role",
          "service_role_insert_present",
          "service_role_update_present",
          "service_role_delete_present",
          "service_role_truncate_present",
          "service_role_references_present",
          "service_role_trigger_present"
        ]
      ) &&
      privilegeRepairTest?.exists &&
      includesAll(
        privilegeRepairTest.content.toLowerCase(),
        [
          "rolbypassrls",
          "service_role_insert_present",
          "service_role_update_present",
          "service_role_delete_present",
          "service_role_truncate_present",
          "service_role_references_present",
          "service_role_trigger_present",
          "rollback;"
        ]
      )
    );

  const functionalTestContractVerified =
    Boolean(
      functionalSqlTest?.exists &&
      includesAll(
        functionalSqlTest.content,
        [
          "build_0085_gate_functional_and_automatic_qa_transactional_validation_pass",
          "athena_build_lifecycle_gate_and_start",
          "governed_override_exact_acknowledgement_pass",
          "governed_override_incomplete_acknowledgement_rejected",
          "automatic_qa_evidence_rpc_readback_pass",
          "ungated_transition_rejected",
          "fixture_rollback_verified",
          "rollback;"
        ]
      )
    );

  const sourceBuildRecord =
    sourceBuildEvidence?.exists
      ? parseJsonRecord(
          sourceBuildEvidence.content
        )
      : null;
  const sourceBuildRoutes =
    Array.isArray(sourceBuildRecord?.routes)
      ? sourceBuildRecord.routes.filter(
          (route): route is string =>
            typeof route === "string"
        )
      : [];
  const sourceBuildVerified =
    sourceBuildRecord?.status ===
      "build_0085_consolidated_source_build_validation_pass" &&
    sourceBuildRecord?.production_builds_passed === 2 &&
    sourceBuildRecord?.database_mutation_performed === false &&
    sourceBuildRecord?.git_staged === false &&
    sourceBuildRecord?.git_committed === false &&
    sourceBuildRecord?.git_pushed === false &&
    [
      "/",
      "/update",
      "/logs",
      "/next",
      "/reusable",
      "/qa",
      "/start-build"
    ].every((route) =>
      sourceBuildRoutes.includes(route)
    );

  const databasePostRecord =
    databasePostVerificationEvidence?.exists
      ? parseJsonRecord(
          databasePostVerificationEvidence.content
        )
      : null;
  const databaseSecurity =
    asRecord(databasePostRecord?.security);
  const databaseGateObjects =
    asRecord(databasePostRecord?.gate_objects);
  const databasePostVerified =
    databasePostRecord?.status ===
      "canonical_build_0085_database_migration_and_privilege_repair_post_verification_pass" &&
    databaseSecurity
      ?.service_role_exact_select_only_tables ===
      true &&
    databaseSecurity
      ?.anon_authenticated_access === false &&
    databaseSecurity
      ?.append_only_triggers_enabled === true &&
    databaseSecurity
      ?.lifecycle_transition_gate_enabled === true &&
    databaseGateObjects?.table_count === 3 &&
    databaseGateObjects?.function_count === 11 &&
    databaseGateObjects?.trigger_count === 7 &&
    databaseGateObjects?.evaluation_row_count === 0 &&
    databaseGateObjects?.candidate_row_count === 0 &&
    databaseGateObjects?.override_row_count === 0;

  const functionalRecord =
    functionalValidationEvidence?.exists
      ? parseJsonRecord(
          functionalValidationEvidence.content
        )
      : null;
  const functionalMatrix =
    asRecord(
      functionalRecord?.functional_matrix
    );
  const functionalSecurityMatrix =
    asRecord(
      functionalRecord?.security_matrix
    );
  const persistentMutations =
    asRecord(
      functionalRecord?.persistent_mutations
    );
  const functionalValidationVerified =
    functionalRecord?.status ===
      "build_0085_gate_functional_and_automatic_qa_transactional_validation_pass" &&
    functionalRecord
      ?.fixture_rollback_verified === true &&
    functionalRecord
      ?.persistent_build_0086_created === false &&
    functionalRecord
      ?.persistent_build_0087_created === false &&
    functionalMatrix
      ?.new_capability_wrapper_start_pass === true &&
    functionalMatrix
      ?.duplicate_completed_scope_block_pass === true &&
    functionalMatrix
      ?.governed_override_exact_acknowledgement_pass === true &&
    functionalMatrix
      ?.governed_override_incomplete_acknowledgement_rejected === true &&
    functionalMatrix
      ?.automatic_qa_evidence_rpc_readback_pass === true &&
    functionalSecurityMatrix
      ?.ungated_transition_rejected === true &&
    functionalSecurityMatrix
      ?.service_role_exact_select_only_gate_tables === true &&
    persistentMutations?.database === false &&
    persistentMutations?.timer === false &&
    persistentMutations?.qa === false &&
    persistentMutations?.completion === false &&
    persistentMutations?.build_log === false &&
    persistentMutations?.git === false;

  updates.route_or_function_exists =
    allFilesExist &&
    migrationContractVerified &&
    actionContractVerified &&
    gateModuleVerified &&
    privilegeRepairContractVerified &&
    functionalTestContractVerified &&
    sourceBuildVerified &&
    databasePostVerified &&
    functionalValidationVerified
      ? update(
          "pass",
          "The mandatory pre-build gate route integration, server module, two migrations, three SQL tests, and three retained evidence records exist in the exact governed paths.",
          "Automatic evidence verified all 15 Build 0085 source/evidence files, the repaired privilege boundary, and the executed rollback-only functional contract.",
          {
            source:
              "build_0085_repository_contract",
            files: files.map((file) => ({
              path: file.relative_path,
              exists: file.exists,
              sha256: file.sha256
            })),
            migration_contract_verified:
              migrationContractVerified,
            lifecycle_action_contract_verified:
              actionContractVerified,
            gate_module_verified:
              gateModuleVerified,
            privilege_repair_contract_verified:
              privilegeRepairContractVerified,
            functional_test_contract_verified:
              functionalTestContractVerified,
            source_build_evidence_verified:
              sourceBuildVerified,
            database_post_verification_evidence_verified:
              databasePostVerified,
            functional_validation_evidence_verified:
              functionalValidationVerified
          }
        )
      : update(
          "fail",
          "One or more required Build 0085 files or gate-enforcement tokens are missing.",
          "The exact missing file and source-contract evidence is attached.",
          {
            source:
              "build_0085_repository_contract",
            files: files.map((file) => ({
              path: file.relative_path,
              exists: file.exists,
              sha256: file.sha256
            })),
            migration_contract_verified:
              migrationContractVerified,
            lifecycle_action_contract_verified:
              actionContractVerified,
            gate_module_verified:
              gateModuleVerified,
            privilege_repair_contract_verified:
              privilegeRepairContractVerified,
            functional_test_contract_verified:
              functionalTestContractVerified,
            source_build_evidence_verified:
              sourceBuildVerified,
            database_post_verification_evidence_verified:
              databasePostVerified,
            functional_validation_evidence_verified:
              functionalValidationVerified
          }
        );

  const uiTokens = [
    "Mandatory pre-build gate preview",
    "Gate classification",
    "Allowed implementation delta",
    "Missing evidence",
    "Governed override",
    "override_acknowledged_reason_codes",
    "Override gate and formally start canonical build"
  ];
  const uiVerified = Boolean(
    page?.exists &&
    includesAll(page.content, uiTokens)
  );
  updates.ui_shows_expected_new_fields =
    uiVerified
      ? update(
          "pass",
          "The /start-build UI displays classification, decision, scope hash, candidate evidence, narrowed scope, blocking reasons, and governed override controls.",
          "Automatic source evidence verified the complete Build 0085 operator contract.",
          {
            source: "src/app/start-build/page.tsx",
            sha256: page?.sha256 || null,
            required_tokens: uiTokens
          }
        )
      : update(
          "fail",
          "The complete Build 0085 gate UI contract could not be verified.",
          "One or more mandatory operator fields or controls are absent.",
          {
            source: "src/app/start-build/page.tsx",
            sha256: page?.sha256 || null,
            required_tokens: uiTokens
          }
        );

  const [evaluationRead, candidateRead, overrideRead] =
    await Promise.all([
      supabase
        .from("athena_pre_build_gate_evaluations")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("athena_pre_build_gate_candidate_matches")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("athena_pre_build_gate_overrides")
        .select("id", { count: "exact", head: true })
    ]);
  const structuralReadsVerified =
    !evaluationRead.error &&
    !candidateRead.error &&
    !overrideRead.error;

  updates.database_read_verified =
    structuralReadsVerified
      ? update(
          "pass",
          "Athena OS Supabase reads succeeded for all three canonical Build 0085 gate evidence relations.",
          "Automatic evidence queried the evaluation, candidate-match, and override relations through the service-role server boundary.",
          {
            source:
              "athena_pre_build_gate_relations",
            evaluation_count:
              evaluationRead.count,
            candidate_count:
              candidateRead.count,
            override_count:
              overrideRead.count
          }
        )
      : update(
          "fail",
          "One or more canonical Build 0085 gate evidence relations could not be read.",
          evaluationRead.error?.message ||
            candidateRead.error?.message ||
            overrideRead.error?.message ||
            "Unknown relation-read failure.",
          {
            source:
              "athena_pre_build_gate_relations"
          }
        );

  const {
    data: latestEvaluations,
    error: latestEvaluationError
  } = await supabase
    .from("athena_pre_build_gate_evaluations")
    .select(
      "id, operation_key, request_hash, scope_hash, classification, decision, candidate_count, lifecycle_transition_id, created_at"
    )
    .eq("project_key", packet.project_key)
    .eq("module_key", packet.module_key)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<Array<{
      id: string;
      operation_key: string;
      request_hash: string;
      scope_hash: string;
      classification: string;
      decision: string;
      candidate_count: number;
      lifecycle_transition_id: string | null;
      created_at: string;
    }>>();

  const latestEvaluation =
    latestEvaluations?.[0] || null;
  if (!latestEvaluationError && latestEvaluation) {
    const {
      data: qaEvidence,
      error: qaEvidenceError
    } = await supabase.rpc(
      "athena_pre_build_gate_read_qa_evidence",
      {
        p_evaluation_id:
          latestEvaluation.id
      }
    );
    const qaRecord = asRecord(qaEvidence);
    const persistedCandidateCount = Number(
      qaRecord?.candidate_count ?? -1
    );
    const writeVerified =
      !qaEvidenceError &&
      qaRecord !== null &&
      persistedCandidateCount ===
        Number(latestEvaluation.candidate_count) &&
      qaRecord
        ?.old_rpc_service_role_execute ===
        true &&
      qaRecord
        ?.wrapper_service_role_execute ===
        true &&
      qaRecord
        ?.transition_gate_trigger_exists ===
        true;

    updates.database_write_verified =
      writeVerified
        ? update(
            "pass",
            "A persisted Build 0085 gate evaluation and its candidate evidence were read back through the governed QA RPC.",
            "Automatic evidence verified candidate counts, historical RPC compatibility, and the non-bypassable database transition trigger.",
            {
              source:
                "athena_pre_build_gate_read_qa_evidence",
              evaluation_id:
                latestEvaluation.id,
              operation_key:
                latestEvaluation.operation_key,
              classification:
                latestEvaluation.classification,
              decision:
                latestEvaluation.decision,
              candidate_count:
                persistedCandidateCount,
              old_rpc_service_role_execute:
                qaRecord
                  ?.old_rpc_service_role_execute,
              wrapper_service_role_execute:
                qaRecord
                  ?.wrapper_service_role_execute,
              transition_gate_trigger_exists:
                qaRecord
                  ?.transition_gate_trigger_exists
            }
          )
        : update(
            "fail",
            "The persisted Build 0085 gate evidence failed governed read-after-write verification.",
            qaEvidenceError?.message ||
              "Candidate count or RPC privilege evidence did not match.",
            {
              source:
                "athena_pre_build_gate_read_qa_evidence",
              evaluation_id:
                latestEvaluation.id
            }
          );

    updates.saved_row_verified =
      writeVerified
        ? update(
            "pass",
            "The exact evaluation row, scope/request hashes, candidate count, and lifecycle link were saved and verified.",
            "Automatic evidence used the latest exact project/module evaluation and the gate QA RPC.",
            {
              source:
                "athena_pre_build_gate_evaluations",
              evaluation:
                latestEvaluation
            }
          )
        : update(
            "fail",
            "The exact saved Build 0085 gate row could not be verified.",
            qaEvidenceError?.message ||
              "The saved row evidence was incomplete.",
            {
              source:
                "athena_pre_build_gate_evaluations",
              evaluation:
                latestEvaluation
            }
          );
  } else if (
    functionalTestContractVerified &&
    functionalValidationVerified
  ) {
    updates.database_write_verified =
      update(
        "pass",
        "The real gate wrapper persisted evaluation, candidate, override, and lifecycle-link evidence inside a rollback-only live transaction.",
        "Automatic evidence retained the executed functional-validation result and verified that every fixture mutation was rolled back, so no fake Build 0086/0087 or gate evidence remains.",
        {
          source:
            "build_0085_transactional_functional_validation",
          sql_sha256:
            functionalSqlTest?.sha256 || null,
          evidence_sha256:
            functionalValidationEvidence
              ?.sha256 || null,
          fixture_rollback_verified:
            functionalRecord
              ?.fixture_rollback_verified,
          persistent_build_0086_created:
            functionalRecord
              ?.persistent_build_0086_created,
          persistent_build_0087_created:
            functionalRecord
              ?.persistent_build_0087_created
        }
      );
    updates.saved_row_verified =
      update(
        "pass",
        "Transactional evaluation, candidate, override, transition, idempotent replay, and QA-RPC readback were saved and verified before rollback.",
        "The retained evidence proves the complete saved-row contract while preserving the live Build 0085 lifecycle, timer, QA, and zero gate rows.",
        {
          source:
            "build_0085_transactional_functional_validation",
          functional_matrix:
            functionalMatrix,
          security_matrix:
            functionalSecurityMatrix
        }
      );
  } else {
    updates.database_write_verified =
      update(
        "pending",
        "No persisted gate evaluation or verified rollback-only functional evidence is available.",
        "Run the governed Build 0085 transactional functional validation and retain its exact evidence before refreshing automatic QA.",
        {
          source:
            "athena_pre_build_gate_evaluations",
          latest_evaluation_error:
            latestEvaluationError?.message ||
            null,
          functional_test_contract_verified:
            functionalTestContractVerified,
          functional_validation_evidence_verified:
            functionalValidationVerified
        }
      );
    updates.saved_row_verified =
      update(
        "pending",
        "No persisted or transactionally verified Build 0085 saved-row evidence is available.",
        "Automatic QA remains pending until the full wrapper and read-after-write evidence are verified.",
        {
          source:
            "build_0085_saved_row_evidence"
        }
      );
  }

  const testTokens = [
    "duplicate_completed_scope",
    "repair_existing",
    "extension_existing",
    "new_capability",
    "insufficient_evidence",
    "active_scope_conflict",
    "athena_pre_build_overlap_score",
    "no persisted pre-build gate evaluation exists",
    "rollback;"
  ];
  const calculationVerified = Boolean(
    sqlTest?.exists &&
    includesAll(
      sqlTest.content,
      testTokens
    ) &&
    functionalTestContractVerified &&
    functionalValidationVerified
  );
  updates.calculation_verified =
    calculationVerified
      ? update(
          "pass",
          "Deterministic classification, wrapper start/block, governed override, idempotent replay, and score-bound fixtures passed and rolled back their database fixture.",
          "Automatic evidence verified both SQL test contracts and the retained successful live rollback result.",
          {
            source:
              "build_0085_sql_automatic_qa",
            sha256:
              sqlTest?.sha256 || null,
            required_tokens:
              testTokens,
            functional_test_sha256:
              functionalSqlTest?.sha256 || null,
            functional_evidence_sha256:
              functionalValidationEvidence
                ?.sha256 || null
          }
        )
      : update(
          "fail",
          "The deterministic Build 0085 calculation test contract is incomplete.",
          "One or more classification, score, or rollback fixtures are absent.",
          {
            source:
              "build_0085_sql_automatic_qa",
            sha256:
              sqlTest?.sha256 || null
          }
        );

  const securityVerified = Boolean(
    migration?.exists &&
    includesAll(
      migration.content.toLowerCase(),
      [
        "enable row level security",
        "prevent_athena_pre_build_gate_mutation",
        "athena_build_lifecycle_transitions_require_pre_build_gate"
      ]
    ) &&
    privilegeRepairContractVerified &&
    databasePostVerified &&
    functionalValidationVerified
  );
  updates.rls_policy_reviewed =
    securityVerified
      ? update(
          "pass",
          "RLS, exact service_role SELECT-only table access, no browser-role access, append-only evidence, security-definer RPCs, and the mandatory transition gate trigger are verified.",
          "Automatic evidence requires the corrective privilege migration, its regression test, final live post-verification, and rollback-only functional security matrix.",
          {
            source:
              "build_0085_migration_security_contract",
            migration_sha256:
              migration?.sha256 || null,
            privilege_repair_migration_sha256:
              privilegeRepairMigration
                ?.sha256 || null,
            privilege_repair_test_sha256:
              privilegeRepairTest
                ?.sha256 || null,
            database_post_verification_sha256:
              databasePostVerificationEvidence
                ?.sha256 || null,
            service_role_exact_select_only:
              databaseSecurity
                ?.service_role_exact_select_only_tables ??
              null,
            secret_values_recorded:
              false
          }
        )
      : update(
          "fail",
          "The Build 0085 migration security contract could not be fully verified.",
          "Required RLS, repaired grants, live post-verification, append-only, or transition-gate evidence is missing.",
          {
            source:
              "build_0085_migration_security_contract",
            migration_sha256:
              migration?.sha256 || null
          }
        );

  updates.core_pages_regression_checked =
    sourceBuildVerified
      ? update(
          "pass",
          "Core Athena OS routes and /start-build remained present in both successful Build 0085 production-build route maps.",
          "Automatic evidence retained two clean production builds: the original gate source application and the privilege-repair source application.",
          {
            source:
              "build_0085_consolidated_source_build_validation",
            evidence_sha256:
              sourceBuildEvidence?.sha256 ||
              null,
            routes:
              sourceBuildRoutes,
            production_builds_passed:
              sourceBuildRecord
                ?.production_builds_passed ??
              null
          }
        )
      : update(
          "fail",
          "The retained Build 0085 production-build route evidence is incomplete.",
          "Both production builds and the required route map must be present before this regression check can pass.",
          {
            source:
              "build_0085_consolidated_source_build_validation"
          }
        );

  updates.terminal_build_clean =
    sourceBuildVerified
      ? update(
          "pass",
          "The corrected gate implementation and privilege-repair source both completed clean Next.js production builds and TypeScript validation.",
          "Automatic evidence retained the exact package hashes, local evidence paths, and successful route maps without staging, committing, pushing, or applying database SQL from the installers.",
          {
            source:
              "build_0085_consolidated_source_build_validation",
            evidence_sha256:
              sourceBuildEvidence?.sha256 ||
              null,
            initial_source_evidence_path:
              sourceBuildRecord
                ?.initial_source_evidence_path ??
              null,
            privilege_repair_source_evidence_path:
              sourceBuildRecord
                ?.privilege_repair_source_evidence_path ??
              null
          }
        )
      : update(
          "fail",
          "The retained Build 0085 production-build evidence could not be verified.",
          "A clean production build for both source-application phases is required.",
          {
            source:
              "build_0085_consolidated_source_build_validation"
          }
        );
}

async function persistAutomaticUpdates(input: {
  supabase: SupabaseClient;
  packet: CompletionPacket;
  qaRunId: string;
  updates: Record<
    string,
    AutomaticQaUpdate
  >;
}) {
  const {
    supabase,
    packet,
    qaRunId,
    updates
  } = input;

  const {
    data: existingChecks,
    error: checksError
  } = await supabase
    .from("athena_qa_check_results")
    .select(
      "id, check_key, status, actual_result, notes, evidence, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
    )
    .eq("qa_run_id", qaRunId)
    .returns<QaCheckRow[]>();

  if (checksError || !existingChecks) {
    throw new Error(
      `Automatic QA could not read the linked checklist: ${
        checksError?.message ||
        "No check rows were returned."
      }`
    );
  }

  const checkByKey = new Map(
    existingChecks.map((check) => [
      check.check_key,
      check
    ])
  );

  const missingKeys =
    Object.keys(updates).filter(
      (checkKey) =>
        !checkByKey.has(checkKey)
    );

  if (missingKeys.length > 0) {
    throw new Error(
      `Automatic QA expected checklist rows that do not exist: ${missingKeys.join(
        ", "
      )}`
    );
  }

  const now =
    new Date().toISOString();

  for (const [
    checkKey,
    baseUpdate
  ] of Object.entries(updates)) {
    const existing =
      checkByKey.get(checkKey);

    if (!existing) {
      throw new Error(
        `Automatic QA check disappeared before update: ${checkKey}`
      );
    }

    const signature =
      makeSignature(baseUpdate);

    const priorEvidence =
      asRecord(existing.evidence);

    const sameWarningEvidence =
      baseUpdate.status === "warning" &&
      existing.status === "warning" &&
      priorEvidence
        ?.automatic_signature ===
        signature;

    const warningAcknowledgedAt =
      sameWarningEvidence
        ? existing
            .warning_acknowledged_at
        : null;

    const warningAcknowledgedBy =
      sameWarningEvidence
        ? existing
            .warning_acknowledged_by
        : null;

    const warningAcknowledgementNotes =
      sameWarningEvidence
        ? existing
            .warning_acknowledgement_notes
        : null;

    const evidence = {
      ...baseUpdate.evidence,
      automatic_signature:
        signature,
      generated_at: now,
      completion_packet_id:
        packet.id,
      qa_run_id: qaRunId
    };

    const {
      data: savedCheck,
      error: updateError
    } = await supabase
      .from("athena_qa_check_results")
      .update({
        status: baseUpdate.status,
        actual_result:
          baseUpdate.actual_result,
        notes: baseUpdate.notes,
        evidence,
        warning_acknowledged_at:
          warningAcknowledgedAt,
        warning_acknowledged_by:
          warningAcknowledgedBy,
        warning_acknowledgement_notes:
          warningAcknowledgementNotes,
        updated_at: now
      })
      .eq("id", existing.id)
      .eq("qa_run_id", qaRunId)
      .eq("check_key", checkKey)
      .select(
        "id, check_key, status, actual_result, notes, evidence, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
      )
      .maybeSingle<QaCheckRow>();

    if (
      updateError ||
      !savedCheck ||
      savedCheck.check_key !==
        checkKey ||
      savedCheck.status !==
        baseUpdate.status ||
      savedCheck.actual_result !==
        baseUpdate.actual_result ||
      savedCheck.notes !==
        baseUpdate.notes ||
      asRecord(savedCheck.evidence)
        ?.automatic_signature !==
        signature ||
      !timestampMatches(
        savedCheck
          .warning_acknowledged_at,
        warningAcknowledgedAt
      ) ||
      savedCheck
        .warning_acknowledged_by !==
        warningAcknowledgedBy ||
      savedCheck
        .warning_acknowledgement_notes !==
        warningAcknowledgementNotes
    ) {
      throw new Error(
        `Automatic QA read-after-write verification failed for ${checkKey}: ${
          updateError?.message ||
          "Saved values did not match."
        }`
      );
    }
  }

  const {
    data: verifiedChecks,
    error: verificationError
  } = await supabase
    .from("athena_qa_check_results")
    .select(
      "id, check_key, status, actual_result, notes, evidence, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
    )
    .eq("qa_run_id", qaRunId)
    .returns<QaCheckRow[]>();

  if (
    verificationError ||
    !verifiedChecks
  ) {
    throw new Error(
      `Automatic QA could not verify the final checklist: ${
        verificationError?.message ||
        "No rows were returned."
      }`
    );
  }

  const overallStatus =
    computeQaStatus(verifiedChecks);

  const preRecordingChecks =
    verifiedChecks.filter(
      (check) =>
        check.check_key !==
        "athena_cto_memory_recorded"
    );

  const preRecordingStatus =
    computeQaStatus(preRecordingChecks);

  const completedAt =
    overallStatus === "pass" ||
    overallStatus === "fail"
      ? now
      : null;

  const {
    data: savedRun,
    error: runError
  } = await supabase
    .from("athena_qa_runs")
    .update({
      status: overallStatus,
      completed_at: completedAt,
      updated_at: now
    })
    .eq("id", qaRunId)
    .select(
      "id, status, completed_at"
    )
    .maybeSingle<{
      id: string;
      status: string;
      completed_at: string | null;
    }>();

  if (
    runError ||
    !savedRun ||
    savedRun.status !==
      overallStatus ||
    !timestampMatches(
      savedRun.completed_at,
      completedAt
    )
  ) {
    throw new Error(
      `Automatic QA run-status verification failed: ${
        runError?.message ||
        "Saved status did not match."
      }`
    );
  }

  const packetStatus =
    preRecordingStatus === "pass"
      ? "ready_to_record"
      : "qa_in_progress";

  const counts =
    verifiedChecks.reduce<
      Record<string, number>
    >((result, check) => {
      result[check.status] =
        (result[check.status] || 0) + 1;

      return result;
    }, {});

  const {
    data: savedPacket,
    error: packetError
  } = await supabase
    .from(
      "athena_feature_completion_packets"
    )
    .update({
      status: packetStatus,
      metadata: {
        ...(packet.metadata || {}),
        automatic_qa: {
          evidence_version:
            "0083-automatic-qa-evidence-v1",
          qa_run_id: qaRunId,
          generated_at: now,
          overall_status:
            overallStatus,
          pre_recording_status:
            preRecordingStatus,
          counts,
          updated_check_keys:
            Object.keys(updates)
        }
      }
    })
    .eq("id", packet.id)
    .eq("qa_run_id", qaRunId)
    .select(
      "id, qa_run_id, status, metadata"
    )
    .maybeSingle<{
      id: string;
      qa_run_id: string | null;
      status: string;
      metadata:
        Record<string, unknown> | null;
    }>();

  const savedAutomaticQa =
    asRecord(
      asRecord(savedPacket?.metadata)
        ?.automatic_qa
    );

  if (
    packetError ||
    !savedPacket ||
    savedPacket.qa_run_id !==
      qaRunId ||
    savedPacket.status !==
      packetStatus ||
    savedAutomaticQa?.qa_run_id !==
      qaRunId ||
    savedAutomaticQa
      ?.overall_status !==
      overallStatus
  ) {
    throw new Error(
      `Automatic QA packet synchronization failed: ${
        packetError?.message ||
        "Saved packet values did not match."
      }`
    );
  }

  return {
    qa_run_id: qaRunId,
    overall_status: overallStatus,
    pre_recording_status:
      preRecordingStatus,
    packet_status: packetStatus,
    counts,
    updated_check_keys:
      Object.keys(updates)
  };
}

export async function applyAutomaticQaEvidence(
  input: {
    supabase?: SupabaseClient;
    packet: CompletionPacket;
    qaRunId: string;
  }
): Promise<AutomaticQaEvidenceResult> {
  const supabase =
    input.supabase ||
    createAthenaCoreClient();

  const packet = input.packet;
  const qaRunId =
    input.qaRunId.trim();

  if (!qaRunId) {
    throw new Error(
      "A linked QA run id is required for automatic evidence."
    );
  }

  if (
    packet.qa_run_id &&
    packet.qa_run_id !== qaRunId
  ) {
    throw new Error(
      "The requested QA run does not match the completion packet link."
    );
  }

  const {
    data: run,
    error: runError
  } = await supabase
    .from("athena_qa_runs")
    .select(
      "id, project_key, module_key, feature_name, route_path, build_session_title"
    )
    .eq("id", qaRunId)
    .maybeSingle<{
      id: string;
      project_key: string;
      module_key: string | null;
      feature_name: string;
      route_path: string | null;
      build_session_title: string | null;
    }>();

  if (
    runError ||
    !run ||
    run.project_key !==
      packet.project_key ||
    run.module_key !==
      packet.module_key ||
    run.feature_name !==
      packet.feature_name ||
    run.route_path !==
      packet.route_path ||
    run.build_session_title !==
      packet.build_session_title
  ) {
    throw new Error(
      `Automatic QA run identity verification failed: ${
        runError?.message ||
        "The run does not exactly match the packet identity."
      }`
    );
  }

  const repoRoot =
    path.resolve(
      /* turbopackIgnore: true */
      process.cwd()
    );

  const generic =
    await buildGenericEvidence({
      supabase,
      packet,
      repoRoot
    });

  if (buildTimerProfileApplies(packet)) {
    await addBuildTimerEvidence({
      supabase,
      packet,
      qaRunId,
      repoRoot,
      updates: generic.updates,
      moduleRow:
        generic.moduleRow || null,
      completionHours:
        generic.completionHours
    });
  } else if (
    preBuildGateProfileApplies(packet)
  ) {
    await addPreBuildGateEvidence({
      supabase,
      packet,
      repoRoot,
      updates: generic.updates
    });
  } else {
    const genericPending: Record<
      string,
      AutomaticQaUpdate
    > = {
      route_or_function_exists:
        update(
          "pending",
          "No automatic route profile is registered for this feature type and route.",
          "Add a governed automatic QA profile instead of manually assigning a pass.",
          {
            source:
              "automatic_qa_profile_registry",
            route_path:
              packet.route_path
          }
        ),
      ui_shows_expected_new_fields:
        update(
          "pending",
          "No automatic UI contract profile is registered for this feature.",
          "Add a governed automatic QA profile or use explicit human-review fallback.",
          {
            source:
              "automatic_qa_profile_registry",
            feature_type:
              packet.feature_type
          }
        ),
      database_read_verified:
        update(
          "pending",
          "No automatic database-read profile is registered for this feature.",
          "Add a governed automatic QA profile instead of manually assigning a pass.",
          {
            source:
              "automatic_qa_profile_registry"
          }
        ),
      database_write_verified:
        update(
          "pending",
          "No automatic database-write profile is registered for this feature.",
          "Add a governed automatic QA profile instead of manually assigning a pass.",
          {
            source:
              "automatic_qa_profile_registry"
          }
        ),
      saved_row_verified:
        update(
          "pending",
          "No automatic saved-row profile is registered for this feature.",
          "Add a governed automatic QA profile instead of manually assigning a pass.",
          {
            source:
              "automatic_qa_profile_registry"
          }
        ),
      rls_policy_reviewed:
        update(
          "pending",
          "No automatic security profile is registered for this feature.",
          "Add a governed automatic QA profile or use explicit human-review fallback.",
          {
            source:
              "automatic_qa_profile_registry"
          }
        )
    };

    Object.assign(
      generic.updates,
      genericPending
    );
  }

  return persistAutomaticUpdates({
    supabase,
    packet,
    qaRunId,
    updates: generic.updates
  });
}
