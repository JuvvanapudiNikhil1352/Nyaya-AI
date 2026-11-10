import type { Metadata } from "next";
import { CircleAlert, ListChecks, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FactStatusBadge } from "@/components/cases/fact-status-badge";
import { CaseLink } from "@/components/cases/case-link";
import { ConfirmSummaryButton } from "@/components/facts/confirm-summary-button";
import { FactRowActions } from "@/components/facts/fact-row-actions";
import { ChargesCard, RepaymentsCard } from "@/components/facts/items-cards";
import { SourceNote } from "@/components/facts/source-note";
import { PageHeader } from "@/components/layout/page-header";
import type { VerificationStatus } from "@/lib/case-fields";
import { createClient } from "@/lib/supabase/server";
import { loadOwnedCase } from "@/modules/cases/queries";
import { FACT_FIELDS, formatFactValue } from "@/modules/extraction/fields";
import { loadCaseFacts } from "@/modules/facts/repository";
import { LENDER_TYPE_LABELS, STATE_LABELS } from "@/types/case";

export const metadata: Metadata = { title: "Case summary" };

export default async function SummaryPage({ params }: PageProps<"/cases/[id]/summary">) {
  const c = await loadOwnedCase((await params).id);
  const data = await loadCaseFacts(await createClient(), c.id);
  const closed = c.case_status === "closed";
  const confirmed = ["confirmed", "analysed", "resolution_selected"].includes(c.case_status);
  const canConfirm = !closed && data.facts.principal_amount?.value != null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Case summary"
        description="Check every detail. Confirm what's right, correct what's wrong, and mark what you don't know. Nothing is analysed until you confirm."
        actions={
          <ConfirmSummaryButton
            caseId={c.id}
            missing={data.missing}
            hasDisputes={data.hasDisputes}
            canConfirm={canConfirm}
            confirmed={confirmed}
          />
        }
      />

      {data.hasDisputes && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          Some details you mentioned in chat differ from what you confirmed earlier. Choose which value is right before confirming.
        </p>
      )}
      {!canConfirm && !closed && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Add at least the amount you borrowed to confirm. You can describe your loan in the{" "}
            <CaseLink segment="chat" className="font-medium text-foreground underline">Chat</CaseLink> or add details below.
          </span>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Loan details</CardTitle>
              <CardDescription>
                State: {c.state ? STATE_LABELS[c.state] : "not set"} · Lender: {c.lender_type ? LENDER_TYPE_LABELS[c.lender_type] : "not set"}
                {" "}(change these on the Overview tab)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {FACT_FIELDS.map((def) => {
                  const f = data.facts[def.key];
                  const status: VerificationStatus = (f?.status ?? "missing") as VerificationStatus;
                  const hasValue = f?.value != null;
                  return (
                    <li key={def.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm text-muted-foreground">{def.label}</p>
                        <p className="font-medium break-words">
                          {hasValue ? formatFactValue(def.key, f!.value!, f!.approximate) : f?.status === "missing" ? "You don't know" : "Not provided"}
                        </p>
                        {f?.status === "disputed" && f.previousConfirmed != null && (
                          <p className="text-xs text-destructive">
                            You earlier confirmed: {formatFactValue(def.key, f.previousConfirmed)}
                          </p>
                        )}
                        {f && hasValue && <SourceNote sourceType={f.sourceType} quote={f.quote} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <FactStatusBadge status={status} />
                        <FactRowActions
                          caseId={c.id}
                          field={def.key}
                          value={f?.value ?? null}
                          approximate={f?.approximate ?? false}
                          status={f?.status ?? null}
                          previousConfirmed={f?.previousConfirmed ?? null}
                          disabled={closed}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <RepaymentsCard caseId={c.id} items={data.repayments} disabled={closed} />
          <ChargesCard caseId={c.id} items={data.charges} disabled={closed} />
        </div>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-4" aria-hidden /> Missing information
            </CardTitle>
            <CardDescription>You can confirm without these — the analysis will clearly state what it couldn&apos;t check.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.missing.length === 0 ? (
              <p className="text-sm text-success">Nothing important is missing.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.missing.map((m) => (
                  <li key={m.key} className="flex items-start justify-between gap-2">
                    <span>{m.label}</span>
                    <span className={m.required ? "shrink-0 text-xs font-medium text-warning-foreground dark:text-warning" : "shrink-0 text-xs text-muted-foreground"}>
                      {m.required ? "Needed" : "Helpful"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.unverifiedCount > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {data.unverifiedCount} detail{data.unverifiedCount === 1 ? "" : "s"} from chat not yet checked by you.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
