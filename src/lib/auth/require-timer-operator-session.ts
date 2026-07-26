import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  TIMER_OPERATOR_SESSION_COOKIE,
  type TimerOperatorSession,
  verifyTimerOperatorSessionToken
} from "@/lib/auth/timer-operator-session";

function normalizeReturnPath(value: string) {
  const normalizedValue = value.trim();

  if (
    normalizedValue.startsWith("/") &&
    !normalizedValue.startsWith("//")
  ) {
    return normalizedValue;
  }

  return "/build-timer";
}

export async function readTimerOperatorSession():
  Promise<TimerOperatorSession | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(
    TIMER_OPERATOR_SESSION_COOKIE
  )?.value;

  if (!token) {
    return null;
  }

  return verifyTimerOperatorSessionToken(token);
}

export async function requireTimerOperatorSession(
  returnPath = "/build-timer"
) {
  const session = await readTimerOperatorSession();

  if (!session) {
    const searchParameters = new URLSearchParams({
      next: normalizeReturnPath(returnPath),
      error:
        "Signed timer operator session is required. Sign in again."
    });

    redirect(
      `/operator-login?${searchParameters.toString()}`
    );
  }

  return session;
}