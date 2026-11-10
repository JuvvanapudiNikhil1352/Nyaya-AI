-- =============================================================================
-- NYAYA AI — 5. Row Level Security
-- Rule: a user can only see and change rows belonging to their own cases.
-- All policies apply to the `authenticated` role only; `anon` gets nothing.
-- `(select auth.uid())` is wrapped in a sub-select so Postgres evaluates it once.
-- =============================================================================

alter table public.profiles                   enable row level security;
alter table public.cases                      enable row level security;
alter table public.documents                  enable row level security;
alter table public.loan_details               enable row level security;
alter table public.repayments                 enable row level security;
alter table public.charges                    enable row level security;
alter table public.case_parties               enable row level security;
alter table public.conversations              enable row level security;
alter table public.messages                   enable row level security;
alter table public.extracted_facts            enable row level security;
alter table public.evidence_items             enable row level security;
alter table public.financial_analyses         enable row level security;
alter table public.legal_assessments          enable row level security;
alter table public.action_plans               enable row level security;
alter table public.generated_documents        enable row level security;
alter table public.audit_log                  enable row level security;
alter table public.rate_limit_events          enable row level security;
alter table public.legal_sources              enable row level security;
alter table public.legal_source_applicability enable row level security;
alter table public.legal_chunks               enable row level security;

-- Anonymous visitors cannot touch any table directly.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- profiles
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No insert (signup trigger creates it) and no delete (account deletion cascades).

-- ---------------------------------------------------------------- cases
create policy "cases: read own" on public.cases
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cases: create own" on public.cases
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "cases: update own" on public.cases
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "cases: delete own" on public.cases
  for delete to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------- tables owned through case_id (full CRUD)
do $$
declare
  t text;
begin
  foreach t in array array[
    'loan_details', 'repayments', 'charges', 'case_parties',
    'extracted_facts', 'evidence_items', 'action_plans', 'generated_documents'
  ] loop
    execute format(
      'create policy "%1$s: read own" on public.%1$I for select to authenticated using (private.owns_case(case_id))', t);
    execute format(
      'create policy "%1$s: create own" on public.%1$I for insert to authenticated with check (private.owns_case(case_id))', t);
    execute format(
      'create policy "%1$s: update own" on public.%1$I for update to authenticated using (private.owns_case(case_id)) with check (private.owns_case(case_id))', t);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I for delete to authenticated using (private.owns_case(case_id))', t);
  end loop;
end
$$;

-- ------------------------------------------- append-only analysis snapshots
do $$
declare
  t text;
begin
  foreach t in array array['financial_analyses', 'legal_assessments'] loop
    execute format(
      'create policy "%1$s: read own" on public.%1$I for select to authenticated using (private.owns_case(case_id))', t);
    execute format(
      'create policy "%1$s: create own" on public.%1$I for insert to authenticated with check (private.owns_case(case_id))', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- documents
create policy "documents: read own" on public.documents
  for select to authenticated using (user_id = (select auth.uid()) and private.owns_case(case_id));
create policy "documents: create own" on public.documents
  for insert to authenticated with check (user_id = (select auth.uid()) and private.owns_case(case_id));
create policy "documents: update own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()) and private.owns_case(case_id))
  with check (user_id = (select auth.uid()) and private.owns_case(case_id));
create policy "documents: delete own" on public.documents
  for delete to authenticated using (user_id = (select auth.uid()) and private.owns_case(case_id));

-- ---------------------------------------------------------------- conversations
create policy "conversations: read own" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()) and private.owns_case(case_id));
create policy "conversations: create own" on public.conversations
  for insert to authenticated with check (user_id = (select auth.uid()) and private.owns_case(case_id));
create policy "conversations: delete own" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()) and private.owns_case(case_id));

-- ---------------------------------------------------------------- messages (immutable)
create policy "messages: read own" on public.messages
  for select to authenticated using (private.owns_conversation(conversation_id));
create policy "messages: create own" on public.messages
  for insert to authenticated with check (private.owns_conversation(conversation_id));

-- ---------------------------------------------------------------- audit_log (read-only)
create policy "audit_log: read own" on public.audit_log
  for select to authenticated using (user_id = (select auth.uid()));

-- rate_limit_events: RLS on, no policies — only consume_rate_limit() touches it.

-- ---------------------------------------------------------------- legal KB (read verified only)
create policy "legal_sources: read verified" on public.legal_sources
  for select to authenticated using (verification_status = 'verified');
create policy "legal_source_applicability: read verified" on public.legal_source_applicability
  for select to authenticated using (
    exists (select 1 from public.legal_sources s
            where s.id = source_id and s.verification_status = 'verified'));
create policy "legal_chunks: read verified" on public.legal_chunks
  for select to authenticated using (
    exists (select 1 from public.legal_sources s
            where s.id = source_id and s.verification_status = 'verified'));
