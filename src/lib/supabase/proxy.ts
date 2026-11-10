import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { classifyPath } from "@/lib/security/route-access";
import { getSupabaseConfig } from "./env";

/**
 * Runs before every page request:
 * 1. Refreshes the user's login session (and writes updated cookies).
 * 2. Sends logged-out users away from protected pages to /login.
 * 3. Sends logged-in users from /login or /signup to the dashboard.
 *
 * This is a convenience redirect. Real data protection comes from server-side
 * checks in each data access and from database Row Level Security.
 */
export async function updateSession(request: NextRequest) {
  const access = classifyPath(request.nextUrl.pathname);
  const config = getSupabaseConfig();

  if (!config) {
    // Not configured yet: keep public pages working, block protected ones.
    if (access === "protected") return redirect(request, "/login", { setup: "missing" });
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // No-cache headers so a CDN never serves one user's session to another.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims(): this call
  // validates and, when needed, refreshes the session.
  let isLoggedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isLoggedIn = Boolean(data?.claims?.sub);
  } catch {
    isLoggedIn = false; // Supabase unreachable: treat as logged out
  }

  if (!isLoggedIn && access === "protected") {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    return redirect(request, "/login", { next }, response);
  }
  if (isLoggedIn && access === "auth-page") {
    return redirect(request, "/dashboard", {}, response);
  }
  return response;
}

/** Redirect while keeping any refreshed auth cookies and cache headers. */
function redirect(
  request: NextRequest,
  pathname: string,
  params: Record<string, string>,
  from?: NextResponse,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = new URLSearchParams(params).toString();
  const res = NextResponse.redirect(url);
  if (from) {
    from.cookies.getAll().forEach((c) => res.cookies.set(c));
    ["cache-control", "expires", "pragma"].forEach((h) => {
      const v = from.headers.get(h);
      if (v) res.headers.set(h, v);
    });
  }
  return res;
}
