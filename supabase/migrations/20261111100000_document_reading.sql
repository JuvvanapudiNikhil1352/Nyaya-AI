-- =============================================================================
-- NYAYA AI — Phase 7: results of reading an uploaded document with AI
-- All values are AI output and stay "unverified" until the borrower checks them.
-- =============================================================================

alter table public.documents
  add column summary         text check (char_length(summary) <= 500),
  add column is_handwritten  boolean,
  add column legibility      text check (legibility in ('clear', 'partly_legible', 'illegible')),
  -- Evidence checklist keys this document supports (see src/modules/documents/evidence.ts).
  add column evidence_covers text[] not null default '{}' check (cardinality(evidence_covers) <= 10),
  add column read_by         text check (char_length(read_by) <= 100),
  add column read_at         timestamptz;
