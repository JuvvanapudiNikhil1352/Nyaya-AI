-- =============================================================================
-- NYAYA AI — 6. Private file storage
-- Path convention for both buckets:  {user_id}/{case_id}/{random-file-name}
-- A user can only read/write/delete files under their own user id AND case.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('case-documents', 'case-documents', false, 10485760,
     array['application/pdf', 'image/jpeg', 'image/png']),
  ('generated-documents', 'generated-documents', false, 5242880,
     array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safe check of "<user>/<case>/..." paths (never throws on malformed paths).
create or replace function private.storage_path_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(p_name);
  v_case uuid;
begin
  if array_length(parts, 1) is distinct from 2 then
    return false;
  end if;
  if parts[1] <> (select auth.uid())::text then
    return false;
  end if;
  begin
    v_case := parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.owns_case(v_case);
end;
$$;
revoke all on function private.storage_path_allowed(text) from public, anon;
grant execute on function private.storage_path_allowed(text) to authenticated;

create policy "case files: read own" on storage.objects
  for select to authenticated
  using (bucket_id in ('case-documents', 'generated-documents') and private.storage_path_allowed(name));

create policy "case files: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('case-documents', 'generated-documents') and private.storage_path_allowed(name));

create policy "case files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id in ('case-documents', 'generated-documents') and private.storage_path_allowed(name));
-- No UPDATE policy: uploaded originals are never overwritten.
