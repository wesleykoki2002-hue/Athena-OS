"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  splitPacketLines,
  type CompletionPacket
} from "@/lib/completion-packets";
import { applyAutomaticQaEvidence } from "@/lib/qa/automatic-evidence";
import {
  lookupCompletionHours,
  type CompletionHoursLookup
} from "@/lib/build-timer/completion-hours";

type AthenaCtoUpdateResponse = {
  ok?: boolean;
  verified?: boolean;
  project_key?: string;
  module_key?: string;
  error?: string;
  build_log?: {
    id?: string;
    product_key?: string;
    session_title?: string;
  };
};

type QaCheckRow = {
  check_key: string;
  status: string;
  warning_acknowledged_at: string | null;
};

type ManualFallbackQaRow = {
  id: string;
  check_key: string;
  status: string;
  actual_result: string | null;
  notes: string | null;
  warning_acknowledged_at: string | null;
  warning_acknowledged_by: string | null;
  warning_acknowledgement_notes: string | null;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function asMetadataRecord(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function completionHoursMetadataMatches(
  metadata: Record<string, unknown> | null,
  completionHours: CompletionHoursLookup,
  hoursSpent: number
) {
  const savedMetadata =
    asMetadataRecord(metadata);

  if (
    !savedMetadata ||
    completionHours.source !==
      "verified_timer" ||
    Number(
      savedMetadata.completion_hours
    ) !== hoursSpent
  ) {
    return false;
  }

  return (
    savedMetadata.hours_source ===
      "verified_build_timer" &&
    savedMetadata.timer_session_id ===
      completionHours.timer_session.id &&
    Number(
      savedMetadata.timer_active_seconds
    ) ===
      completionHours.timer_session
        .active_seconds &&
    savedMetadata.timer_started_at ===
      completionHours.timer_session
        .started_at &&
    savedMetadata.timer_last_heartbeat_at ===
      completionHours.timer_session
        .last_heartbeat_at &&
    savedMetadata.timer_stopped_at ===
      completionHours.timer_session
        .stopped_at &&
    savedMetadata.timer_identity_verified ===
      true &&
    savedMetadata.timer_heartbeat_verified ===
      true &&
    savedMetadata.manual_hours_fallback ===
      null
  );
}

type CompletionReconciliationResult = {
  verified?: boolean;
  external_read_after_write_required?: boolean;
  idempotent_replay?: boolean;
  write_status?: string;
  packet_id?: string;
  qa_run_id?: string;
  completion_event_id?: string;
  build_log_id?: string;
  preparation_package_id?: string;
  timer_session_id?: string;
  timer_active_seconds?: number;
  hours_spent?: number;
  success_message?: string | null;
  verification_error?: string;
};

function readReconciliationResult(
  value: unknown,
  rpcName: string
) {
  const record = asMetadataRecord(value);

  if (!record) {
    throw new Error(
      `${rpcName} returned an invalid response.`
    );
  }

  return record as CompletionReconciliationResult;
}

function completionReconciliationOperationKey(
  packetId: string
) {
  return `completion-reconciliation:${packetId}`;
}

function packetUrl(
  packetId: string,
  kind?: "error" | "success",
  message?: string
) {
  const params = new URLSearchParams({
    packet_id: packetId
  });

  if (kind && message) {
    params.set(kind, message);
  }

  return `/complete-feature?${params.toString()}`;
}

function buildCompleteFeatureUrl(
  formData: FormData,
  error?: string
) {
  const packetId = readText(formData, "packet_id");

  if (packetId) {
    return packetUrl(packetId, error ? "error" : undefined, error);
  }

  const params = new URLSearchParams();

  [
    "project_key",
    "module_key",
    "feature_type",
    "feature_name",
    "route_path",
    "build_session_title",
    "summary",
    "completed",
    "files_created",
    "files_modified",
    "decisions",
    "hours_spent",
    "files_changed",
    "database_changes",
    "security_notes",
    "missing",
    "next_steps"
  ].forEach((key) => {
    const value = readText(formData, key);
    if (value) params.set(key, value);
  });

  if (error) params.set("error", error);

  return `/complete-feature?${params.toString()}`;
}

async function readPacketById(
  supabase: ReturnType<typeof createAthenaCoreClient>,
  packetId: string
) {
  const { data, error } = await supabase
    .from("athena_feature_completion_packets")
    .select("*")
    .eq("id", packetId)
    .maybeSingle<CompletionPacket>();

  return {
    packet: data || null,
    error
  };
}

async function readCanonicalModule(
  supabase: ReturnType<typeof createAthenaCoreClient>,
  projectKey: string,
  moduleKey: string
) {
  return supabase
    .from("athena_project_modules")
    .select(
      "project_key, module_key, estimated_remaining_hours"
    )
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey)
    .maybeSingle<{
      project_key: string;
      module_key: string;
      estimated_remaining_hours: number | string | null;
    }>();
}

function asFiniteNonNegativeNumber(
  value: number | string | null | undefined
) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue >= 0
    ? numberValue
    : null;
}

