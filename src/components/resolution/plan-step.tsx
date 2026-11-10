"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { toggleStepAction } from "@/app/(app)/cases/[id]/resolution/actions";
import { CaseLink } from "@/components/cases/case-link";
import { cn } from "@/lib/utils";
import type { PlanStep as Step } from "@/modules/resolution/plan";

export function PlanStep({ caseId, planId, step, index, disabled }: { caseId: string; planId: string; step: Step; index: number; disabled?: boolean }) {
  const [, start] = useTransition();
  const [done, setDone] = useOptimistic(step.done);
  const id = `step-${step.id}`;

  const toggle = (next: boolean) =>
    start(async () => {
      setDone(next);
      const res = await toggleStepAction(caseId, planId, step.id, next);
      if (res.error) toast.error(res.error);
    });

  return (
    <li className="flex gap-3 rounded-lg border p-4">
      <input id={id} type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={done} disabled={disabled} onChange={(e) => toggle(e.target.checked)} />
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className={cn("cursor-pointer font-medium", done && "text-muted-foreground line-through")}>
          {index}. {step.title}
        </label>
        <p className={cn("text-sm text-muted-foreground", done && "opacity-70")}>{step.detail}</p>
        {step.link && (
          <CaseLink segment={step.link.segment} className="text-sm font-medium underline">
            {step.link.label} →
          </CaseLink>
        )}
      </div>
    </li>
  );
}
