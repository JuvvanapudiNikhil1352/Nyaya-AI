"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/security/route-access";
import { isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation/auth";

export type AuthFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: { email?: string; full_name?: string };
};

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: str(formData, "email") };
  const parsed = loginSchema.safeParse({ email: values.email, password: str(formData, "password") });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  if (!isSupabaseConfigured()) return { error: SUPABASE_NOT_CONFIGURED_MESSAGE, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first. Check your inbox for the link we sent.", values };
    }
    if (error.code === "invalid_credentials") {
      // Same message whether the email exists or not, so accounts can't be discovered.
      return { error: "Incorrect email or password.", values };
    }
    if (error.status === 429) {
      return { error: "Too many attempts. Please wait a few minutes and try again.", values };
    }
    console.error("[auth] login failed", { code: error.code, status: error.status });
    return { error: GENERIC_ERROR, values };
  }

  redirect(safeNextPath(str(formData, "next")));
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: str(formData, "email"), full_name: str(formData, "full_name") };
  const parsed = signupSchema.safeParse({ ...values, password: str(formData, "password") });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  if (!isSupabaseConfigured()) return { error: SUPABASE_NOT_CONFIGURED_MESSAGE, values };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Stored in the auth user record; copied into `profiles` from Phase 3.
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${appUrl}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: [error.message] }, values };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return {
        error: "We couldn't send the confirmation email because of a temporary limit. Please try again in an hour.",
        values,
      };
    }
    if (error.code === "signup_disabled") {
      return { error: "New sign-ups are currently turned off.", values };
    }
    console.error("[auth] signup failed", { code: error.code, status: error.status });
    return { error: GENERIC_ERROR, values };
  }

  // If email confirmation is turned off in Supabase, the user is logged in immediately.
  if (data.session) redirect("/dashboard");

  // Same message for new and already-registered emails, so accounts can't be discovered.
  return {
    success: `If ${parsed.data.email} can be registered, we've sent a confirmation link to it. Open the link (in this browser if possible), then log in.`,
  };
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