function packetArrayEquals(
  actual: string[] | null | undefined,
  expected: string[]
) {
  if (!Array.isArray(actual)) return false;
  if (actual.length !== expected.length) return false;

  return actual.every(
    (value, index) => value === expected[index]
  );
}

export async function saveCompletionPacket(formData: FormData) {
  const supabase = createAthenaCoreClient();

  const packetId = readText(formData, "packet_id");
  const projectKey = readText(formData, "project_key");
  const moduleKey = readText(formData, "module_key");
  const featureType =
    readText(formData, "feature_type") ||
    "standard_app_feature";
  const featureName = readText(formData, "feature_name");
  const routePath = readText(formData, "route_path");
  const buildSessionTitle = readText(
    formData,
    "build_session_title"
  );
  const summary = readText(formData, "summary");
  const filesChanged = splitPacketLines(
    readText(formData, "files_changed")
  );
  const databaseChangesText = readText(
    formData,
    "database_changes"
  );
  const databaseChanges =
    databaseChangesText.toLowerCase() === "none"
      ? []
      : splitPacketLines(databaseChangesText);
  const securityNotes = splitPacketLines(
    readText(formData, "security_notes")
  );
  const missing = splitPacketLines(
    readText(formData, "missing")
  );
  const nextSteps = splitPacketLines(
    readText(formData, "next_steps")
  );

  if (
    !projectKey ||
    !moduleKey ||
    !featureName ||
    !buildSessionTitle
  ) {
    redirect(
      buildCompleteFeatureUrl(
        formData,
        "Canonical project, module key, feature name, and build session title are required."
      )
    );
  }

  const { data: moduleRow, error: moduleError } =
    await readCanonicalModule(
      supabase,
      projectKey,
      moduleKey
    );

  if (moduleError || !moduleRow) {
    redirect(
      buildCompleteFeatureUrl(
        formData,
        `Module ${moduleKey} is not registered under canonical project ${projectKey}.`
      )
    );
  }

  const remainingHours = asFiniteNonNegativeNumber(
    moduleRow.estimated_remaining_hours
  );

  if (remainingHours === null) {
    redirect(
      buildCompleteFeatureUrl(
        formData,
        `Canonical remaining hours for ${projectKey}/${moduleKey} is not a finite non-negative number.`
      )
    );
  }

  let existingPacket: CompletionPacket | null = null;

  if (packetId) {
    const { packet, error } = await readPacketById(
      supabase,
      packetId
    );

    if (error || !packet) {
      redirect(
        `/complete-feature?error=${encodeURIComponent(
          error?.message ||
            "The completion packet could not be loaded."
        )}`
      );
    }

    existingPacket = packet;

    if (
      packet.project_key !== projectKey ||
      packet.build_session_title !== buildSessionTitle
    ) {
      redirect(
        packetUrl(
          packet.id,
          "error",
          "Packet identity cannot be changed after the packet has been saved. Create a new packet for a different project or build session."
        )
      );
    }
  } else {
    const { data, error } = await supabase
      .from("athena_feature_completion_packets")
      .select("*")
      .eq("project_key", projectKey)
      .eq("build_session_title", buildSessionTitle)
      .maybeSingle<CompletionPacket>();

    if (error) {
      redirect(
        buildCompleteFeatureUrl(
          formData,
          `Could not check for an existing completion packet: ${error.message}`
        )
      );
    }

    existingPacket = data || null;
  }

  if (
    existingPacket?.status === "completed" ||
    existingPacket?.status === "cancelled"
  ) {
    redirect(
      packetUrl(
        existingPacket.id,
        "error",
        `A ${existingPacket.status} packet is read-only.`
      )
    );
  }

  if (
    existingPacket?.qa_run_id &&
    (
      existingPacket.module_key !== moduleKey ||
      existingPacket.feature_type !== featureType ||
      existingPacket.feature_name !== featureName ||
      existingPacket.route_path !== (routePath || null)
    )
  ) {
    redirect(
      packetUrl(
        existingPacket.id,
        "error",
        "Project, module, feature type, feature name, and route cannot change after a QA run has been linked."
      )
    );
  }

  const payload = {
    project_key: projectKey,
    module_key: moduleKey,
    feature_type: featureType,
    feature_name: featureName,
    build_session_title: buildSessionTitle,
    route_path: routePath || null,
    summary: summary || null,
    files_changed: filesChanged,
    database_changes: databaseChanges,
    security_notes: securityNotes,
    missing,
    next_steps: nextSteps,
    estimated_remaining_hours_snapshot: remainingHours,
    status: existingPacket?.status || "draft",
    metadata: {
      ...(existingPacket?.metadata || {}),
      packet_source: "feature_completion_command_center",
      canonical_registry_verified: true,
      canonical_registry_verified_at:
        new Date().toISOString()
    }
  };

  let savedPacket: CompletionPacket | null = null;
  let saveError: { message: string } | null = null;

  if (existingPacket) {
    const result = await supabase
      .from("athena_feature_completion_packets")
      .update(payload)
      .eq("id", existingPacket.id)
      .select("*")
      .maybeSingle<CompletionPacket>();

    savedPacket = result.data || null;
    saveError = result.error;
  } else {
    const result = await supabase
      .from("athena_feature_completion_packets")
      .insert(payload)
      .select("*")
      .maybeSingle<CompletionPacket>();

    savedPacket = result.data || null;
    saveError = result.error;
  }

  if (saveError || !savedPacket) {
    redirect(
      buildCompleteFeatureUrl(
        formData,
        `Completion packet could not be saved: ${
          saveError?.message || "No row was returned."
        }`
      )
    );
  }

  const { packet: verifiedPacket, error: verifyError } =
    await readPacketById(supabase, savedPacket.id);

  if (
    verifyError ||
    !verifiedPacket ||
    verifiedPacket.project_key !== projectKey ||
    verifiedPacket.module_key !== moduleKey ||
    verifiedPacket.feature_type !== featureType ||
    verifiedPacket.feature_name !== featureName ||
    verifiedPacket.build_session_title !==
      buildSessionTitle ||
    verifiedPacket.route_path !== (routePath || null) ||
    verifiedPacket.summary !== (summary || null) ||
    !packetArrayEquals(
      verifiedPacket.files_changed,
      filesChanged
    ) ||
    !packetArrayEquals(
      verifiedPacket.database_changes,
      databaseChanges
    ) ||
    !packetArrayEquals(
      verifiedPacket.security_notes,
      securityNotes
    ) ||
    !packetArrayEquals(verifiedPacket.missing, missing) ||
    !packetArrayEquals(
      verifiedPacket.next_steps,
      nextSteps
    ) ||
    Number(
      verifiedPacket.estimated_remaining_hours_snapshot
    ) !== remainingHours
  ) {
    redirect(
      packetUrl(
        savedPacket.id,
        "error",
        `Completion packet read-after-write verification failed${
          verifyError ? `: ${verifyError.message}` : "."
        }`
      )
    );
  }

  redirect(
    packetUrl(
      savedPacket.id,
      "success",
      existingPacket
        ? "Completion packet updated and verified."
        : "Completion packet saved and verified."
    )
  );
}

