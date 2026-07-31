"use server";

import { createHash, randomUUID } from "node:crypto";

import {
  readTimerOperatorSession
} from "@/lib/auth/require-timer-operator-session";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

export type TimerActionResponse =
  | {
      ok: true;
      data: JsonRecord | null;
    }
  | {
      ok: false;
      error: string;
    };

export type FindBuildTimerSessionInput = {
  projectKey: string;
  moduleKey: string;
  buildSessionTitle: string;
};

export type StartBuildTimerInput =
  FindBuildTimerSessionInput & {
    operationKey?: string;
    evidence?: JsonRecord;
  };

export type ReadBuildTimerSessionInput = {
  sessionId: string;
};

export type ApplyBuildTimerOperationInput = {
  sessionId: string;
  operation:
    | "pause"
    | "resume"
    | "stop"
    | "heartbeat"
    | "activity";
  operationKey?: string;
  evidence?: JsonRecord;
};

export type CorrectBuildTimerActiveSecondsInput = {
  sessionId: string;
  activeSeconds: number;
  reason: string;
  operationKey?: string;
  evidence?: JsonRecord;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPERATION_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

const allowedOperations = new Set([
  "pause",
  "resume",
  "stop",
  "heartbeat",
  "activity"
]);

async function requireActionTimerOperatorSession() {
  const operatorSession =
    await readTimerOperatorSession();

  if (!operatorSession) {
    throw new Error(
      "Signed timer operator session is required. Sign in again."
    );
  }

  return operatorSession;
}

function success(
  data: JsonRecord | null
): TimerActionResponse {
  return {
    ok: true,
    data
  };
}

function failure(message: string): TimerActionResponse {
  return {
    ok: false,
    error: message
  };
}

function readRequiredText(
  value: unknown,
  fieldName: string,
  maximumLength: number
) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required.`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  if (normalizedValue.length > maximumLength) {
    throw new Error(
      `${fieldName} cannot exceed ${maximumLength} characters.`
    );
  }

  return normalizedValue;
}

function readSessionId(value: unknown) {
  const sessionId = readRequiredText(
    value,
    "Timer session ID",
    36
  );

  if (!UUID_PATTERN.test(sessionId)) {
    throw new Error("Timer session ID is not a valid UUID.");
  }

  return sessionId;
}

function readOperationKey(value: unknown) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return randomUUID();
  }

  const operationKey = readRequiredText(
    value,
    "Operation key",
    200
  );

  if (!OPERATION_KEY_PATTERN.test(operationKey)) {
    throw new Error(
      "Operation key contains unsupported characters or is too short."
    );
  }

  return operationKey;
}

function readEvidence(
  value: unknown,
  operation: string
): JsonRecord {
  const submittedEvidence =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value as JsonRecord
      : {};

  return {
    ...submittedEvidence,
    route_path: "/build-timer",
    action_source: "athena_os_ui",
    operation,
    server_recorded_at: new Date().toISOString()
  };
}

function asJsonRecord(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as JsonRecord;
}

function readRpcString(
  record: JsonRecord,
  key: string,
  rpcName: string
) {
  const value = record[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${rpcName} returned an invalid ${key}.`
    );
  }

  return value;
}

function hasSubmittedEvidence(value: unknown) {
  const record = asJsonRecord(value);
  return Boolean(
    record &&
    Object.keys(record).length > 0
  );
}

function correctionReconciliationOperationKey(
  packetId: string,
  timerOperationKey: string
) {
  const digest = createHash("sha256")
    .update(
      `${packetId}:${timerOperationKey}`,
      "utf8"
    )
    .digest("hex");

  return `completion-correction:${digest}`;
}

