import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/security/route-access";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Landing point for links in Supabase emails (e.g. "Confirm your signup").
 * Supports both link styles Supabase can send:
 *  - ?code=...                 (PKCE flow — the default template)
 *  - ?token_hash=...&type=...  (custom email templates)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const toLogin = (reason: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = new URLSearchParams({ notice: reason }).toString();
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured()) return toLogin("setup");

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (!ok) {
    // Common cause: the link was opened in a different browser than the one used to sign up.
    // The email is usually confirmed anyway, so ask the user to log in.
    return toLogin("confirm-failed");
  }

  const url = request.nextUrl.clone();
  url.pathname = next.split("?")[0];
  url.search = "";
  return NextResponse.redirect(url);
}
