-- =============================================================================
-- NYAYA AI — 2. Case data tables (all user-owned, all protected by RLS later)
-- Money: numeric(14,2) — never float. Unknown values are NULL or 'unknown',
-- never silently defaulted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cases
-- -----------------------------------------------------------------------------
create table public.cases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  case_title          text not null check (char_length(case_title) between 1 and 120),
  case_status         text not null default 'intake' check (case_status in (
                        'intake',               -- collecting information
                        'awaiting_confirmation',-- summary ready, user must confirm
                        'confirmed',            -- user confirmed the facts
                        'analysed',             -- financial + legal analysis done
                        'resolution_selected',  -- user chose a path
                        'closed')),
  state               text check (state in ('AP', 'TG')),
  lender_type         text check (lender_type in ('individual', 'unsure')),
  problem_description text check (char_length(problem_description) <= 4000),
  safety_concern      boolean not null default false,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index cases_user_updated_idx on public.cases (user_id, updated_at desc);
create trigger cases_updated_at before update on public.cases
  for each row execute function private.set_updated_at();

-- Ownership helper used by RLS policies on every child table.
-- SECURITY DEFINER + fixed search_path; returns only a boolean about the caller.
create or replace function private.owns_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cases c
    where c.id = p_case_id and c.user_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_case(uuid) from public, anon;
