import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CaseDangerZone } from "@/components/cases/case-danger-zone";
import { CaseDetailsForm } from "@/components/cases/case-details-form";
import { CaseLink } from "@/components/cases/case-link";
import { caseNav } from "@/lib/navigation";
import { loadOwnedCase } from "@/modules/cases/queries";

export const metadata: Metadata = { title: "Case overview" };

const descriptions: Record<string, string> = {
  chat: "Describe your situation and answer a few follow-up questions.",
  documents: "Upload agreements, receipts, statements and messages.",
  summary: "Check and correct the facts before any analysis.",
  financial: "See the calculated balance compared with the lender's demand.",
  legal: "Understand relevant laws for your state, with sources.",
  resolution: "Compare your options and choose how to proceed.",
  "action-plan": "Your personalised list of next steps.",
  drafts: "Prepare letters and drafts to review and download.",
};

// Rendered inside the segment's loading.tsx Suspense boundary.
export default async function CaseOverviewPage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const c = await loadOwnedCase(id);
  const steps = caseNav.filter((s) => s.segment !== "");

  return (
    <div className="space-y-8">
      <section aria-labelledby="steps">
        <h2 id="steps" className="mb-3 font-medium">Steps</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.segment}>
              <CaseLink segment={step.segment} className="group block h-full">
                <Card className="h-full transition-colors group-hover:border-brand-teal/60">
                  <CardHeader>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <step.icon className="size-4" aria-hidden />
                      </span>
                      <span className="text-xs text-muted-foreground">Step {i + 1}</span>
                    </div>
                    <CardTitle className="flex items-center gap-1">
                      {step.label}
                      <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </CardTitle>
                    <CardDescription>{descriptions[step.segment]}</CardDescription>
                  </CardHeader>
                </Card>
              </CaseLink>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Case details</CardTitle>
            <CardDescription>The basic information about this dispute.</CardDescription>
          </CardHeader>
          <CardContent>
            <CaseDetailsForm c={c} />
          </CardContent>
        </Card>

        <Card className="h-fit border-destructive/30">
          <CardHeader>
            <CardTitle>Manage case</CardTitle>
            <CardDescription>
              Close a case when the dispute is resolved. Deleting removes everything permanently.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CaseDangerZone caseId={c.id} closed={c.case_status === "closed"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
