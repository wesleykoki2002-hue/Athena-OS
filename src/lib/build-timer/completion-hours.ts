import "server-only";

import {
  requireTimerOperatorSession
} from "@/lib/auth/require-timer-operator-session";
import {
  createAthenaCoreClient
} from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

type TimerStatus =
  | "active"
  | "idle"
  | "paused"
  | "stopped";

export type CompletionTimerSession = {
  id: string;
  project_key: string;
  module_key: string;
  build_session_title: string;
  status: TimerStatus;
  started_at: string;
  last_heartbeat_at: string | null;
  stopped_at: string | null;
  active_seconds: number;
  paused_seconds: number;
  idle_seconds: number;
  verified_active_hours: number;
  timer_version: number;
  calculation_version: string;
  updated_at: string;
};

export type CompletionHoursLookup =
  | {
      source: "verified_timer";
      hours_spent: number;
      operator_key: string;
      timer_session: CompletionTimerSession;
      warning: null;
      metadata: JsonRecord;
    }
  | {
      source: "manual_fallback";
      hours_spent: null;
      operator_key: string;
      timer_session: CompletionTimerSession | null;
      warning: string;
      metadata: JsonRecord;
    };

type CompletionHoursLookupInput = {
  projectKey: string;
  moduleKey: string;
  buildSessionTitle: string;
};

function readRequiredIdentity(
  value: string,
  label: string,
  maximumLength: number
) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  if (normalizedValue.length > maximumLength) {
    throw new Error(
      `${label} exceeds the allowed length of ${maximumLength}.`
    );
  }

  return normalizedValue;
}

function asRecord(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as JsonRecord;
}

function readRequiredString(
  record: JsonRecord,
  key: string
) {
  const value = record[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value;
}

function readNullableString(
  record: JsonRecord,
  key: string
) {
  const value = record[key];

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return typeof value === "string"
    ? value
    : null;
}

function readFiniteNumber(
  record: JsonRecord,
  key: string
) {
  const value = Number(record[key]);

  return Number.isFinite(value)
    ? value
    : null;
}

function readTimerStatus(
  value: unknown
): TimerStatus | null {
  if (
    value === "active" ||
    value === "idle" ||
    value === "paused" ||
    value === "stopped"
  ) {
    return value;
  }

  return null;
}

function parseTimerSession(
  value: unknown
): CompletionTimerSession | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const id =
    readRequiredString(record, "id");

  const projectKey =
    readRequiredString(
      record,
      "project_key"
    );

  const moduleKey =
    readRequiredString(
      record,
      "module_key"
    );

  const buildSessionTitle =
    readRequiredString(
      record,
      "build_session_title"
    );

  const status =
    readTimerStatus(record.status);

  const startedAt =
    readRequiredString(
      record,
      "started_at"
    );

  const lastHeartbeatAt =
    readNullableString(
      record,
      "last_heartbeat_at"
    );

  const stoppedAt =
    readNullableString(
      record,
      "stopped_at"
    );

  const updatedAt =
    readRequiredString(
      record,
      "updated_at"
    );

  const activeSeconds =
    readFiniteNumber(
      record,
      "active_seconds"
    );

  const pausedSeconds =
    readFiniteNumber(
      record,
      "paused_seconds"
    );

  const idleSeconds =
    readFiniteNumber(
      record,
      "idle_seconds"
    );

  const verifiedActiveHours =
    readFiniteNumber(
      record,
      "verified_active_hours"
    );

  const timerVersion =
    readFiniteNumber(
      record,
      "timer_version"
    );

  const calculationVersion =
    readRequiredString(
      record,
      "calculation_version"
    );

  if (
    !id ||
    !projectKey ||
    !moduleKey ||
    !buildSessionTitle ||
    !status ||
    !startedAt ||
    !updatedAt ||
    activeSeconds === null ||
    pausedSeconds === null ||
    idleSeconds === null ||
    verifiedActiveHours === null ||
    timerVersion === null ||
    !calculationVersion
  ) {
    return null;
  }

  if (
    !Number.isInteger(activeSeconds) ||
    activeSeconds < 0 ||
    !Number.isInteger(pausedSeconds) ||
    pausedSeconds < 0 ||
    !Number.isInteger(idleSeconds) ||
    idleSeconds < 0 ||
    verifiedActiveHours < 0 ||
    !Number.isInteger(timerVersion) ||
    timerVersion < 1
  ) {
    return null;
  }

  return {
    id,
    project_key: projectKey,
    module_key: moduleKey,
    build_session_title:
      buildSessionTitle,
    status,
    started_at: startedAt,
    last_heartbeat_at:
      lastHeartbeatAt,
    stopped_at: stoppedAt,
    active_seconds: activeSeconds,
    paused_seconds: pausedSeconds,
    idle_seconds: idleSeconds,
    verified_active_hours:
      verifiedActiveHours,
    timer_version: timerVersion,
    calculation_version:
      calculationVersion,
    updated_at: updatedAt
  };
}

