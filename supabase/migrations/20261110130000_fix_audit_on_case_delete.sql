-- =============================================================================
-- NYAYA AI — Fix: deleting a case left audit rows for its child records.
-- Cascaded-delete AFTER triggers run at the end of the statement (not nested),
-- so pg_trigger_depth() did not detect them. Instead, skip logging a child
-- delete when its parent case no longer exists.
-- =============================================================================

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
  if tg_op = 'DELETE' then
    v_record_id := old.id;
    v_case_id := case when tg_table_name = 'cases' then old.id else (to_jsonb(old) ->> 'case_id')::uuid end;
    -- The whole case is being erased at the user's request: keep no history.
    if tg_table_name <> 'cases' and not exists (select 1 from public.cases c where c.id = v_case_id) then
      return old;
    end if;
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

-- Remove audit rows left behind by case deletions before this fix.
delete from public.audit_log a
where a.case_id is not null
  and not exists (select 1 from public.cases c where c.id = a.case_id);
