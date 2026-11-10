// Loads legal-corpus/*.json into the legal knowledge base (Phase 10).
// Usage: npm run legal:ingest              (validate, store as PENDING, embed)
//        npm run legal:ingest -- --dry-run (validate and show chunks only; no network)
// New or changed sources are never searchable until a person verifies them:
//        npm run legal:verify -- <slug> --by "Your Name"
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY in .env.local.
import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chunkEntry, contentHash, validateCorpusEntry } from "./lib/legal-corpus.mjs";

const DRY = process.argv.includes("--dry-run");
const DIR = new URL("../legal-corpus/", import.meta.url);
const DIMS = 1536;
const MODEL = (process.env.GEMINI_EMBEDDING_MODEL ?? "").trim() || "gemini-embedding-2";

const entries = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: f, data: JSON.parse(readFileSync(new URL(f, DIR), "utf8")) }));

let bad = 0;
for (const { file, data } of entries) {
  const errors = validateCorpusEntry(data);
  if (errors.length) {
    bad++;
    console.error(`✗ ${file}:\n  - ${errors.join("\n  - ")}`);
  }
}
if (bad) process.exit(1);
console.log(`${entries.length} source file(s) valid.`);

if (DRY) {
  for (const { data } of entries) {
    const chunks = chunkEntry(data);
    console.log(`- ${data.slug}: ${data.sections.length} sections → ${chunks.length} chunks, hash ${contentHash(data).slice(0, 12)}…`);
  }
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY?.trim();
if (!url || !serviceKey || !geminiKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY in .env.local.");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function embedAll(texts, title) {
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`, {
        method: "POST",
        headers: { "x-goog-api-key": geminiKey, "content-type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_DOCUMENT",
            title,
            outputDimensionality: DIMS,
          })),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        for (const e of json.embeddings) {
          if (e.values?.length !== DIMS) throw new Error(`Unexpected embedding size ${e.values?.length}`);
          out.push(e.values);
        }
        break;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        console.warn(`  embedding busy (${res.status}); waiting ${attempt * 20}s…`);
        await new Promise((r) => setTimeout(r, attempt * 20_000));
        continue;
      }
      throw new Error(`Embedding failed: HTTP ${res.status} ${await res.text()}`);
    }
  }
  return out;
}

const must = (res, where) => {
  if (res.error) throw new Error(`${where}: ${res.error.message}`);
  return res.data;
};

for (const { data: e } of entries) {
  const hash = contentHash(e);
  const existing = must(
    await db.from("legal_sources").select("id, content_hash, verification_status").eq("source_url", e.source_url).maybeSingle(),
    "lookup",
  );
  const { count: embedded } = existing
    ? await db.from("legal_chunks").select("id", { count: "exact", head: true }).eq("source_id", existing.id).not("embedding", "is", null)
    : { count: 0 };
  const chunks = chunkEntry(e);
  if (existing && existing.content_hash === hash && embedded === chunks.length) {
    console.log(`= ${e.slug}: unchanged (${existing.verification_status})`);
    continue;
  }

  const row = {
    title: e.title,
    short_title: e.short_title ?? null,
    jurisdiction: e.jurisdiction,
    source_url: e.source_url,
    issuing_authority: e.issuing_authority,
    document_type: e.document_type,
    act_year: e.act_year ?? null,
    publication_date: e.publication_date ?? null,
    effective_from: e.effective_from ?? null,
    effective_until: e.effective_until ?? null,
    document_version: e.document_version,
    content_hash: hash,
  };
  let sourceId;
  if (existing) {
    // Changed text must be checked again by a person before it can be searched.
    const changed = existing.content_hash !== hash;
    must(
      await db
        .from("legal_sources")
        .update({ ...row, ...(changed ? { verification_status: "needs_review", verification_notes: "Text changed since last verification." } : {}) })
        .eq("id", existing.id),
      "update source",
    );
    sourceId = existing.id;
    must(await db.from("legal_chunks").delete().eq("source_id", sourceId), "clear chunks");
    must(await db.from("legal_source_applicability").delete().eq("source_id", sourceId), "clear applicability");
  } else {
    sourceId = must(await db.from("legal_sources").insert({ ...row, verification_status: "pending" }).select("id").single(), "insert source").id;
  }

  must(
    await db.from("legal_source_applicability").insert(e.applicability.map((a) => ({ source_id: sourceId, state: a.state, lender_type: a.lender_type, notes: a.notes ?? null }))),
    "insert applicability",
  );
  const vectors = await embedAll(chunks.map((c) => c.content), e.title);
  must(
    await db.from("legal_chunks").insert(
      chunks.map((c, i) => ({
        source_id: sourceId,
        chunk_index: c.chunk_index,
        section_reference: c.section_reference,
        content: c.content,
        embedding: JSON.stringify(vectors[i]),
        metadata: { slug: e.slug, retrieved_on: e.retrieved_on, embedding_model: MODEL },
      })),
    ),
    "insert chunks",
  );
  console.log(`✓ ${e.slug}: ${chunks.length} chunks stored (${existing ? "updated" : "new"}; not searchable until verified)`);
}
console.log("Done. Verify each source after comparing it with the official text: npm run legal:verify -- --list");
