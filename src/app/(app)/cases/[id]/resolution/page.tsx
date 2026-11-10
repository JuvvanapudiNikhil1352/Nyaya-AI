import type { Metadata } from "next";
import { CircleAlert, Gavel, Handshake, LifeBuoy, MessageSquare, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";
import { CaseLink } from "@/components/cases/case-link";
import { PageHeader } from "@/components/layout/page-header";
import { ChoosePathButton } from "@/components/resolution/choose-path-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { loadOwnedCase } from "@/modules/cases/queries";
import { recommend, RESOLUTION_OPTIONS, RESOLUTION_TYPES, type ResolutionType } from "@/modules/resolution/plan";
import { loadActivePlan, loadPlanContext } from "@/modules/resolution/repository";

export const metadata: Metadata = { title: "Resolution" };

const ICONS: Record<ResolutionType, LucideIcon> = { clarification: MessageSquare, negotiation: Handshake, legal_action: Gavel, legal_assistance: LifeBuoy };
const CONFIRMED = ["confirmed", "analysed", "resolution_selected"];

export default async function ResolutionPage({ params }: PageProps<"/cases/[id]/resolution">) {
  const c = await loadOwnedCase((await params).id);
  const supabase = await createClient();
  const [ctx, plan] = await Promise.all([loadPlanContext(supabase, c), loadActivePlan(supabase, c.id)]);
  const rec = recommend(ctx);
  const canChoose = CONFIRMED.includes(c.case_status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Choose how to proceed"
        description="We suggest a starting point based on your case, but the choice is always yours. Nothing is sent or filed automatically."
      />

      {rec.alerts.map((a, i) => (
        <p key={a} className={cn("flex items-start gap-2 rounded-lg px-4 py-3 text-sm", i === 0 && c.safety_concern ? "border border-destructive/30 bg-destructive/5" : "bg-muted text-muted-foreground")}>
          {i === 0 && c.safety_concern ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{a}</span>
        </p>
      ))}

      {!canChoose && (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Confirm your <CaseLink segment="summary" className="font-medium text-foreground underline">Case summary</CaseLink> and run the{" "}
          <CaseLink segment="financial" className="font-medium text-foreground underline">Financial analysis</CaseLink> first, so the options can be tailored to your case.
        </p>
      )}

      {canChoose && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" aria-hidden /> Suggested starting point: {RESOLUTION_OPTIONS[rec.recommended].title}
            </CardTitle>
            <CardDescription>Why we suggest this — you can choose any option below.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {rec.reasons.map((r) => <li key={r}>{r}</li>)}
              {!ctx.legal.exists && <li>Tip: the <CaseLink segment="legal" className="underline">Legal assessment</CaseLink> can help you choose.</li>}
            </ul>
            {rec.alsoConsider.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">Also worth considering: {rec.alsoConsider.map((k) => RESOLUTION_OPTIONS[k].title).join(", ")}.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {RESOLUTION_TYPES.map((key) => {
          const o = RESOLUTION_OPTIONS[key];
          const Icon = ICONS[key];
          const isRec = canChoose && rec.recommended === key;
          return (
            <Card key={key} className={cn(isRec && "ring-2 ring-primary/40")}>
              <CardHeader>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  {isRec && <Badge>Suggested</Badge>}
                  {plan?.resolutionType === key && <Badge variant="secondary">Chosen</Badge>}
                </div>
                <CardTitle>{o.title}</CardTitle>
                <CardDescription>{o.involves}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p><span className="font-medium">How we help: </span><span className="text-muted-foreground">{o.howWeHelp}</span></p>
                <Detail title="Benefits" items={o.benefits} />
                <Detail title="Risks and limits" items={o.risks} />
                <Detail title="What you'll need" items={o.needed} />
              </CardContent>
              <CardFooter>
                <ChoosePathButton caseId={c.id} type={key} title={o.title} current={plan?.resolutionType === key} recommended={isRec} disabled={!canChoose} />
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-muted-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
