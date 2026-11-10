/**
 * Phase 10 — legal knowledge base rules against the real database (no AI calls).
 * Uses a stored chunk's own embedding as the query vector.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

describe.skipIf(!hasSupabase)("Legal knowledge base", () => {
  const admin = adminClient();
  let user: TestUser;
  let vector: string | null = null;
  let tempSourceId: string | null = null;

  beforeAll(async () => {
    user = await createTestUser("Legal KB Test");
    const { data } = await admin.from("legal_chunks").select("embedding").not("embedding", "is", null).limit(1).maybeSingle();
    vector = (data?.embedding as string | undefined) ?? null;
  });
  afterAll(async () => {
    if (tempSourceId) await admin.from("legal_sources").delete().eq("id", tempSourceId);
    await deleteTestUser(user);
  });

  const search = (state: string, lenderType = "individual") =>
    user.client.rpc("match_legal_chunks", { query_embedding: vector, p_state: state, p_lender_type: lenderType, match_count: 20, min_similarity: 0.99 });

  it("users can't write legal sources", async () => {
    const { error } = await user.client.from("legal_sources").insert({
      title: "Fake", jurisdiction: "IN", source_url: "https://example.gov.in/x", issuing_authority: "x", document_type: "act", document_version: "1",
    });
    expect(error).not.toBeNull();
  });

  it("a verified source is found only in the states it applies to; pending text never is", async (ctx) => {
    if (!vector) ctx.skip("Run npm run legal:ingest first");
    // A temporary VERIFIED copy that applies only in Telangana, with the same embedding
    const src = await admin
      .from("legal_sources")
      .insert({
        title: "Temporary verified test source", jurisdiction: "TG", source_url: `https://example.gov.in/test-${Date.now()}`,
        issuing_authority: "test", document_type: "act", document_version: "test", verification_status: "verified",
        verified_by: "integration test", verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    tempSourceId = src.data!.id;
    await admin.from("legal_source_applicability").insert({ source_id: tempSourceId, state: "TG", lender_type: "individual" });
    await admin.from("legal_chunks").insert({ source_id: tempSourceId, chunk_index: 0, section_reference: "Section 1", content: "test", embedding: vector });

    const tg = await search("TG");
    expect(tg.error).toBeNull();
    const titles = (tg.data ?? []).map((r: { source_title: string }) => r.source_title);
    expect(titles).toContain("Temporary verified test source");
    // The ingested (still pending) source with the identical vector is NOT returned
    const pendingTitles = (await admin.from("legal_sources").select("title").neq("verification_status", "verified")).data!.map((s) => s.title);
    for (const t of pendingTitles) expect(titles).not.toContain(t);

    const ap = await search("AP");
    expect((ap.data ?? []).map((r: { source_title: string }) => r.source_title)).not.toContain("Temporary verified test source");

    // Repealed sources disappear too
    await admin.from("legal_sources").update({ effective_until: "2000-01-01" }).eq("id", tempSourceId);
    expect(((await search("TG")).data ?? []).map((r: { source_title: string }) => r.source_title)).not.toContain("Temporary verified test source");
  });
});
