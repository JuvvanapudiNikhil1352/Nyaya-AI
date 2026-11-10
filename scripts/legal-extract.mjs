// Copies sections VERBATIM from an official Act PDF (or its .txt) into the
// "sections" format used by legal-corpus/*.json. Nothing is retyped by hand.
// Usage: node scripts/legal-extract.mjs <file.pdf|file.txt> --sections 1,2,3 [--after "CHAPTER IV"] [--into legal-corpus/x.json]
// Removes only: page numbers, and the amendment footnotes printed at page
// bottoms (e.g. "1. Subs. by Act 37 of 2002 ..."). Output: JSON on stdout.
// Always compare the result with the PDF before verifying the source.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [file, ...rest] = process.argv.slice(2);
const opt = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : undefined);
const wanted = (opt("--sections") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!file || wanted.length === 0) {
  console.error("Usage: node scripts/legal-extract.mjs <file.pdf|file.txt> --sections 12,13 [--after \"CHAPTER IV\"]");
  process.exit(1);
}

const raw = file.toLowerCase().endsWith(".pdf") ? execFileSync("pdftotext", [file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) : readFileSync(file, "utf8");

const FOOTNOTE = /^\d+\.\s+(The words|The word|Subs\.|Ins\.|Omitted|Rep\.|Added|Cl\.|It has been|Renumbered|Certain words|The original|Now see|See |Clause|Sub-section|Section \d+ (was|of)|Vide )/;
let lines = raw
  .replace(/\f/g, "\n")
  .split(/\r?\n/)
  .map((l) => l.replace(/\s+/g, " ").trim())
  .filter((l) => l && !/^\d{1,4}$/.test(l) && !/^[_-]+$/.test(l));
// Drop footnote paragraphs (a footnote line and any continuation lines until the next non-footnote marker).
const out = [];
let inFoot = false;
for (const l of lines) {
  if (FOOTNOTE.test(l)) { inFoot = true; continue; }
  if (inFoot && (/^\d+\.\s/.test(l) && FOOTNOTE.test(l))) continue;
  if (inFoot && /^(\(|\d+\[|[A-Z]|\d+\.\s+[A-Z“"])/.test(l) && !/^\d+\.\s+(Subs|Ins|Omitted|Rep)/.test(l)) inFoot = false;
  if (!inFoot) out.push(l);
}
lines = out;

const after = opt("--after");
let startAt = 0;
if (after) {
  startAt = lines.findIndex((l) => l.includes(after));
  if (startAt < 0) { console.error(`--after text not found: ${after}`); process.exit(1); }
}

// A section starts like: "12. Criteria for giving legal services.--Every person ..."
const START = /^(\d+[A-Z]?)\.\s+(.{2,200}?)\.\s?(--|—|–)\s?(.*)$/;
const sections = [];
for (const n of wanted) {
  const i = lines.findIndex((l, idx) => idx >= startAt && START.test(l) && l.match(START)[1] === n);
  if (i < 0) { console.error(`Section ${n} not found`); process.exit(1); }
  const m = lines[i].match(START);
  const body = [m[4]];
  for (let j = i + 1; j < lines.length; j++) {
    const s = lines[j].match(START);
    if (s && s[1] !== n) break;
    if (/^CHAPTER [IVXLC]+\b/.test(lines[j])) break;
    body.push(lines[j]);
  }
  sections.push({ ref: `Section ${n}`, heading: m[2].trim(), text: body.join("\n").trim() });
}
const into = opt("--into");
if (into) {
  // Fill the "sections" of a corpus file whose metadata was written by hand.
  const entry = JSON.parse(readFileSync(into, "utf8"));
  entry.sections = sections;
  writeFileSync(into, JSON.stringify(entry, null, 2) + "\n");
  console.error(`Wrote ${sections.length} sections into ${into}`);
} else {
  console.log(JSON.stringify(sections, null, 2));
}
