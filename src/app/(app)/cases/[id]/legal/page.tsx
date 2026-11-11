import type { Metadata } from "next";
import { BookOpen, CircleAlert, ExternalLink, HandHelping, Info, ShieldAlert } from "lucide-react";
import { CaseLink } from "@/components/cases/case-link";
import { PageHeader } from "@/components/layout/page-header";
import { NotLegalAdviceNotice } from "@/components/legal/disclaimer";
import { RunAssessmentButton } from "@/components/legal/run-assessment-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { loadOwnedCase } from "@/modules/cases/queries";
import { SAFETY_GUIDANCE } from "@/modules/conversation/safety";
import type { LegalPoint } from "@/modules/legal/assessment";
import { loadLatestLegal, type LegalAssessmentResult } from "@/modules/legal/repository";

export const metadata: Metadata = { title: "Legal assessment" };

const CONFIRMED = ["confirmed", "analysed", "resolution_selected"];
const KIND_LABEL: Record<LegalPoint["kind"], string> = {
  relevant_law: "What the law says",
  possible_concern: "Possible concern",
  possible_remedy: "Possible remedy",
};

export default async function LegalPage({ params }: PageProps<"/cases/[id]/legal">) {
  const c = await loadOwnedCase((await params).id);
  const saved = await loadLatestLegal(await createClient(), c.id);
  const confirmed = CONFIRMED.includes(c.case_status);
  const closed = c.case_status === "closed";
  const r = saved?.result;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Legal assessment"
        description="Only verified legal sources for your state are used. Every legal point links to its official source."
        actions={confirmed && !closed && c.state ? <RunAssessmentButton caseId={c.id} label={r ? "Update assessment" : "Get legal assessment"} /> : undefined}
      />
      <NotLegalAdviceNotice />

      {/* Safety always comes first (fixed text, not AI). */}
      {c.safety_concern && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" aria-hidden /> {SAFETY_GUIDANCE.threat.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {SAFETY_GUIDANCE.threat.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {!confirmed && !closed && (
        <Notice icon={CircleAlert}>
          Please confirm your <CaseLink segment="summary" className="font-medium text-foreground underline">Case summary</CaseLink> first. The legal assessment uses only details you confirmed.
        </Notice>
      )}
      {confirmed && !c.state && <Notice icon={CircleAlert}>Choose your state (Andhra Pradesh or Telangana) in the case details first — the law depends on it.</Notice>}
      {confirmed && !r && c.state && (
        <Notice icon={Info}>
          Run the <CaseLink segment="financial" className="font-medium text-foreground underline">Financial analysis</CaseLink> first for the most useful result, then press <strong>Get legal assessment</strong>.
        </Notice>
      )}

      {r && <Assessment r={r} createdAt={saved!.createdAt} />}
    </div>
  );
}

function Assessment({ r, createdAt }: { r: LegalAssessmentResult; createdAt: string }) {
  const byLabel = new Map(r.passages.map((p) => [p.label, p]));
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Prepared {new Date(createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} for{" "}
        {r.state === "TG" ? "Telangana" : "Andhra Pradesh"} · {r.passages.length} verified passage{r.passages.length === 1 ? "" : "s"} used
      </p>

      <Card>
        <CardHeader>
          <CardTitle>In short</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{r.summary}</p>
          <p className="text-muted-foreground">A high interest rate alone does not prove that a loan is illegal. The legal position depends on facts such as the lender&apos;s status and how the loan was made.</p>
        </CardContent>
      </Card>

      {r.points.length > 0 && (
        <div className="space-y-3">
          {r.points.map((p, i) => (
            <Card key={i}>
              <CardHeader>
                <Badge variant="outline" className="w-fit font-normal">{KIND_LABEL[p.kind]}</Badge>
                <CardTitle className="text-base">{p.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{p.explanation}</p>
                <div className="space-y-2">
                  {p.citations.map((label) => {
                    const src = byLabel.get(label);
                    if (!src) return null;
                    return (
                      <details key={label} className="rounded-md border bg-muted/30 text-xs">
                        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2">
                          <BookOpen className="size-3.5 shrink-0" aria-hidden />
                          <span className="font-medium">{src.sourceTitle}</span>
                          {src.sectionReference && <span className="text-muted-foreground">— {src.sectionReference}</span>}
                        </summary>
                        <div className="space-y-2 border-t px-3 py-2">
                          <p className="whitespace-pre-line">{src.content.split("\n\n").slice(1).join("\n\n")}</p>
                          <p className="text-muted-foreground">Version: {src.documentVersion}</p>
                          <a href={src.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                            Official text <ExternalLink className="size-3" aria-hidden />
                          </a>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandHelping className="size-5" aria-hidden /> When to get help
            </CardTitle>
            <CardDescription>Free legal aid is available through the Legal Services Authorities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.lawyer.recommended ? (
              <>
                <p className="font-medium">We recommend speaking to free legal aid or a lawyer because:</p>
                <ul className="list-disc space-y-1 pl-5">
                  {r.lawyer.reasons.map((x) => <li key={x}>{x}</li>)}
                  {r.lawyerReason && <li>{r.lawyerReason}</li>}
                </ul>
              </>
            ) : (
              <p>Consider speaking to free legal aid or a lawyer before taking any formal step, such as sending a legal notice or going to court.</p>
            )}
            <p className="text-muted-foreground">
              Ask at the District Legal Services Authority in your district court complex. Whether you qualify for free help depends on the criteria in the Legal Services Authorities Act and your state&apos;s current income limit.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What would change the picture</CardTitle>
            <CardDescription>Facts that matter legally and are not yet known.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {r.factsNeeded.length ? (
              <ul className="list-disc space-y-1 pl-5">{r.factsNeeded.map((f) => <li key={f}>{f}</li>)}</ul>
            ) : (
              <p className="text-muted-foreground">Nothing specific was identified.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {r.notCovered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not covered by our verified sources yet</CardTitle>
            <CardDescription>These may matter for your case, but we don&apos;t have verified official text for them, so we say nothing about them.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">{r.notCovered.map((t) => <li key={t}>{t}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      {(r.corrections ?? []).map((note) => (
        <p key={note} className="text-xs text-muted-foreground">Automatic correction: {note}</p>
      ))}
      {r.removed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {r.removed.length} AI-suggested point{r.removed.length === 1 ? " was" : "s were"} left out because {r.removed.length === 1 ? "it" : "they"} could not be matched to a verified source.
        </p>
      )}
    </>
  );
}

function Notice({ icon: Icon, children }: { icon: typeof Info; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
