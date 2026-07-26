"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  splitPacketLines,
  type CompletionPacket
} from "@/lib/completion-packets";
import { computeQaStatus } from "@/lib/qa-status";
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

type ManualHoursDetails = {
  manual_hours_spent: number;
  manual_hours_reason: string;
  manual_hours_evidence: string;
  manual_hours_acknowledged: true;
  manual_hours_operator: string;
  manual_hours_submitted_at: string;
  timer_lookup_warning: string;
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

function readCheckbox(formData: FormData, key: string) {
  const value = formData.get(key);

  return (
    value === "on" ||
    value === "true" ||
    value === "1"
  );
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
  hoursSpent: number,
  manualHoursDetails: ManualHoursDetails | null
) {
  const savedMetadata =
    asMetadataRecord(metadata);

  if (
    !savedMetadata ||
    Number(
      savedMetadata.completion_hours
    ) !== hoursSpent
  ) {
    return false;
  }

  if (
    completionHours.source ===
      "verified_timer"
  ) {
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
      savedMetadata.manual_hours_fallback ===
        null
    );
  }

  const savedManualHours =
    asMetadataRecord(
      savedMetadata.manual_hours_fallback
    );

  if (
    !manualHoursDetails ||
    !savedManualHours
  ) {
    return false;
  }

  return (
    savedMetadata.hours_source ===
      "manual_fallback" &&
    Number(
      savedManualHours.manual_hours_spent
    ) ===
      manualHoursDetails.manual_hours_spent &&
    savedManualHours.manual_hours_reason ===
      manualHoursDetails.manual_hours_reason &&
    savedManualHours.manual_hours_evidence ===
      manualHoursDetails.manual_hours_evidence &&
    savedManualHours.manual_hours_acknowledged ===
      true &&
    savedManualHours.manual_hours_operator ===
      manualHoursDetails.manual_hours_operator &&
    savedManualHours.manual_hours_submitted_at ===
      manualHoursDetails.manual_hours_submitted_at &&
    savedManualHours.timer_lookup_warning ===
      manualHoursDetails.timer_lookup_warning
  );
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
    redirect(
      packetUrl(
        initialPacket.id,
        "success",
        "This completion packet was already recorded."
      )
    );
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

  const manualHoursRaw =
    readText(
      formData,
      "manual_hours_spent"
    );

  const manualHoursReason =
    readText(
      formData,
      "manual_hours_reason"
    );

  const manualHoursEvidence =
    readText(
      formData,
      "manual_hours_evidence"
    );

  const manualHoursOperator =
    readText(
      formData,
      "manual_hours_operator"
    );

  const manualHoursAcknowledged =
    readCheckbox(
      formData,
      "manual_hours_acknowledged"
    );

  let hoursSpent: number;

  let completionHoursMetadata:
    Record<string, unknown>;

  let manualHoursDetails:
    ManualHoursDetails | null = null;

  if (
    completionHours.source ===
      "verified_timer"
  ) {
    hoursSpent =
      completionHours.hours_spent;

    completionHoursMetadata = {
      ...completionHours.metadata,
      manual_hours_fallback: null
    };
  } else {
    if (!manualHoursRaw) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          `${completionHours.warning} Enter audited manual hours before recording.`
        )
      );
    }

    const parsedManualHours =
      Number(manualHoursRaw);

    if (
      !Number.isFinite(
        parsedManualHours
      ) ||
      parsedManualHours < 0
    ) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          "Manual hours must be a finite non-negative number."
        )
      );
    }

    const roundedManualHours =
      Math.round(
        parsedManualHours * 100
      ) / 100;

    if (
      Math.abs(
        parsedManualHours -
          roundedManualHours
      ) >
      0.000001
    ) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          "Manual hours may contain at most two decimal places."
        )
      );
    }

    if (!manualHoursReason) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          "A manual-hours reason is required."
        )
      );
    }

    if (!manualHoursEvidence) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          "Manual-hours evidence is required."
        )
      );
    }

    if (!manualHoursOperator) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          "The manual-hours operator acknowledgement name is required."
        )
      );
    }

    if (!manualHoursAcknowledged) {
      redirect(
        packetUrl(
          initialPacket.id,
          "error",
          "The operator must acknowledge that manual hours require a visible QA warning."
        )
      );
    }

    const manualHoursSubmittedAt =
      new Date().toISOString();

    hoursSpent =
      roundedManualHours;

    manualHoursDetails = {
      manual_hours_spent:
        roundedManualHours,
      manual_hours_reason:
        manualHoursReason,
      manual_hours_evidence:
        manualHoursEvidence,
      manual_hours_acknowledged:
        true,
      manual_hours_operator:
        manualHoursOperator,
      manual_hours_submitted_at:
        manualHoursSubmittedAt,
      timer_lookup_warning:
        completionHours.warning
    };

    completionHoursMetadata = {
      ...completionHours.metadata,
      hours_source:
        "manual_fallback",
      completion_hours:
        roundedManualHours,
      manual_hours_fallback:
        manualHoursDetails
    };
  }

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
      hoursSpent,
      manualHoursDetails
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

  if (manualHoursDetails) {
    const manualWarningActualResult =
      `Manual completion hours ${hoursSpent.toFixed(
        2
      )} were submitted because no valid stopped timer was available.`;

    const manualWarningNotes = [
      `Reason: ${manualHoursDetails.manual_hours_reason}`,
      `Evidence: ${manualHoursDetails.manual_hours_evidence}`,
      `Timer lookup: ${manualHoursDetails.timer_lookup_warning}`,
      `Operator acknowledgement: ${manualHoursDetails.manual_hours_operator}`
    ].join("\n");

    const preserveAcknowledgement =
      existingManualWarning?.status ===
        "warning" &&
      existingManualWarning.actual_result ===
        manualWarningActualResult &&
      existingManualWarning.notes ===
        manualWarningNotes &&
      Boolean(
        existingManualWarning
          .warning_acknowledged_at &&
        existingManualWarning
          .warning_acknowledged_by &&
        existingManualWarning
          .warning_acknowledgement_notes
      );

    const expectedAcknowledgedAt =
      preserveAcknowledgement
        ? existingManualWarning
            ?.warning_acknowledged_at ||
          null
        : null;

    const expectedAcknowledgedBy =
      preserveAcknowledgement
        ? existingManualWarning
            ?.warning_acknowledged_by ||
          null
        : null;

    const expectedAcknowledgementNotes =
      preserveAcknowledgement
        ? existingManualWarning
            ?.warning_acknowledgement_notes ||
          null
        : null;

    const manualWarningPayload = {
      status: "warning",
      actual_result:
        manualWarningActualResult,
      evidence: {
        hours_source:
          "manual_fallback",
        manual_hours_spent:
          manualHoursDetails
            .manual_hours_spent,
        manual_hours_reason:
          manualHoursDetails
            .manual_hours_reason,
        manual_hours_evidence:
          manualHoursDetails
            .manual_hours_evidence,
        manual_hours_operator:
          manualHoursDetails
            .manual_hours_operator,
        manual_hours_submitted_at:
          manualHoursDetails
            .manual_hours_submitted_at,
        timer_lookup_warning:
          manualHoursDetails
            .timer_lookup_warning,
        completion_packet_id:
          packet.id
      },
      notes:
        manualWarningNotes,
      warning_acknowledged_at:
        expectedAcknowledgedAt,
      warning_acknowledged_by:
        expectedAcknowledgedBy,
      warning_acknowledgement_notes:
        expectedAcknowledgementNotes,
      updated_at:
        new Date().toISOString()
    };

    let savedManualWarning:
      ManualFallbackQaRow | null = null;

    let manualWarningWriteError:
      { message: string } | null = null;

    if (existingManualWarning) {
      const result = await supabase
        .from("athena_qa_check_results")
        .update(
          manualWarningPayload
        )
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

      savedManualWarning =
        result.data || null;

      manualWarningWriteError =
        result.error;
    } else {
      const result = await supabase
        .from("athena_qa_check_results")
        .insert({
          qa_run_id:
            packet.qa_run_id,
          check_key:
            manualWarningCheckKey,
          check_name:
            "Manual completion hours fallback reviewed",
          category:
            "calculation",
          severity:
            "high",
          expected_result:
            "Manual completion hours are permitted only when no valid stopped timer exists and the reason, evidence, operator acknowledgement, and QA warning remain visible.",
          ...manualWarningPayload
        })
        .select(
          "id, check_key, status, actual_result, notes, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
        )
        .maybeSingle<ManualFallbackQaRow>();

      savedManualWarning =
        result.data || null;

      manualWarningWriteError =
        result.error;
    }

    if (
      manualWarningWriteError ||
      !savedManualWarning ||
      savedManualWarning.check_key !==
        manualWarningCheckKey ||
      savedManualWarning.status !==
        "warning" ||
      savedManualWarning.actual_result !==
        manualWarningActualResult ||
      savedManualWarning.notes !==
        manualWarningNotes ||
      savedManualWarning
        .warning_acknowledged_at !==
        expectedAcknowledgedAt ||
      savedManualWarning
        .warning_acknowledged_by !==
        expectedAcknowledgedBy ||
      savedManualWarning
        .warning_acknowledgement_notes !==
        expectedAcknowledgementNotes
    ) {
      redirect(
        packetUrl(
          packet.id,
          "error",
          `Manual-hours QA warning could not be persisted and verified: ${
            manualWarningWriteError?.message ||
            "Saved values did not match."
          }`
        )
      );
    }
  } else if (existingManualWarning) {
    const {
      data: disabledManualWarning,
      error: disableManualWarningError
    } = await supabase
      .from("athena_qa_check_results")
      .update({
        status:
          "not_applicable",
        actual_result:
          "A verified stopped timer supplied the completion hours. Manual fallback was not used.",
        evidence: {
          hours_source:
            "verified_build_timer",
          timer_session_id:
            completionHours.source ===
              "verified_timer"
              ? completionHours
                  .timer_session.id
              : null,
          completion_packet_id:
            packet.id
        },
        notes:
          "Any prior manual-hours fallback warning was disabled because canonical timer evidence is now available.",
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

  if (existingCompletionEvent?.cto_recorded) {
    if (!packet.build_log_id) {
      const { data: linkedBuildLog } = await supabase
        .from("athena_build_logs")
        .select("id")
        .eq("product_key", packet.project_key)
        .eq(
          "session_title",
          packet.build_session_title
        )
        .maybeSingle<{ id: string }>();

      if (linkedBuildLog) {
        const { data: recoveredPacket } = await supabase
          .from("athena_feature_completion_packets")
          .update({
            qa_run_id: packet.qa_run_id,
            completion_event_id:
              existingCompletionEvent.id,
            build_log_id: linkedBuildLog.id,
            status: "completed"
          })
          .eq("id", packet.id)
          .select("id, status")
          .maybeSingle<{
            id: string;
            status: string;
          }>();

        if (recoveredPacket?.status === "completed") {
          redirect(
            packetUrl(
              packet.id,
              "success",
              "Previously recorded completion was recovered and linked to the persistent packet."
            )
          );
        }
      }
    }

    redirect(
      packetUrl(
        packet.id,
        "error",
        "The completion event is already recorded, but the packet could not be fully recovered. Review its linked build log."
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

  if (existingCompletionEvent) {
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
  } else {
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

  const { data: recordingPacket, error: recordingError } =
    await supabase
      .from("athena_feature_completion_packets")
      .update({
        status: "recording",
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
    recordingPacket.status !== "recording" ||
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

  const {
    data: memoryCheck,
    error: memoryCheckError
  } = await supabase
    .from("athena_qa_check_results")
    .update({
      status: "pass",
      actual_result: `${packet.build_session_title} was recorded in Athena CTO automatically from the persistent completion packet.`,
      notes:
        "Automatically marked pass after the verified Athena CTO build log was saved or recovered.",
      warning_acknowledged_at: null,
      warning_acknowledged_by: null,
      warning_acknowledgement_notes: null,
      updated_at: new Date().toISOString()
    })
    .eq("qa_run_id", packet.qa_run_id)
    .eq(
      "check_key",
      "athena_cto_memory_recorded"
    )
    .select("id, status, actual_result")
    .maybeSingle<{
      id: string;
      status: string;
      actual_result: string | null;
    }>();

  if (
    memoryCheckError ||
    !memoryCheck ||
    memoryCheck.status !== "pass"
  ) {
    await markRetryReady(
      memoryCheckError?.message ||
        "Memory check update verification failed."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `CTO update was recorded, but memory check verification failed: ${
          memoryCheckError?.message ||
          "No verified row was returned."
        }`
      )
    );
  }

  const {
    data: finalChecks,
    error: finalChecksError
  } = await supabase
    .from("athena_qa_check_results")
    .select(
      "status, warning_acknowledged_at"
    )
    .eq("qa_run_id", packet.qa_run_id)
    .returns<
      {
        status: string;
        warning_acknowledged_at: string | null;
      }[]
    >();

  if (finalChecksError || !finalChecks) {
    await markRetryReady(
      finalChecksError?.message ||
        "Final QA checks could not be read."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Final QA checks could not be verified: ${
          finalChecksError?.message ||
          "No rows were returned."
        }`
      )
    );
  }

  const computedStatus =
    computeQaStatus(finalChecks);

  if (computedStatus !== "pass") {
    await markRetryReady(
      `Final QA status was ${computedStatus}, not pass.`
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Final QA status is ${computedStatus}. The packet remains retry-ready.`
      )
    );
  }

  const qaCompletedAt = new Date().toISOString();

  const { data: savedQaRun, error: qaRunError } =
    await supabase
      .from("athena_qa_runs")
      .update({
        status: "pass",
        completed_at: qaCompletedAt,
        updated_at: qaCompletedAt
      })
      .eq("id", packet.qa_run_id)
      .select("id, status, completed_at")
      .maybeSingle<{
        id: string;
        status: string;
        completed_at: string | null;
      }>();

  const savedQaCompletedAt =
    savedQaRun?.completed_at
      ? Date.parse(savedQaRun.completed_at)
      : Number.NaN;

  const expectedQaCompletedAt =
    Date.parse(qaCompletedAt);

  if (
    qaRunError ||
    !savedQaRun ||
    savedQaRun.status !== "pass" ||
    !Number.isFinite(savedQaCompletedAt) ||
    savedQaCompletedAt !== expectedQaCompletedAt
  ) {
    await markRetryReady(
      qaRunError?.message ||
        "Final QA run update verification failed."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Final QA run could not be verified: ${
          qaRunError?.message ||
          "Saved values did not match."
        }`
      )
    );
  }

  const {
    data: completedEvent,
    error: completionEventError
  } = await supabase
    .from("athena_feature_completion_events")
    .update({
      status: "completed",
      cto_recorded: true,
      memory_check_closed: true,
      notes:
        "Completed through the persistent Feature Completion Command Center packet. CTO update recorded, verified, and memory QA check closed.",
      updated_at: new Date().toISOString()
    })
    .eq("id", completionEventId)
    .select(
      "id, status, cto_recorded, memory_check_closed, qa_run_id"
    )
    .maybeSingle<{
      id: string;
      status: string;
      cto_recorded: boolean;
      memory_check_closed: boolean;
      qa_run_id: string | null;
    }>();

  if (
    completionEventError ||
    !completedEvent ||
    completedEvent.status !== "completed" ||
    completedEvent.cto_recorded !== true ||
    completedEvent.memory_check_closed !== true ||
    completedEvent.qa_run_id !== packet.qa_run_id
  ) {
    await markRetryReady(
      completionEventError?.message ||
        "Completion event final verification failed."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `Completion history could not be finalized and verified: ${
          completionEventError?.message ||
          "Saved values did not match."
        }`
      )
    );
  }

  const { data: completedPacket, error: finalPacketError } =
    await supabase
      .from("athena_feature_completion_packets")
      .update({
        qa_run_id: packet.qa_run_id,
        completion_event_id:
          completedEvent.id,
        build_log_id: verifiedBuildLog.id,
        status: "completed",
        estimated_remaining_hours_snapshot:
          currentRemainingHours,
        metadata: {
          ...(packet.metadata || {}),
          recording_verified: true,
          recording_verified_at:
            new Date().toISOString()
        }
      })
      .eq("id", packet.id)
      .select(
        "id, status, qa_run_id, completion_event_id, build_log_id, completed_at, hours_spent, estimated_remaining_hours_snapshot"
      )
      .maybeSingle<{
        id: string;
        status: string;
        qa_run_id: string | null;
        completion_event_id: string | null;
        build_log_id: string | null;
        completed_at: string | null;
        hours_spent: number | string | null;
        estimated_remaining_hours_snapshot:
          | number
          | string
          | null;
      }>();

  if (
    finalPacketError ||
    !completedPacket ||
    completedPacket.status !== "completed" ||
    completedPacket.qa_run_id !==
      packet.qa_run_id ||
    completedPacket.completion_event_id !==
      completedEvent.id ||
    completedPacket.build_log_id !==
      verifiedBuildLog.id ||
    !completedPacket.completed_at ||
    Number(completedPacket.hours_spent) !==
      hoursSpent ||
    Number(
      completedPacket.estimated_remaining_hours_snapshot
    ) !== currentRemainingHours
  ) {
    await markRetryReady(
      finalPacketError?.message ||
        "Final completion packet verification failed."
    );

    redirect(
      packetUrl(
        packet.id,
        "error",
        `The build was recorded, but final packet verification failed: ${
          finalPacketError?.message ||
          "Saved values did not match."
        }`
      )
    );
  }

  redirect(
    packetUrl(
      packet.id,
      "success",
      "CTO update, QA closure, completion event, and persistent packet were recorded and verified."
    )
  );
}