export async function prefillLatestQaChecks(
  formData: FormData
) {
  const supabase = createAthenaCoreClient();
  const packetId = readText(formData, "packet_id");

  if (!packetId) {
    redirect(
      buildCompleteFeatureUrl(
        formData,
        "A saved completion packet is required before automatic QA evidence can run."
      )
    );
  }

  const { packet, error: packetError } =
    await readPacketById(supabase, packetId);

  if (packetError || !packet) {
    redirect(
      `/complete-feature?error=${encodeURIComponent(
        packetError?.message ||
          "Completion packet was not found."
      )}`
    );
  }

  if (!packet.qa_run_id) {
    redirect(
      packetUrl(
        packet.id,
        "error",
        "No QA run is linked yet. Create the QA run first."
      )
    );
  }

  let result;

  try {
    result =
      await applyAutomaticQaEvidence({
        supabase,
        packet,
        qaRunId: packet.qa_run_id
      });
  } catch (error) {
    redirect(
      `/qa/${packet.qa_run_id}?error=${encodeURIComponent(
        error instanceof Error
          ? error.message
          : "Automatic QA evidence generation failed."
      )}`
    );
  }

  redirect(
    `/qa/${packet.qa_run_id}?success=${encodeURIComponent(
      `Automatic QA evidence generated and verified: ${result.updated_check_keys.length} checks updated; status ${result.overall_status}.`
    )}`
  );
}

