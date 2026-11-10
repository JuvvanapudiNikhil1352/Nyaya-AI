# Database

Supabase PostgreSQL. Migrations live in `supabase/migrations/` and are applied with `npm run db:push`.

## Migrations

| File | Contents |
|---|---|
| `…120000_foundation.sql` | pgvector, `private` helper schema, `updated_at` trigger, `profiles` + auto-create on signup |
| `…120100_case_tables.sql` | `cases` and every case-owned table, constraints, indexes, ownership helpers |
| `…120200_audit_and_rate_limit.sql` | `audit_log` + triggers, `rate_limit_events` + `consume_rate_limit()` |
| `…120300_legal_knowledge_base.sql` | `legal_sources`, `legal_source_applicability`, `legal_chunks` (HNSW index), `match_legal_chunks()` |
| `…120400_rls_policies.sql` | Row Level Security on every table |
| `…120500_storage.sql` | Private buckets `case-documents`, `generated-documents` and their policies |
| `…130000_fix_audit_on_case_delete.sql` | Removes audit rows left behind after a case delete |
| `…140000_fact_provenance.sql` | Source message and quote on `repayments` / `charges` |
| `20261111100000_document_reading.sql` | AI reading results on `documents`: `summary`, `is_handwritten`, `legibility`, `evidence_covers`, `read_by`, `read_at` |

## Relationships

```
auth.users 1─1 profiles
auth.users 1─* cases
cases 1─1 loan_details
cases 1─* repayments, charges, case_parties, documents, extracted_facts, evidence_items,
          conversations, financial_analyses, legal_assessments, action_plans, generated_documents
conversations 1─* messages
documents 0..1─* repayments / charges / extracted_facts / evidence_items (evidence links, SET NULL on delete)
legal_sources 1─* legal_chunks, legal_source_applicability
```

Deleting a case cascades to all its rows. The app removes its storage files first (`deleteCase`).

## Rules enforced by the database

- **Money** is `numeric(14,2)`. Amounts must be positive, and rates are limited to 0–1000.
- **Unknown is explicit.** Loan terms default to `'unknown'` or `NULL` and are never guessed.
- **Ownership (RLS):** a user can access only their own rows.
  - `cases` is checked by `user_id = auth.uid()`.
  - Child tables are checked by `private.owns_case(case_id)`.
  - `messages` are checked through their conversation.
  - Logged-out visitors (`anon`) have no access to any table.
- **Messages and analyses are append-only.** Users can't edit them.
- **Audit:** inserts, updates and deletes on `cases`, `loan_details`, `repayments`, `charges`, `extracted_facts` and `case_parties` are logged, with old and new values. When a case is deleted, its audit history is deleted with it.
- **Storage:** files must be stored at `{user_id}/{case_id}/{file}`, and the case must belong to the user.
  - Allowed types: PDF, JPEG and PNG, up to 10 MB.
  - Uploaded files can't be overwritten.
- **Legal knowledge base:**
  - Users can read only `verified` sources and can't write any.
  - Writes happen only through the service role (the admin ingestion script, Phase 10).
  - `match_legal_chunks(embedding, state, lender_type)` returns only verified, in-force sources that apply to that state and lender type.
- **Rate limits:** `consume_rate_limit(bucket, max, window_seconds)` counts actions per user. Limits are set in `src/lib/security/rate-limit.ts`.

## Documents (Phase 7)

- Upload: `POST /api/cases/[id]/documents` (multipart, same-origin required). The type is checked from the file's first bytes; the name is sanitised; the file goes to `case-documents/{user}/{case}/{random}.{ext}`.
- Reading: `POST /api/cases/[id]/documents/[documentId]/read` sends the file to Gemini (`AI_DOCUMENT_CHAIN`). Only one read per document at a time (`extraction_status` = `processing` acts as a lock; stale after 3 minutes).
- Results: `extracted_text` (ID numbers removed), `summary`, `document_type`, `evidence_covers`. Facts go to `extracted_facts` with `source_document_id`; repayments and charges get `evidence_document_id` and `source_type = 'uploaded_document'`. All unverified. A repayment already mentioned in chat is linked to the document as proof instead of being duplicated.
- Handwritten, hard-to-read or unrelated documents get `extraction_status = 'needs_review'`. Every fact must quote the document's text, or it is dropped.
- Delete: removes the file, the record, and the details from it the borrower has **not** confirmed. Confirmed details stay.
- Evidence checklist: computed from documents plus the borrower's own answers in `evidence_items` (`partial`, `missing`, `not_applicable`). Missing evidence never blocks the borrower.

## Changes from the original spec

- `loan_details.annual_or_monthly_rate` became `rate_period` (`monthly` / `annual` / `unknown`).
- `loan_details.tenure` became `tenure_months` (integer).
- New `loan_details` columns: `amount_actually_received`, `compounding_frequency`, `day_count_convention` and `lender_demand_date`.
- New tables: `charges`, `case_parties`, `evidence_items`, `audit_log`, `rate_limit_events` and `legal_source_applicability`.

## Tests

`npm run test:integration` runs `tests/integration/*.test.ts` (RLS, cases, facts, documents) against the real project, using throwaway users that are deleted afterwards. The documents test needs the sample PDFs (`npm run samples`).
