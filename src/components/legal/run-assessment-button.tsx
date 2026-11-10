"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Gavel, Loader2 } from "lucide-react";
import { runLegalAssessmentAction } from "@/app/(app)/cases/[id]/legal/actions";
import { Button } from "@/components/ui/button";

export function RunAssessmentButton({ caseId, label }: { caseId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runLegalAssessmentAction(caseId);
          if (res.error) toast.error(res.error);
          else toast.success("Legal assessment ready.");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Gavel />} {pending ? "Checking verified sources…" : label}
    </Button>
  );
}
