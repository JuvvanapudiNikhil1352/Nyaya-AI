/**
 * Phase 4 — case management against the real database, through the same
 * repository functions the pages and API use.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase, deleteCase, getCase, listCases, updateCase } from "@/modules/cases/repository";
import { adminClient, createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

describe.skipIf(!hasSupabase)("Case management", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser("Case Owner");
    b = await createTestUser("Other User");
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  it("creates a case with a default title and its conversation", async () => {
    const c = await createCase(a.client, { state: "AP", lender_type: "individual" });
    expect(c.case_title).toMatch(/^Loan dispute – /);
    expect(c.case_status).toBe("intake");
    expect(c.user_id).toBe(a.id);

    const { data: conv } = await a.client.from("conversations").select("id").eq("case_id", c.id);
    expect(conv?.length).toBe(1);
  });

  it("lists only the user's own cases, newest first, hiding closed ones by default", async () => {
    const first = await createCase(a.client, { state: "TG", lender_type: "unsure", case_title: "First" });
    const second = await createCase(a.client, { state: "TG", lender_type: "unsure", case_title: "Second" });
    await updateCase(a.client, first.id, { closed: true });

    const active = await listCases(a.client);
    expect(active.map((c) => c.id)).toContain(second.id);
    expect(active.map((c) => c.id)).not.toContain(first.id);

    const all = await listCases(a.client, { includeClosed: true });
    expect(all.map((c) => c.id)).toContain(first.id);

    expect(await listCases(b.client, { includeClosed: true })).toEqual([]);
  });

  it("updates details; closing and reopening change the status", async () => {
    const c = await createCase(a.client, { state: "AP", lender_type: "individual" });
    const renamed = await updateCase(a.client, c.id, { case_title: "Renamed", problem_description: "Details" });
    expect(renamed?.case_title).toBe("Renamed");
    expect(renamed?.problem_description).toBe("Details");

    expect((await updateCase(a.client, c.id, { closed: true }))?.case_status).toBe("closed");
    expect((await updateCase(a.client, c.id, { closed: false }))?.case_status).toBe("intake");
  });

  it("another user gets 'not found' for read, update and delete", async () => {
    const c = await createCase(a.client, { state: "AP", lender_type: "individual", case_title: "Private" });
    expect(await getCase(b.client, c.id)).toBeNull();
    expect(await updateCase(b.client, c.id, { case_title: "Hacked" })).toBeNull();
    expect(await deleteCase(b.client, c.id)).toBe(false);
    expect((await getCase(a.client, c.id))?.case_title).toBe("Private");
  });

  it("invalid ids return not found instead of a database error", async () => {
    expect(await getCase(a.client, "not-a-uuid")).toBeNull();
    expect(await deleteCase(a.client, "../../etc")).toBe(false);
  });

  it("deleting a case removes its records and uploaded files", async () => {
    const c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    const path = `${a.id}/${c.id}/receipt.pdf`;
    await a.client.storage.from("case-documents").upload(path, new Blob(["%PDF-1.4"], { type: "application/pdf" }), { contentType: "application/pdf" });
    await a.client.from("documents").insert({
      case_id: c.id, original_filename: "receipt.pdf", storage_path: path, mime_type: "application/pdf", size_bytes: 8,
    });

    expect(await deleteCase(a.client, c.id)).toBe(true);
    expect(await getCase(a.client, c.id)).toBeNull();

    const admin = adminClient();
    expect((await admin.from("documents").select("id").eq("case_id", c.id)).data).toEqual([]);
    const { data: files } = await admin.storage.from("case-documents").list(`${a.id}/${c.id}`);
    expect(files ?? []).toEqual([]);
  });
});
