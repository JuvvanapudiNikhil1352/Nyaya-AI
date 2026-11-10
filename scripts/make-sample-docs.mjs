// Creates MADE-UP sample documents for testing document upload (Phase 7).
// Usage: node scripts/make-sample-docs.mjs
// Output: tests/fixtures/sample-*.pdf  (all names and numbers are fictional)
import { mkdirSync, writeFileSync } from "node:fs";

const SAMPLES = {
  "sample-promissory-note.pdf": [
    "PROMISSORY NOTE",
    "",
    "Date: 05/03/2024                Place: Warangal, Telangana",
    "",
    "I, K. Ravi Kumar, have received a loan of Rs. 80,000 (Rupees Eighty",
    "Thousand only) in cash from Sri P. Suresh today.",
    "",
    "I agree to pay interest at 3% per month on this amount.",
    "I promise to repay the full amount on demand.",
    "",
    "Signature of borrower: K. Ravi Kumar",
    "Witness: M. Lakshmi",
    "",
    "(SAMPLE DOCUMENT FOR TESTING - ALL DETAILS ARE FICTIONAL)",
  ],
  "sample-receipt.pdf": [
    "PAYMENT RECEIPT",
    "",
    "Received from K. Ravi Kumar the sum of Rs. 20,000 (Rupees Twenty",
    "Thousand only) in cash on 10/06/2024 towards the loan given on",
    "05/03/2024.",
    "",
    "Received by: P. Suresh",
    "",
    "(SAMPLE DOCUMENT FOR TESTING - ALL DETAILS ARE FICTIONAL)",
  ],
  "sample-unrelated.pdf": [
    "GROCERY LIST",
    "",
    "Rice 10 kg, Toor dal 2 kg, Oil 1 litre, Onions, Tomatoes",
    "",
    "(SAMPLE DOCUMENT FOR TESTING)",
  ],
};

/** Builds a one-page PDF with plain text (Helvetica). */
function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const text = lines.map((l, i) => `${i === 0 ? "" : "T* "}(${esc(l)}) Tj`).join("\n");
  const stream = `BT\n/F1 12 Tf\n16 TL\n60 760 Td\n${text}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const dir = new URL("../tests/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, lines] of Object.entries(SAMPLES)) {
  writeFileSync(new URL(name, dir), makePdf(lines));
  console.log(`wrote tests/fixtures/${name}`);
}
