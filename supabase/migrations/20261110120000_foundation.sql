-- =============================================================================
-- NYAYA AI — 1. Foundation: extensions, private helper schema, shared triggers
-- =============================================================================

create extension if not exists vector with schema extensions;

-- Helper functions live in a schema that is NOT exposed through the Supabase API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Keeps updated_at current on every UPDATE.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user (created automatically on signup)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text check (char_length(full_name) <= 100),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'te')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile whenever a user signs up. Name comes from signup metadata.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill users who signed up before this migration.
insert into public.profiles (id, full_name)
select id, nullif(left(trim(coalesce(raw_user_meta_data ->> 'full_name', '')), 100), '')
from auth.users
on conflict (id) do nothing;
