import type { Metadata } from "next";
import { loadOwnedCase } from "@/modules/cases/queries";
import { Clock, FilePen, TriangleAlert } from "lucide-react";
import { CaseLink } from "@/components/cases/case-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Draft documents" };

const templates = [
  {
    title: "Repayment clarification request",
    text: "Ask the lender for a written breakdown of principal, interest, charges and payments received.",
  },
  {
    title: "Formal demand letter",
    text: "Set out the facts and your requested resolution in writing.",
  },
  {
    title: "Complaint draft",
    text: "A draft complaint for review by a lawyer or legal aid office before use.",
  },
  {
    title: "Legal notice draft",
    text: "Only where appropriate. Should be reviewed and sent through a lawyer.",
  },
];

export default async function DraftsPage({ params }: PageProps<"/cases/[id]/drafts">) {
  await loadOwnedCase((await params).id);

  return (
    <>
      <PageHeader
        title="Draft documents"
        description="Letters prepared from your confirmed case facts. Nothing will ever be sent or filed on your behalf."
        actions={<Badge variant="secondary">Coming soon</Badge>}
      />
      <p className="mb-6 flex items-start gap-2 rounded-lg border bg-muted px-4 py-3 text-sm">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Coming soon.</span> Draft letters are not available yet. For now, use your{" "}
          <CaseLink segment="summary" className="font-medium underline">Case summary</CaseLink> and{" "}
          <CaseLink segment="financial" className="font-medium underline">Financial analysis</CaseLink> to write to the lender, or take them to legal aid.
        </span>
      </p>
      <p className="mb-6 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t.disclaimer.draft}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((d) => (
          <Card key={d.title}>
            <CardHeader>
              <FilePen className="mb-2 size-5 text-brand-teal" aria-hidden />
              <CardTitle>{d.title}</CardTitle>
              <CardDescription>{d.text}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" disabled>
                Coming soon
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </>
  );
}
