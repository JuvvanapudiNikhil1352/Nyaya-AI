# Legal corpus

The laws Nyaya AI may quote. **The assistant can only retrieve a source after a person has verified it.**

## Rules

- Text comes **only from official government sites** (`*.gov.in`, `*.nic.in`, India Code). The validator rejects anything else.
- Text is copied **word for word** from the official PDF by `npm run legal:extract`. It is never retyped or summarised.
- Each file records the source URL, the date it was retrieved and a version note saying what is *not* included (for example, state amendments).
- The original PDF is kept in `raw/` so a reviewer can compare.

## Adding a law

1. Download the official PDF into `raw/`.
2. Create `<slug>.json` with the metadata and `"sections": []` (copy an existing file).
3. Fill the sections from the PDF:
   ```
   npm run legal:extract -- legal-corpus/raw/<file>.pdf --sections 3,4,9 --after "<text just before section 1>" --into legal-corpus/<slug>.json
   ```
4. Store it (pending, not searchable yet): `npm run legal:ingest`
5. **Review**: open the PDF and the JSON side by side and check every section.
6. Verify (records your name and the time):
   ```
   npm run legal:verify -- <slug> --by "Your Name"
   ```
   `npm run legal:verify -- --list` shows every source and its status.

If the text in a file changes later, ingestion sets the source back to `needs_review`, and it stops being searchable until it is verified again.

## Current sources

| File | Sections | Status |
|---|---|---|
| `usurious-loans-act-1918.json` | 1–4 (court may re-open loans with excessive interest) | pending review |
| `legal-services-authorities-act-1987.json` | 12–13 (who gets free legal aid) | pending review |

## Still needed (official PDFs must be downloaded in a browser; India Code blocks automated downloads)

- Telangana Money Lenders Act, 1349 Fasli (India Code)
- Indian Contract Act, 1872, sections 16, 19A, 23, 74 (India Code)
- Bharatiya Nyaya Sanhita, 2023, sections 308 and 351 (India Code, Act 45 of 2023)
- Andhra Pradesh money-lending law currently in force: **not yet confirmed** which Act applies. Don't add one until that is checked.
