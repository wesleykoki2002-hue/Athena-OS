const encoder = new TextEncoder();

export const TIMER_OPERATOR_SESSION_COOKIE =
  "athena_timer_operator_session";

export const TIMER_OPERATOR_SESSION_MAX_AGE_SECONDS =
  60 * 60 * 12;

const TIMER_OPERATOR_SESSION_VERSION = 1;
const TIMER_OPERATOR_CLOCK_SKEW_SECONDS = 60;

export type TimerOperatorSession = {
  version: 1;
  operator_key: string;
  issued_at: number;
  expires_at: number;
  nonce: string;
};

function readSessionSecret() {
  const secret =
    process.env.ATHENA_OS_TIMER_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "Missing ATHENA_OS_TIMER_SESSION_SECRET."
    );
  }

  if (secret.length < 32) {
    throw new Error(
      "ATHENA_OS_TIMER_SESSION_SECRET must contain at least 32 characters."
    );
  }

  return secret;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const paddingLength =
    (4 - (normalized.length % 4)) % 4;

  const padded =
    normalized + "=".repeat(paddingLength);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    [
      "sign",
      "verify"
    ]
  );
}

async function signValue(
  value: string,
  secret: string
) {
  const signingKey = await importSigningKey(secret);

  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    encoder.encode(value)
  );

  return encodeBase64Url(
    new Uint8Array(signature)
  );
}

async function verifySignature(
  value: string,
  signature: string,
  secret: string
) {
  const signingKey = await importSigningKey(secret);

  return crypto.subtle.verify(
    "HMAC",
    signingKey,
    decodeBase64Url(signature),
    encoder.encode(value)
  );
}

async function deriveOperatorKey(
  operatorCredential: string,
  secret: string
) {
  const normalizedCredential =
    operatorCredential.trim();

  if (!normalizedCredential) {
    throw new Error(
      "Operator credential is required."
    );
  }

  const identityValue =
    `athena-timer-operator-v1:${normalizedCredential}`;

  const identitySignature =
    await signValue(
      identityValue,
      secret
    );

  return `operator_${identitySignature.slice(0, 32)}`;
}

function isTimerOperatorSession(
  value: unknown
): value is TimerOperatorSession {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate =
    value as Partial<TimerOperatorSession>;

  return (
    candidate.version ===
      TIMER_OPERATOR_SESSION_VERSION &&
    typeof candidate.operator_key === "string" &&
    candidate.operator_key.length > 0 &&
    Number.isInteger(candidate.issued_at) &&
    Number.isInteger(candidate.expires_at) &&
    typeof candidate.nonce === "string" &&
    candidate.nonce.length > 0
  );
}

export async function createTimerOperatorSessionToken(
  operatorCredential: string,
  nowMilliseconds = Date.now()
) {
  const secret = readSessionSecret();

  const issuedAt = Math.floor(
    nowMilliseconds / 1000
  );

  const payload: TimerOperatorSession = {
    version: TIMER_OPERATOR_SESSION_VERSION,
    operator_key: await deriveOperatorKey(
      operatorCredential,
      secret
    ),
    issued_at: issuedAt,
    expires_at:
      issuedAt +
      TIMER_OPERATOR_SESSION_MAX_AGE_SECONDS,
    nonce: crypto.randomUUID()
  };

  const encodedPayload = encodeBase64Url(
    encoder.encode(
      JSON.stringify(payload)
    )
  );

  const signature = await signValue(
    encodedPayload,
    secret
  );

  return {
    token: `${encodedPayload}.${signature}`,
    session: payload
  };
}

export async function verifyTimerOperatorSessionToken(
  token: string,
  nowMilliseconds = Date.now()
): Promise<TimerOperatorSession | null> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  const tokenParts = normalizedToken.split(".");

  if (tokenParts.length !== 2) {
    return null;
  }

  const [
    encodedPayload,
    signature
  ] = tokenParts;

  if (!encodedPayload || !signature) {
    return null;
  }

  const secret = readSessionSecret();

  let signatureIsValid = false;

  try {
    signatureIsValid = await verifySignature(
      encodedPayload,
      signature,
      secret
    );
  } catch {
    return null;
  }

  if (!signatureIsValid) {
    return null;
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(
      new TextDecoder().decode(
        decodeBase64Url(encodedPayload)
      )
    );
  } catch {
    return null;
  }

  if (!isTimerOperatorSession(parsedPayload)) {
    return null;
  }

  const nowSeconds = Math.floor(
    nowMilliseconds / 1000
  );

  if (
    parsedPayload.issued_at >
    nowSeconds +
      TIMER_OPERATOR_CLOCK_SKEW_SECONDS
  ) {
    return null;
  }

  if (
    parsedPayload.expires_at <= nowSeconds
  ) {
    return null;
  }

  if (
    parsedPayload.expires_at -
      parsedPayload.issued_at !==
    TIMER_OPERATOR_SESSION_MAX_AGE_SECONDS
  ) {
    return null;
  }

  return parsedPayload;
}