import {
  createHash,
  randomUUID
} from "node:crypto";
import {
  NextResponse,
  type NextRequest
} from "next/server";

import {
  createAthenaCoreClient
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord =
  Record<string, unknown>;

const TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{40,200}$/;

const OPERATION_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

function jsonResponse(
  body: JsonRecord,
  status: number
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store, max-age=0",

        "Pragma":
          "no-cache"
      }
    }
  );
}

function isJsonRecord(
  value: unknown
): value is JsonRecord {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function readBearerToken(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    throw new Error(
      "A helper bearer token is required."
    );
  }

  const token =
    authorization
      .slice(
        "Bearer ".length
      )
      .trim();

  if (!TOKEN_PATTERN.test(token)) {
    throw new Error(
      "The helper bearer token is invalid."
    );
  }

  return token;
}

function readOperationKey(
  value: unknown
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return (
      "powershell-heartbeat:" +
      randomUUID()
    );
  }

  const normalizedValue =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !OPERATION_KEY_PATTERN.test(
      normalizedValue
    )
  ) {
    throw new Error(
      "The heartbeat operation key is invalid."
    );
  }

  return normalizedValue;
}

function readRpcErrorMessage(
  error: unknown
) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

export async function POST(
  request: NextRequest
) {
  let rawToken = "";
  let tokenHash = "";

  try {
    rawToken =
      readBearerToken(
        request
      );

    const rawBody =
      await request.text();

    let submittedBody: unknown = {};

    if (rawBody.trim()) {
      try {
        submittedBody =
          JSON.parse(
            rawBody
          );
      } catch {
        return jsonResponse(
          {
            ok: false,
            error:
              "The heartbeat request body must contain valid JSON."
          },
          400
        );
      }
    }

    if (!isJsonRecord(submittedBody)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "The heartbeat request body must be a JSON object."
        },
        400
      );
    }

    const operationKey =
      readOperationKey(
        submittedBody.operation_key
      );

    const submittedEvidence =
      isJsonRecord(
        submittedBody.evidence
      )
        ? submittedBody.evidence
        : {};

    tokenHash =
      createHash("sha256")
        .update(
          rawToken,
          "utf8"
        )
        .digest("hex");

    const supabase =
      createAthenaCoreClient();

    const {
      data,
      error
    } = await supabase.rpc(
      "athena_build_timer_apply_helper_heartbeat",
      {
        p_token_hash:
          tokenHash,

        p_operation_key:
          operationKey,

        p_evidence: {
          ...submittedEvidence,

          endpoint:
            "/api/build-timer/helper-heartbeat",

          request_source:
            "powershell_helper",

          server_received_at:
            new Date().toISOString(),

          raw_token_stored:
            false,

          offline_replay:
            false
        }
      }
    );

    if (error) {
      const rpcMessage =
        readRpcErrorMessage(
          error
        );

      const authenticationFailure =
        rpcMessage
          .toLowerCase()
          .includes(
            "invalid or expired"
          );

      return jsonResponse(
        {
          ok: false,
          error:
            authenticationFailure
              ? "The helper token is invalid, revoked, or expired."
              : "The helper heartbeat could not be recorded."
        },
        authenticationFailure
          ? 401
          : 409
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            "The helper heartbeat returned an invalid timer response."
        },
        502
      );
    }

    return jsonResponse(
      {
        ok: true,
        data
      },
      200
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The helper heartbeat request failed.";

    const authenticationFailure =
      message
        .toLowerCase()
        .includes(
          "bearer token"
        );

    return jsonResponse(
      {
        ok: false,
        error:
          authenticationFailure
            ? "A valid helper bearer token is required."
            : message
      },
      authenticationFailure
        ? 401
        : 400
    );
  } finally {
    rawToken = "";
    tokenHash = "";
  }
}