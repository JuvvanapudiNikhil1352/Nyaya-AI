# NYAYA AI — Project Status

_Last updated: 2026-11-11_

Phase order follows the original specification. The financial engine stays at Phase 8; moving it earlier was proposed but not approved.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Project setup and frontend design | ✅ Complete |
| 2 | Supabase connection and authentication | ✅ Complete — verified automatically and manually by user |
| 3 | Database schema and RLS | ✅ Complete — 7 migrations applied, 24 database tests pass |
| 4 | Case management | ✅ Complete — automated checks pass; manually verified by user |
| 5 | Conversational AI | ✅ Complete — verified automatically and manually by user |
| 6 | Structured extraction and case summary | ✅ Complete — automated checks pass; user moved on to Phase 7 |
| 7 | Document upload and extraction | ✅ Complete — automated checks pass (migration 9 applied); manual test skipped by user (time) |
| 8 | Financial calculation engine | ✅ Complete — automated checks pass; manual test skipped by user (time) |
| 9 | Financial dashboard | ✅ Complete — automated checks pass; manual test skipped by user (time) |
| 10 | Legal knowledge base and RAG | ✅ Complete — 2 Acts verified by user (Nikhil); 3 more waiting for India Code to come back online |
| 11 | Legal assessment | ✅ Complete — automated + AI checks pass; manual test skipped by user (time) |
| 12 | Resolution selection and action plans | ✅ Complete — automated checks pass; manual test skipped by user (time) |
| 13 | Document generation | ⏸ Deferred by user (2026-11-11) — Drafts page shows "Coming soon"; no feature promises drafts |
| 14 | Testing and security review | ✅ Complete — all tests pass, production build succeeds, review in `docs/security.md` |
| 15 | Deployment | Pending |

## What exists

**Phase 1**
- Next.js 16.4.6 (App Router, Cache Components), React 19.3, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Lucide.
- Navy/teal design tokens, i18n-ready strings, a responsive shell, and 15 pages.
- Unconnected features show a "Not connected yet (Phase N)" notice. No fake data.

**Phase 2**
- Supabase clients, `src/proxy.ts` (session refresh and route guard), signup/login/logout server actions with Zod validation.
- Email confirmation route, `requireUser()` data-access layer, and the user menu.
- `npm run check:env` checks the connection and passes against the dev project.

**Phase 3**
- Seven SQL migrations (the 7th fixes audit rows left behind after a case delete, found by the tests): tables, constraints, indexes, RLS, private storage, audit log, rate limiter, legal KB with vector search restricted to verified sources. See `docs/database.md`.
- `npm run db:push` applies them.

