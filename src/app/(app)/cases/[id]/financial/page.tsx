import type { Metadata } from "next";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { CaseLink } from "@/components/cases/case-link";
import { BalanceChart } from "@/components/financial/balance-chart";
import { MethodBars } from "@/components/financial/method-bars";
import { balanceSeries } from "@/modules/financial/chart-data";
import { RunAnalysisButton } from "@/components/financial/run-analysis-button";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { loadOwnedCase } from "@/modules/cases/queries";
import { formatINR, formatISODate } from "@/modules/extraction/fields";
import type { AnalysisResult, ScenarioResult } from "@/modules/financial/engine";
import { explainAnalysis } from "@/modules/financial/explain";
import { loadLatestAnalysis } from "@/modules/financial/repository";

export const metadata: Metadata = { title: "Financial analysis" };

const CONFIRMED = ["confirmed", "analysed", "resolution_selected"];

export default async function FinancialPage({ params }: PageProps<"/cases/[id]/financial">) {
  const c = await loadOwnedCase((await params).id);
  const saved = await loadLatestAnalysis(await createClient(), c.id);
  const confirmed = CONFIRMED.includes(c.case_status);
  const closed = c.case_status === "closed";
  const r = saved?.result;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial analysis"
        description="Every figure is calculated with exact formulas from the details you confirmed — never estimated by AI. All assumptions are listed."
        actions={confirmed && !closed ? <RunAnalysisButton caseId={c.id} label={r ? "Recalculate" : "Calculate"} /> : undefined}
      />

      {!confirmed && !closed && (
        <Notice icon={CircleAlert}>
          {r ? "Your case details changed after this calculation. " : ""}
          Please review and confirm your{" "}
          <CaseLink segment="summary" className="font-medium text-foreground underline">Case summary</CaseLink>
          {r ? ", then recalculate." : " first. Only details you confirmed are used in the calculation."}
        </Notice>
      )}

      {!r ? (
        confirmed && <Notice icon={Info}>Your summary is confirmed. Press <strong>Calculate</strong> to work out the balance.</Notice>
      ) : (
        <Results r={r} createdAt={saved!.createdAt} />
      )}
    </div>
  );
}

