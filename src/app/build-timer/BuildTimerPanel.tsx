"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent
} from "react";
import {
  Activity,
  Clock3,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square
} from "lucide-react";

import {
  applyBuildTimerOperation,
  correctBuildTimerActiveSeconds,
  findBuildTimerSession,
  readBuildTimerSession,
  startBuildTimer,
  type TimerActionResponse
} from "./actions";
import {
  issueBuildTimerHelperToken,
  revokeBuildTimerHelperToken
} from "./helper-token-actions";

export type TimerProjectOption = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
};

export type TimerModuleOption = {
  project_key: string;
  module_key: string;
  name: string;
  priority: string;
  status: string;
};

type TimerStatus =
  | "active"
  | "idle"
  | "paused"
  | "stopped";

type TimerSession = {
  id: string;
  project_key: string;
  module_key: string;
  build_session_title: string;
  operator_display_name: string | null;
  status: TimerStatus;
  started_at: string;
  last_state_changed_at: string;
  last_activity_at: string | null;
  last_heartbeat_at: string | null;
  stopped_at: string | null;
  active_seconds: number;
  paused_seconds: number;
  idle_seconds: number;
  verified_active_hours: number;
  idle_threshold_seconds: number;
  heartbeat_interval_seconds: number;
  stale_timeout_seconds: number;
  heartbeat_is_stale: boolean;
  timer_version: number;
  calculation_version: string;
  updated_at: string;
};

type BuildTimerPanelProps = {
  projects: TimerProjectOption[];
  modules: TimerModuleOption[];
  registryError: string | null;
  initialProjectKey: string;
  initialModuleKey: string;
  initialBuildSessionTitle: string;
};

type HelperTokenState = {
  rawToken: string | null;
  tokenId: string;
  sessionId: string;
  expiresAt: string;
  heartbeatIntervalSeconds: number | null;
};

const runningStatuses = new Set<TimerStatus>([
  "active",
  "idle"
]);

const AUTOMATIC_TIMER_RESTORE_SOURCE =
  "automatic_timer_restore";

function subscribeOnlineStatus(
  callback: () => void
) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);

  return () => {
    window.removeEventListener(
      "online",
      callback
    );

    window.removeEventListener(
      "offline",
      callback
    );
  };
}

function readOnlineStatus() {
  return navigator.onLine;
}

function readServerOnlineStatus() {
  return true;
}

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

function readRequiredString(
  record: Record<string, unknown>,
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
  record: Record<string, unknown>,
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
  record: Record<string, unknown>,
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
): TimerSession | null {
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

  const lastStateChangedAt =
    readRequiredString(
      record,
      "last_state_changed_at"
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

  const idleThresholdSeconds =
    readFiniteNumber(
      record,
      "idle_threshold_seconds"
    );

  const heartbeatIntervalSeconds =
    readFiniteNumber(
      record,
      "heartbeat_interval_seconds"
    );

  const staleTimeoutSeconds =
    readFiniteNumber(
      record,
      "stale_timeout_seconds"
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
    !lastStateChangedAt ||
    !updatedAt ||
    activeSeconds === null ||
    pausedSeconds === null ||
    idleSeconds === null ||
    verifiedActiveHours === null ||
    idleThresholdSeconds === null ||
    heartbeatIntervalSeconds === null ||
    staleTimeoutSeconds === null ||
    timerVersion === null ||
    !calculationVersion
  ) {
    return null;
  }

  return {
    id,
    project_key: projectKey,
    module_key: moduleKey,
    build_session_title:
      buildSessionTitle,
    operator_display_name:
      readNullableString(
        record,
        "operator_display_name"
      ),
    status,
    started_at: startedAt,
    last_state_changed_at:
      lastStateChangedAt,
    last_activity_at:
      readNullableString(
        record,
        "last_activity_at"
      ),
    last_heartbeat_at:
      readNullableString(
        record,
        "last_heartbeat_at"
      ),
    stopped_at:
      readNullableString(
        record,
        "stopped_at"
      ),
    active_seconds:
      Math.max(
        0,
        Math.floor(activeSeconds)
      ),
    paused_seconds:
      Math.max(
        0,
        Math.floor(pausedSeconds)
      ),
    idle_seconds:
      Math.max(
        0,
        Math.floor(idleSeconds)
      ),
    verified_active_hours:
      Math.max(
        0,
        verifiedActiveHours
      ),
    idle_threshold_seconds:
      Math.max(
        1,
        Math.floor(
          idleThresholdSeconds
        )
      ),
    heartbeat_interval_seconds:
      Math.max(
        1,
        Math.floor(
          heartbeatIntervalSeconds
        )
      ),
    stale_timeout_seconds:
      Math.max(
        1,
        Math.floor(
          staleTimeoutSeconds
        )
      ),
    heartbeat_is_stale:
      record.heartbeat_is_stale === true,
    timer_version:
      Math.max(
        1,
        Math.floor(timerVersion)
      ),
    calculation_version:
      calculationVersion,
    updated_at: updatedAt
  };
}

function formatDuration(
  totalSeconds: number
) {
  const safeSeconds = Math.max(
    0,
    Math.floor(totalSeconds)
  );

  const hours =
    Math.floor(safeSeconds / 3600);

  const minutes = Math.floor(
    (safeSeconds % 3600) / 60
  );

  const seconds =
    safeSeconds % 60;

  return [
    hours,
    minutes,
    seconds
  ]
    .map((value) =>
      String(value).padStart(2, "0")
    )
    .join(":");
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Not recorded";
  }

  const timestamp =
    Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en",
    {
      dateStyle: "medium",
      timeStyle: "medium"
    }
  ).format(new Date(timestamp));
}

