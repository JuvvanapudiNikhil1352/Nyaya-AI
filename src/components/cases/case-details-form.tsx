"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateCaseAction, type CaseFormState } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import type { CaseRecord } from "@/types/case";
import { CaseFormFields } from "./case-form-fields";

export function CaseDetailsForm({ c }: { c: CaseRecord }) {
  const [state, action, pending] = useActionState<CaseFormState, FormData>(
    updateCaseAction.bind(null, c.id),
    {},
  );
  const values = state.values ?? {
    case_title: c.case_title,
    state: c.state,
    lender_type: c.lender_type,
    problem_description: c.problem_description,
  };

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state.success && <FormMessage type="success">{state.success}</FormMessage>}
      <CaseFormFields values={values} fieldErrors={state.fieldErrors} />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