function Results({ r, createdAt }: { r: AnalysisResult; createdAt: string }) {
  const primary = r.scenarios.find((s) => s.key === r.primaryKey) ?? null;
  const balance = primary ? formatINR(primary.balance) : r.range ? `${formatINR(r.range.min)} – ${formatINR(r.range.max)}` : "—";
  const diff =
    r.lenderDemand === null || !r.range ? "—"
    : primary ? signed(primary.discrepancy!)
    : `${signed(r.lenderDemand - r.range.max)} to ${signed(r.lenderDemand - r.range.min)}`;
  const metrics = [
    { label: "Amount borrowed", value: r.principal === null ? "—" : formatINR(r.principal) },
    { label: "Total repaid", value: formatINR(r.totalRepaid) },
    { label: primary ? "Calculated balance" : "Calculated balance (range)", value: balance },
    { label: "Lender's demand", value: r.lenderDemand === null ? "—" : formatINR(r.lenderDemand) },
    { label: "Demand minus calculation", value: diff },
  ];

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Calculated {new Date(createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
        {r.asOfDate ? ` · balance as on ${formatISODate(r.asOfDate)}` : ""} · engine v{r.engineVersion}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m.label} size="sm">
            <CardHeader>
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="text-lg tabular-nums">{m.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What this means</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {explainAnalysis(r).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </CardContent>
      </Card>

      {r.scenarios.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Balance over time</CardTitle>
              <CardDescription>
                How the amount owed grows with interest and drops with each repayment. Hover or use the arrow keys for exact figures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BalanceChart series={balanceSeries(r)} demand={r.lenderDemand} />
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{r.lenderDemand === null ? "Balance by method" : "Calculation vs lender's demand"}</CardTitle>
              <CardDescription>On {r.asOfDate ? formatISODate(r.asOfDate) : "the calculation date"}.</CardDescription>
            </CardHeader>
            <CardContent>
              <MethodBars scenarios={r.scenarios} demand={r.lenderDemand} />
            </CardContent>
          </Card>
        </div>
      )}

      {r.scenarios.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Possible methods</CardTitle>
            <CardDescription>Confirm the interest terms on the Case summary page to narrow this down to one answer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  {r.lenderDemand !== null && <TableHead className="text-right">Demand minus balance</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.scenarios.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="whitespace-normal">
                      <p className="font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(s.totalInterest)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(s.balance)}</TableCell>
                    {r.lenderDemand !== null && <TableCell className="text-right tabular-nums">{signed(s.discrepancy!)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Interest rate in other terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.rateSummary ? (
              <>
                <p>
                  {r.rateSummary.rate}% per {r.rateSummary.ratePeriod === "monthly" ? "month" : "year"} = <strong>{r.rateSummary.perYearSimple}% per year</strong> (simple)
                  {r.rateSummary.ratePeriod === "annual" && <> = {r.rateSummary.perMonth}% per month</>}.
                </p>
                {r.rateSummary.perYearCompounded !== null && (
                  <p>If unpaid interest is added every month, it works out to <strong>{r.rateSummary.perYearCompounded}% per year</strong>.</p>
                )}
                {r.flatTermSummary && (
                  <p className="rounded-md bg-muted p-3">
                    As a flat-rate loan for {r.flatTermSummary.tenureMonths} months: total interest {formatINR(r.flatTermSummary.totalInterest)}, total to pay{" "}
                    {formatINR(r.flatTermSummary.totalPayable)}, or {formatINR(r.flatTermSummary.monthlyInstalment)} a month. Because interest stays on the full amount
                    even as you repay, the real cost is about <strong>{r.flatTermSummary.equivalentReducingRate}% per year</strong> on a reducing balance.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Needs the interest rate and whether it is per month or per year.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assumptions &amp; warnings</CardTitle>
            <CardDescription>A difference from the lender&apos;s demand is not, by itself, proof of illegal lending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {r.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </p>
            ))}
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {r.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
            {r.missing.length > 0 && (
              <p>
                <span className="font-medium">Not known:</span> {r.missing.join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {r.chargesNeedingReview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extra charges to examine</CardTitle>
            <CardDescription>Not included in the balance, because no written agreement for them is confirmed. This does not mean they are illegal.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {r.chargesNeedingReview.map((ch, i) => (
                <li key={i} className="flex justify-between gap-2 py-2">
                  <span>{ch.label}</span>
                  <span className="tabular-nums">{ch.amount === null ? "amount not given" : formatINR(ch.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {r.scenarios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Step-by-step calculation</CardTitle>
            <CardDescription>Every interest charge and payment, in date order. Interest is rounded to the paisa at each step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.scenarios.map((s, i) => <Breakdown key={s.key} s={s} open={i === 0} />)}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Breakdown({ s, open }: { s: ScenarioResult; open: boolean }) {
  return (
    <details open={open} className="rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{s.label}</summary>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Interest since last step</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Unpaid interest</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.steps.map((st, i) => (
              <TableRow key={i} className={cn(st.kind === "end" && "font-medium")}>
                <TableCell className="whitespace-nowrap">{formatISODate(st.date)}</TableCell>
                <TableCell>
                  {st.description}
                  {st.kind === "repayment" && <Badge variant="outline" className="ml-2 font-normal">paid</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{st.interestAccrued ? formatINR(st.interestAccrued) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{st.amount && st.kind !== "end" ? formatINR(st.amount) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(st.principalBalance)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(st.interestBalance)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(st.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

function signed(n: number): string {
  if (Math.abs(n) < 0.005) return formatINR(0);
  return n > 0 ? `+${formatINR(n)}` : `−${formatINR(-n)}`;
}

function Notice({ icon: Icon, children }: { icon: typeof Info; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
