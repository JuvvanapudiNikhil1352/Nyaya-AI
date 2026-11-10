"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { deleteAccountAction } from "@/app/(app)/settings/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteAccountDialog() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const ready = text.trim() === "DELETE";

  const confirm = () =>
    start(async () => {
      const res = await deleteAccountAction(text);
      // On success the action redirects; we only get here on error.
      if (res?.error) toast.error(res.error);
    });

  return (
    <AlertDialog onOpenChange={() => setText("")}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Delete my account and data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes your login, every case, all uploaded documents, calculations, legal assessments and action plans. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
          <Input id="confirm-delete" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" disabled={pending} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep my account</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={!ready || pending}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {pending && <Loader2 className="animate-spin" />} Delete everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