**Phase 4**
- `src/modules/cases`: repository (list/get/create/update/close/reopen/delete) and per-request `loadOwnedCase`.
- API: `GET/POST /api/cases`, `GET/PATCH/DELETE /api/cases/[id]`, with auth, ownership (404 for other users' cases), Zod validation, CSRF checks (same origin + JSON only) and rate limits.
- Pages:
  - Dashboard: active cases and recent activity from the audit log.
  - Case history table.
  - New case form.
  - Case header and status, overview with editable details, close/reopen and delete with confirmation.
  - Settings saves the name to the profile.
- All case tabs check ownership.

**Phase 5**
- `src/lib/ai/llm.ts`: server-only client with a **chain of free providers** (`AI_CHAT_CHAIN`, default `groq:openai/gpt-oss-120b → gemini:gemini-3.5-flash → gemini:gemini-3.1-flash-lite → gemini:gemini-3.5-flash-lite`). 3.5-flash-lite is last because in testing it converted "3% per month" to "36% per year" and guessed "simple" interest. Strict JSON-schema output validated with Zod, 45 s budget, retries on 5xx/timeout, moves to the next provider on 429 / quota, content-filter handling. Paid tiers are not an option (assignment project).
- `src/modules/conversation`: intake system prompt (no arithmetic, no legal conclusions, at most 2 questions, never asks for Aadhaar/OTP, user text treated as data), rule-based safety screen (threats + self-harm) independent of the AI, conversation service.
- `POST /api/chat` (auth, CSRF, ownership, closed-case check, rate limits 20/10 min and 150/day), `GET /api/conversations/[id]`.
- Chat UI: history, Enter to send, typing state, retry after AI failure (message never lost), case description pre-filled, fixed safety banner (112; Tele-MANAS 14416 for self-harm).
- Landing privacy text names the AI providers (Groq, Google Gemini) and says not to use real data yet.

**Phase 6**
- Migration 8 (`fact_provenance`): repayments and charges record the source chat message and quote.
- `src/modules/extraction`:
  - `fields.ts`: 15 loan fields, with validation (no zero/negative money, rate 0–100, no future dates, allowed choices only) and Indian formatting.
  - `ai-extraction.ts`: JSON schema plus normalisation. Invalid AI values are dropped, never "fixed".
  - `merge.ts`: decides how new facts combine with existing ones.
- How facts are extracted:
  - Facts come out of the **same AI call** as the chat reply (no extra quota).
  - A second extraction-only call runs only when a message clearly contains details but nothing was extracted.
- Safeguards on extracted facts:
  - **Quotes must really appear in the borrower's message.** An invented quote is removed. A "don't know" is accepted only when the borrower's own words say so.
  - **A confirmed value is never overwritten.** A contradiction becomes "disputed" and blocks confirmation until the borrower chooses which value is right.
- **Privacy:**
  - Aadhaar, PAN, card and account numbers, and anything after "PIN", "OTP", "password" or "CVV" are removed **before a message is stored or sent to any AI**.
  - A fixed (non-AI) note tells the borrower these aren't needed.
- `src/modules/facts/repository.ts`: load, apply, confirm, correct, mark "don't know", and add/edit/confirm/delete repayments and charges.
  - **Confirm summary** writes `loan_details` for the calculator. Unknown choices stay `unknown`.
  - Case status moves `intake → awaiting_confirmation → confirmed`. Any later change requires re-confirmation.
- UI:
  - The "What we know so far" panel beside the chat refreshes after each reply.
  - **Case summary** page:
    - every field shows its source quote and status badge, with Correct / Edit / I don't know buttons;
    - repayments and charges can be added, edited, confirmed or deleted (charges show "written agreement: needs review");
    - a missing-information checklist marks items as Needed or Helpful;
    - the Confirm dialog lists the gaps before you confirm.
- API: `POST /api/cases/[id]/confirm`.

**Phase 7**
- Migration 9 (`document_reading`): AI reading results on `documents`.
- `src/modules/documents`:
  - `file-checks.ts`: real file type from the first bytes (PDF/JPG/PNG only), safe file names, 10 MB and 25-documents-per-case limits.
  - `ai-reading.ts`: Gemini prompt + schema. Transcript with ID numbers removed, document type, handwritten/legibility, one-line summary, evidence covered, loan facts.
  - `evidence.ts`: evidence checklist (6 items) with what each missing item limits; never blocks.
  - `repository.ts`: upload, read (one at a time per document), delete, change type, checklist answers, private 60-second view links.
- Safeguards on document facts:
  - **Every detail must quote the document's text**, or it is dropped. A document can't mark anything "don't know".
  - All details are **unverified**. Handwritten / hard-to-read / unrelated documents are "Needs your review"; handwritten details have low confidence.
  - A document never overrides a confirmed value: a difference becomes "disputed".
  - A repayment already mentioned in chat is linked to the receipt as proof, not duplicated.
  - Deleting a document removes its unchecked details; confirmed ones stay.
- `AI_DOCUMENT_CHAIN` (Gemini only, default `gemini-3.5-flash → 3.1-flash-lite → 3.5-flash-lite`). Rate limits: 30 uploads/hour, 10 reads/hour, 25 reads/day.
- API: `POST/GET /api/cases/[id]/documents` (multipart; Origin header required), `POST …/[documentId]/read`, `GET …/[documentId]/file`. Server actions for delete, type and checklist answers.
- UI: Documents page with upload (drag-and-drop, privacy notice + "I understand" tick box), document cards (status, summary, "Found in this document" with quotes, View file, Try again, type, Delete), evidence checklist with "I have some / I don't have this / Doesn't apply" and the limits of missing evidence.
- Chat now knows which documents are uploaded and which the borrower doesn't have, and won't ask for them.
- `npm run samples` creates made-up sample PDFs in `tests/fixtures/` (promissory note, receipt, unrelated list).

**Phase 8**
- `src/modules/financial/engine.ts`: pure, deterministic engine (v1.0.0), no AI. Accrues interest between dated events (repayments, charges, compounding dates, calculation date), rounded to the paisa at each step.
  - Methods: flat, simple on reducing balance, compound (every 1/3/6/12 months). Monthly or annual rates. Day count: calendar months (default for monthly rates), actual/365 (default for annual), actual/360, 30/360.
  - Payment order: interest first (default, stated as an assumption), principal first, or charges → interest → principal. Interest stops once fully repaid; overpayment shows as a negative balance.
  - **Unknown terms → every possible method is calculated and shown as a range**; never a silent guess.
  - Charges: only those with a confirmed written agreement are added; the rest are listed "to examine — not proof of illegality".
  - Flat-rate summary: total interest, monthly instalment and the equivalent reducing-balance yearly rate (true cost). Rate shown per month / per year / compounded.
  - Calculation date: the lender's demand date (to compare), else today in India. Undated payments are placed on the calculation date (stated). Payments before the loan or in the future are left out with a warning.
- `dates.ts` (UTC date maths), `explain.ts` (fixed-template plain-language explanation — no AI), `repository.ts` (uses **confirmed** loan record, repayments and charges only; saves to `financial_analyses`, append-only; case → `analysed`). Rate limit 30 runs/hour.
- Financial page: Calculate / Recalculate, 5 key figures, "What this means", possible methods table, rate in other terms, assumptions & warnings, extra charges to examine, step-by-step table per method. Shows a notice when facts changed after the calculation.

**Phase 9**
- Financial page charts, hand-built SVG (no chart library, to keep memory use low):
  - **Balance over time**: one line per method; each repayment shows as a drop on its date; dashed line for the lender's demand; end-of-line labels; crosshair tooltip on hover or with arrow keys.
  - **Calculation vs lender's demand**: horizontal bars per method plus the demand in neutral grey; overpayment shown as text.
- Colours `--viz-1..3` in `globals.css` (light and dark), checked with the palette validator for colour-blind separation and contrast on the card surface. Colour follows the method (flat / reducing / compound), never its position. The step-by-step table is the accessible table view.
- `src/modules/financial/chart-data.ts`: chart points, axis steps, compact ₹K/₹L/₹Cr labels (unit-tested).

**Phase 10**
- `legal-corpus/`: one JSON per law with official URL, version note, applicability (AP/TG, lender type) and **verbatim** sections; original PDFs in `legal-corpus/raw/`. See `legal-corpus/README.md`.
- Scripts:
  - `npm run legal:extract`: copies sections word for word from an official PDF (removes only page numbers and amendment footnotes).
  - `npm run legal:ingest`: validates (official `.gov.in` / `.nic.in` sources only), stores as **pending**, one chunk per section, Gemini embeddings (1536 dims). Changed text → `needs_review`.
  - `npm run legal:verify`: a named person marks a source verified (only if the stored text matches the file they reviewed).
- `src/lib/ai/embeddings.ts` (query embeddings) and `src/modules/legal-rag/search.ts` (`searchLegal`, `searchLegalMany`). The database returns only verified, in-force sources for the case's state and lender type.
- Ingested (pending): Usurious Loans Act, 1918 s.1–4 (central text; AP amendment of 1961 not included, stated in the version note); Legal Services Authorities Act, 1987 s.12–13.
- India Code and NALSA don't answer automated requests from this machine; copies came from the High Court of Tripura and Patna High Court sites. A copy of the Contract Act on a state tax site had typing errors and was rejected; the BNS copy found was a police handbook mixing commentary and was not used.
- AP money-lending law: which Act is currently in force is **unconfirmed** (AP Money Lenders Act 2000 / 2015 law / 2017 Bill). Not added.

**Phase 11**
- `src/modules/legal/assessment.ts` (pure, unit-tested):
  - Search questions chosen from the case (high interest, charges, compound interest, demand above calculation, threats, state money-lending rules).
  - Prompt: only the numbered verified passages; cite labels; no invented Acts/sections; no conclusion of illegality; no arithmetic; "you"; state conditions exactly ("and" stays "and"); never tell the borrower to file a particular case.
  - **Checks on AI output:** points without a valid citation, naming a section or Act not in their cited passages, or asserting illegality (negated statements allowed) are removed; an unsafe summary is replaced by a fixed one.
  - "Not covered" list: expected topics (TG/AP money-lending law, Contract Act, BNS when threats) without a verified source.
  - Professional help is recommended by fixed rules (threats, demand above calculation, gaps in sources), not by the AI alone.
- `src/modules/legal/repository.ts`: needs a confirmed case and its state; uses the latest financial analysis as text; saves to `legal_assessments` (append-only) with citations and uncertainty notes. Rate limits 10/hour, 30/day.
- Legal page: fixed safety guidance first when threats were reported; "In short"; points with the exact source text, version note and official link under each; when to get help (District Legal Services Authority — no invented phone numbers or income limits); facts that would change the picture; not covered; how many AI points were removed.
- **Known limitation:** code can guarantee citations, no invented law and no illegality claims, but not a perfect paraphrase. In testing, the AI once wrote "excessive or unfair" where Section 3 says "and"; the prompt was tightened and the source text is always shown beside each point.

**Phase 12**
- `src/modules/resolution/plan.ts` (pure, no AI): the 4 paths (clarification, negotiation, legal action, legal assistance), each with what it involves, how we help, benefits, risks/limits and what's needed (spec Feature 6).
  - `recommend()`: threats → legal assistance first; no calculation or no demand → clarification; demand above calculation → clarification (gap in ₹ explained); demand inside the unknown-terms range → clarification; otherwise negotiation. Always shows a deadline warning; safety alert when threats were reported. The user can choose any path.
  - `buildActionPlan()`: personalised steps using the real demand, calculation (or range), evidence held and missing, safety and legal gaps; links to the relevant page.
- `repository.ts`: choosing a path archives the old plan (never deleted), saves the new one as active, records whether the suggestion was followed, and moves the case to `resolution_selected`. Steps can be ticked off. Rate limit 200/hour.
- Pages: Resolution (alerts, suggested path with reasons, 4 option cards, Choose buttons) and Action plan (progress bar, checkable steps, Change path).

**Phase 14**
- Security review written up in `docs/security.md`.
- Security headers on every response (`next.config.ts`); `X-Powered-By` removed.
- Production dependencies: `npm audit --omit=dev` → 0 vulnerabilities (`shadcn` code generator moved to dev dependencies; the `cn` package was checked and is the official shadcn-ui package).
- **Account deletion** (Settings → type DELETE): uploaded files removed first, then the login; all rows go by cascade. `src/lib/supabase/admin.ts` (service role, used only for this).
- First **production build** (`npm run build`): succeeds, 22 pages. Production server check: headers present, logged-out → redirect/401, cross-site and no-origin uploads → 403.

## Known issues / notes
- Free-tier limits (2026-11-10): Groq gpt-oss-120b 1,000 requests/day and about 8,000 tokens/min; Gemini 3.5-flash 20 requests/day; Gemini 3.1-flash-lite often overloaded (503). The chain absorbs these, but bursts of chat can still return "busy, try again". `npm run test:ai` uses quota, so run it sparingly.
- Project moved from OneDrive to `C:\dev\nyaya-ai` on 2026-11-10 (OneDrive sync made pages take 6–14 s; now 0.07–0.5 s). Back up with Git/GitHub instead of OneDrive.
- `npm audit`: 0 in production dependencies; moderate advisories remain only in dev tools (eslint-config-next, shadcn, Supabase CLI). See `docs/security.md`.
- `npm run build` succeeds (first run in Phase 14).
- Opening another user's case URL shows the not-found page. Because pages stream, the HTTP status can still be 200, but no data is exposed (verified).
- Each case tab has its own loading placeholder (Next.js instant-navigation requirement). All server database clients call `connection()` so user data is only read at request time.
- Account deletion is available in Settings (Phase 14).
- Content-Security-Policy does not yet restrict scripts; needs nonces before real users.
- Supabase's built-in email sender allows only a few emails per hour. A custom SMTP provider is needed before real users.

## Environment requirements
- Node.js 22, npm 10.
- `.env.local`: Supabase URL and keys ✅, `SUPABASE_DB_URL` ✅, Groq API key ✅ (chat) and Google Gemini API key ✅ (chat fallback, document reading, embeddings) — user chose free providers instead of OpenAI. Free tiers only: use made-up test data (Gemini free tier may use submitted content to improve Google products).

## Test results
| Check | Result |
|---|---|
| `npm test`: 36 unit tests (route access, open-redirect, auth validation, case validation) | ✅ Pass |
| `npm run typecheck`, `npm run lint` | ✅ Pass |
| `npm run check:env`: keys present, Supabase Auth reachable | ✅ Pass |
| Protected pages redirect to `/login?next=…` | ✅ Pass |
| API without login → 401; cross-site → 403; non-JSON → 415 | ✅ Pass |
| `npm run test:integration`: 24 database tests (RLS isolation, anon blocked, spoofing blocked, constraints, audit log, immutable messages, rate limiter, private storage, legal KB verified-only and state filtering for TG/AP, case CRUD, case deletion cleanup) | ✅ Pass |
| End-to-end on dev server with test users: logged-in pages, create/close/delete via API, other user gets 404 and sees no data, no server errors | ✅ Pass |
| Phase 5 unit: safety screen (threats, self-harm, no false alarms on normal loan messages), history trimming. Total unit tests: 56 | ✅ Pass |
| Phase 5 AI (`npm run test:ai`): asks follow-up and does no arithmetic (Test 6) ✅, threat reply prioritises safety (Test 5) ✅, does not repeat answered questions ✅, warns against sharing Aadhaar/PIN ✅ | ✅ 4/4 |
| Phase 5 end-to-end with live AI: real reply in about 1.5 s, threat sets safety flag and banner, empty message rejected, no server errors | ✅ Pass |
| Phase 5 end-to-end with AI unavailable: message saved, 503 + retry, safety flag and banner still shown, empty message rejected | ✅ Pass |
| Phase 6 unit: field validation, Indian formatting, AI-output normalisation, invented-quote rejection, merge/dispute rules, de-duplication, missing-info list, sensitive-data removal. **Total unit tests: 104** | ✅ Pass |
| Phase 6 database (`npm run test:integration`, **30 total**): extraction applied as unverified with quotes, de-duplication, dispute blocks confirmation, "don't know" recorded, confirmation writes `loan_details` (interest type stays `unknown`), change after confirmation requires re-confirmation, other user can't read or change facts | ✅ Pass |
| Phase 6 AI (`npm run test:ai`, **6 total**): spec example extracted exactly (₹80,000, 3% monthly, ₹95,000 demand, ₹70,000 reported repaid) with the interest method **not** invented; dated repayments and "don't know" recorded | ✅ 3 consecutive runs, 18/18 |
| Phase 6 end-to-end: chat records facts → panel and summary show them with quotes → confirm via API → loan record written, missing items listed, no server errors | ✅ Pass |
| Manual: Phases 2–5 | ✅ Verified by user |
| Manual: Phase 6 summary page | ⏳ Not separately reported; user chose to move to Phase 7 |
| Phase 7 unit: file-type detection (fake PDFs rejected), safe file names, evidence checklist, strict quote rule, ID removal, handwritten → review. **Total unit tests: 118** | ✅ Pass |
| Phase 7 `npm run typecheck`, `npm run lint` | ✅ Pass |
| Existing database tests (facts, cases) after Phase 7 changes | ✅ 12/12 |
| Phase 7 database (`tests/integration/documents.test.ts`): upload privacy, fake-file rejection, document facts unverified/disputed, proof linking, checklist, delete cleanup, case-delete file cleanup | ✅ 4/4 |
| Phase 7 AI (`tests/ai/documents.test.ts`, 3 sample PDFs) | ⏳ Not run yet (uses Gemini quota) |
| Phase 8 unit (`tests/unit/financial-engine.test.ts`, 22): spec Tests 1–4 and the spec's ₹80,000 example against **independently hand-calculated values** (flat 10% → ₹9,166.67/month ≈ 17.97% true rate; 3% monthly compound 12 months → ₹1,14,060.87; reducing balance with dated part-payments → ₹58,755.38), unknown terms → range, missing facts, overpayment, rounding. **Total unit tests: 140** | ✅ Pass |
| Phase 8 database (`tests/integration/financial.test.ts`): refuses before confirmation, uses confirmed items only, saves result, case → analysed, other user can't read | ✅ 2/2 |
| Phase 9 unit (`tests/unit/chart-data.test.ts`): series per method, repayment drop, end balance = engine, axis helpers. **Total unit tests: 146**. Both charts render server-side without errors or NaN | ✅ Pass |
| Manual: Phases 7–9 | ⏭ Skipped by user (time) |

| Phase 10 unit (`tests/unit/legal-corpus.test.ts`): validation (official sites only, state rules), every corpus file valid, chunking keeps every word, hash detects changes. **Total unit tests: 153** | ✅ Pass |
| Phase 10 database (`tests/integration/legal-kb.test.ts`): users can't write sources; verified source found only in its state; pending and repealed text never returned | ✅ 2/2 |
| Phase 10 AI (`tests/ai/legal-search.test.ts`): excessive-interest question → Usurious Loans Act s.3 first; legal-aid question → LSA Act | ✅ 2/2 |
| Phase 11 unit (`tests/unit/legal-assessment.test.ts`): invented sections/Acts removed, uncited points removed, illegality claims removed (negation allowed), coverage gaps, fixed escalation rules. **Total unit tests: 163** | ✅ Pass |
| Phase 11 AI (`tests/ai/legal-assessment.test.ts`): spec ₹80,000 example in Telangana — all passages verified, every point cited, Usurious Loans Act s.3 found, no illegality claims, TG money-lending law declared "not covered", help recommended; spec Test 5 (threats) — help recommended for threats, BNS gap declared | ✅ 2/2 |

| Phase 12 unit (`tests/unit/resolution.test.ts`, 12): option content complete, recommendation rules incl. threats override, personalised step text with real figures. **Total unit tests: 175** | ✅ Pass |
| Phase 12 database (`tests/integration/resolution.test.ts`): needs confirmation, user's choice respected over the suggestion, old plan archived, steps tick off, other user can't see or change | ✅ Pass |

| Phase 14: **full run** — unit 175/175, database 40/40 (incl. new account-deletion test), typecheck, lint, production build, production header/access checks | ✅ Pass |

## Next steps
1. Phase 15: deployment.
2. Later (optional): Phase 13 document generation.
2. When India Code is reachable: add Telangana Money Lenders Act, Contract Act, BNS (see `legal-corpus/README.md`).
2. Later: run `npm run test:ai -- tests/ai/documents.test.ts` once (uses 3 Gemini reads).
3. At the end: the "raw outputs" submission folder (unedited outputs from our own test cases).
