// Marks a legal source as VERIFIED by a named person, after they have
// compared the stored text with the official source (source_url).
// Only verified sources can be retrieved by the legal assistant.
//
// Usage: npm run legal:verify -- --list
//        npm run legal:verify -- <slug> --by "Your Name" [--notes "checked sections 3-12"]
//        npm run legal:verify -- <slug> --reject --by "Your Name" --notes "reason"
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { contentHash } from "./lib/legal-corpus.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (args.includes("--list")) {
  const { data, error } = await db.from("legal_sources").select("title, jurisdiction, verification_status, verified_by, source_url").order("jurisdiction");
  if (error) throw error;
  for (const s of data) console.log(`[${s.verification_status.padEnd(12)}] ${s.jurisdiction}  ${s.title}${s.verified_by ? `  (by ${s.verified_by})` : ""}\n               ${s.source_url}`);
  process.exit(0);
}

const slug = args.find((a) => !a.startsWith("--") && a !== opt("--by") && a !== opt("--notes"));
const by = opt("--by")?.trim();
if (!slug || !by) {
  console.error('Usage: npm run legal:verify -- <slug> --by "Your Name" [--notes "..."] [--reject]');
  process.exit(1);
}
const entry = JSON.parse(readFileSync(new URL(`../legal-corpus/${slug}.json`, import.meta.url), "utf8"));
const { data: src, error } = await db.from("legal_sources").select("id, content_hash, title").eq("source_url", entry.source_url).maybeSingle();
if (error) throw error;
if (!src) {
  console.error("Not ingested yet. Run: npm run legal:ingest");
  process.exit(1);
}
// You verify exactly the text you reviewed: the stored text must match the file.
if (src.content_hash !== contentHash(entry)) {
  console.error("The stored text differs from legal-corpus file. Run npm run legal:ingest first, then review again.");
  process.exit(1);
}
const reject = args.includes("--reject");
const { error: upd } = await db
  .from("legal_sources")
  .update({
    verification_status: reject ? "rejected" : "verified",
    verified_by: by,
    verified_at: new Date().toISOString(),
    verification_notes: opt("--notes") ?? `Compared with ${entry.source_url} (retrieved ${entry.retrieved_on}).`,
  })
  .eq("id", src.id);
if (upd) throw upd;
console.log(`${reject ? "Rejected" : "Verified"}: ${src.title} (by ${by})`);