function readRpcRecord(
  value: unknown,
  rpcName: string
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${rpcName} returned an invalid response.`
    );
  }

  return value as JsonRecord;
}

function readOptionalRpcRecord(
  value: unknown,
  rpcName: string
) {
  if (value === null || value === undefined) {
    return null;
  }

  return readRpcRecord(value, rpcName);
}

function readRpcError(
  rpcName: string,
  error: {
    message?: string;
  } | null
) {
  return (
    error?.message ||
    `${rpcName} failed without an error message.`
  );
}

export async function findBuildTimerSession(
  input: FindBuildTimerSessionInput
): Promise<TimerActionResponse> {
  try {
    const operatorSession =
      await requireActionTimerOperatorSession();

    const projectKey = readRequiredText(
      input.projectKey,
      "Project key",
      120
    );

    const moduleKey = readRequiredText(
      input.moduleKey,
      "Module key",
      120
    );

    const buildSessionTitle = readRequiredText(
      input.buildSessionTitle,
      "Build session title",
      500
    );

    const supabase = createAthenaCoreClient();

    const { data, error } = await supabase.rpc(
      "athena_build_timer_find_session",
      {
        p_project_key: projectKey,
        p_module_key: moduleKey,
        p_build_session_title: buildSessionTitle,
        p_operator_key: operatorSession.operator_key
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_find_session",
          error
        )
      );
    }

    return success(
      readOptionalRpcRecord(
        data,
        "athena_build_timer_find_session"
      )
    );
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Timer session lookup failed."
    );
  }
}

export async function readBuildTimerSession(
  input: ReadBuildTimerSessionInput
): Promise<TimerActionResponse> {
  try {
    const operatorSession =
      await requireActionTimerOperatorSession();

    const sessionId = readSessionId(
      input.sessionId
    );

    const supabase = createAthenaCoreClient();

    const { data, error } = await supabase.rpc(
      "athena_build_timer_read_session",
      {
        p_session_id: sessionId,
        p_operator_key: operatorSession.operator_key
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_read_session",
          error
        )
      );
    }

    return success(
      readOptionalRpcRecord(
        data,
        "athena_build_timer_read_session"
      )
    );
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Timer session read failed."
    );
  }
}

export async function startBuildTimer(
  input: StartBuildTimerInput
): Promise<TimerActionResponse> {
  try {
    const operatorSession =
      await requireActionTimerOperatorSession();

    const projectKey = readRequiredText(
      input.projectKey,
      "Project key",
      120
    );

    const moduleKey = readRequiredText(
      input.moduleKey,
      "Module key",
      120
    );

    const buildSessionTitle = readRequiredText(
      input.buildSessionTitle,
      "Build session title",
      500
    );

    const operationKey = readOperationKey(
      input.operationKey
    );

    const supabase = createAthenaCoreClient();

    const { data, error } = await supabase.rpc(
      "athena_build_timer_start_session",
      {
        p_project_key: projectKey,
        p_module_key: moduleKey,
        p_build_session_title: buildSessionTitle,
        p_operator_key: operatorSession.operator_key,
        p_operation_key: operationKey,
        p_operator_display_name:
          "Athena OS Operator",
        p_evidence: readEvidence(
          input.evidence,
          "start"
        )
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_start_session",
          error
        )
      );
    }

    return success(
      readRpcRecord(
        data,
        "athena_build_timer_start_session"
      )
    );
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Timer start failed."
    );
  }
}

export async function applyBuildTimerOperation(
  input: ApplyBuildTimerOperationInput
): Promise<TimerActionResponse> {
  try {
    const operatorSession =
      await requireActionTimerOperatorSession();

    const sessionId = readSessionId(
      input.sessionId
    );

    const operation = readRequiredText(
      input.operation,
      "Timer operation",
      20
    );

    if (!allowedOperations.has(operation)) {
      return failure(
        `Unsupported timer operation: ${operation}`
      );
    }

    const operationKey = readOperationKey(
      input.operationKey
    );

    const operationSource =
      operation === "activity"
        ? "browser_activity"
        : "athena_os_ui";

    const supabase = createAthenaCoreClient();

    const { data, error } = await supabase.rpc(
      "athena_build_timer_apply_operation",
      {
        p_session_id: sessionId,
        p_operator_key: operatorSession.operator_key,
        p_operation: operation,
        p_source: operationSource,
        p_operation_key: operationKey,
        p_evidence: readEvidence(
          input.evidence,
          operation
        )
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_apply_operation",
          error
        )
      );
    }

    return success(
      readRpcRecord(
        data,
        "athena_build_timer_apply_operation"
      )
    );
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Timer operation failed."
    );
  }
}

export async function correctBuildTimerActiveSeconds(
  input: CorrectBuildTimerActiveSecondsInput
): Promise<TimerActionResponse> {
  try {
    const operatorSession =
      await requireActionTimerOperatorSession();

    const sessionId = readSessionId(
      input.sessionId
    );

    if (
      !Number.isSafeInteger(input.activeSeconds) ||
      input.activeSeconds < 0
    ) {
      return failure(
        "Corrected active seconds must be a non-negative integer."
      );
    }

    const reason = readRequiredText(
      input.reason,
      "Correction reason",
      1000
    );

    const operationKey = readOperationKey(
      input.operationKey
    );

    const supabase = createAthenaCoreClient();

    const {
      data: currentSessionData,
      error: currentSessionError
    } = await supabase.rpc(
      "athena_build_timer_read_session",
      {
        p_session_id: sessionId,
        p_operator_key:
          operatorSession.operator_key
      }
    );

    if (currentSessionError) {
      return failure(
        readRpcError(
          "athena_build_timer_read_session",
          currentSessionError
        )
      );
    }

    const currentSession = readRpcRecord(
      currentSessionData,
      "athena_build_timer_read_session"
    );

    const projectKey = readRpcString(
      currentSession,
      "project_key",
      "athena_build_timer_read_session"
    );

    const moduleKey = readRpcString(
      currentSession,
      "module_key",
      "athena_build_timer_read_session"
    );

    const buildSessionTitle = readRpcString(
      currentSession,
      "build_session_title",
      "athena_build_timer_read_session"
    );

    const {
      data: completedPacket,
      error: packetLookupError
    } = await supabase
      .from("athena_feature_completion_packets")
      .select(
        "id, status, qa_run_id, completion_event_id, build_log_id"
      )
      .eq("project_key", projectKey)
      .eq("module_key", moduleKey)
      .eq(
        "build_session_title",
        buildSessionTitle
      )
      .eq("status", "completed")
      .maybeSingle<{
        id: string;
        status: string;
        qa_run_id: string | null;
        completion_event_id: string | null;
        build_log_id: string | null;
      }>();

    if (packetLookupError) {
      return failure(
        `Completed-packet lookup failed before timer correction: ${packetLookupError.message}`
      );
    }

    if (
      completedPacket &&
      (
        !completedPacket.qa_run_id ||
        !completedPacket.completion_event_id ||
        !completedPacket.build_log_id
      )
    ) {
      return failure(
        "The completed packet is missing canonical links. Reconcile completion before correcting its timer."
      );
    }

    if (
      completedPacket &&
      input.activeSeconds === 0 &&
      (
        reason.length < 20 ||
        !hasSubmittedEvidence(
          input.evidence
        )
      )
    ) {
      return failure(
        "Correcting a completed build to zero active seconds requires a reason of at least 20 characters and non-empty evidence."
      );
    }

    const correctionEvidence = readEvidence(
      input.evidence,
      "manual_correction"
    );

    const { data, error } = await supabase.rpc(
      "athena_build_timer_correct_active_seconds",
      {
        p_session_id: sessionId,
        p_operator_key: operatorSession.operator_key,
        p_new_active_seconds: input.activeSeconds,
        p_reason: reason,
        p_operation_key: operationKey,
        p_evidence: correctionEvidence
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_correct_active_seconds",
          error
        )
      );
    }

    const correctedSession = readRpcRecord(
      data,
      "athena_build_timer_correct_active_seconds"
    );

    if (!completedPacket) {
      return success(correctedSession);
    }

    const reconciliationOperationKey =
      correctionReconciliationOperationKey(
        completedPacket.id,
        operationKey
      );

    const reconciliationEvidence = {
      ...correctionEvidence,
      action_source:
        "athena_os_timer_correction_reconciliation",
      completion_packet_id:
        completedPacket.id,
      timer_correction_operation_key:
        operationKey,
      timer_correction_reason:
        reason,
      ...(input.activeSeconds === 0
        ? {
            zero_time_evidence:
              asJsonRecord(input.evidence)
          }
        : {})
    };

    const {
      data: reconciliationData,
      error: reconciliationError
    } = await supabase.rpc(
      "athena_reconcile_feature_completion",
      {
        p_packet_id:
          completedPacket.id,
        p_completion_event_id:
          completedPacket.completion_event_id,
        p_build_log_id:
          completedPacket.build_log_id,
        p_operator_key:
          operatorSession.operator_key,
        p_operation_key:
          reconciliationOperationKey,
        p_zero_time_reason:
          input.activeSeconds === 0
            ? reason
            : null,
        p_evidence:
          reconciliationEvidence
      }
    );

    if (reconciliationError) {
      return failure(
        `Timer correction was recorded, but completion synchronization failed: ${reconciliationError.message}. Rerun the same correction operation key to retry synchronization idempotently.`
      );
    }

    const reconciliationWrite =
      readRpcRecord(
        reconciliationData,
        "athena_reconcile_feature_completion"
      );

    if (
      reconciliationWrite.packet_id !==
        completedPacket.id ||
      reconciliationWrite.timer_session_id !==
        sessionId ||
      reconciliationWrite
        .external_read_after_write_required !==
        true
    ) {
      return failure(
        "Timer correction was recorded, but completion synchronization returned mismatched identifiers. Rerun the same correction operation key."
      );
    }

    const {
      data: verificationData,
      error: verificationError
    } = await supabase.rpc(
      "athena_read_feature_completion_reconciliation",
      {
        p_packet_id:
          completedPacket.id
      }
    );

    if (verificationError) {
      return failure(
        `Timer correction was recorded, but completion read-after-write verification failed: ${verificationError.message}. Rerun the same correction operation key.`
      );
    }

    const verification = readRpcRecord(
      verificationData,
      "athena_read_feature_completion_reconciliation"
    );

    if (
      verification.verified !== true ||
      verification.packet_id !==
        completedPacket.id ||
      verification.timer_session_id !==
        sessionId ||
      Number(
        verification.timer_active_seconds
      ) !== input.activeSeconds
    ) {
      return failure(
        "Timer correction was recorded, but the synchronized completion records did not verify. Rerun the same correction operation key."
      );
    }

    return success({
      ...correctedSession,
      completion_reconciliation:
        verification
    });
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Timer correction failed."
    );
  }
}
