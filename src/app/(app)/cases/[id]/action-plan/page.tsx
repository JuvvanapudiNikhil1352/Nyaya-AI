import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { CaseLink } from "@/components/cases/case-link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PlanStep } from "@/components/resolution/plan-step";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";
import { loadOwnedCase } from "@/modules/cases/queries";
import { RESOLUTION_OPTIONS } from "@/modules/resolution/plan";
import { loadActivePlan } from "@/modules/resolution/repository";

export const metadata: Metadata = { title: "Action plan" };

export default async function ActionPlanPage({ params }: PageProps<"/cases/[id]/action-plan">) {
  const c = await loadOwnedCase((await params).id);
  const plan = await loadActivePlan(await createClient(), c.id);

  if (!plan) {
    return (
      <>
        <PageHeader title="Action plan" description="Your personalised next steps, based on your confirmed facts and chosen path." />
        <EmptyState
          icon={ListChecks}
          title="No action plan yet"
          description="Choose a resolution path first, and we'll build a step-by-step plan for you."
          action={
            <Button asChild variant="outline">
              <CaseLink segment="resolution">Go to resolution options</CaseLink>
            </Button>
          }
        />
      </>
    );
  }

  const option = RESOLUTION_OPTIONS[plan.resolutionType];
  const done = plan.steps.filter((s) => s.done).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Action plan: ${option.title}`}
        description="Tick off each step as you complete it. These steps are based on your confirmed facts — nothing is sent or filed for you."
        actions={
          <Button asChild variant="outline">
            <CaseLink segment="resolution">Change path</CaseLink>
          </Button>
        }
      />
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {done} of {plan.steps.length} steps done · created {new Date(plan.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}
          {plan.choseRecommended ? " · you chose the suggested path" : ""}
        </p>
        <Progress value={(done / plan.steps.length) * 100} aria-label="Progress" />
      </div>
      <ol className="space-y-3">
        {plan.steps.map((s, i) => (
          <PlanStep key={s.id} caseId={c.id} planId={plan.id} step={s} index={i + 1} disabled={c.case_status === "closed"} />
        ))}
      </ol>
    </div>
  );
}
