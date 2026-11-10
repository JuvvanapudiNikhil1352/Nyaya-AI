/** Pages that require a logged-in user. API routes check auth themselves. */
const PROTECTED_PREFIXES = ["/dashboard", "/cases", "/settings"];
/** Pages a logged-in user doesn't need (sent to the dashboard instead). */
const AUTH_PAGES = ["/login", "/signup"];

export type RouteAccess = "protected" | "auth-page" | "public";

export function classifyPath(pathname: string): RouteAccess {
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "protected";
  }
  if (AUTH_PAGES.includes(pathname)) return "auth-page";
  return "public";
}

/**
 * Makes a user-supplied "?next=" value safe to redirect to.
 * Only same-site relative paths are allowed, to prevent open redirects
 * (e.g. "?next=https://evil.example" or "?next=//evil.example").
 */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const base = "http://nyaya.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    if (classifyPath(url.pathname) === "auth-page") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
