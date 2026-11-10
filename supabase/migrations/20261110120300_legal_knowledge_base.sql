-- =============================================================================
-- NYAYA AI — 4. Legal knowledge base (shared, not user-owned)
-- Only sources marked 'verified' by a human reviewer can ever be retrieved.
-- Writes happen only through the admin ingestion script (service role).
-- =============================================================================

create table public.legal_sources (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (char_length(title) between 1 and 300),
  short_title         text check (char_length(short_title) <= 120),
  jurisdiction        text not null check (jurisdiction in ('IN', 'AP', 'TG')), -- IN = central law
  source_url          text not null check (source_url ~ '^https://'),
  issuing_authority   text not null,
  document_type       text not null check (document_type in (
                        'act', 'rules', 'amendment', 'notification', 'order', 'guidance')),
  act_year            integer check (act_year between 1800 and 2100),
  publication_date    date,
  effective_from      date,
  effective_until     date,             -- set when repealed / superseded
  verification_status text not null default 'pending' check (verification_status in (
                        'pending', 'verified', 'rejected', 'needs_review')),
  document_version    text not null,    -- e.g. "as amended up to 2023-05-01"
  content_hash        text,             -- sha256 of the stored original text
  verified_by         text,
  verified_at         timestamptz,
  verification_notes  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (verification_status <> 'verified' or (verified_by is not null and verified_at is not null)),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);
create trigger legal_sources_updated_at before update on public.legal_sources
  for each row execute function private.set_updated_at();

-- Where and to whom a source applies. A central Act gets one row per state.
create table public.legal_source_applicability (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.legal_sources (id) on delete cascade,
  state       text not null check (state in ('AP', 'TG')),
  lender_type text not null check (lender_type in (
                'individual', 'pawnbroker', 'mfi', 'bank', 'nbfc', 'any')),
  notes       text,
  unique (source_id, state, lender_type)
);
create index legal_source_applicability_lookup_idx
  on public.legal_source_applicability (state, lender_type, source_id);

create table public.legal_chunks (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid not null references public.legal_sources (id) on delete cascade,
  chunk_index       integer not null check (chunk_index >= 0),
  section_reference text,               -- e.g. "Section 9(1)"
  content           text not null check (char_length(content) between 1 and 20000),
  embedding         extensions.vector(1536),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  unique (source_id, chunk_index)
);
create index legal_chunks_embedding_idx on public.legal_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Semantic search restricted to verified, in-force sources applicable to the
-- case's state and lender type. Runs with the caller's rights (RLS applies).
create or replace function public.match_legal_chunks(
  query_embedding extensions.vector(1536),
  p_state text,
  p_lender_type text,
  match_count integer default 8,
  min_similarity double precision default 0.2
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  jurisdiction text,
  source_url text,
  document_version text,
  section_reference text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ch.id, s.id, s.title, s.jurisdiction, s.source_url, s.document_version,
    ch.section_reference, ch.content,
    1 - (ch.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.legal_chunks ch
  join public.legal_sources s on s.id = ch.source_id
  where s.verification_status = 'verified'
    and (s.effective_from is null or s.effective_from <= current_date)
    and (s.effective_until is null or s.effective_until >= current_date)
    and ch.embedding is not null
    and exists (
      select 1 from public.legal_source_applicability a
      where a.source_id = s.id
        and a.state = p_state
        and a.lender_type in (p_lender_type, 'any')
    )
    and 1 - (ch.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by ch.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 20);
$$;
revoke all on function public.match_legal_chunks(extensions.vector, text, text, integer, double precision) from public, anon;
grant execute on function public.match_legal_chunks(extensions.vector, text, text, integer, double precision) to authenticated;
