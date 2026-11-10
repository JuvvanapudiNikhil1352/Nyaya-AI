import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Plain JavaScript helper shared with the ingestion script.
import { chunkEntry, contentHash, MAX_CHUNK_CHARS, splitText, validateCorpusEntry } from "../../scripts/lib/legal-corpus.mjs";
import { lenderTypeForSearch } from "@/modules/legal-rag/search";

const valid = {
  slug: "test-act",
  title: "The Test Act, 2000",
  jurisdiction: "TG",
  source_url: "https://www.indiacode.nic.in/x.pdf",
  issuing_authority: "Test",
  document_type: "act",
  document_version: "v1",
  retrieved_on: "2026-11-11",
  applicability: [{ state: "TG", lender_type: "individual" }],
  sections: [{ ref: "Section 1", heading: "Short title", text: "This Act may be called the Test Act." }],
};

describe("corpus validation", () => {
  it("accepts a complete entry from an official site", () => {
    expect(validateCorpusEntry(valid)).toEqual([]);
  });
  it("rejects non-government sources, wrong states and missing text", () => {
    expect(validateCorpusEntry({ ...valid, source_url: "https://indiankanoon.org/doc/1/" }).join()).toMatch(/official government site/);
    expect(validateCorpusEntry({ ...valid, source_url: "http://indiacode.nic.in/x.pdf" }).join()).toMatch(/https/);
    expect(validateCorpusEntry({ ...valid, applicability: [{ state: "AP", lender_type: "individual" }] }).join()).toMatch(/TG law can only apply in TG/);
    expect(validateCorpusEntry({ ...valid, sections: [{ ref: "Section 1", text: " " }] }).join()).toMatch(/text is required/);
  });
  it("every file in legal-corpus/ is valid", () => {
    const dir = new URL("../../legal-corpus/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const e = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
      expect({ file: f, errors: validateCorpusEntry(e) }).toEqual({ file: f, errors: [] });
      expect(`${e.slug}.json`).toBe(f);
    }
  });
});

describe("chunking", () => {
  it("makes one chunk per section, each citable on its own", () => {
    const chunks = chunkEntry(valid);
    expect(chunks).toEqual([{ chunk_index: 0, section_reference: "Section 1", content: "The Test Act, 2000 — Section 1: Short title\n\nThis Act may be called the Test Act." }]);
  });
  it("splits long sections at paragraph boundaries and labels the parts", () => {
    const long = Array.from({ length: 12 }, (_, i) => `(${i + 1}) ${"word ".repeat(80)}`).join("\n");
    const chunks = chunkEntry({ ...valid, sections: [{ ref: "Section 3", text: long }] });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(chunks[0].section_reference).toBe(`Section 3 (part 1 of ${chunks.length})`);
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    expect(words(chunks.map((c) => c.content.split("\n\n")[1]).join("\n"))).toEqual(words(long)); // no word lost or changed
    expect(splitText("short", 100)).toEqual(["short"]);
  });
  it("changes the hash when any text changes", () => {
    const changed = { ...valid, sections: [{ ...valid.sections[0], text: "This Act may be called the Test Act!" }] };
    expect(contentHash(valid)).not.toBe(contentHash(changed));
    expect(contentHash(valid)).toBe(contentHash({ ...valid }));
  });
});

describe("search scope", () => {
  it("searches informal lenders as individuals", () => {
    expect(lenderTypeForSearch("individual")).toBe("individual");
    expect(lenderTypeForSearch("unsure")).toBe("individual");
    expect(lenderTypeForSearch(null)).toBe("individual");
  });
});
