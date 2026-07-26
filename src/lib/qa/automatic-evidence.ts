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

async function readKnownQaLog(
  repoRoot: string,
  fileName:
    | "0083_helper_ui_build.txt"
    | "0083_helper_ui_eslint.txt"
) {
  try {
    const fullPath =
      fileName ===
      "0083_helper_ui_build.txt"
        ? path.join(
            repoRoot,
            "0083_helper_ui_build.txt"
          )
        : path.join(
            repoRoot,
            "0083_helper_ui_eslint.txt"
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
        .status === "stopped";

    updates.calculation_verified =
      calculationMatches
        ? update(
            "pass",
            `Stopped timer calculation verified: ${rawSeconds} raw active seconds = ${expectedHours.toFixed(
              2
            )} completion hours.`,
            "Automatic evidence used the exact stopped timer matching the packet project, module, build title, and signed operator.",
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
                  .calculation_version
            }
          )
        : update(
            "fail",
            "The authoritative timer calculation did not match the governed seconds-to-hours rule.",
            "Automatic evidence found a stopped timer but its stored calculation did not match raw active seconds divided by 3600 and rounded to two decimals.",
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
                completionHours.hours_spent
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

  const buildLog =
    await readKnownQaLog(
      repoRoot,
      "0083_helper_ui_build.txt"
    );

  const eslintLog =
    await readKnownQaLog(
      repoRoot,
      "0083_helper_ui_eslint.txt"
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

  if (packet.build_log_id) {
    const {
      data: buildLogRow,
      error: buildLogError
    } = await supabase
      .from("athena_build_logs")
      .select(
        "id, product_key, session_title"
      )
      .eq("id", packet.build_log_id)
      .eq(
        "product_key",
        packet.project_key
      )
      .eq(
        "session_title",
        packet.build_session_title
      )
      .maybeSingle<{
        id: string;
        product_key: string;
        session_title: string;
      }>();

    updates.athena_cto_memory_recorded =
      !buildLogError &&
      Boolean(buildLogRow)
        ? update(
            "pass",
            "Athena CTO build-log memory is linked and verified.",
            "Automatic evidence read the exact build log linked to this persistent completion packet.",
            {
              source:
                "athena_build_logs",
              build_log_id:
                buildLogRow?.id || null,
              product_key:
                buildLogRow?.product_key ||
                null,
              session_title:
                buildLogRow?.session_title ||
                null
            }
          )
        : update(
            "fail",
            "The packet contains a build-log id, but the linked Athena CTO build log could not be verified.",
            buildLogError?.message ||
              "The linked build-log row was not returned.",
            {
              source:
                "athena_build_logs",
              requested_build_log_id:
                packet.build_log_id
            }
          );
  } else {
    updates.athena_cto_memory_recorded =
      update(
        "pending",
        "Athena CTO memory remains pending until the verified recording step creates and links the build log.",
        "This is the only intentionally deferred QA check before CTO recording. The recording workflow marks it pass automatically after read-after-write verification.",
        {
          source:
            "completion_packet",
          packet_id: packet.id,
          build_log_id: null
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
