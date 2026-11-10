"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createCaseAction, type CaseFormState } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import { CaseFormFields } from "./case-form-fields";

export function NewCaseForm() {
  const [state, action, pending] = useActionState<CaseFormState, FormData>(createCaseAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <FormMessage type="error">{state.error}</FormMessage>}
      <CaseFormFields
        values={state.values}
        fieldErrors={state.fieldErrors}
        titlePlaceholder="e.g. Loan from neighbour, 2023 (optional)"
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Creating…" : "Create case"}
      </Button>
    </form>
  );
}
