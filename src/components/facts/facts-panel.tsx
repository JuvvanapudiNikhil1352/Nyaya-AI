import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseLink } from "@/components/cases/case-link";
import { FactStatusBadge } from "@/components/cases/fact-status-badge";
import type { VerificationStatus } from "@/lib/case-fields";
import { FACT_FIELDS, formatFactValue, formatINR } from "@/modules/extraction/fields";
import type { CaseFacts } from "@/modules/facts/repository";

/** Compact, read-only view of the case facts beside the chat. */
export function FactsPanel({ data }: { data: CaseFacts }) {
  const known = FACT_FIELDS.filter((d) => data.facts[d.key]);
  const repaid = data.repayments.reduce((n, r) => n + r.amount, 0);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">What we know so far</CardTitle>
        <CardDescription>Picked up from your messages. You&apos;ll check each one on the summary.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {known.length === 0 && data.repayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet — describe your loan in the chat.</p>
        ) : (
          <dl className="divide-y text-sm">
            {known.map((def) => {
              const f = data.facts[def.key]!;
              return (
                <div key={def.key} className="flex items-start justify-between gap-2 py-2">
                  <dt className="text-muted-foreground">{def.label}</dt>
                  <dd className="flex flex-col items-end gap-1 text-right">
                    <span className="font-medium">
                      {f.value !== null ? formatFactValue(def.key, f.value, f.approximate) : "Not known"}
                    </span>
                    <FactStatusBadge status={f.status as VerificationStatus} />
                  </dd>
                </div>
              );
            })}
            {data.repayments.length > 0 && (
              <div className="flex items-start justify-between gap-2 py-2">
                <dt className="text-muted-foreground">Repayments listed</dt>
                <dd className="text-right font-medium">
                  {data.repayments.length} · {formatINR(repaid)}
                </dd>
              </div>
            )}
            {data.charges.length > 0 && (
              <div className="flex items-start justify-between gap-2 py-2">
                <dt className="text-muted-foreground">Extra charges</dt>
                <dd className="font-medium">{data.charges.length}</dd>
              </div>
            )}
          </dl>
        )}
        {data.missing.some((m) => m.required) && (
          <p className="text-xs text-muted-foreground">
            Still needed: {data.missing.filter((m) => m.required).map((m) => m.label.toLowerCase()).join(", ")}.
          </p>
        )}
        <CaseLink segment="summary" className="flex items-center gap-1 text-sm font-medium text-brand-teal hover:underline">
          Review on Case summary <ArrowRight className="size-3.5" aria-hidden />
        </CaseLink>
      </CardContent>
    </Card>
  );
}
