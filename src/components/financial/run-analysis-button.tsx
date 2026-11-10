"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Calculator, Loader2 } from "lucide-react";
import { runAnalysisAction } from "@/app/(app)/cases/[id]/financial/actions";
import { Button } from "@/components/ui/button";

export function RunAnalysisButton({ caseId, label = "Calculate", disabled }: { caseId: string; label?: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await runAnalysisAction(caseId);
          if (res.error) toast.error(res.error);
          else toast.success("Calculation complete.");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Calculator />} {label}
    </Button>
  );
}
