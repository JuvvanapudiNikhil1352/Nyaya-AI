"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck, Loader2 } from "lucide-react";
import { confirmSummaryAction } from "@/app/(app)/cases/[id]/summary/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { MissingItem } from "@/modules/extraction/merge";

export function ConfirmSummaryButton({
  caseId,
  missing,
  hasDisputes,
  canConfirm,
  confirmed,
}: {
  caseId: string;
  missing: MissingItem[];
  hasDisputes: boolean;
  canConfirm: boolean;
  confirmed: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const required = missing.filter((m) => m.required);
  const optional = missing.filter((m) => !m.required);

  const confirm = () =>
    start(async () => {
      const res = await confirmSummaryAction(caseId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success("Summary confirmed. You can now run the financial analysis.");
    });

  if (confirmed) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
        <CircleCheck className="size-4" aria-hidden /> Confirmed by you
      </p>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="lg" disabled={!canConfirm || hasDisputes || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />} Confirm summary
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm these details are correct?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>All details shown will be marked as confirmed by you and used for the analysis. You can still change them later.</p>
              {required.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">Still missing (the analysis will be limited or use clearly labelled scenarios):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {required.map((m) => <li key={m.key}>{m.label}</li>)}
                  </ul>
                </div>
              )}
              {optional.length > 0 && (
                <p>Also not known: {optional.map((m) => m.label.toLowerCase()).join(", ")}.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Yes, confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
