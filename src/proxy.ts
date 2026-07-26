import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = [
  "/",
  "/qa",
  "/complete-feature",
  "/build-timer",
  "/completion-history",
  "/database-changes",
  "/database-map",
  "/sql-queries",
  "/update",
  "/logs",
  "/projects",
  "/reusable",
  "/qa-prefill-templates",
  "/qa-prefill-preview",
  "/internal-mvp-audit",
  "/intake",
  "/operator-workflow",
  "/start-build",
  "/next"
];

const publicPrefixes = [
  "/operator-login",
  "/operator-logout",
  "/_next",
  "/favicon.ico"
];

function isPublicPath(pathname: string) {
  return publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedPath(pathname: string) {
  if (pathname === "/") return true;
  return protectedPrefixes.some((prefix) => prefix !== "/" && (pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const operatorCookie = request.cookies.get("athena_os_operator")?.value;

  if (operatorCookie === "authorized") {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/operator-login";
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
