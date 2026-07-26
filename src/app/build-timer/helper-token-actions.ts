"use server";

import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";

import {
  readTimerOperatorSession
} from "@/lib/auth/require-timer-operator-session";
import {
  createAthenaCoreClient
} from "@/lib/supabase/server";

type JsonRecord =
  Record<string, unknown>;

export type HelperTokenActionResponse =
  | {
      ok: true;
      data: JsonRecord;
    }
  | {
      ok: false;
      error: string;
    };

export type IssueBuildTimerHelperTokenInput = {
  sessionId: string;
  lifetimeMinutes?: number;
};

export type RevokeBuildTimerHelperTokenInput = {
  sessionId: string;
  tokenId: string;
  reason: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_TOKEN_LIFETIME_MINUTES = 15;
const MINIMUM_TOKEN_LIFETIME_MINUTES = 2;
const MAXIMUM_TOKEN_LIFETIME_MINUTES = 240;

function failure(
  error: string
): HelperTokenActionResponse {
  return {
    ok: false,
    error
  };
}

function success(
  data: JsonRecord
): HelperTokenActionResponse {
  return {
    ok: true,
    data
  };
}

async function requireHelperTokenOperatorSession() {
  const operatorSession =
    await readTimerOperatorSession();

  if (!operatorSession) {
    throw new Error(
      "Signed timer operator session is required. Sign in again."
    );
  }

  return operatorSession;
}

function readUuid(
  value: unknown,
  fieldName: string
) {
  const normalizedValue =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(
      `${fieldName} must be a valid UUID.`
    );
  }

  return normalizedValue;
}

function readRequiredText(
  value: unknown,
  fieldName: string,
  maximumLength: number
) {
  const normalizedValue =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!normalizedValue) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  if (normalizedValue.length > maximumLength) {
    throw new Error(
      `${fieldName} must not exceed ${maximumLength} characters.`
    );
  }

  return normalizedValue;
}

function readLifetimeMinutes(
  value: unknown
) {
  if (
    value === undefined ||
    value === null
  ) {
    return DEFAULT_TOKEN_LIFETIME_MINUTES;
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < MINIMUM_TOKEN_LIFETIME_MINUTES ||
    value > MAXIMUM_TOKEN_LIFETIME_MINUTES
  ) {
    throw new Error(
      "Helper-token lifetime must be an integer from 2 through 240 minutes."
    );
  }

  return value;
}

function readRpcRecord(
  value: unknown,
  rpcName: string
): JsonRecord {
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

function readRpcError(
  rpcName: string,
  error: unknown
) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return `${rpcName}: ${error.message}`;
  }

  return `${rpcName} failed.`;
}

export async function issueBuildTimerHelperToken(
  input: IssueBuildTimerHelperTokenInput
): Promise<HelperTokenActionResponse> {
  let rawToken = "";
  let tokenHash = "";

  try {
    const operatorSession =
      await requireHelperTokenOperatorSession();

    const sessionId = readUuid(
      input.sessionId,
      "Timer session ID"
    );

    const lifetimeMinutes =
      readLifetimeMinutes(
        input.lifetimeMinutes
      );

    rawToken =
      randomBytes(32).toString(
        "base64url"
      );

    tokenHash =
      createHash("sha256")
        .update(
          rawToken,
          "utf8"
        )
        .digest("hex");

    const expiresAt =
      new Date(
        Date.now() +
          lifetimeMinutes *
            60 *
            1000
      ).toISOString();

    const operationKey =
      `helper-token-issue:${randomUUID()}`;

    const supabase =
      createAthenaCoreClient();

    const {
      data,
      error
    } = await supabase.rpc(
      "athena_build_timer_issue_helper_token",
      {
        p_session_id:
          sessionId,

        p_operator_key:
          operatorSession.operator_key,

        p_token_hash:
          tokenHash,

        p_expires_at:
          expiresAt,

        p_operation_key:
          operationKey,

        p_metadata: {
          requested_lifetime_minutes:
            lifetimeMinutes,

          issuance_surface:
            "/build-timer",

          server_generated_token:
            true,

          raw_token_stored:
            false,

          issued_at:
            new Date().toISOString()
        }
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_issue_helper_token",
          error
        )
      );
    }

    const record = readRpcRecord(
      data,
      "athena_build_timer_issue_helper_token"
    );

    const tokenId = readUuid(
      record.token_id,
      "Helper token ID"
    );

    const returnedSessionId =
      readUuid(
        record.session_id,
        "Returned timer session ID"
      );

    if (
      returnedSessionId !== sessionId
    ) {
      throw new Error(
        "Helper-token issuance returned a mismatched timer session."
      );
    }

    const returnedExpiresAt =
      readRequiredText(
        record.expires_at,
        "Helper token expiry",
        100
      );

    return success({
      raw_token:
        rawToken,

      token_id:
        tokenId,

      session_id:
        returnedSessionId,

      expires_at:
        returnedExpiresAt,

      heartbeat_interval_seconds:
        record.heartbeat_interval_seconds,

      idempotent_replay:
        record.idempotent_replay === true,

      raw_token_stored:
        false,

      token_display_rule:
        "The raw helper token is returned once and must not be persisted by Athena OS."
    });
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Helper-token issuance failed."
    );
  } finally {
    rawToken = "";
    tokenHash = "";
  }
}

export async function revokeBuildTimerHelperToken(
  input: RevokeBuildTimerHelperTokenInput
): Promise<HelperTokenActionResponse> {
  try {
    const operatorSession =
      await requireHelperTokenOperatorSession();

    const sessionId = readUuid(
      input.sessionId,
      "Timer session ID"
    );

    const tokenId = readUuid(
      input.tokenId,
      "Helper token ID"
    );

    const reason = readRequiredText(
      input.reason,
      "Revocation reason",
      1000
    );

    const operationKey =
      `helper-token-revoke:${randomUUID()}`;

    const supabase =
      createAthenaCoreClient();

    const {
      data,
      error
    } = await supabase.rpc(
      "athena_build_timer_revoke_helper_token",
      {
        p_session_id:
          sessionId,

        p_operator_key:
          operatorSession.operator_key,

        p_token_id:
          tokenId,

        p_operation_key:
          operationKey,

        p_reason:
          reason,

        p_metadata: {
          revocation_surface:
            "/build-timer",

          revoked_at:
            new Date().toISOString()
        }
      }
    );

    if (error) {
      return failure(
        readRpcError(
          "athena_build_timer_revoke_helper_token",
          error
        )
      );
    }

    const record = readRpcRecord(
      data,
      "athena_build_timer_revoke_helper_token"
    );

    const returnedTokenId =
      readUuid(
        record.token_id,
        "Returned helper token ID"
      );

    if (
      returnedTokenId !== tokenId
    ) {
      throw new Error(
        "Helper-token revocation returned a mismatched token."
      );
    }

    return success({
      ...record,
      token_id:
        returnedTokenId,

      raw_token_returned:
        false
    });
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Helper-token revocation failed."
    );
  }
}