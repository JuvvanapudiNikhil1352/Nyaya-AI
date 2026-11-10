"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { login, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormMessage } from "./form-message";

const notices: Record<string, { type: "info" | "error"; text: string }> = {
  "confirm-failed": {
    type: "info",
    text: "We couldn't complete sign-in from that link (this often happens if it was opened in a different browser). If you've confirmed your email, simply log in below.",
  },
  setup: {
    type: "error",
    text: "The app is not connected to Supabase yet. Add the Supabase values to .env.local and restart the server.",
  },
};

export function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});
  const notice = params.get("setup") === "missing" ? notices.setup : notices[params.get("notice") ?? ""];
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      {notice && !state.error && <FormMessage type={notice.type}>{notice.text}</FormMessage>}
      {state.error && <FormMessage type="error">{state.error}</FormMessage>}

      <input type="hidden" name="next" value={params.get("next") ?? ""} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" errors={fe.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!fe.password}
          aria-describedby={fe.password ? "password-error" : undefined}
        />
        <FieldError id="password-error" errors={fe.password} />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
