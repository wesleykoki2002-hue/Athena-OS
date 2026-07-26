"use server";

import { randomUUID } from "node:crypto";

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

    const { data, error } = await supabase.rpc(
      "athena_build_timer_correct_active_seconds",
      {
        p_session_id: sessionId,
        p_operator_key: operatorSession.operator_key,
        p_new_active_seconds: input.activeSeconds,
        p_reason: reason,
        p_operation_key: operationKey,
        p_evidence: readEvidence(
          input.evidence,
          "manual_correction"
        )
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

    return success(
      readRpcRecord(
        data,
        "athena_build_timer_correct_active_seconds"
      )
    );
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Timer correction failed."
    );
  }
}