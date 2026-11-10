/**
 * Phase 7 — documents against the real database and storage (no AI calls).
 * Uses the made-up sample PDFs from `node scripts/make-sample-docs.mjs`.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase, deleteCase, getCase } from "@/modules/cases/repository";
import { getOrCreateConversation } from "@/modules/conversation/service";
import {
  deleteDocument,
  DocumentError,
  getDocument,
  listDocuments,
  loadDocumentFindings,
  loadEvidence,
  setEvidenceMark,
  uploadDocument,
} from "@/modules/documents/repository";
import { applyExtraction, confirmFact, loadCaseFacts } from "@/modules/facts/repository";
import { createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

const samplePdf = () => new Uint8Array(readFileSync(new URL("../fixtures/sample-promissory-note.pdf", import.meta.url)));

describe.skipIf(!hasSupabase)("Documents", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    a = await createTestUser("Docs Owner");
    b = await createTestUser("Docs Other");
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });
  const refresh = async (id: string) => (await getCase(a.client, id))!;

  it("stores an upload privately with a safe name; other users can't see the record or the file", async () => {
    const c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    const doc = await uploadDocument(a.client, c, { bytes: samplePdf(), name: "../secret/Loan note.PDF" });
    expect(doc).toMatchObject({ original_filename: "Loan note.PDF", mime_type: "application/pdf", extraction_status: "pending", document_type: "unknown" });

    const full = await getDocument(a.client, c.id, doc.id);
    expect(full!.storage_path).toMatch(new RegExp(`^${a.id}/${c.id}/[0-9a-f-]{36}\\.pdf$`));
    const own = await a.client.storage.from("case-documents").download(full!.storage_path);
    expect(own.error).toBeNull();

    expect(await listDocuments(b.client, c.id)).toEqual([]);
    const theirs = await b.client.storage.from("case-documents").download(full!.storage_path);
    expect(theirs.data).toBeNull();
    const signed = await b.client.storage.from("case-documents").createSignedUrl(full!.storage_path, 60);
    expect(signed.data).toBeNull();
    // Another user can't upload into this case either
    await expect(uploadDocument(b.client, c, { bytes: samplePdf(), name: "x.pdf" })).rejects.toThrow();

    await deleteCase(a.client, c.id);
  });

  it("rejects files that are not really PDF/JPG/PNG, whatever their name", async () => {
    const c = await createCase(a.client, { state: "AP", lender_type: "individual" });
    const fake = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    await expect(uploadDocument(a.client, c, { bytes: fake, name: "note.pdf" })).rejects.toBeInstanceOf(DocumentError);
    expect(await listDocuments(a.client, c.id)).toHaveLength(0);
    await deleteCase(a.client, c.id);
  });

  it("adds document details as unverified, links proof to a repayment already mentioned, and cleans up on delete", async () => {
    let c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    const conv = await getOrCreateConversation(a.client, c.id);
    const msg = await a.client.from("messages").insert({ conversation_id: conv, role: "user", content: "test" }).select("id").single();

    // From chat: a repayment and the lender's demand (the borrower then confirms the demand)
    await applyExtraction(a.client, c, msg.data!.id, {
      facts: [{ field: "lender_demand", kind: "value", value: 95000, approximate: false, confidence: 0.9, quote: "he wants 95,000" }],
      repayments: [{ amount: 20000, date: "2024-06-10", approximate: false, method: "cash", quote: "paid 20,000" }],
      charges: [],
    });
    c = await refresh(c.id);
    await confirmFact(a.client, c, "lender_demand");

    const doc = await uploadDocument(a.client, c, { bytes: samplePdf(), name: "note.pdf" });
    await a.client.from("documents").update({ document_type: "promissory_note", extraction_status: "completed" }).eq("id", doc.id);
    c = await refresh(c.id);
    const changed = await applyExtraction(a.client, c, { documentId: doc.id }, {
      facts: [
        { field: "principal_amount", kind: "value", value: 80000, approximate: false, confidence: 0.9, quote: "Rs. 80,000" },
        { field: "lender_demand", kind: "value", value: 99000, approximate: false, confidence: 0.9, quote: "Rs. 99,000" },
      ],
      repayments: [
        { amount: 20000, date: "2024-06-10", approximate: false, method: "cash", quote: "Rs. 20,000 ... 10/06/2024" },
        { amount: 5000, date: "2024-07-10", approximate: false, method: "cash", quote: "Rs. 5,000" },
      ],
      charges: [],
    });
    expect(changed).toBe(3); // principal, disputed demand, new repayment (the duplicate only gets linked)

    let facts = await loadCaseFacts(a.client, c.id);
    expect(facts.facts.principal_amount).toMatchObject({ value: 80000, status: "unverified", sourceType: "uploaded_document" });
    // A document never silently overrides what the borrower confirmed
    expect(facts.facts.lender_demand).toMatchObject({ value: 99000, status: "disputed", previousConfirmed: 95000 });
    const linked = facts.repayments.find((r) => r.amount === 20000)!;
    expect(linked).toMatchObject({ source_type: "user_statement", evidence_document_id: doc.id });
    expect(facts.repayments.find((r) => r.amount === 5000)).toMatchObject({ source_type: "uploaded_document", confirmation_status: "unverified" });

    const findings = (await loadDocumentFindings(a.client, c.id))[doc.id];
    expect(findings.map((f) => f.label)).toEqual(
      expect.arrayContaining(["Amount borrowed (principal)", "Repayment", "Proof of a repayment you mentioned"]),
    );

    // Checklist: the uploaded note + the borrower's own answer
    await setEvidenceMark(a.client, c, "lender_demand", "missing");
    const { checklist } = await loadEvidence(a.client, c.id);
    expect(checklist.find((i) => i.key === "loan_agreement")!.status).toBe("uploaded");
    expect(checklist.find((i) => i.key === "lender_demand")!.status).toBe("dont_have");
    await setEvidenceMark(a.client, c, "lender_demand", null);
    expect((await loadEvidence(a.client, c.id)).checklist.find((i) => i.key === "lender_demand")!.status).toBe("not_checked");

    // Confirm the principal, then delete the document
    c = await refresh(c.id);
    await confirmFact(a.client, c, "principal_amount");
    const path = (await getDocument(a.client, c.id, doc.id))!.storage_path;
    await deleteDocument(a.client, await refresh(c.id), doc.id);

    facts = await loadCaseFacts(a.client, c.id);
    expect(facts.facts.principal_amount).toMatchObject({ value: 80000, status: "confirmed" }); // borrower vouched: kept
    expect(facts.facts.lender_demand).toMatchObject({ value: 95000, status: "confirmed" }); // unchecked dispute removed
    expect(facts.repayments.map((r) => r.amount)).toEqual([20000]); // unchecked document repayment removed
    expect(facts.repayments[0].evidence_document_id).toBeNull(); // chat repayment kept, link cleared
    expect(await listDocuments(a.client, c.id)).toHaveLength(0);
    const gone = await a.client.storage.from("case-documents").download(path);
    expect(gone.data).toBeNull();

    await deleteCase(a.client, c.id);
  });

  it("deleting a case removes its uploaded files", async () => {
    const c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    const doc = await uploadDocument(a.client, c, { bytes: samplePdf(), name: "n.pdf" });
    const path = (await getDocument(a.client, c.id, doc.id))!.storage_path;
    expect(await deleteCase(a.client, c.id)).toBe(true);
    const gone = await a.client.storage.from("case-documents").download(path);
    expect(gone.data).toBeNull();
  });
});
