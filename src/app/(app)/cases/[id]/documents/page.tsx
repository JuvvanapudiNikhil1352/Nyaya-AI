import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { CaseLink } from "@/components/cases/case-link";
import { DocumentCard } from "@/components/documents/document-card";
import { EvidenceChecklist } from "@/components/documents/evidence-checklist";
import { UploadPanel } from "@/components/documents/upload-panel";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { loadOwnedCase } from "@/modules/cases/queries";
import { loadDocumentFindings, loadEvidence } from "@/modules/documents/repository";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ params }: PageProps<"/cases/[id]/documents">) {
  const c = await loadOwnedCase((await params).id);
  const supabase = await createClient();
  const [{ documents, checklist }, findings] = await Promise.all([loadEvidence(supabase, c.id), loadDocumentFindings(supabase, c.id)]);
  const closed = c.case_status === "closed";
  const needsReview = documents.some((d) => d.extraction_status === "needs_review");

  return (
    <>
      <PageHeader
        title="Documents & evidence"
        description="Upload what you have. We read the loan details from it so you don't have to type them again. Missing documents won't stop you from continuing."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <UploadPanel caseId={c.id} disabled={closed} />

          {documents.length > 0 && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Everything read from your documents is <strong className="text-foreground">unverified</strong> until you check it on the{" "}
              <CaseLink segment="summary" className="font-medium text-foreground underline">Case summary</CaseLink>
              {needsReview ? ". Documents marked “Needs your review” are handwritten or hard to read — compare every detail with the original." : "."}
            </p>
          )}

          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents uploaded"
              description="Your uploaded files and the details read from them will appear here."
            />
          ) : (
            <div className="space-y-4">
              {[...documents].reverse().map((d) => (
                <DocumentCard key={d.id} caseId={c.id} doc={d} findings={findings[d.id] ?? []} disabled={closed} />
              ))}
            </div>
          )}
        </div>

        <EvidenceChecklist caseId={c.id} items={checklist} disabled={closed} />
      </div>
    </>
  );
}