function roundCompletionHours(
  activeSeconds: number
) {
  return Math.round(
    (
      activeSeconds /
      3600
    ) *
      100
  ) / 100;
}

function manualFallback(
  warning: string,
  operatorKey: string,
  timerSession:
    CompletionTimerSession | null
): CompletionHoursLookup {
  return {
    source: "manual_fallback",
    hours_spent: null,
    operator_key: operatorKey,
    timer_session: timerSession,
    warning,
    metadata: {
      hours_source:
        "manual_fallback_required",
      timer_lookup_rpc:
        "athena_build_timer_find_session",
      timer_session_id:
        timerSession?.id || null,
      timer_status:
        timerSession?.status || null,
      timer_lookup_warning: warning,
      timer_identity_verified:
        Boolean(timerSession),
      timer_heartbeat_verified:
        Boolean(
          timerSession?.last_heartbeat_at
        )
    }
  };
}

export async function lookupCompletionHours(
  input: CompletionHoursLookupInput
): Promise<CompletionHoursLookup> {
  const projectKey =
    readRequiredIdentity(
      input.projectKey,
      "Project key",
      120
    );

  const moduleKey =
    readRequiredIdentity(
      input.moduleKey,
      "Module key",
      120
    );

  const buildSessionTitle =
    readRequiredIdentity(
      input.buildSessionTitle,
      "Build session title",
      500
    );

  const operatorSession =
    await requireTimerOperatorSession(
      "/complete-feature"
    );

  const supabase =
    createAthenaCoreClient();

  const { data, error } =
    await supabase.rpc(
      "athena_build_timer_find_session",
      {
        p_project_key: projectKey,
        p_module_key: moduleKey,
        p_build_session_title:
          buildSessionTitle,
        p_operator_key:
          operatorSession.operator_key
      }
    );

  if (error) {
    throw new Error(
      error.message ||
        "Build timer lookup failed."
    );
  }

  if (
    data === null ||
    data === undefined
  ) {
    return manualFallback(
      "No verified timer session exists for this exact project, module, build title, and signed operator.",
      operatorSession.operator_key,
      null
    );
  }

  const timerSession =
    parseTimerSession(data);

  if (!timerSession) {
    return manualFallback(
      "The timer lookup returned a session that could not be validated.",
      operatorSession.operator_key,
      null
    );
  }

  if (
    timerSession.project_key !==
      projectKey ||
    timerSession.module_key !==
      moduleKey ||
    timerSession.build_session_title !==
      buildSessionTitle
  ) {
    throw new Error(
      "The timer RPC returned a session with a mismatched canonical identity."
    );
  }

  if (
    timerSession.status !==
      "stopped" ||
    !timerSession.stopped_at
  ) {
    return manualFallback(
      `The exact timer session is ${timerSession.status}. Stop the timer before completion.`,
      operatorSession.operator_key,
      timerSession
    );
  }

  if (!timerSession.last_heartbeat_at) {
    return manualFallback(
      "The exact stopped timer has no verified heartbeat evidence.",
      operatorSession.operator_key,
      timerSession
    );
  }

  const roundedHours =
    roundCompletionHours(
      timerSession.active_seconds
    );

  if (
    Math.abs(
      timerSession.verified_active_hours -
        roundedHours
    ) >
    0.000001
  ) {
    return manualFallback(
      "The timer's verified hours do not match the canonical nearest-0.01-hour calculation from raw active seconds.",
      operatorSession.operator_key,
      timerSession
    );
  }

  return {
    source: "verified_timer",
    hours_spent: roundedHours,
    operator_key:
      operatorSession.operator_key,
    timer_session: timerSession,
    warning: null,
    metadata: {
      hours_source:
        "verified_build_timer",
      timer_session_id:
        timerSession.id,
      timer_status:
        timerSession.status,
      timer_active_seconds:
        timerSession.active_seconds,
      timer_paused_seconds:
        timerSession.paused_seconds,
      timer_idle_seconds:
        timerSession.idle_seconds,
      timer_verified_active_hours:
        timerSession.verified_active_hours,
      completion_hours:
        roundedHours,
      completion_rounding:
        "nearest_0.01_hour",
      timer_version:
        timerSession.timer_version,
      calculation_version:
        timerSession.calculation_version,
      timer_started_at:
        timerSession.started_at,
      timer_last_heartbeat_at:
        timerSession.last_heartbeat_at,
      timer_heartbeat_verified:
        true,
      timer_stopped_at:
        timerSession.stopped_at,
      timer_updated_at:
        timerSession.updated_at,
      timer_identity_verified: true,
      timer_lookup_rpc:
        "athena_build_timer_find_session"
    }
  };
}