function calculateDisplayedSeconds(
  session: TimerSession,
  now: number
) {
  if (
    session.status !== "active" ||
    session.heartbeat_is_stale
  ) {
    return session.active_seconds;
  }

  const accountedAt =
    Date.parse(session.updated_at);

  if (!Number.isFinite(accountedAt)) {
    return session.active_seconds;
  }

  let verifiedEnd = now;

  if (session.last_activity_at) {
    const lastActivityAt =
      Date.parse(
        session.last_activity_at
      );

    if (
      Number.isFinite(lastActivityAt)
    ) {
      verifiedEnd = Math.min(
        verifiedEnd,
        lastActivityAt +
          session.idle_threshold_seconds *
            1000
      );
    }
  }

  if (session.last_heartbeat_at) {
    const lastHeartbeatAt =
      Date.parse(
        session.last_heartbeat_at
      );

    if (
      Number.isFinite(lastHeartbeatAt)
    ) {
      verifiedEnd = Math.min(
        verifiedEnd,
        lastHeartbeatAt +
          session.stale_timeout_seconds *
            1000
      );
    }
  }

  const additionalSeconds =
    Math.max(
      0,
      Math.floor(
        (
          verifiedEnd -
          accountedAt
        ) / 1000
      )
    );

  return (
    session.active_seconds +
    additionalSeconds
  );
}

function statusClassName(
  status: TimerStatus
) {
  if (status === "active") {
    return (
      "bg-green-50 text-green-700"
    );
  }

  if (status === "idle") {
    return (
      "bg-amber-50 text-amber-800"
    );
  }

  if (status === "paused") {
    return (
      "bg-blue-50 text-blue-700"
    );
  }

  return "bg-black/5 text-black/60";
}

function createOperationKey() {
  return crypto.randomUUID();
}

