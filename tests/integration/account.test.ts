/**
 * Phase 14 — account deletion removes the login, every row and every file.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deleteAccount } from "@/modules/account/delete-account";
import { createCase } from "@/modules/cases/repository";
import { getDocument, uploadDocument } from "@/modules/documents/repository";
import { setFactValue } from "@/modules/facts/repository";
import { adminClient, createTestUser, deleteTestUser, hasSupabase } from "./helpers";

describe.skipIf(!hasSupabase)("Account deletion", () => {
  it("removes files, rows and the login; other users are untouched", async () => {
    const admin = adminClient();
    const user = await createTestUser("Delete Me");
    const other = await createTestUser("Keep Me");
    try {
      const c = await createCase(user.client, { state: "AP", lender_type: "individual" });
      await setFactValue(user.client, c, "principal_amount", 50000, false);
      const pdf = new Uint8Array(readFileSync(new URL("../fixtures/sample-receipt.pdf", import.meta.url)));
      const doc = await uploadDocument(user.client, c, { bytes: pdf, name: "r.pdf" });
      const path = (await getDocument(user.client, c.id, doc.id))!.storage_path;
      const otherCase = await createCase(other.client, { state: "TG", lender_type: "individual" });

      await deleteAccount(user.client, admin, user.id);

      expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull();
      for (const table of ["profiles", "cases", "documents"] as const) {
        const col = table === "profiles" ? "id" : "user_id";
        expect((await admin.from(table).select("id").eq(col, user.id)).data).toEqual([]);
      }
      expect((await admin.from("extracted_facts").select("id").eq("case_id", c.id)).data).toEqual([]);
      expect((await admin.from("audit_log").select("id").eq("user_id", user.id)).data).toEqual([]);
      const file = await admin.storage.from("case-documents").download(path);
      expect(file.data).toBeNull();
      // The other user's data is untouched
      expect((await admin.from("cases").select("id").eq("id", otherCase.id)).data).toHaveLength(1);
    } finally {
      await deleteTestUser(other);
    }
  });
});
