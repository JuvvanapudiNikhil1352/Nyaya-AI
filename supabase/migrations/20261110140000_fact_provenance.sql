-- =============================================================================
-- NYAYA AI — Phase 6: provenance for repayments and charges extracted from chat
-- =============================================================================

alter table public.repayments
  add column source_message_id uuid references public.messages (id) on delete set null,
  add column source_quote text check (char_length(source_quote) <= 500);

alter table public.charges
  add column source_message_id uuid references public.messages (id) on delete set null,
  add column source_quote text check (char_length(source_quote) <= 500),
  add column source_type text not null default 'user_statement'
    check (source_type in ('user_statement', 'uploaded_document', 'user_confirmed'));

create index repayments_source_message_idx on public.repayments (source_message_id);
create index charges_source_message_idx on public.charges (source_message_id);

-- Fast lookup of the latest fact per field.
create index extracted_facts_case_field_created_idx
  on public.extracted_facts (case_id, field_name, created_at desc);
