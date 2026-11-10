/**
 * Phase 3 — database security tests against the real Supabase project.
 * Two throwaway users (A and B) are created; B must never see or change A's data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

describe.skipIf(!hasSupabase)("Row Level Security", () => {
  let a: TestUser;
  let b: TestUser;
  let caseA: string;

  beforeAll(async () => {
    a = await createTestUser("Alice Test");
    b = await createTestUser("Bob Test");
    const { data, error } = await a.client
      .from("cases")
      .insert({ case_title: "A's loan", state: "TG", lender_type: "individual" })
      .select("id")
      .single();
    if (error) throw error;
    caseA = data.id;
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  it("creates a profile automatically on signup, with the name from signup", async () => {
    const { data } = await a.client.from("profiles").select("id, full_name, preferred_language").single();
    expect(data).toMatchObject({ id: a.id, full_name: "Alice Test", preferred_language: "en" });
  });

  it("user sees only their own profile", async () => {
    const { data } = await b.client.from("profiles").select("id");
    expect(data?.map((p) => p.id)).toEqual([b.id]);
  });

  it("sets user_id automatically and owner can read the case", async () => {
    const { data } = await a.client.from("cases").select("id, user_id, case_status").eq("id", caseA).single();
    expect(data).toMatchObject({ id: caseA, user_id: a.id, case_status: "intake" });
  });

  it("another user cannot read, update or delete the case", async () => {
    const read = await b.client.from("cases").select("id").eq("id", caseA);
    expect(read.data).toEqual([]);

    const upd = await b.client.from("cases").update({ case_title: "hacked" }).eq("id", caseA).select();
    expect(upd.data ?? []).toEqual([]);

    const del = await b.client.from("cases").delete().eq("id", caseA).select();
    expect(del.data ?? []).toEqual([]);

    const check = await a.client.from("cases").select("case_title").eq("id", caseA).single();
    expect(check.data?.case_title).toBe("A's loan");
  });

  it("cannot create a case on behalf of another user", async () => {
    const { error } = await b.client.from("cases").insert({ case_title: "spoof", user_id: a.id });
    expect(error).not.toBeNull();
  });

  it("logged-out visitors cannot read any case data", async () => {
    const { data, error } = await anonClient().from("cases").select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("child records (loan details, repayments) are private to the case owner", async () => {
    const ld = await a.client
      .from("loan_details")
      .insert({ case_id: caseA, principal_amount: 80000, interest_rate: 3, rate_period: "monthly" })
      .select("principal_amount")
      .single();
    expect(ld.error).toBeNull();
    expect(Number(ld.data?.principal_amount)).toBe(80000);

    const rp = await a.client
      .from("repayments")
      .insert({ case_id: caseA, amount: 10000, repayment_date: "2025-01-15" });
    expect(rp.error).toBeNull();

    expect((await b.client.from("loan_details").select("id").eq("case_id", caseA)).data).toEqual([]);
    expect((await b.client.from("repayments").select("id").eq("case_id", caseA)).data).toEqual([]);

    const inject = await b.client.from("repayments").insert({ case_id: caseA, amount: 1 });
    expect(inject.error).not.toBeNull();
  });

  it("rejects invalid values (negative money, unknown status)", async () => {
    const neg = await a.client.from("repayments").insert({ case_id: caseA, amount: -5 });
    expect(neg.error).not.toBeNull();
    const badStatus = await a.client.from("cases").update({ case_status: "won" }).eq("id", caseA);
    expect(badStatus.error).not.toBeNull();
  });

  it("records changes to loan facts in the audit log, visible only to the owner", async () => {
    await a.client.from("loan_details").update({ interest_rate: 2.5 }).eq("case_id", caseA);
    const { data } = await a.client
      .from("audit_log")
      .select("table_name, action, old_data, new_data")
      .eq("case_id", caseA)
      .eq("table_name", "loan_details")
      .eq("action", "update");
    expect(data?.length).toBe(1);
    expect(Number(data![0].old_data.interest_rate)).toBe(3);
    expect(Number(data![0].new_data.interest_rate)).toBe(2.5);

    expect((await b.client.from("audit_log").select("id").eq("case_id", caseA)).data).toEqual([]);
  });

  it("messages cannot be edited after they are sent", async () => {
    const conv = await a.client.from("conversations").insert({ case_id: caseA }).select("id").single();
    expect(conv.error).toBeNull();
    const msg = await a.client
      .from("messages")
      .insert({ conversation_id: conv.data!.id, role: "user", content: "original" })
      .select("id")
      .single();
    expect(msg.error).toBeNull();
    await a.client.from("messages").update({ content: "edited" }).eq("id", msg.data!.id);
    const after = await a.client.from("messages").select("content").eq("id", msg.data!.id).single();
    expect(after.data?.content).toBe("original");
    expect((await b.client.from("messages").select("id").eq("conversation_id", conv.data!.id)).data).toEqual([]);
  });

  it("rate limiter allows up to the limit, then refuses", async () => {
    const bucket = `test-${Date.now()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const { data, error } = await a.client.rpc("consume_rate_limit", {
        p_bucket: bucket, p_max: 2, p_window_seconds: 60,
      });
      expect(error).toBeNull();
      results.push(data as boolean);
    }
    expect(results).toEqual([true, true, false]);
  });

  it("private storage: owner can upload/read; others and wrong paths are blocked", async () => {
    const path = `${a.id}/${caseA}/test.pdf`;
    const file = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });

    const up = await a.client.storage.from("case-documents").upload(path, file, { contentType: "application/pdf" });
    expect(up.error).toBeNull();

    const own = await a.client.storage.from("case-documents").download(path);
    expect(own.error).toBeNull();

    const other = await b.client.storage.from("case-documents").download(path);
    expect(other.error).not.toBeNull();

    // B tries to write into A's case folder, and into a path with no case folder
    const intoA = await b.client.storage.from("case-documents").upload(`${b.id}/${caseA}/x.pdf`, file, { contentType: "application/pdf" });
    expect(intoA.error).not.toBeNull();
    const badPath = await a.client.storage.from("case-documents").upload(`${a.id}/not-a-uuid/x.pdf`, file, { contentType: "application/pdf" });
    expect(badPath.error).not.toBeNull();

    // Disallowed file type
    const exe = await a.client.storage.from("case-documents")
      .upload(`${a.id}/${caseA}/x.exe`, new Blob(["MZ"], { type: "application/x-msdownload" }), { contentType: "application/x-msdownload" });
    expect(exe.error).not.toBeNull();

    // The bucket is private: no public URL access
    const pub = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/case-documents/${path}`);
    expect(pub.ok).toBe(false);

    await a.client.storage.from("case-documents").remove([path]);
  });

  it("deleting a single repayment is recorded in the audit log", async () => {
    const { data: r } = await a.client
      .from("repayments")
      .insert({ case_id: caseA, amount: 555 })
      .select("id")
      .single();
    await a.client.from("repayments").delete().eq("id", r!.id);
    const { data } = await a.client
      .from("audit_log")
      .select("action, old_data")
      .eq("record_id", r!.id)
      .eq("action", "delete");
    expect(data?.length).toBe(1);
    expect(Number(data![0].old_data.amount)).toBe(555);
  });

  it("deleting a case removes all its records and its audit history", async () => {
    const { data: c } = await a.client.from("cases").insert({ case_title: "to delete" }).select("id").single();
    await a.client.from("loan_details").insert({ case_id: c!.id, principal_amount: 1000 });
    await a.client.from("repayments").insert({ case_id: c!.id, amount: 100 });

    const del = await a.client.from("cases").delete().eq("id", c!.id);
    expect(del.error).toBeNull();

    const admin = adminClient();
    expect((await admin.from("loan_details").select("id").eq("case_id", c!.id)).data).toEqual([]);
    expect((await admin.from("repayments").select("id").eq("case_id", c!.id)).data).toEqual([]);
    expect((await admin.from("audit_log").select("id").eq("case_id", c!.id)).data).toEqual([]);
  });
});

describe.skipIf(!hasSupabase)("Legal knowledge base access", () => {
  let user: TestUser;
  const admin = hasSupabase ? adminClient() : (null as never);
  const sourceIds: string[] = [];
  const vec = (x: number) => `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? x : 0)).join(",")}]`;

  async function addSource(title: string, status: "verified" | "pending", state: "AP" | "TG") {
    const { data, error } = await admin
      .from("legal_sources")
      .insert({
        title, jurisdiction: state, source_url: "https://example.invalid/test",
        issuing_authority: "TEST", document_type: "act", document_version: "test",
        verification_status: status,
        ...(status === "verified" ? { verified_by: "integration-test", verified_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();
    if (error) throw error;
    sourceIds.push(data.id);
    await admin.from("legal_source_applicability").insert({ source_id: data.id, state, lender_type: "individual" });
    await admin.from("legal_chunks").insert({ source_id: data.id, chunk_index: 0, content: `TEST CHUNK ${title}`, embedding: vec(1) });
    return data.id;
  }

  beforeAll(async () => {
    user = await createTestUser();
    await addSource("TEST verified TG", "verified", "TG");
    await addSource("TEST pending TG", "pending", "TG");
    await addSource("TEST verified AP", "verified", "AP");
  });

  afterAll(async () => {
    if (sourceIds.length) await admin.from("legal_sources").delete().in("id", sourceIds);
    await deleteTestUser(user);
  });

  it("users cannot see unverified sources", async () => {
    const { data } = await user.client.from("legal_sources").select("title").like("title", "TEST %");
    const titles = (data ?? []).map((r) => r.title).sort();
    expect(titles).toEqual(["TEST verified AP", "TEST verified TG"]);
  });

  it("users cannot write to the legal knowledge base", async () => {
    const { error } = await user.client.from("legal_sources").insert({
      title: "fake", jurisdiction: "TG", source_url: "https://x.invalid", issuing_authority: "x",
      document_type: "act", document_version: "x",
    });
    expect(error).not.toBeNull();
  });

  it("search returns only verified sources for the case's state (Telangana)", async () => {
    const { data, error } = await user.client.rpc("match_legal_chunks", {
      query_embedding: vec(1), p_state: "TG", p_lender_type: "individual", match_count: 20, min_similarity: 0.5,
    });
    expect(error).toBeNull();
    const titles = (data ?? []).map((r: { source_title: string }) => r.source_title).filter((t: string) => t.startsWith("TEST"));
    expect(titles).toEqual(["TEST verified TG"]);
  });

  it("search returns only verified sources for the case's state (Andhra Pradesh)", async () => {
    const { data } = await user.client.rpc("match_legal_chunks", {
      query_embedding: vec(1), p_state: "AP", p_lender_type: "individual", match_count: 20, min_similarity: 0.5,
    });
    const titles = (data ?? []).map((r: { source_title: string }) => r.source_title).filter((t: string) => t.startsWith("TEST"));
    expect(titles).toEqual(["TEST verified AP"]);
  });
});