export default function BuildTimerPanel({
  projects,
  modules,
  registryError,
  initialProjectKey,
  initialModuleKey,
  initialBuildSessionTitle
}: BuildTimerPanelProps) {
  const validInitialProjectKey =
    projects.some(
      (project) =>
        project.project_key ===
        initialProjectKey
    )
      ? initialProjectKey
      : "";

  const validInitialModuleKey =
    modules.some(
      (moduleItem) =>
        moduleItem.project_key ===
          validInitialProjectKey &&
        moduleItem.module_key ===
          initialModuleKey
    )
      ? initialModuleKey
      : "";

  const [projectKey, setProjectKey] =
    useState(
      validInitialProjectKey
    );

  const [moduleKey, setModuleKey] =
    useState(
      validInitialModuleKey
    );

  const [
    buildSessionTitle,
    setBuildSessionTitle
  ] = useState(
    initialBuildSessionTitle
  );

  const [session, setSession] =
    useState<TimerSession | null>(
      null
    );

  const [message, setMessage] =
    useState<string | null>(
      null
    );

  const [
    errorMessage,
    setErrorMessage
  ] = useState<string | null>(
    null
  );

  const [
    correctionSeconds,
    setCorrectionSeconds
  ] = useState("");

  const [
    correctionReason,
    setCorrectionReason
  ] = useState("");

  const [
    helperTokenLifetimeMinutes,
    setHelperTokenLifetimeMinutes
  ] = useState("15");

  const [helperToken, setHelperToken] =
    useState<HelperTokenState | null>(
      null
    );

  const [clockNow, setClockNow] =
    useState(() => Date.now());

  const [isPending, startTransition] =
    useTransition();

  const automaticRequestInFlight =
    useRef(false);

  const automaticLookupKey =
    useRef<string | null>(
      null
    );

  const initialRestoreKey =
    useRef(
      validInitialProjectKey &&
        validInitialModuleKey &&
        initialBuildSessionTitle.trim()
        ? [
            validInitialProjectKey,
            validInitialModuleKey,
            initialBuildSessionTitle.trim()
          ].join("\u001f")
        : null
    );

  const lastActivitySentAt =
    useRef(0);

  const online =
    useSyncExternalStore(
      subscribeOnlineStatus,
      readOnlineStatus,
      readServerOnlineStatus
    );

  const selectedProject =
    projects.find(
      (project) =>
        project.project_key ===
        projectKey
    ) || null;

  const availableModules =
    useMemo(
      () =>
        modules.filter(
          (moduleItem) =>
            moduleItem.project_key ===
            projectKey
        ),
      [
        modules,
        projectKey
      ]
    );

  const selectedModule =
    availableModules.find(
      (moduleItem) =>
        moduleItem.module_key ===
        moduleKey
    ) || null;

  const sessionId =
    session?.id || null;

  const sessionStatus =
    session?.status || null;

  const heartbeatIntervalSeconds =
    session
      ?.heartbeat_interval_seconds ||
    null;

  const identityComplete =
    Boolean(
      selectedProject &&
      selectedModule &&
      buildSessionTitle.trim()
    );

  const identityLookupKey =
    identityComplete
      ? [
          projectKey,
          moduleKey,
          buildSessionTitle.trim()
        ].join("\u001f")
      : "";

  const syncIdentityToUrl =
    useCallback(
      (
        nextProjectKey: string,
        nextModuleKey: string,
        nextBuildSessionTitle: string
      ) => {
        const url =
          new URL(
            window.location.href
          );

        const identityValues = {
          project_key:
            nextProjectKey.trim(),
          module_key:
            nextModuleKey.trim(),
          build_session_title:
            nextBuildSessionTitle.trim()
        };

        for (const [
          key,
          value
        ] of Object.entries(
          identityValues
        )) {
          if (value) {
            url.searchParams.set(
              key,
              value
            );
          } else {
            url.searchParams.delete(
              key
            );
          }
        }

        const nextRelativeUrl =
          `${url.pathname}${url.search}${url.hash}`;

        const currentRelativeUrl =
          `${window.location.pathname}${window.location.search}${window.location.hash}`;

        if (
          nextRelativeUrl !==
          currentRelativeUrl
        ) {
          window.history.replaceState(
            {
              ...(window.history.state || {}),
              athena_build_timer_identity_source:
                AUTOMATIC_TIMER_RESTORE_SOURCE
            },
            "",
            nextRelativeUrl
          );
        }
      },
      []
    );

  const displayedActiveSeconds =
    session
      ? calculateDisplayedSeconds(
          session,
          clockNow
        )
      : 0;

  function clearMessages() {
    setMessage(null);
    setErrorMessage(null);
  }

  function acceptResponse(
    response: TimerActionResponse,
    successMessage: string
  ) {
    if (!response.ok) {
      setErrorMessage(
        response.error
      );

      return;
    }

    const parsedSession =
      parseTimerSession(
        response.data
      );

    if (!parsedSession) {
      setErrorMessage(
        "The timer operation returned an invalid canonical session record."
      );

      return;
    }

    setSession(parsedSession);
    setMessage(successMessage);
    setErrorMessage(null);
  }

  function executeAction(
    action:
      () => Promise<TimerActionResponse>,
    successMessage: string
  ) {
    startTransition(() => {
      void (async () => {
        setErrorMessage(null);

        try {
          const response =
            await action();

          acceptResponse(
            response,
            successMessage
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "The timer action could not be completed."
          );
        }
      })();
    });
  }

  const lookupExistingTimer =
    useCallback(
      async (
        automatic: boolean
      ) => {
        if (!identityComplete) {
          if (!automatic) {
            setErrorMessage(
              "Select a canonical project and module and enter the exact build session title."
            );
          }

          return;
        }

        setMessage(
          automatic
            ? "Restoring the exact existing timer session..."
            : null
        );
        setErrorMessage(null);

        try {
          const response =
            await findBuildTimerSession({
              projectKey,
              moduleKey,
              buildSessionTitle
            });

          if (!response.ok) {
            setErrorMessage(
              response.error
            );

            return;
          }

          if (response.data === null) {
            setSession(null);

            setMessage(
              automatic
                ? "No timer session exists for the restored build identity."
                : "No timer session exists for this exact build identity."
            );

            return;
          }

          const parsedSession =
            parseTimerSession(
              response.data
            );

          if (!parsedSession) {
            setErrorMessage(
              "Timer lookup returned an invalid canonical session record."
            );

            return;
          }

          setSession(parsedSession);

          setMessage(
            automatic
              ? "Existing timer session restored automatically."
              : "Existing timer session loaded."
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : automatic
                ? "Automatic timer restoration failed."
                : "Timer lookup failed."
          );
        }
      },
      [
        buildSessionTitle,
        identityComplete,
        moduleKey,
        projectKey
      ]
    );

  function findExistingTimer() {
    startTransition(() => {
      void lookupExistingTimer(
        false
      );
    });
  }

  function startTimer() {
    if (!identityComplete) {
      setErrorMessage(
        "Select a canonical project and module and enter the exact build session title."
      );

      return;
    }

    executeAction(
      () =>
        startBuildTimer({
          projectKey,
          moduleKey,
          buildSessionTitle,
          operationKey:
            createOperationKey(),
          evidence: {
            ui_component:
              "BuildTimerPanel",
            trigger:
              "operator_start_button"
          }
        }),
      session?.status === "stopped"
        ? "Timer recovery was recorded and verified."
        : "Timer was started and verified."
    );
  }

  function refreshTimer() {
    if (!sessionId) {
      setErrorMessage(
        "No timer session is loaded."
      );

      return;
    }

    executeAction(
      () =>
        readBuildTimerSession({
          sessionId
        }),
      "Timer session refreshed."
    );
  }

  function applyOperation(
    operation:
      | "pause"
      | "resume"
      | "stop"
  ) {
    if (!sessionId) {
      setErrorMessage(
        "No timer session is loaded."
      );

      return;
    }

    executeAction(
      () =>
        applyBuildTimerOperation({
          sessionId,
          operation,
          operationKey:
            createOperationKey(),
          evidence: {
            ui_component:
              "BuildTimerPanel",
            trigger:
              `operator_${operation}_button`
          }
        }),
      `Timer ${operation} operation was recorded and verified.`
    );
  }

  function submitCorrection(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!sessionId) {
      setErrorMessage(
        "No timer session is loaded."
      );

      return;
    }

    const activeSeconds =
      Number(correctionSeconds);

    if (
      !Number.isSafeInteger(
        activeSeconds
      ) ||
      activeSeconds < 0
    ) {
      setErrorMessage(
        "Corrected active seconds must be a non-negative whole number."
      );

      return;
    }

    if (!correctionReason.trim()) {
      setErrorMessage(
        "A correction reason is required."
      );

      return;
    }

    executeAction(
      () =>
        correctBuildTimerActiveSeconds({
          sessionId,
          activeSeconds,
          reason:
            correctionReason.trim(),
          operationKey:
            createOperationKey(),
          evidence: {
            ui_component:
              "BuildTimerPanel",
            trigger:
              "operator_correction_form",
            submitted_display:
              formatDuration(
                activeSeconds
              )
          }
        }),
      "Timer correction was appended and verified."
    );
  }

  function issueHelperToken() {
    if (
      !sessionId ||
      !session ||
      !runningStatuses.has(
        session.status
      )
    ) {
      setErrorMessage(
        "Load an active or idle timer session before issuing a helper token."
      );

      return;
    }

    if (helperToken) {
      setErrorMessage(
        "Revoke the current helper token before issuing another one."
      );

      return;
    }

    const lifetimeMinutes =
      Number(
        helperTokenLifetimeMinutes
      );

    if (
      !Number.isSafeInteger(
        lifetimeMinutes
      ) ||
      lifetimeMinutes < 2 ||
      lifetimeMinutes > 240
    ) {
      setErrorMessage(
        "Helper-token lifetime must be a whole number from 2 through 240 minutes."
      );

      return;
    }

    const verifiedSessionId =
      sessionId;

    startTransition(() => {
      void (async () => {
        clearMessages();

        try {
          const response =
            await issueBuildTimerHelperToken({
              sessionId:
                verifiedSessionId,
              lifetimeMinutes
            });

          if (!response.ok) {
            setErrorMessage(
              response.error
            );

            return;
          }

          const record =
            asRecord(response.data);

          if (!record) {
            setErrorMessage(
              "Helper-token issuance returned an invalid response."
            );

            return;
          }

          const rawToken =
            readRequiredString(
              record,
              "raw_token"
            );

          const tokenId =
            readRequiredString(
              record,
              "token_id"
            );

          const returnedSessionId =
            readRequiredString(
              record,
              "session_id"
            );

          const expiresAt =
            readRequiredString(
              record,
              "expires_at"
            );

          const returnedHeartbeatInterval =
            readFiniteNumber(
              record,
              "heartbeat_interval_seconds"
            );

          if (
            !rawToken ||
            !tokenId ||
            !returnedSessionId ||
            !expiresAt ||
            returnedSessionId !==
              verifiedSessionId
          ) {
            setErrorMessage(
              "Helper-token issuance returned incomplete or mismatched evidence."
            );

            return;
          }

          setHelperToken({
            rawToken,
            tokenId,
            sessionId:
              returnedSessionId,
            expiresAt,
            heartbeatIntervalSeconds:
              returnedHeartbeatInterval ===
              null
                ? null
                : Math.max(
                    1,
                    Math.floor(
                      returnedHeartbeatInterval
                    )
                  )
          });

          setMessage(
            "A short-lived helper token was issued. The raw token is available only in this browser session."
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Helper-token issuance failed."
          );
        }
      })();
    });
  }

  function copyHelperToken() {
    const rawToken =
      helperToken?.rawToken;

    if (!rawToken) {
      setErrorMessage(
        "The raw helper token is no longer available on this screen."
      );

      return;
    }

    void (async () => {
      try {
        await navigator.clipboard.writeText(
          rawToken
        );

        setMessage(
          "The helper token was copied to the clipboard. It was not written to Athena OS storage."
        );
        setErrorMessage(null);
      } catch {
        setErrorMessage(
          "The browser could not copy the helper token. Copy it manually before clearing it."
        );
      }
    })();
  }

  function clearHelperTokenFromScreen() {
    if (!helperToken) {
      return;
    }

    setHelperToken({
      ...helperToken,
      rawToken: null
    });

    setMessage(
      "The raw helper token was cleared from the screen and cannot be recovered."
    );
    setErrorMessage(null);
  }

  function revokeHelperToken() {
    if (!helperToken) {
      setErrorMessage(
        "No helper token is loaded for revocation."
      );

      return;
    }

    const tokenToRevoke =
      helperToken;

    startTransition(() => {
      void (async () => {
        clearMessages();

        try {
          const response =
            await revokeBuildTimerHelperToken({
              sessionId:
                tokenToRevoke.sessionId,
              tokenId:
                tokenToRevoke.tokenId,
              reason:
                "Operator revoked the PowerShell helper token from /build-timer."
            });

          if (!response.ok) {
            setErrorMessage(
              response.error
            );

            return;
          }

          setHelperToken(null);
          setMessage(
            "The helper token was revoked and its append-only revocation evidence was recorded."
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Helper-token revocation failed."
          );
        }
      })();
    });
  }

  useEffect(() => {
    const intervalId =
      window.setInterval(
        () => {
          setClockNow(
            Date.now()
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, []);

  useEffect(() => {
    syncIdentityToUrl(
      projectKey,
      moduleKey,
      buildSessionTitle
    );
  }, [
    buildSessionTitle,
    moduleKey,
    projectKey,
    syncIdentityToUrl
  ]);

  useEffect(() => {
    const restoreKey =
      initialRestoreKey.current;

    if (
      !restoreKey ||
      restoreKey !==
        identityLookupKey ||
      automaticLookupKey.current ===
        restoreKey ||
      session ||
      !online
    ) {
      return;
    }

    automaticLookupKey.current =
      restoreKey;

    startTransition(() => {
      void lookupExistingTimer(
        true
      );
    });
  }, [
    identityLookupKey,
    lookupExistingTimer,
    online,
    session
  ]);

  useEffect(() => {
    if (
      !sessionId ||
      !sessionStatus ||
      !heartbeatIntervalSeconds ||
      !runningStatuses.has(
        sessionStatus
      )
    ) {
      return;
    }

    const verifiedSessionId =
      sessionId;

    const intervalMilliseconds =
      Math.max(
        15,
        heartbeatIntervalSeconds
      ) * 1000;

    let cancelled = false;

    async function sendHeartbeat() {
      if (
        cancelled ||
        automaticRequestInFlight.current ||
        !navigator.onLine
      ) {
        return;
      }

      automaticRequestInFlight.current =
        true;

      try {
        const response =
          await applyBuildTimerOperation({
            sessionId:
              verifiedSessionId,
            operation:
              "heartbeat",
            operationKey:
              createOperationKey(),
            evidence: {
              ui_component:
                "BuildTimerPanel",
              trigger:
                "automatic_heartbeat",
              page_visibility:
                document.visibilityState
            }
          });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setErrorMessage(
            response.error
          );

          return;
        }

        const parsedSession =
          parseTimerSession(
            response.data
          );

        if (!parsedSession) {
          setErrorMessage(
            "Automatic heartbeat returned an invalid session record."
          );

          return;
        }

        setSession(
          parsedSession
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Automatic heartbeat failed."
          );
        }
      } finally {
        automaticRequestInFlight.current =
          false;
      }
    }

    const intervalId =
      window.setInterval(
        () => {
          void sendHeartbeat();
        },
        intervalMilliseconds
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        intervalId
      );
    };
  }, [
    heartbeatIntervalSeconds,
    sessionId,
    sessionStatus
  ]);

  useEffect(() => {
    if (
      !sessionId ||
      !sessionStatus ||
      !runningStatuses.has(
        sessionStatus
      )
    ) {
      return;
    }

    const verifiedSessionId =
      sessionId;

    const verifiedSessionStatus =
      sessionStatus;

    const activityThrottleMilliseconds =
      60 * 1000;

    let cancelled = false;

    async function sendActivity() {
      if (
        cancelled ||
        automaticRequestInFlight.current ||
        !navigator.onLine
      ) {
        return;
      }

      const now =
        Date.now();

      const minimumDelay =
        verifiedSessionStatus === "idle"
          ? 0
          : activityThrottleMilliseconds;

      if (
        now -
          lastActivitySentAt.current <
        minimumDelay
      ) {
        return;
      }

      lastActivitySentAt.current =
        now;

      automaticRequestInFlight.current =
        true;

      try {
        const response =
          await applyBuildTimerOperation({
            sessionId:
              verifiedSessionId,
            operation:
              "activity",
            operationKey:
              createOperationKey(),
            evidence: {
              ui_component:
                "BuildTimerPanel",
              trigger:
                "verified_browser_activity",
              page_visibility:
                document.visibilityState
            }
          });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setErrorMessage(
            response.error
          );

          return;
        }

        const parsedSession =
          parseTimerSession(
            response.data
          );

        if (!parsedSession) {
          setErrorMessage(
            "Browser activity returned an invalid session record."
          );

          return;
        }

        setSession(
          parsedSession
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Browser activity could not be verified."
          );
        }
      } finally {
        automaticRequestInFlight.current =
          false;
      }
    }

    function activityHandler() {
      void sendActivity();
    }

    function visibilityHandler() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void sendActivity();
      }
    }

    window.addEventListener(
      "pointerdown",
      activityHandler
    );

    window.addEventListener(
      "keydown",
      activityHandler
    );

    window.addEventListener(
      "focus",
      activityHandler
    );

    window.addEventListener(
      "scroll",
      activityHandler,
      {
        passive: true
      }
    );

    document.addEventListener(
      "visibilitychange",
      visibilityHandler
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "pointerdown",
        activityHandler
      );

      window.removeEventListener(
        "keydown",
        activityHandler
      );

      window.removeEventListener(
        "focus",
        activityHandler
      );

      window.removeEventListener(
        "scroll",
        activityHandler
      );

      document.removeEventListener(
        "visibilitychange",
        visibilityHandler
      );
    };
  }, [
    sessionId,
    sessionStatus
  ]);

  return (
    <div className="grid gap-6">
      {registryError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {registryError}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-black/45">
              Canonical timer identity
            </p>

            <h2 className="text-3xl font-semibold">
              Select the exact build
            </h2>
          </div>

          <div
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              online
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {online
              ? "Online verification available"
              : "Offline - no time will be replayed"}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-black/70">
              Project
            </label>

            <select
              value={projectKey}
              onChange={(event) => {
                setProjectKey(
                  event.target.value
                );

                setModuleKey("");
                setSession(null);
                clearMessages();
              }}
              disabled={
                Boolean(registryError) ||
                projects.length === 0 ||
                Boolean(session)
              }
              className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                Select a registered project
              </option>

              {projects.map(
                (project) => (
                  <option
                    key={
                      project.project_key
                    }
                    value={
                      project.project_key
                    }
                  >
                    {project.name} |{" "}
                    {project.priority} |{" "}
                    {project.status}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-black/70">
              Module
            </label>

            <select
              value={moduleKey}
              onChange={(event) => {
                setModuleKey(
                  event.target.value
                );

                setSession(null);
                clearMessages();
              }}
              disabled={
                !selectedProject ||
                Boolean(session) ||
                availableModules.length ===
                  0
              }
              className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {!selectedProject
                  ? "Select a project first"
                  : availableModules.length ===
                      0
                    ? "No registered modules"
                    : "Select a registered module"}
              </option>

              {availableModules.map(
                (moduleItem) => (
                  <option
                    key={`${moduleItem.project_key}:${moduleItem.module_key}`}
                    value={
                      moduleItem.module_key
                    }
                  >
                    {moduleItem.name} |{" "}
                    {moduleItem.module_key} |{" "}
                    {moduleItem.priority} |{" "}
                    {moduleItem.status}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-black/70">
              Exact build session title
            </label>

            <input
              value={buildSessionTitle}
              onChange={(event) => {
                setBuildSessionTitle(
                  event.target.value
                );

                setSession(null);
                clearMessages();
              }}
              readOnly={
                Boolean(session)
              }
              placeholder="0083 Build title: Athena Build Timer and Automatic Hours Recording"
              className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black read-only:bg-black/[0.03] read-only:text-black/60"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={
              findExistingTimer
            }
            disabled={
              !identityComplete ||
              isPending ||
              !online
            }
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium transition hover:bg-[#f5f1ea] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Find Existing Timer
          </button>

          <button
            type="button"
            onClick={startTimer}
            disabled={
              !identityComplete ||
              isPending ||
              !online ||
              Boolean(
                session &&
                  session.status !==
                    "stopped"
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />

            {session?.status ===
            "stopped"
              ? "Recover Timer"
              : "Start Timer"}
          </button>

          {session ? (
            <button
              type="button"
              onClick={() => {
                setSession(null);
                clearMessages();
              }}
              disabled={
                runningStatuses.has(
                  session.status
                ) ||
                Boolean(helperToken)
              }
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium transition hover:bg-[#f5f1ea] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Change Build Identity
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-black/50">
          This page does not create projects,
          modules, or builds. The identity must
          already exist in the canonical Athena
          registries.
        </p>
      </section>

      {session ? (
        <>
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-black/45">
                  Verified build session
                </p>

                <h2 className="mt-1 max-w-4xl text-3xl font-semibold">
                  {
                    session.build_session_title
                  }
                </h2>

                <p className="mt-3 font-mono text-sm text-black/50">
                  {session.project_key} /{" "}
                  {session.module_key}
                </p>
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${statusClassName(
                  session.status
                )}`}
              >
                <Activity className="h-4 w-4" />

                {session.status.toUpperCase()}
              </div>
            </div>

            <div className="mb-8 rounded-[2rem] bg-black p-8 text-white">
              <div className="flex items-center gap-3 text-white/60">
                <Clock3 className="h-5 w-5" />
                Verified active time
              </div>

              <p className="mt-4 font-mono text-5xl font-semibold tracking-tight md:text-7xl">
                {formatDuration(
                  displayedActiveSeconds
                )}
              </p>

              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55">
                <span>
                  Stored raw seconds:{" "}
                  {session.active_seconds}
                </span>

                <span>
                  Completion hours:{" "}
                  {session.verified_active_hours.toFixed(
                    2
                  )}
                </span>

                <span>
                  Calculation:{" "}
                  {
                    session.calculation_version
                  }
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="text-sm text-black/45">
                  Active
                </p>

                <p className="mt-2 font-mono text-2xl font-semibold">
                  {formatDuration(
                    session.active_seconds
                  )}
                </p>
              </div>

              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="text-sm text-black/45">
                  Paused
                </p>

                <p className="mt-2 font-mono text-2xl font-semibold">
                  {formatDuration(
                    session.paused_seconds
                  )}
                </p>
              </div>

              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="text-sm text-black/45">
                  Idle
                </p>

                <p className="mt-2 font-mono text-2xl font-semibold">
                  {formatDuration(
                    session.idle_seconds
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {session.status ===
                "active" ||
              session.status ===
                "idle" ? (
                <button
                  type="button"
                  onClick={() =>
                    applyOperation(
                      "pause"
                    )
                  }
                  disabled={
                    isPending ||
                    !online
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium transition hover:bg-[#f5f1ea] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
              ) : null}

              {session.status ===
              "paused" ? (
                <button
                  type="button"
                  onClick={() =>
                    applyOperation(
                      "resume"
                    )
                  }
                  disabled={
                    isPending ||
                    !online
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </button>
              ) : null}

              {session.status !==
              "stopped" ? (
                <button
                  type="button"
                  onClick={() =>
                    applyOperation(
                      "stop"
                    )
                  }
                  disabled={
                    isPending ||
                    !online
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </button>
              ) : null}

              <button
                type="button"
                onClick={refreshTimer}
                disabled={
                  isPending ||
                  !online
                }
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium transition hover:bg-[#f5f1ea] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </section>

          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-black/45">
                  PowerShell heartbeat helper
                </p>

                <h2 className="text-2xl font-semibold">
                  Short-lived helper token
                </h2>
              </div>

              <div className="rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                Hash-only database storage
              </div>
            </div>

            <p className="max-w-4xl text-sm leading-6 text-black/55">
              Issue a temporary bearer token for the
              repository PowerShell helper. Athena OS
              returns the raw token once, stores only its
              SHA-256 hash, and never replays offline
              heartbeats.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-[220px_1fr]">
              <div>
                <label
                  htmlFor="helper-token-lifetime"
                  className="mb-2 block text-sm font-medium text-black/70"
                >
                  Token lifetime in minutes
                </label>

                <input
                  id="helper-token-lifetime"
                  type="number"
                  min={2}
                  max={240}
                  step={1}
                  value={
                    helperTokenLifetimeMinutes
                  }
                  onChange={(event) =>
                    setHelperTokenLifetimeMinutes(
                      event.target.value
                    )
                  }
                  disabled={
                    isPending ||
                    Boolean(helperToken)
                  }
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={issueHelperToken}
                  disabled={
                    isPending ||
                    !online ||
                    !runningStatuses.has(
                      session.status
                    ) ||
                    Boolean(helperToken)
                  }
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
                >
                  Issue Helper Token
                </button>
              </div>
            </div>

            {helperToken ? (
              <div className="mt-6 rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6">
                <dl className="grid gap-4 text-sm md:grid-cols-3">
                  <div>
                    <dt className="text-black/45">
                      Token ID
                    </dt>

                    <dd className="mt-1 break-all font-mono text-xs font-medium">
                      {helperToken.tokenId}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-black/45">
                      Expires
                    </dt>

                    <dd className="mt-1 font-medium">
                      {formatDateTime(
                        helperToken.expiresAt
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-black/45">
                      Heartbeat interval
                    </dt>

                    <dd className="mt-1 font-medium">
                      {helperToken.heartbeatIntervalSeconds ===
                      null
                        ? "Use canonical timer setting"
                        : `${helperToken.heartbeatIntervalSeconds} seconds`}
                    </dd>
                  </div>
                </dl>

                {helperToken.rawToken ? (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-red-700">
                      Copy this raw token now. It cannot be
                      recovered after this screen is cleared
                      or refreshed.
                    </p>

                    <div className="mt-3 rounded-2xl bg-black p-4 text-white">
                      <code className="block break-all font-mono text-sm">
                        {helperToken.rawToken}
                      </code>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={copyHelperToken}
                        className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium transition hover:bg-[#f5f1ea]"
                      >
                        Copy Raw Token
                      </button>

                      <button
                        type="button"
                        onClick={
                          clearHelperTokenFromScreen
                        }
                        className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium transition hover:bg-[#f5f1ea]"
                      >
                        Clear Raw Token
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                    The raw token has been cleared from this
                    browser session. It cannot be displayed
                    again. Revoke it below when it is no
                    longer required.
                  </p>
                )}

                <div className="mt-6 rounded-2xl border border-black/10 bg-white p-5">
                  <p className="text-sm font-semibold">
                    Run from C:\supabase\athena-os
                  </p>

                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-black p-4 font-mono text-xs leading-6 text-white">
                    {`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\Invoke-AthenaBuildTimerHeartbeat.ps1"`}
                  </pre>

                  <p className="mt-3 text-sm leading-6 text-black/50">
                    The helper prompts for the token as a
                    secure string. Do not add the raw token
                    to source files, command history, or
                    environment files.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={revokeHelperToken}
                    disabled={
                      isPending ||
                      !online
                    }
                    className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke Helper Token
                  </button>

                  <p className="text-sm text-black/50">
                    Revoke the token before changing build
                    identity. Revocation is append-only.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-6 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm leading-6 text-black/50">
                No PowerShell helper token is currently
                loaded in this browser session. Tokens can
                be issued only while the timer is active or
                idle.
              </p>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6" />

                <div>
                  <p className="text-sm font-medium text-black/45">
                    Verification state
                  </p>

                  <h2 className="text-2xl font-semibold">
                    Heartbeat and evidence
                  </h2>
                </div>
              </div>

              <dl className="grid gap-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Started
                  </dt>

                  <dd className="text-right font-medium">
                    {formatDateTime(
                      session.started_at
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Last activity
                  </dt>

                  <dd className="text-right font-medium">
                    {formatDateTime(
                      session.last_activity_at
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Last heartbeat
                  </dt>

                  <dd className="text-right font-medium">
                    {formatDateTime(
                      session.last_heartbeat_at
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Heartbeat interval
                  </dt>

                  <dd className="font-medium">
                    {
                      session.heartbeat_interval_seconds
                    }
                    s
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Idle threshold
                  </dt>

                  <dd className="font-medium">
                    {
                      session.idle_threshold_seconds
                    }
                    s
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Stale timeout
                  </dt>

                  <dd className="font-medium">
                    {
                      session.stale_timeout_seconds
                    }
                    s
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Heartbeat stale
                  </dt>

                  <dd
                    className={
                      session.heartbeat_is_stale
                        ? "font-medium text-red-700"
                        : "font-medium text-green-700"
                    }
                  >
                    {
                      session.heartbeat_is_stale
                        ? "YES"
                        : "NO"
                    }
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-black/45">
                    Timer version
                  </dt>

                  <dd className="font-medium">
                    {session.timer_version}
                  </dd>
                </div>
              </dl>

              <p className="mt-6 rounded-2xl bg-[#f5f1ea] p-4 text-sm leading-6 text-black/55">
                Unverified offline or stale time is
                never added later. Active-time
                accumulation stops at the last
                verified boundary.
              </p>
            </div>

            <div className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <RotateCcw className="h-6 w-6" />

                <div>
                  <p className="text-sm font-medium text-black/45">
                    Append-only correction
                  </p>

                  <h2 className="text-2xl font-semibold">
                    Correct verified seconds
                  </h2>
                </div>
              </div>

              <form
                onSubmit={
                  submitCorrection
                }
                className="grid gap-4"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    New active seconds
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      correctionSeconds
                    }
                    onChange={(event) =>
                      setCorrectionSeconds(
                        event.target.value
                      )
                    }
                    disabled={
                      session.status ===
                        "active" ||
                      session.status ===
                        "idle"
                    }
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Required reason and evidence
                  </label>

                  <textarea
                    rows={5}
                    value={
                      correctionReason
                    }
                    onChange={(event) =>
                      setCorrectionReason(
                        event.target.value
                      )
                    }
                    disabled={
                      session.status ===
                        "active" ||
                      session.status ===
                        "idle"
                    }
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    isPending ||
                    !online ||
                    session.status ===
                      "active" ||
                    session.status ===
                      "idle" ||
                    !correctionSeconds ||
                    !correctionReason.trim()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Record Audited Correction
                </button>
              </form>

              <p className="mt-4 text-sm leading-6 text-black/50">
                Corrections are allowed only while
                paused or stopped. The original
                value, replacement, difference,
                operator, reason, timestamp, and
                evidence remain in the append-only
                event log.
              </p>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}