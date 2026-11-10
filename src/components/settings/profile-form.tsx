"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateProfileAction, type ProfileFormState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError, FormMessage } from "@/components/auth/form-message";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state.success && <FormMessage type="success">{state.success}</FormMessage>}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" autoComplete="name" maxLength={100} defaultValue={fullName} aria-invalid={!!fe.full_name} />
        <FieldError id="full_name-error" errors={fe.full_name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="preferred_language">Preferred language</Label>
        <Select name="preferred_language" defaultValue="en">
          <SelectTrigger id="preferred_language" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="te" disabled>
              తెలుగు (Telugu) — coming later
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
