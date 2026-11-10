"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

type Step = "idle" | "uploading" | "reading";

/** Calls the read endpoint. Shared with the document card's "Read again" button. */
export async function requestRead(caseId: string, documentId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`/api/cases/${caseId}/documents/${documentId}/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: body.error ?? "We couldn't read this document. You can try again." };
    const n = Number(body.facts_added ?? 0);
    return {
      ok: true,
      message: n > 0 ? `Found ${n} detail${n === 1 ? "" : "s"}. Please check them on the Case summary page.` : "Document read. No new loan details were found in it.",
    };
  } catch {
    return { ok: false, message: "Network problem. Your file is saved — try reading it again." };
  }
}

export function UploadPanel({ caseId, disabled }: { caseId: string; disabled?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const consentId = useId();
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [dragging, setDragging] = useState(false);
  const busy = step !== "idle";
  const canUse = consent && !busy && !disabled;

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) return void toast.error("The file is larger than 10 MB.");
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) && !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      return void toast.error("Only PDF, JPG and PNG files can be uploaded.");
    }

    setStep("uploading");
    let documentId: string;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStep("idle");
        return void toast.error(body.error ?? "Upload failed. Please try again.");
      }
      documentId = body.document.id;
    } catch {
      setStep("idle");
      return void toast.error("Network problem. Please try again.");
    }

    router.refresh(); // show the new document straight away
    setStep("reading");
    const result = await requestRead(caseId, documentId);
    setStep("idle");
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    router.refresh();
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (file) void handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!canUse) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (canUse) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center rounded-xl border-2 border-dashed bg-muted/30 px-6 py-8 text-center transition-colors",
        dragging && "border-primary bg-primary/5",
      )}
    >
      {busy ? (
        <Loader2 className="mb-3 size-8 animate-spin text-primary" aria-hidden />
      ) : (
        <Upload className="mb-3 size-8 text-muted-foreground" aria-hidden />
      )}
      <p className="font-medium" aria-live="polite">
        {step === "uploading" ? "Uploading…" : step === "reading" ? "Reading your document… this can take up to a minute" : "Upload a document"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">PDF, JPG or PNG, up to 10 MB. Loan agreements, promissory notes, receipts, bank statements, chat screenshots.</p>

      <div className="mt-4 flex max-w-md items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-left text-xs">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
        <div className="space-y-2">
          <p>
            Documents are read by Google Gemini (free tier), and Google may use them to improve its products.{" "}
            <strong>While Nyaya AI is in testing, upload only made-up sample documents.</strong> Cover any Aadhaar, PAN or account numbers.
          </p>
          <label htmlFor={consentId} className="flex cursor-pointer items-center gap-2 font-medium">
            <input
              id={consentId}
              type="checkbox"
              className="size-4 accent-primary"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy || disabled}
            />
            I understand
          </label>
        </div>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden />
      <Button className="mt-4" disabled={!canUse} onClick={() => inputRef.current?.click()}>
        {busy && <Loader2 className="animate-spin" />} Choose file
      </Button>
      {disabled && <p className="mt-2 text-xs text-muted-foreground">This case is closed. Reopen it to add documents.</p>}
      <p className="mt-4 max-w-md text-xs text-muted-foreground">
        Details read from documents are marked <em>unverified</em> until you check them. Handwritten documents always need your review.
      </p>
    </div>
  );
}
