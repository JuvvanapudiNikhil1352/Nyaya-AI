"use client";

import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/form-message";
import { LENDER_TYPES, LENDER_TYPE_LABELS, STATES, STATE_LABELS } from "@/types/case";

type Values = Partial<Record<"case_title" | "state" | "lender_type" | "problem_description", string | null>>;

/** Shared fields for the "new case" and "edit case details" forms. */
export function CaseFormFields({
  values = {},
  fieldErrors = {},
  titlePlaceholder,
}: {
  values?: Values;
  fieldErrors?: Partial<Record<string, string[]>>;
  titlePlaceholder?: string;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="case_title">Case name</Label>
        <Input
          id="case_title"
          name="case_title"
          placeholder={titlePlaceholder}
          maxLength={120}
          defaultValue={values.case_title ?? undefined}
          aria-invalid={!!fieldErrors.case_title}
        />
        <FieldError id="case_title-error" errors={fieldErrors.case_title} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="state">Your state</Label>
          <Select name="state" defaultValue={values.state ?? undefined}>
            <SelectTrigger id="state" className="w-full" aria-invalid={!!fieldErrors.state}>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="state-error" errors={fieldErrors.state} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lender_type">Who lent you the money?</Label>
          <Select name="lender_type" defaultValue={values.lender_type ?? undefined}>
            <SelectTrigger id="lender_type" className="w-full" aria-invalid={!!fieldErrors.lender_type}>
              <SelectValue placeholder="Select lender type" />
            </SelectTrigger>
            <SelectContent>
              {LENDER_TYPES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LENDER_TYPE_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="lender_type-error" errors={fieldErrors.lender_type} />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Nyaya AI currently supports loans from private individuals in Andhra Pradesh and
        Telangana. Loans from banks, NBFCs or loan apps follow different rules and are not
        covered yet.
      </p>

      <div className="space-y-2">
        <Label htmlFor="problem_description">What is the problem? (optional)</Label>
        <Textarea
          id="problem_description"
          name="problem_description"
          rows={5}
          maxLength={4000}
          defaultValue={values.problem_description ?? undefined}
          placeholder="e.g. I borrowed ₹80,000. He charges 3% per month. I have repaid ₹70,000 but he is demanding ₹95,000."
          aria-invalid={!!fieldErrors.problem_description}
        />
        <FieldError id="problem_description-error" errors={fieldErrors.problem_description} />
        <p className="text-xs text-muted-foreground">
          Please don&apos;t include Aadhaar numbers, bank passwords or OTPs.
        </p>
      </div>
    </>
  );
}
