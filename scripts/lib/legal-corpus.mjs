// Pure helpers for the legal corpus (legal-corpus/*.json). Used by the
// ingestion script and unit tests. No network or database access here.
import { createHash } from "node:crypto";

const JURISDICTIONS = ["IN", "AP", "TG"];
const STATES = ["AP", "TG"];
const LENDER_TYPES = ["individual", "pawnbroker", "mfi", "bank", "nbfc", "any"];
const DOC_TYPES = ["act", "rules", "amendment", "notification", "order", "guidance"];
// Official government sources only.
const OFFICIAL_HOSTS = [/(^|\.)indiacode\.nic\.in$/, /(^|\.)gov\.in$/, /(^|\.)nic\.in$/, /(^|\.)egazette\.gov\.in$/];

export const MAX_CHUNK_CHARS = 3000;

/** Returns a list of problems; empty means the entry is valid. */
export function validateCorpusEntry(e) {
  const errors = [];
  const req = (k) => (typeof e?.[k] === "string" && e[k].trim() ? null : errors.push(`${k} is required`));
  ["slug", "title", "jurisdiction", "source_url", "issuing_authority", "document_type", "document_version", "retrieved_on"].forEach(req);
  if (e?.slug && !/^[a-z0-9-]{3,80}$/.test(e.slug)) errors.push("slug must be lower-case letters, digits and dashes");
  if (e?.jurisdiction && !JURISDICTIONS.includes(e.jurisdiction)) errors.push("jurisdiction must be IN, AP or TG");
  if (e?.document_type && !DOC_TYPES.includes(e.document_type)) errors.push("invalid document_type");
  if (e?.source_url) {
    try {
      const u = new URL(e.source_url);
      if (u.protocol !== "https:") errors.push("source_url must be https");
      else if (!OFFICIAL_HOSTS.some((h) => h.test(u.hostname))) errors.push(`source_url must be an official government site (got ${u.hostname})`);
    } catch {
      errors.push("source_url is not a valid URL");
    }
  }
  if (!Array.isArray(e?.applicability) || e.applicability.length === 0) errors.push("applicability needs at least one {state, lender_type}");
  else
    for (const a of e.applicability) {
      if (!STATES.includes(a?.state)) errors.push(`applicability state must be AP or TG (got ${a?.state})`);
      if (!LENDER_TYPES.includes(a?.lender_type)) errors.push(`invalid applicability lender_type ${a?.lender_type}`);
    }
  if (e?.jurisdiction === "AP" && e.applicability?.some((a) => a.state !== "AP")) errors.push("an AP law can only apply in AP");
  if (e?.jurisdiction === "TG" && e.applicability?.some((a) => a.state !== "TG")) errors.push("a TG law can only apply in TG");
  if (!Array.isArray(e?.sections) || e.sections.length === 0) errors.push("sections are required");
  else
    e.sections.forEach((s, i) => {
      if (!s?.ref?.trim()) errors.push(`sections[${i}].ref is required`);
      if (!s?.text?.trim()) errors.push(`sections[${i}].text is required`);
    });
  return errors;
}

/** sha256 of the exact stored text, so any later change to the text is detected. */
export function contentHash(e) {
  const body = e.sections.map((s) => `${s.ref}\n${s.heading ?? ""}\n${s.text}`).join("\n\n");
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * One chunk per section; long sections are split at paragraph boundaries
 * (never mid-sentence where avoidable). Each chunk carries its section ref and
 * a header with the Act's title, so a retrieved passage is always citable.
 */
export function chunkEntry(e, max = MAX_CHUNK_CHARS) {
  const chunks = [];
  for (const s of e.sections) {
    const header = `${e.short_title || e.title} — ${s.ref}${s.heading ? `: ${s.heading}` : ""}`;
    const parts = splitText(s.text.trim(), max - header.length - 4);
    parts.forEach((p, i) => {
      chunks.push({
        chunk_index: chunks.length,
        section_reference: parts.length > 1 ? `${s.ref} (part ${i + 1} of ${parts.length})` : s.ref,
        content: `${header}\n\n${p}`,
      });
    });
  }
  return chunks;
}

export function splitText(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let cur = "";
  const pieces = text.split(/\n{1,}/).flatMap((para) => (para.length <= max ? [para] : para.match(new RegExp(`[^.;]{1,${max}}[.;]?\\s*`, "g")) ?? [para]));
  for (const p of pieces) {
    if (cur && cur.length + p.length + 1 > max) {
      out.push(cur.trim());
      cur = "";
    }
    cur += (cur ? "\n" : "") + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
