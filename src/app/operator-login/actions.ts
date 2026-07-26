"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createTimerOperatorSessionToken,
  TIMER_OPERATOR_SESSION_COOKIE,
  TIMER_OPERATOR_SESSION_MAX_AGE_SECONDS
} from "@/lib/auth/timer-operator-session";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function operatorLogin(formData: FormData) {
  const submittedKey = readText(formData, "operator_key");
  const expectedKey = process.env.ATHENA_OS_OPERATOR_KEY;

  if (!expectedKey) {
    redirect("/operator-login?error=ATHENA_OS_OPERATOR_KEY is missing from .env.local");
  }

  if (!submittedKey || submittedKey !== expectedKey) {
    redirect("/operator-login?error=Invalid operator key");
  }

  const timerOperatorSession =
    await createTimerOperatorSessionToken(
      expectedKey
    );

  const cookieStore = await cookies();

  cookieStore.set("athena_os_operator", "authorized", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  cookieStore.set(
    TIMER_OPERATOR_SESSION_COOKIE,
    timerOperatorSession.token,
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge:
        TIMER_OPERATOR_SESSION_MAX_AGE_SECONDS
    }
  );

  redirect("/");
}