export async function recordCtoUpdateFromCompletion(
  formData: FormData
) {
  const supabase = createAthenaCoreClient();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.ATHENA_CTO_ADMIN_KEY;
  const packetId = readText(formData, "packet_id");

  if (!packetId) {
    redirect(
      buildCompleteFeatureUrl(
        formData,
        "A saved completion packet id is required before recording."
      )
    );
  }

  const { packet: initialPacket, error: packetReadError } =
    await readPacketById(supabase, packetId);

  if (packetReadError || !initialPacket) {
    redirect(
      `/complete-feature?error=${encodeURIComponent(
        packetReadError?.message ||
          "Completion packet was not found."
      )}`
    );
  }

  if (initialPacket.status === "completed") {
    const {
      data: existingVerificationData,
      error: existingVerificationError
    } = await supabase.rpc(
      "athena_read_feature_completion_reconciliation",
      {
        p_packet_id: initialPacket.id
      }
    );

    if (!existingVerificationError) {
      const existingVerification =
        readReconciliationResult(
          existingVerificationData,
          "athena_read_feature_completion_reconciliation"
        );

      if (
        existingVerification.verified === true &&
        typeof existingVerification.success_message ===
          "string" &&
        existingVerification.success_message.trim()
      ) {
        redirect(
          packetUrl(
            initialPacket.id,
            "success",
            existingVerification.success_message
          )
        );
      }
    }
  }

  if (initialPacket.status === "cancelled") {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        "A cancelled completion packet cannot be recorded."
      )
    );
  }

  if (!supabaseUrl || !adminKey) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        "Missing NEXT_PUBLIC_SUPABASE_URL or ATHENA_CTO_ADMIN_KEY. CTO update cannot be recorded."
      )
    );
  }

  const completed = splitPacketLines(
    readText(formData, "completed")
  );
  const filesCreated = splitPacketLines(
    readText(formData, "files_created")
  );
  const filesModified = splitPacketLines(
    readText(formData, "files_modified")
  );
  const decisions = splitPacketLines(
    readText(formData, "decisions")
  );
  if (completed.length === 0) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        "Completed work is required before recording the CTO update."
      )
    );
  }

  const completionHours =
    await lookupCompletionHours({
      projectKey:
        initialPacket.project_key,
      moduleKey:
        initialPacket.module_key,
      buildSessionTitle:
        initialPacket.build_session_title
    });

  const zeroTimeReason =
    readText(
      formData,
      "zero_time_completion_reason"
    );

  const zeroTimeEvidenceText =
    readText(
      formData,
      "zero_time_completion_evidence"
    );

  if (
    completionHours.source !==
      "verified_timer"
  ) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        `${completionHours.warning} Build 0086 completion requires the exact stopped timer with verified activation and heartbeat evidence.`
      )
    );
  }

  if (
    completionHours.timer_session
      .active_seconds === 0 &&
    (
      zeroTimeReason.length < 20 ||
      !zeroTimeEvidenceText
    )
  ) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        "Zero-time completion requires a reason of at least 20 characters and non-empty supporting evidence."
      )
    );
  }

  const hoursSpent =
    completionHours.hours_spent;

  const completionHoursMetadata = {
    ...completionHours.metadata,
    manual_hours_fallback: null,
    zero_time_completion_reason:
      completionHours.timer_session
        .active_seconds === 0
        ? zeroTimeReason
        : null,
    zero_time_completion_evidence:
      completionHours.timer_session
        .active_seconds === 0
        ? {
            operator_evidence:
              zeroTimeEvidenceText
          }
        : null
  };

  const { data: moduleRow, error: moduleError } =
    await readCanonicalModule(
      supabase,
      initialPacket.project_key,
      initialPacket.module_key
    );

  if (moduleError || !moduleRow) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        `Module ${initialPacket.module_key} is not registered under project ${initialPacket.project_key}. CTO update was not recorded.`
      )
    );
  }

  const currentRemainingHours =
    asFiniteNonNegativeNumber(
      moduleRow.estimated_remaining_hours
    );

  if (currentRemainingHours === null) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        `Current remaining hours for ${initialPacket.project_key}/${initialPacket.module_key} is invalid.`
      )
    );
  }

  const { data: savedOperatorPacket, error: packetSaveError } =
    await supabase
      .from("athena_feature_completion_packets")
      .update({
        completed,
        files_created: filesCreated,
        files_modified: filesModified,
        decisions,
        hours_spent: hoursSpent,
        estimated_remaining_hours_snapshot:
          currentRemainingHours,
        metadata: {
          ...(initialPacket.metadata || {}),
          ...completionHoursMetadata,
          completion_hours_linked_at:
            new Date().toISOString()
        }
      })
      .eq("id", initialPacket.id)
      .select("*")
      .maybeSingle<CompletionPacket>();

  if (
    packetSaveError ||
    !savedOperatorPacket ||
    !packetArrayEquals(
      savedOperatorPacket.completed,
      completed
    ) ||
    !packetArrayEquals(
      savedOperatorPacket.files_created,
      filesCreated
    ) ||
    !packetArrayEquals(
      savedOperatorPacket.files_modified,
      filesModified
    ) ||
    !packetArrayEquals(
      savedOperatorPacket.decisions,
      decisions
    ) ||
    Number(savedOperatorPacket.hours_spent) !==
      hoursSpent ||
    Number(
      savedOperatorPacket.estimated_remaining_hours_snapshot
    ) !== currentRemainingHours ||
    !completionHoursMetadataMatches(
      savedOperatorPacket.metadata,
      completionHours,
      hoursSpent
    )
  ) {
    redirect(
      packetUrl(
        initialPacket.id,
        "error",
        `Operator completion details could not be persisted and verified: ${
          packetSaveError?.message ||
          "Saved values did not match."
        }`
      )
    );
  }

  const packet = savedOperatorPacket;

  if (!packet.qa_run_id) {
    redirect(
      packetUrl(
        packet.id,
        "error",
        "No QA run is linked. Create and complete QA before recording."
      )
    );
  }

  const manualWarningCheckKey =
    "manual_hours_fallback_review";

  const {
    data: existingManualWarning,
    error: manualWarningReadError
  } = await supabase
    .from("athena_qa_check_results")
    .select(
      "id, check_key, status, actual_result, notes, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
    )
    .eq(
      "qa_run_id",
      packet.qa_run_id
    )
    .eq(
      "check_key",
      manualWarningCheckKey
    )
    .maybeSingle<ManualFallbackQaRow>();

  if (manualWarningReadError) {
    redirect(
      packetUrl(
        packet.id,
        "error",
        `Manual-hours QA warning could not be read: ${manualWarningReadError.message}`
      )
    );
  }

  if (existingManualWarning) {
    const {
      data: disabledManualWarning,
      error: disableManualWarningError
    } = await supabase
      .from("athena_qa_check_results")
      .update({
        status:
          "not_applicable",
        actual_result:
          "Build 0086 requires a verified stopped timer. Manual completion-hours fallback was not used.",
        evidence: {
          hours_source:
            "verified_build_timer",
          timer_session_id:
            completionHours.timer_session.id,
          completion_packet_id:
            packet.id,
          timer_heartbeat_verified:
            true
        },
        notes:
          "Any prior manual-hours fallback warning was disabled because canonical timer activation, heartbeat, and stopped-state evidence are now required.",
        warning_acknowledged_at:
          null,
        warning_acknowledged_by:
          null,
        warning_acknowledgement_notes:
          null,
        updated_at:
          new Date().toISOString()
      })
      .eq(
        "id",
        existingManualWarning.id
      )
      .eq(
        "qa_run_id",
        packet.qa_run_id
      )
      .select(
        "id, check_key, status, actual_result, notes, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
      )
      .maybeSingle<ManualFallbackQaRow>();

    if (
      disableManualWarningError ||
      !disabledManualWarning ||
      disabledManualWarning.check_key !==
        manualWarningCheckKey ||
      disabledManualWarning.status !==
        "not_applicable" ||
      disabledManualWarning
        .warning_acknowledged_at !==
        null ||
      disabledManualWarning
        .warning_acknowledged_by !==
        null ||
      disabledManualWarning
        .warning_acknowledgement_notes !==
        null
    ) {
      redirect(
        packetUrl(
          packet.id,
          "error",
          `The obsolete manual-hours QA warning could not be disabled and verified: ${
            disableManualWarningError
              ?.message ||
            "Saved values did not match."
          }`
        )
      );
    }
  }

  const { data: qaChecks, error: qaChecksError } =
    await supabase
      .from("athena_qa_check_results")
      .select(
        "check_key, status, warning_acknowledged_at"
      )
      .eq("qa_run_id", packet.qa_run_id)
      .returns<QaCheckRow[]>();

  if (qaChecksError || !qaChecks) {
    redirect(
      packetUrl(
        packet.id,
        "error",
        `QA checks could not be verified: ${
          qaChecksError?.message ||
          "No QA check rows were returned."
        }`
      )
    );
  }

  const preRecordingChecks = qaChecks.filter(
    (check) =>
      check.check_key !==
      "athena_cto_memory_recorded"
  );

  const blockingChecks = preRecordingChecks.filter(
    (check) =>
      check.status === "fail" ||
      check.status === "pending" ||
      (
        check.status === "warning" &&
        !check.warning_acknowledged_at
      )
  );

  if (
    preRecordingChecks.length === 0 ||
    blockingChecks.length > 0
  ) {
    await supabase
      .from("athena_feature_completion_packets")
      .update({
        status: "qa_in_progress"
      })
      .eq("id", packet.id);

    redirect(
      packetUrl(
        packet.id,
        "error",
        preRecordingChecks.length === 0
          ? "No non-memory QA checks were found."
          : `QA still has blocking checks: ${blockingChecks
              .map((check) => check.check_key)
              .join(", ")}`
      )
    );
  }

  const markRetryReady = async (notes: string) => {
    const timestamp = new Date().toISOString();

    const { error: packetRetryError } = await supabase
      .from("athena_feature_completion_packets")
      .update({
        status: "retry_ready",
        metadata: {
          ...(packet.metadata || {}),
          last_recording_error: notes,
          last_recording_error_at: timestamp
        }
      })
      .eq("id", packet.id)
      .neq("status", "completed");

    if (packetRetryError) {
      console.error(
        "Could not mark completion packet retry_ready:",
        packetRetryError.message
      );
    }

    const { error: eventRetryError } = await supabase
      .from("athena_feature_completion_events")
      .update({
        status: "retry_ready",
        cto_recorded: false,
        memory_check_closed: false,
        notes,
        updated_at: timestamp
      })
      .eq("project_key", packet.project_key)
      .eq(
        "build_session_title",
        packet.build_session_title
      )
      .neq("status", "completed");

    if (eventRetryError) {
      console.error(
        "Could not mark completion event retry_ready:",
        eventRetryError.message
      );
    }
  };

  const {
    data: existingCompletionEvent,
    error: existingEventError
  } = await supabase
    .from("athena_feature_completion_events")
    .select(
      "id, status, cto_recorded, qa_run_id, module_key, feature_name, route_path"
    )
    .eq("project_key", packet.project_key)
    .eq(
      "build_session_title",
      packet.build_session_title
    )
    .maybeSingle<{
      id: string;
      status: string;
      cto_recorded: boolean;
      qa_run_id: string | null;
      module_key: string | null;
      feature_name: string;
      route_path: string | null;
    }>();

  if (existingEventError) {
    await markRetryReady(existingEventError.message);

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Completion event could not be read: ${existingEventError.message}`
      )
    );
  }

  let completionEventId =
    existingCompletionEvent?.id || null;

  if (
    existingCompletionEvent &&
    (
      existingCompletionEvent.qa_run_id !==
        packet.qa_run_id ||
      existingCompletionEvent.module_key !==
        packet.module_key ||
      existingCompletionEvent.feature_name !==
        packet.feature_name ||
      existingCompletionEvent.route_path !==
        packet.route_path
    )
  ) {
    await markRetryReady(
      "The existing completion event does not match the persistent packet identity."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        "The existing completion event does not match the persistent packet identity."
      )
    );
  }

  const eventPayload = {
    qa_run_id: packet.qa_run_id,
    module_key: packet.module_key,
    feature_name: packet.feature_name,
    route_path: packet.route_path,
    status: "recording",
    cto_recorded: false,
    memory_check_closed: false,
    notes:
      "Recording started from the persistent Feature Completion Command Center packet.",
    updated_at: new Date().toISOString()
  };

  if (
    existingCompletionEvent &&
    !existingCompletionEvent.cto_recorded
  ) {
    const { data, error } = await supabase
      .from("athena_feature_completion_events")
      .update(eventPayload)
      .eq("id", existingCompletionEvent.id)
      .select(
        "id, qa_run_id, module_key, feature_name, route_path, status"
      )
      .maybeSingle<{
        id: string;
        qa_run_id: string | null;
        module_key: string | null;
        feature_name: string;
        route_path: string | null;
        status: string;
      }>();

    if (
      error ||
      !data ||
      data.qa_run_id !== packet.qa_run_id ||
      data.module_key !== packet.module_key ||
      data.feature_name !== packet.feature_name ||
      data.route_path !== packet.route_path ||
      data.status !== "recording"
    ) {
      await markRetryReady(
        error?.message ||
          "Completion event update verification failed."
      );

      redirect(
        packetUrl(
          packet.id,
          "error",
          `Could not verify the completion event before CTO recording: ${
            error?.message ||
            "Saved values did not match."
          }`
        )
      );
    }

    completionEventId = data.id;
  } else if (!existingCompletionEvent) {
    const { data, error } = await supabase
      .from("athena_feature_completion_events")
      .insert({
        project_key: packet.project_key,
        build_session_title:
          packet.build_session_title,
        ...eventPayload
      })
      .select(
        "id, qa_run_id, module_key, feature_name, route_path, status"
      )
      .maybeSingle<{
        id: string;
        qa_run_id: string | null;
        module_key: string | null;
        feature_name: string;
        route_path: string | null;
        status: string;
      }>();

    if (
      error ||
      !data ||
      data.qa_run_id !== packet.qa_run_id ||
      data.module_key !== packet.module_key ||
      data.feature_name !== packet.feature_name ||
      data.route_path !== packet.route_path ||
      data.status !== "recording"
    ) {
      await markRetryReady(
        error?.message ||
          "Completion event insert verification failed."
      );

      redirect(
        packetUrl(
          packet.id,
          "error",
          `Completion event insert failed or returned unverified data: ${
            error?.message ||
            "Saved values did not match."
          }`
        )
      );
    }

    completionEventId = data.id;
  }

  if (!completionEventId) {
    await markRetryReady(
      "Completion event id was not available."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        "Completion event id was not available."
      )
    );
  }

  const expectedRecordingStatus =
    packet.status === "completed"
      ? "completed"
      : "recording";

  const { data: recordingPacket, error: recordingError } =
    await supabase
      .from("athena_feature_completion_packets")
      .update({
        status: expectedRecordingStatus,
        completion_event_id: completionEventId
      })
      .eq("id", packet.id)
      .select(
        "id, status, completion_event_id"
      )
      .maybeSingle<{
        id: string;
        status: string;
        completion_event_id: string | null;
      }>();

  if (
    recordingError ||
    !recordingPacket ||
    recordingPacket.status !==
      expectedRecordingStatus ||
    recordingPacket.completion_event_id !==
      completionEventId
  ) {
    await markRetryReady(
      recordingError?.message ||
        "Packet recording-state verification failed."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Completion packet could not enter verified recording state: ${
          recordingError?.message ||
          "Saved values did not match."
        }`
      )
    );
  }

  const {
    data: existingBuildLog,
    error: existingBuildLogError
  } = await supabase
    .from("athena_build_logs")
    .select(
      "id, product_key, session_title, metadata"
    )
    .eq("product_key", packet.project_key)
    .eq(
      "session_title",
      packet.build_session_title
    )
    .maybeSingle<{
      id: string;
      product_key: string;
      session_title: string;
      metadata: Record<string, unknown> | null;
    }>();

  if (existingBuildLogError) {
    await markRetryReady(
      existingBuildLogError.message
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Existing build-log lookup failed: ${existingBuildLogError.message}`
      )
    );
  }

  let buildLogId = existingBuildLog?.id || null;

  if (!buildLogId) {
    const body = {
      product_key: packet.project_key,
      module_key: packet.module_key,
      session_title: packet.build_session_title,
      feature_name: packet.feature_name,
      route_path: packet.route_path,
      summary: packet.summary,
      completed: packet.completed,
      files_created: packet.files_created,
      files_modified: packet.files_modified,
      database_changes:
        packet.database_changes,
      decisions: packet.decisions,
      security_notes: packet.security_notes,
      missing: packet.missing,
      next_steps: packet.next_steps,
      hours_spent: Number(packet.hours_spent),
      estimated_remaining_hours:
        currentRemainingHours
    };

    const response = await fetch(
      `${supabaseUrl}/functions/v1/athena-cto-update`,
      {
        method: "POST",
        headers: {
          "x-athena-admin-key": adminKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        cache: "no-store"
      }
    );

    const responseText = await response.text();
    let responseBody:
      | AthenaCtoUpdateResponse
      | null = null;

    try {
      responseBody = responseText
        ? (JSON.parse(
            responseText
          ) as AthenaCtoUpdateResponse)
        : null;
    } catch {
      responseBody = null;
    }

    if (
      !response.ok ||
      responseBody?.ok !== true ||
      responseBody?.verified !== true ||
      responseBody?.project_key !==
        packet.project_key ||
      responseBody?.module_key !==
        packet.module_key
    ) {
      const message =
        responseBody?.error ||
        responseText ||
        "Athena CTO update returned an unverified response.";

      await markRetryReady(
        `Athena CTO recording failed verification: ${message}`
      );

      redirect(
        packetUrl(
          packet.id,
          "error",
          `Athena CTO update failed verification: ${message}`
        )
      );
    }

    buildLogId =
      responseBody.build_log?.id || null;

    if (!buildLogId) {
      await markRetryReady(
        "Athena CTO returned success without a build-log id."
      );

      redirect(
        packetUrl(
          packet.id,
          "error",
          "Athena CTO returned success without a build-log id."
        )
      );
    }
  }

  const {
    data: verifiedBuildLog,
    error: verificationError
  } = await supabase
    .from("athena_build_logs")
    .select(
      "id, product_key, session_title, metadata"
    )
    .eq("id", buildLogId)
    .eq("product_key", packet.project_key)
    .eq(
      "session_title",
      packet.build_session_title
    )
    .maybeSingle<{
      id: string;
      product_key: string;
      session_title: string;
      metadata: Record<string, unknown> | null;
    }>();

  if (verificationError || !verifiedBuildLog) {
    await markRetryReady(
      `Build-log read-after-write verification failed: ${
        verificationError?.message ||
        "Saved row was not found."
      }`
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        "The saved build log could not be verified."
      )
    );
  }

  const verifiedMetadata =
    verifiedBuildLog.metadata &&
    typeof verifiedBuildLog.metadata === "object"
      ? verifiedBuildLog.metadata
      : {};

  if (
    verifiedMetadata.project_key !==
      packet.project_key ||
    verifiedMetadata.module_key !==
      packet.module_key ||
    verifiedMetadata.canonical_registry_verified !==
      true
  ) {
    await markRetryReady(
      "Saved build-log metadata did not verify the canonical project and module."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        "Saved build-log metadata did not verify the canonical project and module."
      )
    );
  }

  const reconciliationOperationKey =
    completionReconciliationOperationKey(
      packet.id
    );

  const reconciliationEvidence = {
    route_path:
      "/complete-feature",
    action_source:
      "athena_os_completion_workflow",
    reconciliation_version:
      "0086-v1",
    completion_packet_id:
      packet.id,
    timer_session_id:
      completionHours.timer_session.id,
    timer_active_seconds:
      completionHours.timer_session
        .active_seconds,
    timer_last_heartbeat_at:
      completionHours.timer_session
        .last_heartbeat_at,
    completion_hours:
      hoursSpent,
    ...(completionHours.timer_session
      .active_seconds === 0
      ? {
          zero_time_evidence: {
            operator_evidence:
              zeroTimeEvidenceText
          }
        }
      : {})
  };

  const {
    data: reconciliationWriteData,
    error: reconciliationWriteError
  } = await supabase.rpc(
    "athena_reconcile_feature_completion",
    {
      p_packet_id: packet.id,
      p_completion_event_id:
        completionEventId,
      p_build_log_id:
        verifiedBuildLog.id,
      p_operator_key:
        completionHours.operator_key,
      p_operation_key:
        reconciliationOperationKey,
      p_zero_time_reason:
        completionHours.timer_session
          .active_seconds === 0
          ? zeroTimeReason
          : null,
      p_evidence:
        reconciliationEvidence
    }
  );

  if (reconciliationWriteError) {
    await markRetryReady(
      reconciliationWriteError.message
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Build 0086 transactional reconciliation failed: ${reconciliationWriteError.message}`
      )
    );
  }

  const reconciliationWrite =
    readReconciliationResult(
      reconciliationWriteData,
      "athena_reconcile_feature_completion"
    );

  if (
    reconciliationWrite.packet_id !==
      packet.id ||
    reconciliationWrite.qa_run_id !==
      packet.qa_run_id ||
    reconciliationWrite.completion_event_id !==
      completionEventId ||
    reconciliationWrite.build_log_id !==
      verifiedBuildLog.id ||
    reconciliationWrite.timer_session_id !==
      completionHours.timer_session.id ||
    reconciliationWrite
      .external_read_after_write_required !==
      true
  ) {
    await markRetryReady(
      "The transactional reconciliation write returned mismatched identifiers."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        "The transactional reconciliation write returned mismatched identifiers."
      )
    );
  }

  const {
    data: reconciliationReadData,
    error: reconciliationReadError
  } = await supabase.rpc(
    "athena_read_feature_completion_reconciliation",
    {
      p_packet_id: packet.id
    }
  );

  if (reconciliationReadError) {
    await markRetryReady(
      reconciliationReadError.message
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Build 0086 read-after-write verification failed: ${reconciliationReadError.message}`
      )
    );
  }

  const reconciliationRead =
    readReconciliationResult(
      reconciliationReadData,
      "athena_read_feature_completion_reconciliation"
    );

  const reconciliationSuccessMessage =
    typeof reconciliationRead.success_message ===
      "string"
      ? reconciliationRead.success_message.trim()
      : "";

  if (
    reconciliationRead.verified !== true ||
    reconciliationRead.packet_id !==
      packet.id ||
    reconciliationRead.qa_run_id !==
      packet.qa_run_id ||
    reconciliationRead.completion_event_id !==
      completionEventId ||
    reconciliationRead.build_log_id !==
      verifiedBuildLog.id ||
    reconciliationRead.timer_session_id !==
      completionHours.timer_session.id ||
    !reconciliationSuccessMessage
  ) {
    await markRetryReady(
      reconciliationRead.verification_error ||
        "The committed completion reconciliation did not verify."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        reconciliationRead.verification_error ||
          "The committed completion reconciliation did not verify."
      )
    );
  }

  redirect(
    packetUrl(
      packet.id,
      "success",
      reconciliationSuccessMessage
    )
  );
}
