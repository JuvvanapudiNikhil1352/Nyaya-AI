import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json(details ? { error, details } : { error }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Returns the logged-in user, or a 401 response. */
export async function authenticate(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  return user ?? jsonError(401, "You must be logged in.");
}

/**
 * CSRF protection for state-changing requests that use cookie auth:
 * require a JSON body and a same-origin Origin header.
 */
export function checkMutationRequest(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return jsonError(403, "Cross-site requests are not allowed.");
  }
  if (request.method !== "DELETE") {
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) {
      return jsonError(415, "Send the request body as JSON.");
    }
  }
  return null;
}

/**
 * CSRF protection for file uploads (multipart/form-data, which plain HTML
 * forms on other sites can also send): the Origin header is REQUIRED and must
 * match. Also rejects bodies larger than `maxBytes` before reading them.
 */
export function checkUploadRequest(request: NextRequest, maxBytes: number): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return jsonError(403, "Cross-site requests are not allowed.");
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    return jsonError(415, "Send the file as multipart/form-data.");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) return jsonError(413, "The file is larger than 10 MB.");
  return null;
}

/** Parses and validates a JSON body. Returns data or a 400 response. */
export async function parseBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 100_000) return { response: jsonError(413, "Request body is too large.") };
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { response: jsonError(400, "Request body is not valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: jsonError(400, "Invalid input.", z.flattenError(parsed.error).fieldErrors) };
  }
  return { data: parsed.data };
}

/** Converts known errors to safe responses; never leaks internal details. */
export function handleRouteError(error: unknown) {
  if (error instanceof RateLimitError) return jsonError(429, error.message);
  console.error("[api] unexpected error", error instanceof Error ? error.message : "unknown");
  return jsonError(500, "Something went wrong. Please try again.");
}