grant execute on function private.owns_case(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- documents (uploaded evidence; original file lives in private storage)
-- -----------------------------------------------------------------------------
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.cases (id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path      text not null unique check (char_length(storage_path) <= 500),
  mime_type         text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes        integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  document_type     text not null default 'unknown' check (document_type in (
                      'loan_agreement', 'promissory_note', 'handwritten_record', 'receipt',
                      'bank_statement', 'repayment_record', 'chat_screenshot', 'demand_message',
                      'other', 'unknown')),
  extraction_status text not null default 'pending' check (extraction_status in (
                      'pending', 'processing', 'completed', 'needs_review', 'failed')),
  extracted_text    text,
  extraction_notes  text check (char_length(extraction_notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index documents_case_idx on public.documents (case_id, created_at desc);
create index documents_user_idx on public.documents (user_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- loan_details (exactly one per case)
-- -----------------------------------------------------------------------------
create table public.loan_details (
  id                       uuid primary key default gen_random_uuid(),
  case_id                  uuid not null unique references public.cases (id) on delete cascade,
  principal_amount         numeric(14, 2) check (principal_amount > 0),
  amount_actually_received numeric(14, 2) check (amount_actually_received >= 0),
  borrowing_date           date check (borrowing_date >= date '1950-01-01'),
  rate_period              text not null default 'unknown' check (rate_period in ('monthly', 'annual', 'unknown')),
  interest_rate            numeric(9, 4) check (interest_rate >= 0 and interest_rate <= 1000),
  interest_type            text not null default 'unknown' check (interest_type in ('simple', 'compound', 'unknown')),
  interest_method          text not null default 'unknown' check (interest_method in ('flat', 'reducing', 'unknown')),
  compounding_frequency    text not null default 'unknown' check (compounding_frequency in (
                             'monthly', 'quarterly', 'half_yearly', 'annually', 'not_applicable', 'unknown')),
  day_count_convention     text not null default 'unknown' check (day_count_convention in (
                             'calendar_month', 'actual_365', 'actual_360', 'thirty_360', 'unknown')),
  tenure_months            integer check (tenure_months > 0 and tenure_months <= 600),
  repayment_frequency      text not null default 'unknown' check (repayment_frequency in (
                             'monthly', 'weekly', 'lump_sum', 'irregular', 'unknown')),
  lender_demand            numeric(14, 2) check (lender_demand >= 0),
  lender_demand_date       date,
  repayment_allocation     text not null default 'unknown' check (repayment_allocation in (
                             'interest_first', 'principal_first', 'charges_interest_principal', 'unknown')),
  currency                 text not null default 'INR' check (currency = 'INR'),
  confirmation_status      text not null default 'unverified' check (confirmation_status in (
                             'unverified', 'confirmed', 'corrected', 'disputed')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger loan_details_updated_at before update on public.loan_details
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- repayments
-- -----------------------------------------------------------------------------
create table public.repayments (
  id                   uuid primary key default gen_random_uuid(),
  case_id              uuid not null references public.cases (id) on delete cascade,
  repayment_date       date check (repayment_date >= date '1950-01-01'),
  date_is_approximate  boolean not null default false,
  amount               numeric(14, 2) not null check (amount > 0),
  payment_method       text not null default 'unknown' check (payment_method in (
                         'cash', 'upi', 'bank_transfer', 'cheque', 'in_kind', 'other', 'unknown')),
  description          text check (char_length(description) <= 500),
  evidence_document_id uuid references public.documents (id) on delete set null,
  source_type          text not null default 'user_statement' check (source_type in (
                         'user_statement', 'uploaded_document', 'user_confirmed')),
  confirmation_status  text not null default 'unverified' check (confirmation_status in (
                         'unverified', 'confirmed', 'corrected', 'disputed')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index repayments_case_date_idx on public.repayments (case_id, repayment_date);
create index repayments_evidence_idx on public.repayments (evidence_document_id);
create trigger repayments_updated_at before update on public.repayments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- charges (fees / penalties claimed by the lender)
-- -----------------------------------------------------------------------------
create table public.charges (
  id                   uuid primary key default gen_random_uuid(),
  case_id              uuid not null references public.cases (id) on delete cascade,
  charge_date          date,
  amount               numeric(14, 2) check (amount >= 0),
  charge_type          text not null default 'unknown' check (charge_type in (
                         'penalty', 'late_fee', 'processing_fee', 'other', 'unknown')),
  description          text check (char_length(description) <= 500),
  -- Is there a written agreement supporting this charge? Never assumed.
  has_written_basis    text not null default 'unknown' check (has_written_basis in ('yes', 'no', 'unknown')),
  evidence_document_id uuid references public.documents (id) on delete set null,
  confirmation_status  text not null default 'unverified' check (confirmation_status in (
                         'unverified', 'confirmed', 'corrected', 'disputed')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index charges_case_idx on public.charges (case_id);
create index charges_evidence_idx on public.charges (evidence_document_id);
create trigger charges_updated_at before update on public.charges
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- case_parties (borrower / lender details used in letters — minimal on purpose)
-- -----------------------------------------------------------------------------
create table public.case_parties (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  role       text not null check (role in ('borrower', 'lender', 'guarantor', 'witness')),
  name       text check (char_length(name) <= 200),
  address    text check (char_length(address) <= 500),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_parties_case_idx on public.case_parties (case_id);
create trigger case_parties_updated_at before update on public.case_parties
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- conversations & messages
-- -----------------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index conversations_case_idx on public.conversations (case_id);
create index conversations_user_idx on public.conversations (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null check (char_length(content) <= 20000),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function private.owns_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations cv
    join public.cases c on c.id = cv.case_id
    where cv.id = p_conversation_id and c.user_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_conversation(uuid) from public, anon;
grant execute on function private.owns_conversation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- extracted_facts (every fact keeps its source, confidence and verification)
-- -----------------------------------------------------------------------------
create table public.extracted_facts (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references public.cases (id) on delete cascade,
  field_name          text not null check (char_length(field_name) between 1 and 64),
  extracted_value     jsonb,
  source_type         text not null check (source_type in (
                        'user_statement', 'uploaded_document', 'user_confirmed')),
  source_document_id  uuid references public.documents (id) on delete set null,
  source_message_id   uuid references public.messages (id) on delete set null,
  confidence          numeric(4, 3) check (confidence between 0 and 1),
  verification_status text not null default 'unverified' check (verification_status in (
                        'unverified', 'confirmed', 'corrected', 'disputed', 'missing')),
  notes               text check (char_length(notes) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index extracted_facts_case_field_idx on public.extracted_facts (case_id, field_name);
create index extracted_facts_document_idx on public.extracted_facts (source_document_id);
create index extracted_facts_message_idx on public.extracted_facts (source_message_id);
create trigger extracted_facts_updated_at before update on public.extracted_facts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- evidence_items (checklist)
-- -----------------------------------------------------------------------------
create table public.evidence_items (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases (id) on delete cascade,
  evidence_type text not null check (char_length(evidence_type) between 1 and 64),
  status        text not null default 'missing' check (status in (
                  'uploaded', 'partial', 'missing', 'not_applicable', 'needs_verification')),
  document_id   uuid references public.documents (id) on delete set null,
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (case_id, evidence_type)
);
create index evidence_items_document_idx on public.evidence_items (document_id);
create trigger evidence_items_updated_at before update on public.evidence_items
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Analysis outputs (append-only snapshots)
-- -----------------------------------------------------------------------------
create table public.financial_analyses (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references public.cases (id) on delete cascade,
  input_snapshot      jsonb not null,
  calculation_method  text,
  calculated_balance  numeric(14, 2),
  total_interest      numeric(14, 2),
  total_repayments    numeric(14, 2),
  lender_demand       numeric(14, 2),
  discrepancy         numeric(14, 2),
  assumptions         jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  breakdown           jsonb not null default '[]'::jsonb,
  engine_version      text not null,
  created_at          timestamptz not null default now()
);
create index financial_analyses_case_idx on public.financial_analyses (case_id, created_at desc);

create table public.legal_assessments (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.cases (id) on delete cascade,
  assessment        jsonb not null,
  citations         jsonb not null default '[]'::jsonb,
  uncertainty_notes jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);
create index legal_assessments_case_idx on public.legal_assessments (case_id, created_at desc);

create table public.action_plans (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases (id) on delete cascade,
  resolution_type text not null check (resolution_type in (
                    'clarification', 'negotiation', 'legal_action', 'legal_assistance')),
  recommendations jsonb not null default '[]'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index action_plans_case_idx on public.action_plans (case_id, created_at desc);
create trigger action_plans_updated_at before update on public.action_plans
  for each row execute function private.set_updated_at();

create table public.generated_documents (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases (id) on delete cascade,
  document_type text not null check (document_type in (
                  'clarification_request', 'demand_letter', 'complaint_draft', 'legal_notice_draft')),
  title         text not null check (char_length(title) between 1 and 200),
  content       text not null check (char_length(content) <= 100000),
  storage_path  text check (char_length(storage_path) <= 500),
  review_status text not null default 'draft' check (review_status in ('draft', 'user_reviewed', 'final')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index generated_documents_case_idx on public.generated_documents (case_id, created_at desc);
create trigger generated_documents_updated_at before update on public.generated_documents
  for each row execute function private.set_updated_at();
