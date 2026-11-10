"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { deleteCaseAction, setCaseClosedAction } from "@/app/(app)/cases/actions";
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

export function CaseDangerZone({ caseId, closed }: { caseId: string; closed: boolean }) {
  const [pending, startTransition] = useTransition();

  const toggleClosed = () =>
    startTransition(async () => {
      const res = await setCaseClosedAction(caseId, !closed);
      if (res.error) toast.error(res.error);
      else toast.success(closed ? "Case reopened." : "Case closed.");
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteCaseAction(caseId); // redirects on success
      if (res?.error) toast.error(res.error);
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button variant="outline" onClick={toggleClosed} disabled={pending}>
        {closed ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {closed ? "Reopen case" : "Close case"}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            Delete case permanently
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this case permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the case, its chat, uploaded documents, analyses and drafts. This
              cannot be undone. If you only want to put it aside, close it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
