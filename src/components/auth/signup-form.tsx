"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signup, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormMessage } from "./form-message";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signup, {});
  const fe = state.fieldErrors ?? {};

  if (state.success) {
    return <FormMessage type="success">{state.success}</FormMessage>;
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <FormMessage type="error">{state.error}</FormMessage>}

      <div className="space-y-2">
        <Label htmlFor="full_name">Your name</Label>
        <Input
          id="full_name"
          name="full_name"
          autoComplete="name"
          required
          maxLength={100}
          defaultValue={state.values?.full_name}
          aria-invalid={!!fe.full_name}
          aria-describedby={fe.full_name ? "full_name-error" : undefined}
        />
        <FieldError id="full_name-error" errors={fe.full_name} />
      </div>
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
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          aria-invalid={!!fe.password}
          aria-describedby="password-help"
        />
        {fe.password ? (
          <FieldError id="password-help" errors={fe.password} />
        ) : (
          <p id="password-help" className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
