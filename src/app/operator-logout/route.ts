import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  TIMER_OPERATOR_SESSION_COOKIE
} from "@/lib/auth/timer-operator-session";

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/operator-login", request.url);

  const response = NextResponse.redirect(loginUrl);

  response.cookies.set("athena_os_operator", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  response.cookies.set(
    TIMER_OPERATOR_SESSION_COOKIE,
    "",
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    }
  );

  return response;
}