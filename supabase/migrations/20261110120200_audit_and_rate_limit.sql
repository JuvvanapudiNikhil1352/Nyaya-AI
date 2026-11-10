-- =============================================================================
-- NYAYA AI — 3. Audit trail and rate limiting
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_log: who changed which case fact, when, from what to what.
-- case_id intentionally has NO foreign key: rows for a case are removed by a
-- trigger when the case is deleted (so user-requested deletion is complete).
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  case_id    uuid,
  table_name text not null,
  record_id  uuid not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_case_idx on public.audit_log (case_id, created_at desc);
create index audit_log_user_idx on public.audit_log (user_id);

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
  v_record_id uuid;
begin
  -- Rows removed by a cascading case delete are not logged (pg_trigger_depth > 1):
  -- the whole case is being erased at the user's request.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'DELETE' then
    v_record_id := old.id;
    v_case_id := case when tg_table_name = 'cases' then old.id else (to_jsonb(old) ->> 'case_id')::uuid end;
  else
    v_record_id := new.id;
    v_case_id := case when tg_table_name = 'cases' then new.id else (to_jsonb(new) ->> 'case_id')::uuid end;
  end if;

  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then
    return new; -- nothing meaningful changed
  end if;

  insert into public.audit_log (user_id, case_id, table_name, record_id, action, old_data, new_data)
  values (
    (select auth.uid()),
    v_case_id,
    tg_table_name,
    v_record_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Audited tables: the facts that drive calculations and letters.
create trigger audit_cases after insert or update on public.cases
  for each row execute function private.audit_row_change();
create trigger audit_loan_details after insert or update or delete on public.loan_details
  for each row execute function private.audit_row_change();
create trigger audit_repayments after insert or update or delete on public.repayments
  for each row execute function private.audit_row_change();
create trigger audit_charges after insert or update or delete on public.charges
  for each row execute function private.audit_row_change();
create trigger audit_extracted_facts after insert or update or delete on public.extracted_facts
  for each row execute function private.audit_row_change();
create trigger audit_case_parties after insert or update or delete on public.case_parties
  for each row execute function private.audit_row_change();

-- Remove a case's audit history when the case itself is deleted.
create or replace function private.purge_case_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.audit_log where case_id = old.id;
  return old;
end;
$$;
create trigger purge_audit_on_case_delete after delete on public.cases
  for each row execute function private.purge_case_audit();

-- -----------------------------------------------------------------------------
-- Rate limiting: fixed window per user and action ("bucket").
-- Called from the server via RPC as the logged-in user.
-- -----------------------------------------------------------------------------
create table public.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  bucket     text not null check (char_length(bucket) between 1 and 64),
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on public.rate_limit_events (user_id, bucket, created_at desc);

-- Returns TRUE if the action is allowed (and records it), FALSE if the limit is reached.
create or replace function public.consume_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_max < 1 or p_max > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  -- Serialise concurrent calls for the same user+bucket.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_bucket, 0));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_user and bucket = p_bucket
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limit_events (user_id, bucket) values (v_user, p_bucket);

  -- Opportunistic cleanup of this user's old events.
  delete from public.rate_limit_events
  where user_id = v_user and created_at < now() - interval '1 day';

  return true;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
