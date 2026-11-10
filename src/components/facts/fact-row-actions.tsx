"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CircleHelp, Loader2, Pencil } from "lucide-react";
import { confirmFactAction, markUnknownAction, setFactAction } from "@/app/(app)/cases/[id]/summary/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FIELD_BY_KEY, type FactField, type FactValue } from "@/modules/extraction/fields";
import { FactInput } from "./fact-input";

type Props = {
  caseId: string;
  field: FactField;
  value: FactValue | null;
  approximate: boolean;
  status: string | null;
  previousConfirmed: FactValue | null;
  disabled?: boolean;
};

export function FactRowActions({ caseId, field, value, approximate, status, previousConfirmed, disabled }: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftApprox, setDraftApprox] = useState(false);
  const [error, setError] = useState<string>();

  const canConfirm = value !== null && (status === "unverified" || status === "disputed");

  const act = (fn: () => Promise<{ error?: string; fieldErrors?: Record<string, string> }>, ok?: string) =>
    start(async () => {
      const res = await fn();
      if (res.fieldErrors?.value) return setError(res.fieldErrors.value);
      if (res.error) return void toast.error(res.error);
      setOpen(false);
      if (ok) toast.success(ok);
    });

  function openEditor(prefill: FactValue | null) {
    setDraft(prefill === null ? "" : String(prefill));
    setDraftApprox(approximate);
    setError(undefined);
    setOpen(true);
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {canConfirm && (
        <Button size="sm" variant="outline" disabled={pending || disabled} onClick={() => act(() => confirmFactAction(caseId, field), "Confirmed.")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} {status === "disputed" ? "Use new value" : "Correct"}
        </Button>
      )}
      {status === "disputed" && previousConfirmed !== null && (
        <Button size="sm" variant="outline" disabled={pending || disabled} onClick={() => act(() => setFactAction(caseId, field, String(previousConfirmed), approximate), "Kept your earlier answer.")}>
          Keep earlier value
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending || disabled} onClick={() => openEditor(value)} aria-label={`Edit ${FIELD_BY_KEY[field].label}`}>
        <Pencil /> {value === null ? "Add" : "Edit"}
      </Button>
      {status !== "missing" && value === null && (
        <Button size="sm" variant="ghost" disabled={pending || disabled} onClick={() => act(() => markUnknownAction(caseId, field), "Noted — you don't know this.")}>
          <CircleHelp /> I don&apos;t know
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{value === null ? "Add detail" : "Correct this detail"}</DialogTitle>
            <DialogDescription>What you enter here is saved as confirmed by you.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(() => setFactAction(caseId, field, draft, draftApprox), "Saved.");
            }}
            className="space-y-4"
          >
            <FactInput field={field} value={draft} onChange={setDraft} approximate={draftApprox} onApproximateChange={setDraftApprox} error={error} />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => act(() => markUnknownAction(caseId, field), "Noted — you don't know this.")}>
                I don&apos;t know
              </Button>
              <Button type="submit" disabled={pending || !draft.trim()}>
                {pending && <Loader2 className="animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
