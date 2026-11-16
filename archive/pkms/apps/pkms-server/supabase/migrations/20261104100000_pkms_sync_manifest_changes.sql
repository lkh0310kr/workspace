-- Imported GitHub tree entries are manifest changes too. Give each import batch a
-- workspace revision so Desktop sync cursors can discover newly cached files.
create or replace function public.pkms_register_imported_files(p_workspace_id text, p_file_ids text[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  v_revision bigint;
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  if exists(select 1 from public.pkms_files where workspace_id=p_workspace_id and file_id=any(p_file_ids) and revision=0 and not deleted and not dirty) then
    v_revision:=w.server_revision+1;
    update public.pkms_files set revision=v_revision,updated_at=now()
      where workspace_id=p_workspace_id and file_id=any(p_file_ids) and revision=0 and not deleted and not dirty;
    update public.pkms_workspaces set server_revision=v_revision,updated_at=now() where workspace_id=p_workspace_id;
    return v_revision;
  end if;
  return w.server_revision;
end;
$$;
revoke all on function public.pkms_register_imported_files(text,text[]) from public,anon,authenticated;
grant execute on function public.pkms_register_imported_files(text,text[]) to service_role;

-- Root tree mirror imports bypass the normal PostgREST upsert helper. Register
-- each new batch in the same cursor stream while leaving existing rows intact.
create or replace function public.pkms_mirror_tree(p_workspace_id text, p_files jsonb, p_dirs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.pkms_workspaces%rowtype;
  v_revision bigint;
  inserted_ids text[];
begin
  select * into w from public.pkms_workspaces where workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='workspace_not_found'; end if;
  with inserted as (
    insert into public.pkms_files(workspace_id,file_id,path,parent_path,kind,size,sha,revision,deleted,dirty)
    select p_workspace_id, f->>'fileId', f->>'path', f->>'parentPath', f->>'kind', coalesce((f->>'size')::bigint,0), f->>'sha', 0, false, false
    from jsonb_array_elements(p_files) as f
    on conflict do nothing
    returning file_id
  ) select coalesce(array_agg(file_id),array[]::text[]) into inserted_ids from inserted;
  if cardinality(inserted_ids)>0 then
    v_revision:=w.server_revision+1;
    update public.pkms_files set revision=v_revision,updated_at=now()
      where workspace_id=p_workspace_id and file_id=any(inserted_ids);
    update public.pkms_workspaces set server_revision=v_revision,updated_at=now() where workspace_id=p_workspace_id;
  end if;
  insert into public.pkms_directories(workspace_id,path,tree_sha,loaded)
  select p_workspace_id, d->>'path', d->>'treeSha', true from jsonb_array_elements(p_dirs) as d
  on conflict (workspace_id,path) do update set loaded=true;
end;
$$;
revoke all on function public.pkms_mirror_tree(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pkms_mirror_tree(text,jsonb,jsonb) to service_role;
